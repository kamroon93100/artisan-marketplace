import { Hono } from 'hono';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiEnv } from '../../shared/context/api-env.js';
import { createIdentityService } from './composition.js';
import { identitySessionStore } from './composition.js';
import { allowsInMemorySessionStore, hasSessionStoreConfigured } from './composition.js';
import type { SessionBindingEnv } from '../../shared/auth/session.js';
import { requireActorSync } from '../../shared/auth/session.js';
import {
  enforceAuthIpRateLimit,
  enforceAuthRateLimit,
} from './auth-rate-limit.js';

export const authRoutes = new Hono<ApiEnv>();

/**
 * Auth routes use the same middleware pattern as other routes for
 * request context initialization, but authentication is handled
 * within each handler per the M8 auth contract.
 */
authRoutes.use('*', async (c, next) => {
  const requestId =
    c.req.header('x-request-id') ??
    crypto.randomUUID();

  const correlationId =
    c.req.header('x-correlation-id') ??
    requestId;

  c.set('requestContext', {
    requestId,
    correlationId,
    actor: {
      actorId: 'anonymous',
      roles: [],
      authenticated: false,
    },
  });

  await next();

  c.header('x-request-id', requestId);
  c.header('x-correlation-id', correlationId);
});

/**
 * POST /v1/auth/register
 * 
 * Register a new account and establish initial authenticated session.
 * 
 * Request:
 *   Content-Type: application/json
 *   Body: { username: string, password: string }
 * 
 * Response (201):
 *   { session: { sessionId, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, actor: { actorId, username, roles } } }
 * 
 * Errors:
 *   400 VALIDATION_FAILED - invalid username format, password too short/long, reserved username
 *   409 CONFLICT - username already exists
 *   503 DEPENDENCY_FAILED - persistence failure
 */
