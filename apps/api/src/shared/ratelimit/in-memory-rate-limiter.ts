import type {
  RateLimitResult,
  RateLimiter,
} from './rate-limiter.js';

/**
 * Sliding-window rate limiter that lives entirely in process memory.
 *
 * Design decisions for the current modular-monolith / local-dev stage:
 *
 * - **Per-key sliding window** — each key (typically `actorId:endpoint`)
 *   has its own rolling window of timestamps. This is fairer than a
 *   fixed clock-aligned window and avoids the thundering-herd reset at
 *   the minute boundary.
 * - **No shared state** — single-process, in-memory `Map`. A production
 *   deployment with multiple worker instances must swap this for a
 *   shared implementation (Cloudflare Rate Limiting, Upstash, etc.).
 * - **No background cleanup** — stale entries are filtered on each
 *   `check()` call. For the expected request rates at this stage this
 *   is negligible, and it avoids introducing timers or finalization.
 * - **Not persisted** — a process restart loses all rate-limit state.
 *   This is acceptable for the current stage because the consequence is
 *   a temporarily relaxed limit, not a data-loss or authorization
 *   failure.
 *
 * @param limit  Maximum requests allowed within the window.
 * @param windowMs  Window duration in milliseconds.
 */
export class InMemorySlidingWindowRateLimiter
  implements RateLimiter
{
  /** key → sorted array of Unix-millisecond timestamps. */
  private readonly windows = new Map<
    string,
    number[]
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async check(
    key: string,
  ): Promise<RateLimitResult> {
    const now = Date.now();

    let timestamps = this.windows.get(key);

    // Prune entries that have fallen out of the window.  The array is
    // naturally sorted because we always push at the end, so a
    // single-pass filter is sufficient.
    if (timestamps) {
      timestamps = timestamps.filter(
        (t) => now - t < this.windowMs,
      );
    } else {
      timestamps = [];
    }

    const count = timestamps.length;
    const allowed = count < this.limit;

    if (allowed) {
      timestamps.push(now);
      this.windows.set(key, timestamps);
    }

    // Reset time: the oldest observed timestamp + window, or now + window
    // when the window is empty.
    const oldest = timestamps[0] ?? now;
    const resetAt = oldest + this.windowMs;

    return {
      allowed,
      remaining: Math.max(
        0,
        this.limit - count - (allowed ? 1 : 0),
      ),
      resetAt,
    };
  }
}