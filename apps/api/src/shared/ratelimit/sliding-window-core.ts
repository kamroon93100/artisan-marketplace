import type { RateLimitResult } from './rate-limiter.js';

/**
 * Input to one sliding-window decision.
 *
 * The caller owns persistence. For a Durable Object this means loading the
 * currently stored attempt timestamps, calling this function, and writing the
 * returned `activeTimestamps` back in the same SQLite transaction. Keeping the
 * decision here means the window rules are testable without Cloudflare runtime
 * globals and have exactly one implementation.
 */
export type SlidingWindowDecisionInput = {
  /** Attempt timestamps currently stored for one rate-limit subject. */
  activeTimestamps: readonly number[];
  /** Maximum allowed attempts in the window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Deterministic evaluation time, in Unix milliseconds. */
  now: number;
};

/**
 * The decision plus the exact state the caller must persist.
 *
 * `activeTimestamps` contains only attempts still in the window, sorted
 * oldest-first, plus the current attempt when it was allowed. A rejected
 * attempt is never appended, so repeated rejections cannot grow stored state
 * or move the reset time forward.
 */
export type SlidingWindowDecision = {
  result: RateLimitResult;
  activeTimestamps: number[];
};

function assertFiniteTimestamp(
  value: number,
  label: string,
): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite Unix-millisecond timestamp.`);
  }
}

/**
 * Evaluates one attempt against a sliding window.
 *
 * Semantics deliberately match `InMemorySlidingWindowRateLimiter`:
 * - an attempt is active while `now - occurredAt < windowMs`;
 * - an attempt exactly one window old has expired;
 * - the limit-th attempt in a window is allowed;
 * - `resetAt` is the oldest active attempt plus the window, or `now + window`
 *   when no attempt is active;
 * - a rejected attempt leaves the active state unchanged.
 */
export function decideSlidingWindow(
  input: SlidingWindowDecisionInput,
): SlidingWindowDecision {
  const {
    activeTimestamps,
    limit,
    windowMs,
    now,
  } = input;

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError('limit must be a positive integer.');
  }

  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError('windowMs must be a positive finite number.');
  }

  assertFiniteTimestamp(now, 'now');

  const cutoff = now - windowMs;
  const active = activeTimestamps
    .map((timestamp, index) => {
      assertFiniteTimestamp(timestamp, `activeTimestamps[${index}]`);
      return timestamp;
    })
    .filter((timestamp) => timestamp > cutoff)
    .sort((left, right) => left - right);

  const count = active.length;
  const allowed = count < limit;
  const nextActive = allowed ? [...active, now] : active;
  const oldest = active[0] ?? now;

  return {
    result: {
      allowed,
      remaining: Math.max(
        0,
        limit - count - (allowed ? 1 : 0),
      ),
      resetAt: oldest + windowMs,
    },
    activeTimestamps: nextActive,
  };
}
