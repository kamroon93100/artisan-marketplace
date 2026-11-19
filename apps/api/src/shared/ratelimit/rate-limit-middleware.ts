import type { Context, Next } from 'hono';
import type { ApiEnv } from '../../shared/context/api-env.js';
import type { RateLimiter } from './rate-limiter.js';
import { AppError } from '../errors/app-error.js';

/**
 * Enforces one rate-limit budget and applies the standard response headers.
 *
 * This is deliberately separate from `rateLimitMiddleware` because auth
 * throttling must run after structural request validation (so a malformed
 * request cannot consume a valid username's budget) and before credential
 * verification. The middleware and the auth handlers therefore share the
 * same envelope and header semantics without sharing key construction.
 */
export async function enforceRateLimit(
  c: Context<ApiEnv>,
  rateLimiter: RateLimiter,
  key: string,
  limitLabel = 'request',
): Promise<void> {
  const result = await rateLimiter.check(key);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil(
      (result.resetAt - Date.now()) / 1000,
    );

    c.header('retry-after', String(retryAfterSeconds));
    c.header('x-ratelimit-remaining', '0');
    c.header('x-ratelimit-reset', String(result.resetAt));

    throw new AppError(
      'RATE_LIMITED',
      `Too many ${limitLabel}s. Try again shortly.`,
      {
        retryAfterSeconds,
        resetAt: result.resetAt,
      },
    );
  }

  c.header(
    'x-ratelimit-remaining',
    String(result.remaining),
  );
  c.header(
    'x-ratelimit-reset',
    String(result.resetAt),
  );
}

/**
 * Builds a Hono middleware that enforces a rate-limit budget for every
 * request to the routes it guards.
 *
 * The key is a composite of the authenticated actor (or `anonymous` when
 * the request has not passed an auth boundary yet) and the HTTP method
 * and path.  This ensures one caller cannot exhaust another caller's
 * budget and that a burst on one endpoint does not starve a different
 * endpoint.
 *
 * @param rateLimiter  The rate-limiter implementation to use.
 * @param limitLabel   A human label for the limit (used in error details).
 */
export function rateLimitMiddleware(
  rateLimiter: RateLimiter,
  limitLabel = 'request',
) {
  return async (c: Context<ApiEnv>, next: Next) => {
    const context = c.get('requestContext');
    const actorId = context?.actor?.actorId ?? 'anonymous';
    const key = `${actorId}:${c.req.method}:${c.req.path}`;

    await enforceRateLimit(c, rateLimiter, key, limitLabel);

    await next();
  };
}