import { Hono } from 'hono';
import app from '../../index.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiEnv } from '../../shared/context/api-env.js';
import {
  AUTH_RATE_LIMIT_POLICY,
  authLoginLimiter,
  authLogoutLimiter,
  authRefreshLimiter,
  authRegisterLimiter,
  rateLimitMiddleware,
  type RateLimiter,
} from '../../shared/ratelimit/index.js';
import {
  allowsInMemoryAuthRateLimiters,
  authIpRateLimitKey,
  authRateLimitKey,
  defaultAuthRateLimiters,
  enforceAuthIpRateLimit,
  enforceAuthRateLimit,
  resolveAuthRateLimiters,
  UNTRUSTED_AUTH_CLIENT_IP,
  type AuthRateLimitEnv,
  type AuthRateLimiters,
} from './auth-rate-limit.js';
import { hashRateLimitSubject } from '../../shared/ratelimit/durable-object-rate-limiter.js';
import { identitySessionStore } from './composition.js';

// Route-level fixtures cannot pass a build mode through `app.request`.
// This focused file runs in the test build; unit-level policy assertions
// below still pass explicit modes so production selection never depends on
// this process value.
process.env.NODE_ENV = 'test';

const VALID_PASSWORD = 'validpassword123456';
const TEST_ENV = {
  APP_ENV: 'test',
  LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
};

let usernameCounter = 0;

