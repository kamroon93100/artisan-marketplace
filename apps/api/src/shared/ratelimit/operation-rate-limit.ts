import type { ApiEnv } from '../context/api-env.js';
import { allowsLocalInMemoryAuthState } from '../context/auth-state-policy.js';
import { DurableObjectRateLimiter } from './durable-object-rate-limiter.js';
import { InMemorySlidingWindowRateLimiter } from './in-memory-rate-limiter.js';
import type { RateLimiter } from './rate-limiter.js';
import { AppError } from '../errors/app-error.js';
import {
  OPERATION_POLICIES,
  type OperationScope,
} from './operation-registry.js';

/**
 * Resets all in-memory operation rate limiters.
 * Intended for test isolation only.
 */
export function resetInMemoryOperationRateLimiters(): void {
  for (const limiter of Object.values(defaultOperationLimiters)) {
    if (limiter instanceof InMemorySlidingWindowRateLimiter) {
      limiter.reset();
    }
  }
}

export type OperationRateLimitEnv = Pick<
  ApiEnv['Bindings'],
  | 'APP_ENV'
  | 'LOCAL_IN_MEMORY_AUTH_ENABLED'
  | 'AUTH_RATE_LIMITER'
>;

export type OperationRateLimiters = Record<OperationScope, RateLimiter>;

/**
 * Creates the in-memory limiter singletons for local development.
 *
 * These are process-local and do not provide distributed protection.
 * They are only used when the shared local development policy permits.
 */
function createInMemoryLimiters(): OperationRateLimiters {
  const limiters: Partial<OperationRateLimiters> = {};
  for (const [scope, policy] of Object.entries(OPERATION_POLICIES)) {
    limiters[scope as OperationScope] = new InMemorySlidingWindowRateLimiter(
      policy.limit,
      policy.windowMs,
    );
  }
  return limiters as OperationRateLimiters;
}

const defaultOperationLimiters = createInMemoryLimiters();

/**
 * Whether process-local operation rate limiters are acceptable for this environment.
 *
 * Reuses the shared authentication policy: requires an explicit local application
 * environment, the local-only opt-in, and an explicitly matching non-production
 * build mode. A deployed Worker that carries `APP_ENV=development` or
 * `APP_ENV=test` therefore cannot silently fall back to per-isolate memory.
 *
 * `buildMode` is a test seam only. Production call sites omit it, so the
 * statically replaced `process.env.NODE_ENV` decides.
 */
export function allowsInMemoryOperationRateLimiters(
  env: OperationRateLimitEnv,
  buildMode: string | undefined = process.env.NODE_ENV,
): boolean {
  return allowsLocalInMemoryAuthState(env, buildMode);
}

/**
 * Resolves the operation rate limiters for one request environment.
 *
 * Local development and tests may keep the in-memory singletons only when
 * the shared policy permits process-local authentication state. Every other
 * environment must provide the Durable Object namespace; absent or unknown
 * configuration fails closed and never falls back to process memory.
 *
 * The adapters are cheap and hold no connections, so they are constructed
 * per resolution rather than cached across request environments.
 */
export function resolveOperationRateLimiters(
  env: OperationRateLimitEnv,
  buildMode: string | undefined = process.env.NODE_ENV,
): OperationRateLimiters {
  if (allowsInMemoryOperationRateLimiters(env, buildMode)) {
    return defaultOperationLimiters;
  }

  if (!env.AUTH_RATE_LIMITER) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Rate limiting is unavailable.',
    );
  }

  const limiters: Partial<OperationRateLimiters> = {};
  for (const [scope, policy] of Object.entries(OPERATION_POLICIES)) {
    limiters[scope as OperationScope] = new DurableObjectRateLimiter(
      env.AUTH_RATE_LIMITER,
      policy.limit,
      policy.windowMs,
    );
  }
  return limiters as OperationRateLimiters;
}

/**
 * Builds the stable rate-limit key for an operation.
 *
 * The key combines the operation scope and the authenticated actor ID.
 * Dynamic resource identifiers (product ID, job ID, attachment ID, etc.)
 * are deliberately excluded so that requests by the same actor to different
 * resources share the same operation budget.
 */
export function buildOperationKey(
  scope: OperationScope,
  actorId: string,
): string {
  return `${scope}:${actorId}`;
}