authRoutes.post('/v1/auth/register', async (c) => {
  const env = c.env as SessionBindingEnv & { APP_ENV?: string };
  
  // Get identity service (uses in-memory store for dev/test)
  const identity = createIdentityService(env);
  if (!identity) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Session verification is not configured.',
    );
  }

  // Parse request body
  let body: { username?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(
      'VALIDATION_FAILED',
      'Request body must be valid JSON.',
    );
  }

  const { username, password } = body;

  // Structural validation (P8, P9) - unknown fields rejected
  const allowedFields = new Set(['username', 'password']);
  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Unknown field: ${key}`,
        { field: key },
      );
    }
  }

  // Validate required fields
  if (username === undefined || username === null) {
    throw new AppError('VALIDATION_FAILED', 'Username is required.', { field: 'username' });
  }
  if (password === undefined || password === null) {
    throw new AppError('VALIDATION_FAILED', 'Password is required.', { field: 'password' });
  }

  if (typeof username !== 'string') {
    throw new AppError('VALIDATION_FAILED', 'Username must be a string.', { field: 'username' });
  }
  if (typeof password !== 'string') {
    throw new AppError('VALIDATION_FAILED', 'Password must be a string.', { field: 'password' });
  }

  // Throttle after structural validation and before account creation.
  // The subject is (trusted Cloudflare IP, normalized username) per Q5.6/P14.
  await enforceAuthRateLimit(c, 'register', username);

  try {
    const result = await identity.register({
      username: username,
      password: password,
    });

    // P4 corrected: same response schema for register, login, refresh
    // Status 201 for register
    return c.json(
      {
        session: {
          sessionId: result.sessionId,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          accessExpiresAt: result.accessExpiresAt,
          refreshExpiresAt: result.refreshExpiresAt,
          actor: result.actor,
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    // Sanitized diagnostic: which store shape handled this request and
    // how it failed. Stage was logged by IdentityService; here we record
    // the environment shape only. No credentials or connection details.
    console.error(
      '[auth] register 503',
      JSON.stringify({
        appEnv: env.APP_ENV ?? 'unset',
        inMemoryStore: allowsInMemorySessionStore(env),
        sessionStoreConfigured: hasSessionStoreConfigured(env),
        name: error instanceof Error ? error.name : typeof error,
      }),
    );
    // Persistence failure -> 503 DEPENDENCY_FAILED (P16)
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Registration failed due to a server error.',
    );
  }
});

/**
 * POST /v1/auth/login
 * 
 * Authenticate with username and password, establish new session.
 * 
 * Request:
 *   Content-Type: application/json
 *   Body: { username: string, password: string }
 * 
 * Response (200):
 *   { session: { sessionId, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, actor: { actorId, username, roles } } }
 * 
 * Errors:
 *   400 VALIDATION_FAILED - invalid username format
 *   401 UNAUTHENTICATED - uniform failure (no details, timing equalized)
 *   503 DEPENDENCY_FAILED - persistence failure
 */
authRoutes.post('/v1/auth/login', async (c) => {
  const env = c.env as SessionBindingEnv & { APP_ENV?: string };
  
  const identity = createIdentityService(env);
  if (!identity) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Session verification is not configured.',
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(
      'VALIDATION_FAILED',
      'Request body must be valid JSON.',
    );
  }

  const { username, password } = body;

  // Structural validation - unknown fields rejected (P9)
  const allowedFields = new Set(['username', 'password']);
  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Unknown field: ${key}`,
        { field: key },
      );
    }
  }

  if (username === undefined || username === null) {
    throw new AppError('VALIDATION_FAILED', 'Username is required.', { field: 'username' });
  }
  if (password === undefined || password === null) {
    throw new AppError('VALIDATION_FAILED', 'Password is required.', { field: 'password' });
  }

  if (typeof username !== 'string') {
    throw new AppError('VALIDATION_FAILED', 'Username must be a string.', { field: 'username' });
  }
  if (typeof password !== 'string') {
    throw new AppError('VALIDATION_FAILED', 'Password must be a string.', { field: 'password' });
  }

  // Throttle after structural validation and before credential verification.
  // The subject is (trusted Cloudflare IP, normalized username) per Q3.5/Q5.6.
  await enforceAuthRateLimit(c, 'login', username);

  try {
    const result = await identity.login({
      username: username,
      password: password,
    });

    // P4 corrected: same response schema as register/refresh
    // Status 200 for login
    return c.json(
      {
        session: {
          sessionId: result.sessionId,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          accessExpiresAt: result.accessExpiresAt,
          refreshExpiresAt: result.refreshExpiresAt,
          actor: result.actor,
        },
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    // Persistence failure -> 503 DEPENDENCY_FAILED (P16). A bad
    // credential is an `AppError` (uniform 401, no details) and is
    // rethrown above; a store that cannot answer must never be reported
    // to the user as an invalid username or password.
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Login failed due to a server error.',
    );
  }
});

/**
 * POST /v1/auth/refresh
 * 
 * Exchange refresh token for new access + refresh token pair.
 * 
 * Request:
 *   Content-Type: application/json
 *   Body: { refreshToken: string }
 * 
 * Response (200):
 *   { session: { sessionId, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, actor: { actorId, username, roles } } }
 * 
 * Errors:
 *   400 VALIDATION_FAILED - missing refreshToken, unknown fields
 *   401 UNAUTHENTICATED - invalid/expired/revoked refresh token (no details for missing/unknown)
 *   401 UNAUTHENTICATED with details.reason=SESSION_REVOKED - replay detected
 *   503 DEPENDENCY_FAILED - persistence failure
 */
