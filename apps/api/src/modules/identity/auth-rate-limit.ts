import type { Context } from 'hono';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiEnv } from '../../shared/context/api-env.js';
import {
  allowsLocalInMemoryAuthState,
} from '../../shared/context/auth-state-policy.js';
import {
  AUTH_RATE_LIMIT_POLICY,
  authLoginLimiter,
  authLogoutLimiter,
  authRefreshLimiter,
  authRegisterLimiter,
  enforceRateLimit,
  type RateLimiter,
} from '../../shared/ratelimit/index.js';
import { DurableObjectRateLimiter } from '../../shared/ratelimit/durable-object-rate-limiter.js';

export type AuthRateLimitScope = 'login' | 'register';
export type AuthIpRateLimitScope = 'refresh' | 'logout';

export type AuthRateLimiters = {
  login: RateLimiter;
  register: RateLimiter;
  refresh: RateLimiter;
  logout: RateLimiter;
};

export type AuthRateLimitEnv = Pick<
  ApiEnv['Bindings'],
  | 'APP_ENV'
  | 'LOCAL_IN_MEMORY_AUTH_ENABLED'
  | 'AUTH_RATE_LIMITER'
>;

export const defaultAuthRateLimiters: AuthRateLimiters = {
  login: authLoginLimiter,
  register: authRegisterLimiter,
  refresh: authRefreshLimiter,
  logout: authLogoutLimiter,
};

/**
 * Whether the process-local limiter pair is acceptable for this environment.
 *
 * The shared policy requires an explicit local application environment, the
 * local-only opt-in, and an explicitly matching non-production build mode.
 * A deployed Worker that carries `APP_ENV=development` or `APP_ENV=test`
 * therefore cannot silently fall back to per-isolate memory.
 *
 * `buildMode` is a test seam only. Production call sites omit it, so the
 * statically replaced `process.env.NODE_ENV` decides.
 */
export function allowsInMemoryAuthRateLimiters(
  env: AuthRateLimitEnv,
  buildMode: string | undefined = process.env.NODE_ENV,
): boolean {
  return allowsLocalInMemoryAuthState(env, buildMode);
}

/**
 * Resolves the authentication limiter pair for one request environment.
 *
 * Local development and tests may keep the in-memory singletons only when
 * the shared policy permits process-local authentication state. Every other
 * environment must provide the Durable Object namespace; absent or unknown
 * configuration fails closed and never falls back to process memory.
 *
 * The adapters are cheap and hold no connections, so they are constructed
 * per resolution rather than cached across request environments.
 */
export function resolveAuthRateLimiters(
  env: AuthRateLimitEnv,
  buildMode: string | undefined = process.env.NODE_ENV,
): AuthRateLimiters {
  if (allowsInMemoryAuthRateLimiters(env, buildMode)) {
    return defaultAuthRateLimiters;
  }

  if (!env.AUTH_RATE_LIMITER) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Rate limiting is unavailable.',
    );
  }

  return {
    login: new DurableObjectRateLimiter(
      env.AUTH_RATE_LIMITER,
      AUTH_RATE_LIMIT_POLICY.login.limit,
      AUTH_RATE_LIMIT_POLICY.login.windowMs,
    ),
    register: new DurableObjectRateLimiter(
      env.AUTH_RATE_LIMITER,
      AUTH_RATE_LIMIT_POLICY.register.limit,
      AUTH_RATE_LIMIT_POLICY.register.windowMs,
    ),
    refresh: new DurableObjectRateLimiter(
      env.AUTH_RATE_LIMITER,
      AUTH_RATE_LIMIT_POLICY.refresh.limit,
      AUTH_RATE_LIMIT_POLICY.refresh.windowMs,
    ),
    logout: new DurableObjectRateLimiter(
      env.AUTH_RATE_LIMITER,
      AUTH_RATE_LIMIT_POLICY.logout.limit,
      AUTH_RATE_LIMIT_POLICY.logout.windowMs,
    ),
  };
}

/**
 * The key used when Cloudflare did not provide trusted client metadata.
 *
 * This is intentionally a single fixed value, never a client-supplied
 * header. Callers that cannot prove an IP share one budget instead of
 * choosing their own key.
 */
export const UNTRUSTED_AUTH_CLIENT_IP = 'untrusted-ip';

/**
 * Reads only the trusted Cloudflare edge header.
 *
 * `X-Forwarded-For` is deliberately ignored: it is client-controlled unless
 * a trusted proxy sanitizes it, and this route must not let a caller choose
 * an arbitrary throttle key. Local development has no Cloudflare edge and
 * therefore falls back to the shared `untrusted-ip` key.
 */
export function trustedAuthClientIp(
  c: Context<ApiEnv>,
): string {
  const trustedIp = c.req.header('cf-connecting-ip')?.trim();

  return trustedIp && trustedIp.length > 0
    ? trustedIp
    : UNTRUSTED_AUTH_CLIENT_IP;
}

/**
 * Builds the pre-authentication throttle subject.
 *
 * The identity service normalizes with `toLowerCase().trim()`; this must
 * stay identical so equivalent username spellings share one budget.
 */
export function authRateLimitKey(
  scope: AuthRateLimitScope,
  clientIp: string,
  username: string,
): string {
  const normalizedUsername = username.toLowerCase().trim();

  return `${scope}:${clientIp}:${normalizedUsername}`;
}

/**
 * Builds the pre-verification subject for refresh and logout.
 *
 * These operations are throttled by trusted client IP only. The refresh
 * credential and any username are deliberately excluded: the limiter runs
 * before token verification and must not use attacker-controlled token
 * material as a budget key.
 */
export function authIpRateLimitKey(
  scope: AuthIpRateLimitScope,
  clientIp: string,
): string {
  return `${scope}:${clientIp}`;
}

/**
 * Enforces the registration or login budget.
 *
 * This must be called after structural validation and before credential
 * verification or account creation. An explicit limiter pair is the test
 * injection seam; without it, the request environment decides between the
 * local in-memory limiters and the production Durable Object adapter.
 */
export async function enforceAuthRateLimit(
  c: Context<ApiEnv>,
  scope: AuthRateLimitScope,
  username: string,
  limiters?: AuthRateLimiters,
): Promise<void> {
  const resolvedLimiters =
    limiters ?? resolveAuthRateLimiters(c.env);

  const limiter = scope === 'login'
    ? resolvedLimiters.login
    : resolvedLimiters.register;

  const limitLabel = scope === 'login'
    ? 'login attempt'
    : 'registration attempt';

  await enforceRateLimit(
    c,
    limiter,
    authRateLimitKey(
      scope,
      trustedAuthClientIp(c),
      username,
    ),
    limitLabel,
  );
}

/**
 * Enforces the per-IP refresh or logout budget.
 *
 * This runs after structural validation and before token verification or
 * session mutation. The subject contains only the operation and trusted
 * client IP; no username, refresh credential, or raw subject is placed in
 * the label or logged.
 */
export async function enforceAuthIpRateLimit(
  c: Context<ApiEnv>,
  scope: AuthIpRateLimitScope,
  limiters?: AuthRateLimiters,
): Promise<void> {
  const resolvedLimiters =
    limiters ?? resolveAuthRateLimiters(c.env);

  const limiter = scope === 'refresh'
    ? resolvedLimiters.refresh
    : resolvedLimiters.logout;

  const limitLabel = scope === 'refresh'
    ? 'refresh attempt'
    : 'logout attempt';

  await enforceRateLimit(
    c,
    limiter,
    authIpRateLimitKey(
      scope,
      trustedAuthClientIp(c),
    ),
    limitLabel,
  );
}
