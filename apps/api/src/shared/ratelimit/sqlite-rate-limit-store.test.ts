import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  checkAndRecordRateLimit,
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

function assertRangeError(
  action: () => unknown,
  label: string,
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof RangeError) {
      return;
    }

    throw new Error(
      `${label}: expected RangeError, received ${String(error)}.`,
    );
  }

  throw new Error(`${label}: expected RangeError, but no error was thrown.`);
}

/**
 * Test adapter for the production SQL seam. `node:sqlite` returns row objects
 * from `all()` and has no cursor, so this wrapper supplies the same
 * `exec(...).toArray()` shape Cloudflare's `SqlStorage` exposes.
 */
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

function check(
  database: DatabaseSync,
  limit: number,
  windowMs: number,
  now: number,
) {
  const storage = sqliteStorage(database);

  return inTransaction(database, () =>
    checkAndRecordRateLimit(storage, limit, windowMs, now),
  );
}

function attemptCount(database: DatabaseSync): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM ${RATE_LIMIT_ATTEMPTS_TABLE}`)
    .get() as { count: number };

  return row.count;
}

function attemptTimestamps(database: DatabaseSync): number[] {
  return (
    database
      .prepare(
        `SELECT occurred_at FROM ${RATE_LIMIT_ATTEMPTS_TABLE}
          ORDER BY occurred_at ASC`,
      )
      .all() as { occurred_at: number }[]
  ).map((row) => row.occurred_at);
}

function testSchemaCreationIsRepeatable(): void {
  const database = new DatabaseSync(':memory:');
  const storage = sqliteStorage(database);

  ensureRateLimitSchema(storage);
  ensureRateLimitSchema(storage);

  const table = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(RATE_LIMIT_ATTEMPTS_TABLE) as { name: string } | undefined;
  const index = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
    )
    .get(`${RATE_LIMIT_ATTEMPTS_TABLE}_occurred_at`) as
      | { name: string }
      | undefined;

  assertEqual(table?.name, RATE_LIMIT_ATTEMPTS_TABLE, 'table exists');
  assertEqual(
    index?.name,
    `${RATE_LIMIT_ATTEMPTS_TABLE}_occurred_at`,
    'index exists',
  );

  database.close();
}

function testAllowsUntilLimitThenRejects(): void {
  const database = new DatabaseSync(':memory:');
  const storage = sqliteStorage(database);
  ensureRateLimitSchema(storage);

  const first = check(database, 2, 1_000, 1_000);
  const second = check(database, 2, 1_000, 1_100);
  const rejected = check(database, 2, 1_000, 1_200);

  assertEqual(first.allowed, true, 'first attempt allowed');
  assertEqual(first.remaining, 1, 'first attempt remaining');
  assertEqual(second.allowed, true, 'limit-th attempt allowed');
  assertEqual(second.remaining, 0, 'limit-th attempt remaining');
  assertEqual(rejected.allowed, false, 'attempt over limit rejected');
  assertEqual(rejected.remaining, 0, 'rejected attempt remaining');
  assertEqual(attemptCount(database), 2, 'rejected attempt not stored');

  database.close();
}

function testRejectedAttemptsDoNotGrowState(): void {
  const database = new DatabaseSync(':memory:');
  const storage = sqliteStorage(database);
  ensureRateLimitSchema(storage);

  check(database, 1, 1_000, 1_000);

  const before = attemptTimestamps(database);
  const rejected = check(database, 1, 1_000, 1_100);
  const after = attemptTimestamps(database);

  assertEqual(rejected.allowed, false, 'second attempt rejected');
  assertEqual(after.length, before.length, 'rejected attempt not appended');
  assertEqual(after.join(','), before.join(','), 'active state unchanged');

  database.close();
}

function testExpiryAtBoundaryAndPruning(): void {
  const database = new DatabaseSync(':memory:');
  const storage = sqliteStorage(database);
  ensureRateLimitSchema(storage);

  const first = check(database, 1, 1_000, 1_000);
  const justInside = check(database, 1, 1_000, 1_999);
  const atBoundary = check(database, 1, 1_000, 2_000);

  assertEqual(first.allowed, true, 'first attempt allowed');
  assertEqual(justInside.allowed, false, 'attempt just inside window rejected');
  assertEqual(atBoundary.allowed, true, 'attempt at boundary is allowed');
  assertEqual(
    attemptTimestamps(database).join(','),
    '2000',
    'boundary-expired row is pruned',
  );

  database.close();
}

function testSeparateCallsPreserveActiveWindow(): void {
  const database = new DatabaseSync(':memory:');
  const storage = sqliteStorage(database);
  ensureRateLimitSchema(storage);

  const first = check(database, 3, 1_000, 1_000);
  const second = check(database, 3, 1_000, 1_500);
  const third = check(database, 3, 1_000, 1_900);
  const afterOldestExpiry = check(database, 3, 1_000, 2_000);

  assertEqual(first.remaining, 2, 'first remaining');
  assertEqual(second.remaining, 1, 'second remaining');
  assertEqual(third.remaining, 0, 'third remaining');
  assertEqual(third.allowed, true, 'third attempt allowed');
  assertEqual(
    afterOldestExpiry.allowed,
    true,
    'attempt after oldest expiry is allowed',
  );
  assertEqual(
    attemptTimestamps(database).join(','),
    '1500,1900,2000',
    'only active attempts remain',
  );

  database.close();
}

function testPersistenceAcrossReopen(): void {
  const directory = mkdtempSync(join(tmpdir(), 'artisan-rate-limit-'));
  const databasePath = join(directory, 'rate-limit.sqlite');

  try {
    let database = new DatabaseSync(databasePath);
    let storage = sqliteStorage(database);
    ensureRateLimitSchema(storage);

    const first = check(database, 2, 1_000, 1_000);
    const second = check(database, 2, 1_000, 1_100);
    const rejected = check(database, 2, 1_000, 1_200);

    assertEqual(first.allowed, true, 'persistence first allowed');
    assertEqual(second.allowed, true, 'persistence second allowed');
    assertEqual(rejected.allowed, false, 'persistence rejection');

    database.close();

    database = new DatabaseSync(databasePath);
    storage = sqliteStorage(database);
    ensureRateLimitSchema(storage);

    const afterReopen = check(database, 2, 1_000, 1_300);
    const afterExpiry = check(database, 2, 1_000, 2_300);

    assertEqual(afterReopen.allowed, false, 'stored attempts survive reopen');
    assertEqual(afterExpiry.allowed, true, 'stored attempts expire after reopen');
    assertEqual(
      attemptTimestamps(database).join(','),
      '2300',
      'reopened store prunes expired attempts',
    );

    database.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function testInvalidInputRollsBackCleanly(): void {
  const database = new DatabaseSync(':memory:');
  const storage = sqliteStorage(database);
  ensureRateLimitSchema(storage);

  check(database, 3, 1_000, 1_000);
  const before = attemptTimestamps(database);

  assertRangeError(
    () =>
      inTransaction(database, () =>
        checkAndRecordRateLimit(storage, 0, 1_000, 3_000),
      ),
    'invalid limit',
  );

  assertEqual(
    attemptTimestamps(database).join(','),
    before.join(','),
    'invalid limit transaction rollback preserves stored state',
  );

  assertRangeError(
    () =>
      inTransaction(database, () =>
        checkAndRecordRateLimit(storage, 3, 0, 3_000),
      ),
    'invalid window',
  );

  assertEqual(
    attemptTimestamps(database).join(','),
    before.join(','),
    'invalid window transaction rollback preserves stored state',
  );

  database.close();
}

function main(): void {
  testSchemaCreationIsRepeatable();
  testAllowsUntilLimitThenRejects();
  testRejectedAttemptsDoNotGrowState();
  testExpiryAtBoundaryAndPruning();
  testSeparateCallsPreserveActiveWindow();
  testPersistenceAcrossReopen();
  testInvalidInputRollsBackCleanly();

  console.log('SQLITE RATE LIMIT STORE TESTS PASSED');
}

main();