authRoutes.post('/v1/auth/refresh', async (c) => {
  const env = c.env as SessionBindingEnv & { APP_ENV?: string };
  
  const identity = createIdentityService(env);
  if (!identity) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Session verification is not configured.',
    );
  }

  let body: { refreshToken?: string };
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(
      'VALIDATION_FAILED',
      'Request body must be valid JSON.',
    );
  }

  const { refreshToken } = body;

  // Structural validation - unknown fields rejected (P9)
  const allowedFields = new Set(['refreshToken']);
  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Unknown field: ${key}`,
        { field: key },
      );
    }
  }

  // Per P17: missing/invalid refresh credential => 401 UNAUTHENTICATED with no details
  if (refreshToken === undefined || refreshToken === null || typeof refreshToken !== 'string') {
    throw new AppError('UNAUTHENTICATED', 'Invalid refresh token.');
  }

  // Throttle by trusted IP after structural validation and before token
  // verification or session mutation.
  await enforceAuthIpRateLimit(c, 'refresh');

  // Authorization header is ignored on refresh (P5, P21)

  try {
    const result = await identity.refreshAsync(refreshToken);

    if (!result.ok) {
      // Map refresh rejection reasons to HTTP responses
      switch (result.reason) {
        case 'REFRESH_ALREADY_USED':
          // Replay detected - revoke session and return 401 with SESSION_REVOKED (R-C, P5.5)
          throw new AppError(
            'UNAUTHENTICATED',
            'Session revoked.',
            { reason: 'SESSION_REVOKED' },
          );
        case 'SESSION_EXPIRED':
        case 'SESSION_REVOKED':
        case 'SESSION_UNKNOWN':
        case 'CREDENTIAL_MISSING':
          // Uniform failure for missing/invalid/expired/revoked (P17, P7)
          throw new AppError(
            'UNAUTHENTICATED',
            'Invalid refresh token.',
          );
        default:
          throw new AppError('UNAUTHENTICATED', 'Invalid refresh token.');
      }
    }

    // P4 corrected: same response schema as register/login
    // Status 200 for refresh
    return c.json(
      {
        session: {
          sessionId: result.session.sessionId,
          accessToken: result.session.accessToken,
          refreshToken: result.session.refreshToken,
          accessExpiresAt: result.session.accessExpiresAt,
          refreshExpiresAt: result.session.refreshExpiresAt,
          actor: result.session.actor,
        },
      },
      200,
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Token refresh failed due to a server error.',
    );
  }
});

/**
 * POST /v1/auth/logout
 * 
 * Revoke the current refresh session.
 * 
 * Request:
 *   Content-Type: application/json
 *   Body: { refreshToken: string }
 * 
 * Response (200):
 *   { ok: true }
 * 
 * Errors:
 *   400 VALIDATION_FAILED - missing refreshToken, unknown fields
 *   401 UNAUTHENTICATED - missing/unknown/invalid refresh token (no details)
 *   503 DEPENDENCY_FAILED - persistence failure
 * 
 * Per P6: repeat logout is API-success/idempotent (200 { ok: true })
 * Per Q5.5: logout revokes refresh session, does NOT denylist access token
 * Per P20: 200 with { "ok": true }
 */
authRoutes.post('/v1/auth/logout', async (c) => {
  const env = c.env as SessionBindingEnv & { APP_ENV?: string };
  
  const identity = createIdentityService(env);
  if (!identity) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Session verification is not configured.',
    );
  }

  let body: { refreshToken?: string };
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(
      'VALIDATION_FAILED',
      'Request body must be valid JSON.',
    );
  }

  const { refreshToken } = body;

  // Structural validation - unknown fields rejected (P9)
  const allowedFields = new Set(['refreshToken']);
  for (const key of Object.keys(body)) {
    if (!allowedFields.has(key)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Unknown field: ${key}`,
        { field: key },
      );
    }
  }

  // Per P17: missing/invalid refresh credential => 401 UNAUTHENTICATED with no details
  if (refreshToken === undefined || refreshToken === null || typeof refreshToken !== 'string') {
    throw new AppError('UNAUTHENTICATED', 'Invalid refresh token.');
  }

  // Throttle by trusted IP after structural validation and before token
  // verification or session mutation.
  await enforceAuthIpRateLimit(c, 'logout');

  // Authorization header is ignored on logout (P5, P21)

  try {
    const result = await identity.logoutAsync(refreshToken);

    // Per P6: repeat logout is idempotent 200 OK
    // Per P6: already-expired/revoked/unknown -> 200 OK (idempotent)
    // The field was provided but token not found/invalid/expired -> idempotent 200
    return c.json({ ok: true }, 200);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Logout failed due to a server error.',
    );
  }
});

export { authRoutes as identityAuthRoutes };