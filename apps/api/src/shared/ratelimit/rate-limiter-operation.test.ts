import { DatabaseSync } from 'node:sqlite';

import {
  handleRateLimitObjectRequest,
  RATE_LIMIT_CHECK_URL,
  type RateLimitObjectRequest,
} from './rate-limiter-operation.js';
import {
  ensureRateLimitSchema,
  RATE_LIMIT_ATTEMPTS_TABLE,
  type RateLimitSqlStorage,
  type RateLimitSqlValue,
} from './sqlite-rate-limit-store.js';

function assertEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

function sqliteStorage(database: DatabaseSync): RateLimitSqlStorage {
  return {
    exec<T extends Record<string, RateLimitSqlValue>>(
      query: string,
      ...bindings: RateLimitSqlValue[]
    ): { toArray(): T[] } {
      const statement = database.prepare(query);
      const operation = query.trimStart().split(/\s+/, 1)[0]?.toUpperCase();

      if (operation === 'SELECT') {
        return {
          toArray: () => statement.all(...bindings) as T[],
        };
      }

      statement.run(...bindings);

      return { toArray: () => [] };
    },
  };
}

function inTransaction<T>(
  database: DatabaseSync,
  action: () => T,
): T {
  database.exec('BEGIN IMMEDIATE');

  try {
    const result = action();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function post(
  body: unknown,
  path = '/check',
): Request {
  return new Request(`https://rate-limiter.internal${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function attemptCount(database: DatabaseSync): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM ${RATE_LIMIT_ATTEMPTS_TABLE}`)
    .get() as { count: number };

  return row.count;
}

function attempts(database: DatabaseSync): number[] {
  return (
    database
      .prepare(
        `SELECT occurred_at FROM ${RATE_LIMIT_ATTEMPTS_TABLE}
          ORDER BY occurred_at ASC`,
      )
      .all() as { occurred_at: number }[]
  ).map((row) => row.occurred_at);
}

async function testRejectsWrongPathAndMethod(): Promise<void> {
  const database = new DatabaseSync(':memory:');
  const storage = sqliteStorage(database);
  ensureRateLimitSchema(storage);

  let transactionCalls = 0;
  const transactionSync = <T>(closure: () => T): T => {
    transactionCalls += 1;
    return inTransaction(database, closure);
  };

  const wrongPath = await handleRateLimitObjectRequest(
    post({ limit: 1, windowMs: 1_000, now: 1_000 }, '/wrong'),
    storage,
    transactionSync,
  );
  const wrongMethod = await handleRateLimitObjectRequest(
    new Request(RATE_LIMIT_CHECK_URL, { method: 'GET' }),
    storage,
    transactionSync,
  );

  assertEqual(wrongPath.status, 404, 'wrong path rejected');
  assertEqual(wrongMethod.status, 405, 'wrong method rejected');
  assertEqual(
    wrongMethod.headers.get('allow'),
    'POST',
    'wrong method advertises POST',
  );
  assertEqual(transactionCalls, 0, 'invalid requests do not start a transaction');

  database.close();
}

async function testRejectsMalformedBodies(): Promise<void> {
  const database = new DatabaseSync(':memory:');
  const storage = sqliteStorage(database);
  ensureRateLimitSchema(storage);

  let transactionCalls = 0;
  const transactionSync = <T>(closure: () => T): T => {
    transactionCalls += 1;
    return inTransaction(database, closure);
  };

  const malformed = [
    null,
    [],
    {},
    { limit: 1, windowMs: 1_000 },
    { limit: 0, windowMs: 1_000, now: 1_000 },
    { limit: 1.5, windowMs: 1_000, now: 1_000 },
    { limit: '1', windowMs: 1_000, now: 1_000 },
    { limit: 1, windowMs: 0, now: 1_000 },
    { limit: 1, windowMs: 1_000, now: null },
    { limit: 1, windowMs: 1_000, now: 'now' },
    { limit: 1, windowMs: 1_000, now: 1_000, extra: true },
    { limit: '1; DROP TABLE rate_limit_attempts', windowMs: 1_000, now: 1_000 },
  ];

  for (const body of malformed) {
    const response = await handleRateLimitObjectRequest(
      post(body),
      storage,
      transactionSync,
    );

    assertEqual(response.status, 400, `malformed body ${JSON.stringify(body)}`);
  }

  const invalidJson = await handleRateLimitObjectRequest(
    new Request(RATE_LIMIT_CHECK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }),
    storage,
    transactionSync,
  );

  assertEqual(invalidJson.status, 400, 'invalid JSON rejected');
  assertEqual(transactionCalls, 0, 'malformed requests never reach storage');
  assertEqual(attemptCount(database), 0, 'malformed requests store nothing');
  assertEqual(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(RATE_LIMIT_ATTEMPTS_TABLE)?.count,
    1,
    'malformed input cannot drop the attempt table',
  );

  database.close();
}

async function testAllowDenyAndBoundaryPruning(): Promise<void> {
  const database = new DatabaseSync(':memory:');
  const storage = sqliteStorage(database);
  ensureRateLimitSchema(storage);

  let transactionCalls = 0;
  const transactionSync = <T>(closure: () => T): T => {
    transactionCalls += 1;
    return inTransaction(database, closure);
  };

  const allowed = await handleRateLimitObjectRequest(
    post({ limit: 1, windowMs: 1_000, now: 1_000 }),
    storage,
    transactionSync,
  );
  const denied = await handleRateLimitObjectRequest(
    post({ limit: 1, windowMs: 1_000, now: 1_100 }),
    storage,
    transactionSync,
  );
  const boundary = await handleRateLimitObjectRequest(
    post({ limit: 1, windowMs: 1_000, now: 2_000 }),
    storage,
    transactionSync,
  );

  const allowedBody = (await allowed.json()) as {
    allowed?: boolean;
    remaining?: number;
    resetAt?: number;
  };
  const deniedBody = (await denied.json()) as {
    allowed?: boolean;
    remaining?: number;
    resetAt?: number;
  };
  const boundaryBody = (await boundary.json()) as {
    allowed?: boolean;
    remaining?: number;
    resetAt?: number;
  };

  assertEqual(allowed.status, 200, 'allowed request status');
  assertEqual(allowedBody.allowed, true, 'allowed request result');
  assertEqual(allowedBody.remaining, 0, 'allowed request remaining');
  assertEqual(allowedBody.resetAt, 2_000, 'allowed request reset');

  assertEqual(denied.status, 200, 'denied request status');
  assertEqual(deniedBody.allowed, false, 'denied request result');
  assertEqual(deniedBody.remaining, 0, 'denied request remaining');
  assertEqual(attemptCount(database), 1, 'denied attempt not stored');

  assertEqual(boundary.status, 200, 'boundary request status');
  assertEqual(boundaryBody.allowed, true, 'boundary request result');
  assertEqual(attempts(database).join(','), '2000', 'boundary row pruned');
  assertEqual(transactionCalls, 3, 'each valid check uses one transaction');

  database.close();
}

async function testParseValidationAcceptsOnlyCompleteBody(): Promise<void> {
  const valid: RateLimitObjectRequest = {
    limit: 5,
    windowMs: 60_000,
    now: 1_000,
  };
  const { parseRateLimitObjectRequest } = await import(
    './rate-limiter-operation.js'
  );

  assertEqual(
    parseRateLimitObjectRequest(valid)?.limit,
    5,
    'complete body accepted',
  );
  assertEqual(
    parseRateLimitObjectRequest({ ...valid, extra: true }),
    null,
    'unknown field rejected',
  );
}

async function main(): Promise<void> {
  await testRejectsWrongPathAndMethod();
  await testRejectsMalformedBodies();
  await testAllowDenyAndBoundaryPruning();
  await testParseValidationAcceptsOnlyCompleteBody();

  console.log('RATE LIMITER OPERATION TESTS PASSED');
}

void main().catch((error) => {
  console.error('RATE LIMITER OPERATION TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
