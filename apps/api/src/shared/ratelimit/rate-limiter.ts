/**
 * Minimal, provider-agnostic rate-limit boundary.
 *
 * The interface is small enough that Cloudflare Rate Limiting can replace
 * the in-memory implementation at production scale without changing any
 * route code — the middleware constructor is the only swap point.
 *
 * Each key is typically `actorId:endpoint` so that one caller cannot
 * exhaust the budget for another, and one endpoint's burst cannot starve
 * another endpoint.
 */

export type RateLimitResult = {
  /** Whether this request is within the configured budget. */
  allowed: boolean;
  /** Approximate remaining requests in the current window. */
  remaining: number;
  /** Unix-millisecond timestamp when the budget resets. */
  resetAt: number;
};

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}