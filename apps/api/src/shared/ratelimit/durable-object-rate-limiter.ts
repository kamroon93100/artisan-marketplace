import { AppError } from '../errors/app-error.js';
import type {
  RateLimitResult,
  RateLimiter,
} from './rate-limiter.js';
import {
  RATE_LIMIT_CHECK_URL,
  type RateLimitObjectRequest,
} from './rate-limiter-operation.js';

/**
 * Produces the Durable Object name for a complete rate-limit subject.
 *
 * The raw IP/username/composite key never leaves the adapter as an object
 * name, response value, or log field. `idFromName` receives only this
 * lowercase hexadecimal SHA-256 digest.
 */
export async function hashRateLimitSubject(
  subject: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(subject);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

function isRateLimitResult(
  value: unknown,
  limit: number,
): value is RateLimitResult {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.allowed === 'boolean' &&
    typeof candidate.remaining === 'number' &&
    Number.isInteger(candidate.remaining) &&
    candidate.remaining >= 0 &&
    candidate.remaining <= limit &&
    typeof candidate.resetAt === 'number' &&
    Number.isFinite(candidate.resetAt)
  );
}

/**
 * Production rate limiter backed by one Durable Object per hashed subject.
 *
 * Any absent binding, failed call, non-200 response, or malformed result is a
 * dependency failure. It never falls back to process-local state.
 */
export class DurableObjectRateLimiter implements RateLimiter {
  constructor(
    private readonly namespace: DurableObjectNamespace | undefined,
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError('limit must be a positive integer.');
    }

    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError('windowMs must be a positive finite number.');
    }
  }

  async check(subject: string): Promise<RateLimitResult> {
    try {
      if (!this.namespace) {
        throw new Error('AUTH_RATE_LIMITER binding is not configured.');
      }

      const objectName = await hashRateLimitSubject(subject);
      const definition = this.namespace.idFromName(objectName);
      const stub = this.namespace.get(definition);

      const body: RateLimitObjectRequest = {
        limit: this.limit,
        windowMs: this.windowMs,
        now: this.now(),
      };

      const response = await stub.fetch(RATE_LIMIT_CHECK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status !== 200) {
        throw new Error(
          `Durable Object rate limiter returned status ${response.status}.`,
        );
      }

      const result: unknown = await response.json();

      if (!isRateLimitResult(result, this.limit)) {
        throw new Error(
          'Durable Object rate limiter returned an invalid result.',
        );
      }

      return result;
    } catch (error) {
      // Never include the subject: it may contain an IP address or username.
      // The error class is enough to distinguish dependency failures in logs.
      console.error(
        '[ratelimit] durable object check failed',
        JSON.stringify({
          name: error instanceof Error ? error.name : typeof error,
        }),
      );

      throw new AppError(
        'DEPENDENCY_FAILED',
        'Rate limiting is unavailable.',
      );
    }
  }
}