function uniqueUsername(prefix: string): string {
  usernameCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${usernameCounter}`;
}

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

function assertNotEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual === expected) {
    throw new Error(
      `${label}: expected values to differ, received ${String(actual)}.`,
    );
  }
}

async function post(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
  env: Record<string, unknown> = TEST_ENV,
) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

type RecordedDurableCheck = {
  objectName: string;
  url: string;
  method: string | undefined;
  body: {
    limit: number;
    windowMs: number;
    now: number;
  };
};

function createDurableNamespace(
  respond: (check: RecordedDurableCheck) => Response,
): {
  namespace: DurableObjectNamespace;
  checks: RecordedDurableCheck[];
} {
  const checks: RecordedDurableCheck[] = [];

  const namespace = {
    idFromName(name: string) {
      return name as unknown as DurableObjectId;
    },
    get(id: DurableObjectId) {
      return {
        async fetch(input: RequestInfo | URL, init?: RequestInit) {
          const body = JSON.parse(String(init?.body)) as RecordedDurableCheck['body'];
          const check: RecordedDurableCheck = {
            objectName: String(id),
            url: String(input),
            method: init?.method,
            body,
          };

          checks.push(check);
          return respond(check);
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return { namespace, checks };
}

function allowedDurableResponse(limit: number): Response {
  return new Response(
    JSON.stringify({
      allowed: true,
      remaining: limit - 1,
      resetAt: Date.now() + 60_000,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

function productionDbEnv(
  extra: Record<string, unknown> = {},
): {
  env: Record<string, unknown>;
  identityQueries: () => number;
} {
  let queries = 0;

  return {
    env: {
      APP_ENV: 'production',
      DB_POOL: {
        async query() {
          queries += 1;
          return { rows: [], rowCount: 0 };
        },
        async connect() {
          queries += 1;
          throw new Error('identity connection must not be opened');
        },
        async end() {},
      },
      ...extra,
    },
    identityQueries: () => queries,
  };
}

function throwerLimiter(name: string): RateLimiter {
  return {
    async check() {
      throw new Error(`${name} limiter must not be called`);
    },
  };
}

function expectDependencyFailure(
  label: string,
  run: () => unknown,
): void {
  try {
    run();
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      error.code !== 'DEPENDENCY_FAILED'
    ) {
      throw new Error(
        `${label}: expected DEPENDENCY_FAILED, received ${String(error)}.`,
      );
    }

    return;
  }

  throw new Error(
    `${label}: expected DEPENDENCY_FAILED, but no error was raised.`,
  );
}

async function testMiddlewareCallsLimiterOnce(): Promise<void> {
  let checks = 0;
  const limiter: RateLimiter = {
    async check() {
      checks += 1;
      return {
        allowed: true,
        remaining: 9,
        resetAt: Date.now() + 60_000,
      };
    },
  };

  const testApp = new Hono<ApiEnv>();
  testApp.use('*', rateLimitMiddleware(limiter));
  testApp.get('/probe', (c) => c.text('ok'));

  const response = await testApp.request('/probe');

  assertEqual(response.status, 200, 'middleware allows request');
  assertEqual(checks, 1, 'middleware invokes limiter exactly once');
}

async function testMiddlewareRateLimitEnvelope(): Promise<void> {
  const resetAt = Date.now() + 30_000;
  const limiter: RateLimiter = {
    async check() {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    },
  };

  const testApp = new Hono<ApiEnv>();
  testApp.use('*', rateLimitMiddleware(limiter, 'login attempt'));
  testApp.get('/probe', (c) => c.text('ok'));
  testApp.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        error.code === 'RATE_LIMITED' ? 429 : 500,
      );
    }

    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'unexpected' } },
      500,
    );
  });

  const response = await testApp.request('/probe');
  const body = (await response.json()) as {
    error?: { code?: string; details?: { resetAt?: number } };
  };

  assertEqual(response.status, 429, 'middleware returns 429');
  assertEqual(
    body.error?.code,
    'RATE_LIMITED',
    'middleware returns standard error code',
  );
  assertEqual(
    response.headers.get('x-ratelimit-remaining'),
    '0',
    'middleware sets remaining header',
  );
  assertEqual(
    response.headers.get('x-ratelimit-reset'),
    String(resetAt),
    'middleware sets reset header',
  );
  assertEqual(
    Number(response.headers.get('retry-after')) > 0,
    true,
    'middleware sets retry-after header',
  );
  assertEqual(
    body.error?.details?.resetAt,
    resetAt,
    'middleware includes resetAt details',
  );
}

async function testAuthKeyNormalizationAndTrustedIp(): Promise<void> {
  const ip = '203.0.113.10';

  assertEqual(
    authRateLimitKey('login', ip, '  CaseUser  '),
    authRateLimitKey('login', ip, 'caseuser'),
    'username normalization shares a key',
  );
  assertNotEqual(
    authRateLimitKey('login', ip, 'usera'),
    authRateLimitKey('login', ip, 'userb'),
    'different usernames have different keys',
  );
  assertNotEqual(
    authRateLimitKey('login', ip, 'user'),
    authRateLimitKey('login', '203.0.113.11', 'user'),
    'different IPs have different keys',
  );
  assertNotEqual(
    authRateLimitKey('login', ip, 'user'),
    authRateLimitKey('register', ip, 'user'),
    'login and registration scopes have different keys',
  );

  const keys: string[] = [];
  const fakeLimiters: AuthRateLimiters = {
    login: {
      async check(key) {
        keys.push(key);
        return {
          allowed: true,
          remaining: 9,
          resetAt: Date.now() + 60_000,
        };
      },
    },
    register: {
      async check() {
        throw new Error('register limiter must not be called');
      },
    },
    refresh: {
      async check() {
        throw new Error('refresh limiter must not be called');
      },
    },
    logout: {
      async check() {
        throw new Error('logout limiter must not be called');
      },
    },
  };

  const testApp = new Hono<ApiEnv>();
  testApp.post('/probe', async (c) => {
    await enforceAuthRateLimit(c, 'login', '  CaseUser  ', fakeLimiters);
    return c.text('ok');
  });

  await testApp.request('/probe', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': ip,
      'x-forwarded-for': '198.51.100.99',
    },
  });

  assertEqual(
    keys[0],
    `login:${ip}:caseuser`,
    'helper uses trusted CF IP and normalized username',
  );

  await testApp.request('/probe', {
    method: 'POST',
    headers: {
      'x-forwarded-for': ip,
    },
  });

  assertEqual(
    keys[1],
    `login:${UNTRUSTED_AUTH_CLIENT_IP}:caseuser`,
    'helper ignores X-Forwarded-For',
  );
}

async function testAllowedAuthAndExistingBehavior(): Promise<void> {
  const username = uniqueUsername('ok');
  const ip = '198.51.100.1';

  const registered = await post(
    '/v1/auth/register',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': ip },
  );

  assertEqual(registered.status, 201, 'registration succeeds');
  assertEqual(
    registered.headers.get('x-ratelimit-remaining'),
    String(AUTH_RATE_LIMIT_POLICY.register.limit - 1),
    'registration returns remaining header',
  );
  assertNotEqual(
    registered.headers.get('x-ratelimit-reset'),
    null,
    'registration returns reset header',
  );

  const invalid = await post(
    '/v1/auth/login',
    { username, password: 'wrongpassword123456' },
    { 'cf-connecting-ip': ip },
  );
  const invalidBody = (await invalid.json()) as {
    error?: { code?: string };
  };

  assertEqual(invalid.status, 401, 'invalid credentials still return 401');
  assertEqual(
    invalidBody.error?.code,
    'UNAUTHENTICATED',
    'invalid credentials keep uniform error code',
  );

  const valid = await post(
    '/v1/auth/login',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': ip },
  );

  assertEqual(valid.status, 200, 'valid credentials still return 200');
  assertNotEqual(
    valid.headers.get('x-ratelimit-remaining'),
    null,
    'valid login returns remaining header',
  );
}

async function testLoginLimitAndIdentityNotInvoked(): Promise<void> {
  const username = uniqueUsername('login');
  const registerIp = '198.51.100.2';
  const limitedIp = '198.51.100.3';
  const allowedIp = '198.51.100.4';

  const registered = await post(
    '/v1/auth/register',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': registerIp },
  );

  assertEqual(registered.status, 201, 'login test registration succeeds');

  const key = authRateLimitKey('login', limitedIp, username);

  for (let i = 0; i < AUTH_RATE_LIMIT_POLICY.login.limit; i += 1) {
    const result = await authLoginLimiter.check(key);

    if (!result.allowed) {
      throw new Error(
        `login limiter rejected request ${i + 1} before the limit.`,
      );
    }
  }

  const sessionsBefore = identitySessionStore.all().length;
  const limited = await post(
    '/v1/auth/login',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': limitedIp },
  );
  const limitedBody = (await limited.json()) as {
    error?: { code?: string };
  };

  assertEqual(limited.status, 429, 'login limit returns 429');
  assertEqual(
    limitedBody.error?.code,
    'RATE_LIMITED',
    'login limit returns standard error code',
  );
  assertEqual(
    limited.headers.get('x-ratelimit-remaining'),
    '0',
    'login limit sets remaining header',
  );
  assertNotEqual(
    limited.headers.get('x-ratelimit-reset'),
    null,
    'login limit sets reset header',
  );
  assertNotEqual(
    limited.headers.get('retry-after'),
    null,
    'login limit sets retry-after header',
  );
  assertEqual(
    identitySessionStore.all().length,
    sessionsBefore,
    'throttled login does not invoke identity login',
  );

  const allowed = await post(
    '/v1/auth/login',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': allowedIp },
  );

  assertEqual(allowed.status, 200, 'different IP login is allowed');
  assertEqual(
    identitySessionStore.all().length,
    sessionsBefore + 1,
    'allowed login still creates a session',
  );
}

async function testRegistrationLimitAndIdentityNotInvoked(): Promise<void> {
  const username = uniqueUsername('register');
  const limitedIp = '198.51.100.5';
  const allowedIp = '198.51.100.6';
  const key = authRateLimitKey('register', limitedIp, username);

  for (let i = 0; i < AUTH_RATE_LIMIT_POLICY.register.limit; i += 1) {
    const result = await authRegisterLimiter.check(key);

    if (!result.allowed) {
      throw new Error(
        `registration limiter rejected request ${i + 1} before the limit.`,
      );
    }
  }

  const limited = await post(
    '/v1/auth/register',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': limitedIp },
  );
  const limitedBody = (await limited.json()) as {
    error?: { code?: string };
  };

  assertEqual(limited.status, 429, 'registration limit returns 429');
  assertEqual(
    limitedBody.error?.code,
    'RATE_LIMITED',
    'registration limit returns standard error code',
  );
  assertEqual(
    limited.headers.get('x-ratelimit-remaining'),
    '0',
    'registration limit sets remaining header',
  );

  const allowed = await post(
    '/v1/auth/register',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': allowedIp },
  );

  assertEqual(
    allowed.status,
    201,
    'throttled registration does not create the account',
  );
}

async function testNormalizationAndForwardedForIgnored(): Promise<void> {
  const username = uniqueUsername('norm');
  const limitedIp = '198.51.100.7';
  const otherIp = '198.51.100.8';
  const normalizedKey = authRateLimitKey(
    'login',
    limitedIp,
    username.toUpperCase(),
  );

  for (let i = 0; i < AUTH_RATE_LIMIT_POLICY.login.limit; i += 1) {
    await authLoginLimiter.check(normalizedKey);
  }

  const normalized = await post(
    '/v1/auth/login',
    { username: username.toUpperCase(), password: VALID_PASSWORD },
    {
      'cf-connecting-ip': limitedIp,
      'x-forwarded-for': otherIp,
    },
  );

  assertEqual(
    normalized.status,
    429,
    'normalized username and trusted IP share the login budget',
  );

  const forwardedOnly = await post(
    '/v1/auth/login',
    { username, password: VALID_PASSWORD },
    { 'x-forwarded-for': limitedIp },
  );

  assertEqual(
    forwardedOnly.status,
    401,
    'X-Forwarded-For is not trusted as the client IP',
  );

  const other = await post(
    '/v1/auth/login',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': otherIp },
  );

  assertEqual(
    other.status,
    401,
    'a different trusted IP has its own budget',
  );
}

async function testMalformedRequestsDoNotConsumeBudget(): Promise<void> {
  const loginUsername = uniqueUsername('badlogin');
  const loginIp = '198.51.100.9';
  const malformedLogin = await post(
    '/v1/auth/login',
    { username: loginUsername },
    { 'cf-connecting-ip': loginIp },
  );

  assertEqual(malformedLogin.status, 400, 'malformed login is rejected');

  const loginKey = authRateLimitKey('login', loginIp, loginUsername);
  const loginBudget = await authLoginLimiter.check(loginKey);

  assertEqual(loginBudget.allowed, true, 'login budget remains available');
  assertEqual(
    loginBudget.remaining,
    AUTH_RATE_LIMIT_POLICY.login.limit - 1,
    'malformed login did not consume the login budget',
  );

  const registerUsername = uniqueUsername('badregister');
  const registerIp = '198.51.100.10';
  const malformedRegister = await post(
    '/v1/auth/register',
    { username: registerUsername },
    { 'cf-connecting-ip': registerIp },
  );

  assertEqual(
    malformedRegister.status,
    400,
    'malformed registration is rejected',
  );

  const registerKey = authRateLimitKey(
    'register',
    registerIp,
    registerUsername,
  );
  const registerBudget = await authRegisterLimiter.check(registerKey);

  assertEqual(
    registerBudget.allowed,
    true,
    'registration budget remains available',
  );
  assertEqual(
    registerBudget.remaining,
    AUTH_RATE_LIMIT_POLICY.register.limit - 1,
    'malformed registration did not consume the registration budget',
  );
}

async function testRegistrationAndLoginBudgetsAreIndependent(): Promise<void> {
  const username = uniqueUsername('independent');
  const ip = '198.51.100.11';
  const registerKey = authRateLimitKey('register', ip, username);

  for (let i = 0; i < AUTH_RATE_LIMIT_POLICY.register.limit; i += 1) {
    await authRegisterLimiter.check(registerKey);
  }

  const registrationLimited = await post(
    '/v1/auth/register',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': ip },
  );

  assertEqual(
    registrationLimited.status,
    429,
    'registration budget is exhausted',
  );

  const login = await post(
    '/v1/auth/login',
    { username, password: VALID_PASSWORD },
    { 'cf-connecting-ip': ip },
  );

  assertEqual(
    login.status,
    401,
    'exhausted registration budget does not block login',
  );

  const loginKey = authRateLimitKey('login', ip, username);
  const loginBudget = await authLoginLimiter.check(loginKey);

  assertEqual(
    loginBudget.allowed,
    true,
    'login limiter remains independent after registration exhaustion',
  );
}

async function testResolverKeepsInMemoryForLocalEnvironments(): Promise<void> {
  assertEqual(
    allowsInMemoryAuthRateLimiters(
      {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      'development',
    ),
    true,
    'development allows the in-memory limiter',
  );
  assertEqual(
    allowsInMemoryAuthRateLimiters(
      {
        APP_ENV: 'test',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      'test',
    ),
    true,
    'test allows the in-memory limiter',
  );
  assertEqual(
    allowsInMemoryAuthRateLimiters(
      {
        APP_ENV: 'production',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      'production',
    ),
    false,
    'production does not allow the in-memory limiter',
  );
  assertEqual(
    allowsInMemoryAuthRateLimiters({}, 'test'),
    false,
    'missing APP_ENV does not allow the in-memory limiter',
  );

  const { namespace } = createDurableNamespace(
    ({ body }) => allowedDurableResponse(body.limit),
  );

  for (const environment of ['development', 'test'] as const) {
    const resolved = resolveAuthRateLimiters(
      {
        APP_ENV: environment,
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        AUTH_RATE_LIMITER: namespace,
      },
      environment,
    );

    assertEqual(
      resolved.login,
      defaultAuthRateLimiters.login,
      `${environment} keeps the injected login limiter`,
    );
    assertEqual(
      resolved.register,
      defaultAuthRateLimiters.register,
      `${environment} keeps the injected registration limiter`,
    );
    assertEqual(
      resolved.refresh,
      defaultAuthRateLimiters.refresh,
      `${environment} keeps the injected refresh limiter`,
    );
    assertEqual(
      resolved.logout,
      defaultAuthRateLimiters.logout,
      `${environment} keeps the injected logout limiter`,
    );
  }

  // A production build must not select process-local limiters even when the
  // application environment and opt-in are both misleading.
  for (const environment of ['development', 'test'] as const) {
    const resolved = resolveAuthRateLimiters(
      {
        APP_ENV: environment,
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        AUTH_RATE_LIMITER: namespace,
      },
      'production',
    );

    assertNotEqual(
      resolved.login,
      defaultAuthRateLimiters.login,
      `production build does not use the local login limiter for ${environment}`,
    );
    assertNotEqual(
      resolved.register,
      defaultAuthRateLimiters.register,
      `production build does not use the local registration limiter for ${environment}`,
    );
    assertNotEqual(
      resolved.refresh,
      defaultAuthRateLimiters.refresh,
      `production build does not use the local refresh limiter for ${environment}`,
    );
    assertNotEqual(
      resolved.logout,
      defaultAuthRateLimiters.logout,
      `production build does not use the local logout limiter for ${environment}`,
    );
  }
}

async function testResolverUsesDurableObjectPolicies(): Promise<void> {
  assertEqual(
    AUTH_RATE_LIMIT_POLICY.refresh.limit,
    60,
    'refresh policy limit is centralized and approved',
  );
  assertEqual(
    AUTH_RATE_LIMIT_POLICY.refresh.windowMs,
    600_000,
    'refresh policy window is centralized and approved',
  );
  assertEqual(
    AUTH_RATE_LIMIT_POLICY.logout.limit,
    30,
    'logout policy limit is centralized and approved',
  );
  assertEqual(
    AUTH_RATE_LIMIT_POLICY.logout.windowMs,
    600_000,
    'logout policy window is centralized and approved',
  );

  const { namespace, checks } = createDurableNamespace(
    ({ body }) => allowedDurableResponse(body.limit),
  );
  const limiters = resolveAuthRateLimiters(
    {
      APP_ENV: 'production',
      AUTH_RATE_LIMITER: namespace,
    },
    'production',
  );

  assertNotEqual(
    limiters.login,
    limiters.register,
    'login and registration use independent adapters',
  );
  assertNotEqual(
    limiters.refresh,
    limiters.logout,
    'refresh and logout use independent adapters',
  );

  const loginSubject = authRateLimitKey(
    'login',
    '203.0.113.20',
    '  MixedUser  ',
  );
  const registerSubject = authRateLimitKey(
    'register',
    '203.0.113.20',
    '  MixedUser  ',
  );
  const refreshSubject = authIpRateLimitKey(
    'refresh',
    '203.0.113.20',
  );
  const logoutSubject = authIpRateLimitKey(
    'logout',
    '203.0.113.20',
  );

  const loginResult = await limiters.login.check(loginSubject);
  const registerResult = await limiters.register.check(registerSubject);
  const refreshResult = await limiters.refresh.check(refreshSubject);
  const logoutResult = await limiters.logout.check(logoutSubject);

  assertEqual(loginResult.allowed, true, 'production login check is allowed');
  assertEqual(
    registerResult.allowed,
    true,
    'production registration check is allowed',
  );
  assertEqual(
    refreshResult.allowed,
    true,
    'production refresh check is allowed',
  );
  assertEqual(
    logoutResult.allowed,
    true,
    'production logout check is allowed',
  );
  assertEqual(
    checks[0].body.limit,
    AUTH_RATE_LIMIT_POLICY.login.limit,
    'production login uses the centralized login limit',
  );
  assertEqual(
    checks[0].body.windowMs,
    AUTH_RATE_LIMIT_POLICY.login.windowMs,
    'production login uses the centralized login window',
  );
  assertEqual(
    checks[1].body.limit,
    AUTH_RATE_LIMIT_POLICY.register.limit,
    'production registration uses the centralized registration limit',
  );
  assertEqual(
    checks[1].body.windowMs,
    AUTH_RATE_LIMIT_POLICY.register.windowMs,
    'production registration uses the centralized registration window',
  );
  assertEqual(
    checks[2].body.limit,
    AUTH_RATE_LIMIT_POLICY.refresh.limit,
    'production refresh uses the centralized refresh limit',
  );
  assertEqual(
    checks[2].body.windowMs,
    AUTH_RATE_LIMIT_POLICY.refresh.windowMs,
    'production refresh uses the centralized refresh window',
  );
  assertEqual(
    checks[3].body.limit,
    AUTH_RATE_LIMIT_POLICY.logout.limit,
    'production logout uses the centralized logout limit',
  );
  assertEqual(
    checks[3].body.windowMs,
    AUTH_RATE_LIMIT_POLICY.logout.windowMs,
    'production logout uses the centralized logout window',
  );
  assertEqual(
    checks[0].url,
    'https://rate-limiter.internal/check',
    'production login calls the internal check path',
  );
  assertEqual(
    checks[0].method,
    'POST',
    'production login calls the internal check with POST',
  );
  assertEqual(
    checks[0].objectName,
    await hashRateLimitSubject(loginSubject),
    'production login uses the hashed subject as the object name',
  );
  assertNotEqual(
    checks[0].objectName,
    loginSubject,
    'production login never uses the raw subject as the object name',
  );
  assertEqual(
    loginSubject.includes('mixeduser'),
    true,
    'production login subject remains normalized',
  );
  assertEqual(
    refreshSubject,
    'refresh:203.0.113.20',
    'refresh subject contains only scope and trusted IP',
  );
  assertEqual(
    logoutSubject,
    'logout:203.0.113.20',
    'logout subject contains only scope and trusted IP',
  );
  assertEqual(
    checks[2].objectName,
    await hashRateLimitSubject(refreshSubject),
    'production refresh uses the hashed subject as the object name',
  );
  assertEqual(
    checks[3].objectName,
    await hashRateLimitSubject(logoutSubject),
    'production logout uses the hashed subject as the object name',
  );
}

async function testResolverFailsClosedForUnknownOrMissingEnvironment(): Promise<void> {
  const environments: Array<{
    label: string;
    env: AuthRateLimitEnv;
    buildMode: string;
  }> = [
    {
      label: 'production without AUTH_RATE_LIMITER',
      env: { APP_ENV: 'production' },
      buildMode: 'production',
    },
    {
      label: 'production build with misleading development configuration',
      env: {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      buildMode: 'production',
    },
    {
      label: 'production build with misleading test configuration',
      env: {
        APP_ENV: 'test',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      buildMode: 'production',
    },
    {
      label: 'development without opt-in',
      env: { APP_ENV: 'development' },
      buildMode: 'development',
    },
    {
      label: 'test without opt-in',
      env: { APP_ENV: 'test' },
      buildMode: 'test',
    },
    {
      label: 'development application under test build',
      env: {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      buildMode: 'test',
    },
    {
      label: 'unknown build mode with opt-in',
      env: {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      buildMode: 'staging',
    },
    {
      label: 'unknown environment',
      env: { APP_ENV: 'staging' },
      buildMode: 'test',
    },
    {
      label: 'missing APP_ENV',
      env: { LOCAL_IN_MEMORY_AUTH_ENABLED: 'true' },
      buildMode: 'test',
    },
    {
      label: 'empty APP_ENV',
      env: { APP_ENV: '' },
      buildMode: 'test',
    },
  ];

  for (const { label, env, buildMode } of environments) {
    expectDependencyFailure(label, () =>
      resolveAuthRateLimiters(env, buildMode),
    );
  }
}

async function testMissingProductionBindingStopsAuthRequest(): Promise<void> {
  let identityQueries = 0;
  const env = {
    APP_ENV: 'production',
    DB_POOL: {
      async query() {
        identityQueries += 1;
        return { rows: [], rowCount: 0 };
      },
      async connect() {
        identityQueries += 1;
        throw new Error('identity connection must not be opened');
      },
      async end() {},
    },
  };

  const response = await post(
    '/v1/auth/login',
    {
      username: uniqueUsername('prodmissing'),
      password: VALID_PASSWORD,
    },
    { 'cf-connecting-ip': '203.0.113.30' },
    env,
  );
  const body = (await response.json()) as {
    error?: { code?: string; message?: string };
  };

  assertEqual(
    response.status,
    503,
    'missing production binding returns dependency failure',
  );
  assertEqual(
    body.error?.code,
    'DEPENDENCY_FAILED',
    'missing production binding uses the established code',
  );
  assertEqual(
    body.error?.message,
    'Rate limiting is unavailable.',
    'missing production binding uses the established message',
  );
  assertEqual(
    identityQueries,
    0,
    'missing production binding does not reach identity work',
  );
}

async function testFailedDurableCheckStopsIdentityWork(): Promise<void> {
  let identityQueries = 0;
  const { namespace } = createDurableNamespace(
    () => new Response('unavailable', { status: 503 }),
  );
  const env = {
    APP_ENV: 'production',
    AUTH_RATE_LIMITER: namespace,
    DB_POOL: {
      async query() {
        identityQueries += 1;
        return { rows: [], rowCount: 0 };
      },
      async connect() {
        identityQueries += 1;
        throw new Error('identity connection must not be opened');
      },
      async end() {},
    },
  };

  const response = await post(
    '/v1/auth/login',
    {
      username: uniqueUsername('prodfailure'),
      password: VALID_PASSWORD,
    },
    { 'cf-connecting-ip': '203.0.113.31' },
    env,
  );
  const body = (await response.json()) as {
    error?: { code?: string; message?: string };
  };

  assertEqual(
    response.status,
    503,
    'failed production limiter returns dependency failure',
  );
  assertEqual(
    body.error?.code,
    'DEPENDENCY_FAILED',
    'failed production limiter uses the established code',
  );
  assertEqual(
    body.error?.message,
    'Rate limiting is unavailable.',
    'failed production limiter uses the established message',
  );
  assertEqual(
    identityQueries,
    0,
    'failed production limiter does not reach identity work',
  );
}

async function testRefreshLogoutKeysUseTrustedIpOnly(): Promise<void> {
  const keys: string[] = [];
  const fakeLimiters: AuthRateLimiters = {
    login: throwerLimiter('login'),
    register: throwerLimiter('register'),
    refresh: {
      async check(key) {
        keys.push(key);
        return {
          allowed: true,
          remaining: AUTH_RATE_LIMIT_POLICY.refresh.limit - 1,
          resetAt: Date.now() + 60_000,
        };
      },
    },
    logout: {
      async check(key) {
        keys.push(key);
        return {
          allowed: true,
          remaining: AUTH_RATE_LIMIT_POLICY.logout.limit - 1,
          resetAt: Date.now() + 60_000,
        };
      },
    },
  };

  const testApp = new Hono<ApiEnv>();
  testApp.post('/refresh-probe', async (c) => {
    await enforceAuthIpRateLimit(c, 'refresh', fakeLimiters);
    return c.text('ok');
  });
  testApp.post('/logout-probe', async (c) => {
    await enforceAuthIpRateLimit(c, 'logout', fakeLimiters);
    return c.text('ok');
  });

  await testApp.request('/refresh-probe', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.40',
      'x-forwarded-for': '198.51.100.40',
    },
    body: JSON.stringify({
      username: 'secret-user',
      refreshToken: 'secret-token',
    }),
  });

  await testApp.request('/logout-probe', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '203.0.113.40',
    },
  });

  assertEqual(
    keys[0],
    'refresh:203.0.113.40',
    'refresh subject contains only scope and trusted IP',
  );
  assertEqual(
    keys[0].includes('secret'),
    false,
    'refresh subject excludes username and token',
  );
  assertEqual(
    keys[1],
    `logout:${UNTRUSTED_AUTH_CLIENT_IP}`,
    'logout ignores X-Forwarded-For and uses the fixed fallback',
  );
}

async function testMissingProductionBindingStopsRefreshLogout(): Promise<void> {
  const cases = [
    { path: '/v1/auth/refresh', ip: '203.0.113.41' },
    { path: '/v1/auth/logout', ip: '203.0.113.42' },
  ];

  for (const { path, ip } of cases) {
    const { env, identityQueries } = productionDbEnv();
    const response = await post(
      path,
      { refreshToken: 'invalid-token' },
      { 'cf-connecting-ip': ip },
      env,
    );
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };

    assertEqual(
      response.status,
      503,
      `${path} missing production binding returns 503`,
    );
    assertEqual(
      body.error?.code,
      'DEPENDENCY_FAILED',
      `${path} missing production binding uses the established code`,
    );
    assertEqual(
      body.error?.message,
      'Rate limiting is unavailable.',
      `${path} missing production binding uses the established message`,
    );
    assertEqual(
      identityQueries(),
      0,
      `${path} missing production binding does not reach identity work`,
    );
  }
}

async function testFailedDurableCheckStopsRefreshLogout(): Promise<void> {
  const cases = [
    { path: '/v1/auth/refresh', ip: '203.0.113.43' },
    { path: '/v1/auth/logout', ip: '203.0.113.44' },
  ];

  for (const { path, ip } of cases) {
    const { namespace } = createDurableNamespace(
      () => new Response('unavailable', { status: 503 }),
    );
    const { env, identityQueries } = productionDbEnv({
      AUTH_RATE_LIMITER: namespace,
    });
    const response = await post(
      path,
      { refreshToken: 'invalid-token' },
      { 'cf-connecting-ip': ip },
      env,
    );
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };

    assertEqual(
      response.status,
      503,
      `${path} failed production limiter returns 503`,
    );
    assertEqual(
      body.error?.code,
      'DEPENDENCY_FAILED',
      `${path} failed production limiter uses the established code`,
    );
    assertEqual(
      body.error?.message,
      'Rate limiting is unavailable.',
      `${path} failed production limiter uses the established message`,
    );
    assertEqual(
      identityQueries(),
      0,
      `${path} failed production limiter does not reach identity work`,
    );
  }
}

async function testRefreshLogoutValidationDoesNotConsumeBudget(): Promise<void> {
  const refreshIp = '203.0.113.45';
  const refreshResponse = await post(
    '/v1/auth/refresh',
    {},
    { 'cf-connecting-ip': refreshIp },
  );

  assertEqual(refreshResponse.status, 401, 'malformed refresh is rejected');

  const refreshBudget = await authRefreshLimiter.check(
    authIpRateLimitKey('refresh', refreshIp),
  );

  assertEqual(
    refreshBudget.allowed,
    true,
    'malformed refresh leaves the refresh budget available',
  );
  assertEqual(
    refreshBudget.remaining,
    AUTH_RATE_LIMIT_POLICY.refresh.limit - 1,
    'malformed refresh does not consume the refresh budget',
  );

  const logoutIp = '203.0.113.46';
  const logoutResponse = await post(
    '/v1/auth/logout',
    {},
    { 'cf-connecting-ip': logoutIp },
  );

  assertEqual(logoutResponse.status, 401, 'malformed logout is rejected');

  const logoutBudget = await authLogoutLimiter.check(
    authIpRateLimitKey('logout', logoutIp),
  );

  assertEqual(
    logoutBudget.allowed,
    true,
    'malformed logout leaves the logout budget available',
  );
  assertEqual(
    logoutBudget.remaining,
    AUTH_RATE_LIMIT_POLICY.logout.limit - 1,
    'malformed logout does not consume the logout budget',
  );
}

async function testRefreshLogoutBudgetsAreIndependent(): Promise<void> {
  const refreshExhaustedIp = '203.0.113.47';
  const refreshKey = authIpRateLimitKey('refresh', refreshExhaustedIp);

  for (let i = 0; i < AUTH_RATE_LIMIT_POLICY.refresh.limit; i += 1) {
    await authRefreshLimiter.check(refreshKey);
  }

  const refreshLimited = await post(
    '/v1/auth/refresh',
    { refreshToken: 'invalid-token' },
    { 'cf-connecting-ip': refreshExhaustedIp },
  );
  const refreshLimitedBody = (await refreshLimited.json()) as {
    error?: { code?: string };
  };

  assertEqual(refreshLimited.status, 429, 'exhausted refresh returns 429');
  assertEqual(
    refreshLimitedBody.error?.code,
    'RATE_LIMITED',
    'exhausted refresh returns the standard error code',
  );
  assertEqual(
    refreshLimited.headers.get('x-ratelimit-remaining'),
    '0',
    'exhausted refresh sets remaining header',
  );
  assertNotEqual(
    refreshLimited.headers.get('x-ratelimit-reset'),
    null,
    'exhausted refresh sets reset header',
  );
  assertEqual(
    Number(refreshLimited.headers.get('retry-after')) > 0,
    true,
    'exhausted refresh sets retry-after header',
  );

  const logoutAfterRefresh = await post(
    '/v1/auth/logout',
    { refreshToken: 'invalid-token' },
    { 'cf-connecting-ip': refreshExhaustedIp },
  );

  assertEqual(
    logoutAfterRefresh.status,
    200,
    'exhausted refresh budget does not block logout',
  );

  const logoutExhaustedIp = '203.0.113.48';
  const logoutKey = authIpRateLimitKey('logout', logoutExhaustedIp);

  for (let i = 0; i < AUTH_RATE_LIMIT_POLICY.logout.limit; i += 1) {
    await authLogoutLimiter.check(logoutKey);
  }

  const logoutLimited = await post(
    '/v1/auth/logout',
    { refreshToken: 'invalid-token' },
    { 'cf-connecting-ip': logoutExhaustedIp },
  );
  const logoutLimitedBody = (await logoutLimited.json()) as {
    error?: { code?: string };
  };

  assertEqual(logoutLimited.status, 429, 'exhausted logout returns 429');
  assertEqual(
    logoutLimitedBody.error?.code,
    'RATE_LIMITED',
    'exhausted logout returns the standard error code',
  );
  assertEqual(
    logoutLimited.headers.get('x-ratelimit-remaining'),
    '0',
    'exhausted logout sets remaining header',
  );
  assertNotEqual(
    logoutLimited.headers.get('x-ratelimit-reset'),
    null,
    'exhausted logout sets reset header',
  );
  assertEqual(
    Number(logoutLimited.headers.get('retry-after')) > 0,
    true,
    'exhausted logout sets retry-after header',
  );

  const refreshAfterLogout = await post(
    '/v1/auth/refresh',
    { refreshToken: 'invalid-token' },
    { 'cf-connecting-ip': logoutExhaustedIp },
  );

  assertEqual(
    refreshAfterLogout.status,
    401,
    'exhausted logout budget does not block refresh',
  );
}

async function main(): Promise<void> {
  await testMiddlewareCallsLimiterOnce();
  await testMiddlewareRateLimitEnvelope();
  await testAuthKeyNormalizationAndTrustedIp();
  await testAllowedAuthAndExistingBehavior();
  await testLoginLimitAndIdentityNotInvoked();
  await testRegistrationLimitAndIdentityNotInvoked();
  await testNormalizationAndForwardedForIgnored();
  await testMalformedRequestsDoNotConsumeBudget();
  await testRegistrationAndLoginBudgetsAreIndependent();
  await testResolverKeepsInMemoryForLocalEnvironments();
  await testResolverUsesDurableObjectPolicies();
  await testResolverFailsClosedForUnknownOrMissingEnvironment();
  await testMissingProductionBindingStopsAuthRequest();
  await testFailedDurableCheckStopsIdentityWork();
  await testRefreshLogoutKeysUseTrustedIpOnly();
  await testMissingProductionBindingStopsRefreshLogout();
  await testFailedDurableCheckStopsRefreshLogout();
  await testRefreshLogoutValidationDoesNotConsumeBudget();
  await testRefreshLogoutBudgetsAreIndependent();

  console.log('AUTH RATE LIMIT TESTS PASSED');
}

void main().catch((error) => {
  console.error('AUTH RATE LIMIT TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
