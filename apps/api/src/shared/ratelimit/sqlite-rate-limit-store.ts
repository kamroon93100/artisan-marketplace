import type { RateLimitResult } from './rate-limiter.js';
import { decideSlidingWindow } from './sliding-window-core.js';

/** Values the rate-limit table stores and binds. */
export type RateLimitSqlValue = string | number | null;

/**
 * Minimal SQL seam shared by the Durable Object and the Node test adapter.
 *
 * The production wrapper is Cloudflare's `SqlStorage`; the test adapter uses
 * Node's built-in SQLite. Both expose `exec(...).toArray()`, so the SQL
 * statements and transaction seam are exercised without importing Cloudflare
 * runtime globals into the decision core.
 */
export type RateLimitSqlStorage = {
  exec<T extends Record<string, RateLimitSqlValue>>(
    query: string,
    ...bindings: RateLimitSqlValue[]
  ): { toArray(): T[] };
};

export const RATE_LIMIT_ATTEMPTS_TABLE = 'rate_limit_attempts';

/**
 * Creates the bounded attempt table and its expiry index. Safe to call on
 * every Durable Object construction.
 */
export function ensureRateLimitSchema(
  storage: RateLimitSqlStorage,
): void {
  storage.exec(
    `CREATE TABLE IF NOT EXISTS ${RATE_LIMIT_ATTEMPTS_TABLE} (
      occurred_at INTEGER NOT NULL
    )`,
  ).toArray();

  storage.exec(
    `CREATE INDEX IF NOT EXISTS ${RATE_LIMIT_ATTEMPTS_TABLE}_occurred_at
      ON ${RATE_LIMIT_ATTEMPTS_TABLE} (occurred_at)`,
  ).toArray();
}

/**
 * Applies one sliding-window check to SQLite state.
 *
 * The caller must wrap this function in a synchronous transaction. The
 * Durable Object does so with `ctx.storage.transactionSync`; tests use a
 * SQLite transaction. Within that transaction this function deletes attempts
 * at or before the cutoff, reads the surviving timestamps, lets the pure core
 * decide, and replaces the stored state with exactly the core's returned
 * active timestamps. A rejected attempt is therefore never inserted, and
 * expired attempts are pruned on every check.
 */
export function checkAndRecordRateLimit(
  storage: RateLimitSqlStorage,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  const cutoff = now - windowMs;

  storage.exec(
    `DELETE FROM ${RATE_LIMIT_ATTEMPTS_TABLE} WHERE occurred_at <= ?`,
    cutoff,
  ).toArray();

  const rows = storage.exec<{ occurred_at: number }>(
    `SELECT occurred_at FROM ${RATE_LIMIT_ATTEMPTS_TABLE}
      ORDER BY occurred_at ASC`,
  ).toArray();

  const decision = decideSlidingWindow({
    activeTimestamps: rows.map((row) => row.occurred_at),
    limit,
    windowMs,
    now,
  });

  // Persist exactly the decision state. This also bounds storage to the
  // active window; only `decision.activeTimestamps` can be written back.
  storage.exec(`DELETE FROM ${RATE_LIMIT_ATTEMPTS_TABLE}`).toArray();

  for (const timestamp of decision.activeTimestamps) {
    storage.exec(
      `INSERT INTO ${RATE_LIMIT_ATTEMPTS_TABLE} (occurred_at) VALUES (?)`,
      timestamp,
    ).toArray();
  }

  return decision.result;
}
