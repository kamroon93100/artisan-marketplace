import { Hono } from 'hono';
import { AppError } from '../errors/app-error.js';
import type { ApiEnv } from '../context/api-env.js';
import {
  allowsInMemoryOperationRateLimiters,
  resolveOperationRateLimiters,
  buildOperationKey,
  type OperationRateLimitEnv,
  type OperationRateLimiters,
} from './operation-rate-limit.js';
import { OPERATION_POLICIES, type OperationScope, isOperationScope } from './operation-registry.js';
import { DurableObjectRateLimiter } from './durable-object-rate-limiter.js';
import { hashRateLimitSubject } from './durable-object-rate-limiter.js';
import { InMemorySlidingWindowRateLimiter } from './in-memory-rate-limiter.js';
import { enforceRateLimit } from './rate-limit-middleware.js';

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

/**
 * Creates a fake Durable Object namespace that enforces rate limits per objectName
 * (hashed subject). Each objectName gets its own counter; after the policy limit
 * is exceeded, it returns a denied response. This mimics the sliding-window
 * behavior for test purposes.
 */
function createEnforcingDurableNamespace(): {
  namespace: DurableObjectNamespace;
  checks: RecordedDurableCheck[];
  subjectByObjectName: Map<string, string>;
} {
  const checks: RecordedDurableCheck[] = [];
  const subjectByObjectName = new Map<string, string>();
  const callCounts = new Map<string, number>();

  const namespace = {
    idFromName(name: string) {
      return name as unknown as DurableObjectId;
    },
    get(id: DurableObjectId) {
      const objectName = String(id);
      return {
        async fetch(input: RequestInfo | URL, init?: RequestInit) {
          const body = JSON.parse(String(init?.body)) as RecordedDurableCheck['body'];
          const count = (callCounts.get(objectName) || 0) + 1;
          callCounts.set(objectName, count);

          const check: RecordedDurableCheck = {
            objectName,
            url: String(input),
            method: init?.method,
            body,
          };
          checks.push(check);

          // Enforce limit per objectName based on the policy in the request body
          if (count > body.limit) {
            return new Response(
              JSON.stringify({
                allowed: false,
                remaining: 0,
                resetAt: Date.now() + 60_000,
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            );
          }

          return new Response(
            JSON.stringify({
              allowed: true,
              remaining: body.limit - count,
              resetAt: Date.now() + 60_000,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return { namespace, checks, subjectByObjectName };
}

/**
 * Creates a fake Durable Object namespace with a fixed response function
 * (for tests that don't need enforcement, like the policy verification test).
 */
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

function deniedDurableResponse(limit: number): Response {
  return new Response(
    JSON.stringify({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

function badDurableResponse(): Response {
  return new Response('unavailable', { status: 503 });
}

async function testBuildOperationKey(): Promise<void> {
  const key1 = buildOperationKey('catalog.product.create', 'actor1');
  assertEqual(key1, 'catalog.product.create:actor1', 'buildOperationKey format');

  const key2 = buildOperationKey('catalog.product.publish', 'actor1');
  assertEqual(key2, 'catalog.product.publish:actor1', 'buildOperationKey for publish');

  const key3 = buildOperationKey('catalog.product.create', 'actor2');
  assertNotEqual(key1, key3, 'different actors have different keys');

  assertNotEqual(key1, key2, 'different scopes have different keys');
}

async function testOperationPoliciesCentralized(): Promise<void> {
  assertEqual(OPERATION_POLICIES['catalog.product.create'].limit, 30, 'product create limit');
  assertEqual(OPERATION_POLICIES['catalog.product.create'].windowMs, 60_000, 'product create window');

  assertEqual(OPERATION_POLICIES['catalog.product.publish'].limit, 10, 'product publish limit');
  assertEqual(OPERATION_POLICIES['catalog.product.publish'].windowMs, 60_000, 'product publish window');

  assertEqual(OPERATION_POLICIES['media.upload.authorization'].limit, 60, 'upload auth limit');
  assertEqual(OPERATION_POLICIES['media.upload.authorization'].windowMs, 60_000, 'upload auth window');

  assertEqual(OPERATION_POLICIES['media.upload.start'].limit, 60, 'upload start limit');
  assertEqual(OPERATION_POLICIES['media.upload.start'].windowMs, 60_000, 'upload start window');

  assertEqual(OPERATION_POLICIES['ai.job.enqueue'].limit, 10, 'ai enqueue limit');
  assertEqual(OPERATION_POLICIES['ai.job.enqueue'].windowMs, 60_000, 'ai enqueue window');

  assertEqual(OPERATION_POLICIES['ai.job.run'].limit, 10, 'ai run limit');
  assertEqual(OPERATION_POLICIES['ai.job.run'].windowMs, 60_000, 'ai run window');

  assertEqual(OPERATION_POLICIES['review.product.approve'].limit, 10, 'review approve limit');
  assertEqual(OPERATION_POLICIES['review.product.approve'].windowMs, 60_000, 'review approve window');

  assertEqual(OPERATION_POLICIES['inquiry.create'].limit, 10, 'inquiry create limit');
  assertEqual(OPERATION_POLICIES['inquiry.create'].windowMs, 60_000, 'inquiry create window');

  assertEqual(OPERATION_POLICIES['discovery.search'].limit, 60, 'discovery search limit');
  assertEqual(OPERATION_POLICIES['discovery.search'].windowMs, 60_000, 'discovery search window');

  assertEqual(OPERATION_POLICIES['discovery.read'].limit, 120, 'discovery read limit');
  assertEqual(OPERATION_POLICIES['discovery.read'].windowMs, 60_000, 'discovery read window');
}

async function testIsOperationScopeValidScopes(): Promise<void> {
  for (const scope of Object.keys(OPERATION_POLICIES) as OperationScope[]) {
    assertEqual(isOperationScope(scope), true, `isOperationScope(${scope}) returns true`);
  }
}

async function testIsOperationScopeInvalidValues(): Promise<void> {
  assertEqual(isOperationScope('toString'), false, 'toString returns false');
  assertEqual(isOperationScope('constructor'), false, 'constructor returns false');
  assertEqual(isOperationScope('__proto__'), false, '__proto__ returns false');
  assertEqual(isOperationScope('hasOwnProperty'), false, 'hasOwnProperty returns false');
  assertEqual(isOperationScope('valueOf'), false, 'valueOf returns false');

  assertEqual(isOperationScope('unknown.operation'), false, 'unknown scope returns false');
  assertEqual(isOperationScope(''), false, 'empty string returns false');
  assertEqual(isOperationScope('catalog.product.delete'), false, 'non-existent scope returns false');
}

/**
 * Regression test: same actor + different product IDs = shared budget for catalog.product.publish.
 * Uses the production resolver and a fake DO namespace that enforces the limit.
 * Two different product IDs resolve to the same stable subject (scope:actorId).
 * Asserts that ten checks are allowed and the eleventh is denied by the fake DO.
 */
async function testSameActorDifferentResourcesShareBudget(): Promise<void> {
  const { namespace, checks, subjectByObjectName } = createEnforcingDurableNamespace();

  const limiters = resolveOperationRateLimiters(
    {
      APP_ENV: 'production',
      AUTH_RATE_LIMITER: namespace,
    },
    'production',
  );

  const actorId = 'actor1';
  const scope: OperationScope = 'catalog.product.publish';
  const key = buildOperationKey(scope, actorId);
  const expectedHash = await hashRateLimitSubject(key);

  // Track the subject for this objectName so we can verify the hash later
  subjectByObjectName.set(expectedHash, key);

  // First 10 requests (simulating different product IDs but same actor+scope)
  // All use the same key because buildOperationKey excludes resource IDs
  for (let i = 0; i < 10; i++) {
    const result = await limiters[scope].check(key);
    assertEqual(result.allowed, true, `request ${i + 1} allowed`);
  }

  // 11th request should be denied by the fake DO (enforcing the limit)
  const deniedResult = await limiters[scope].check(key);
  assertEqual(deniedResult.allowed, false, '11th request denied');
  assertEqual(deniedResult.remaining, 0, 'remaining is 0');

  // Verify we made exactly 11 DO calls for this objectName
  const objectNameChecks = checks.filter(c => c.objectName === expectedHash);
  assertEqual(objectNameChecks.length, 11, '11 DO checks recorded for this subject');

  // Verify each check used the exact subject key we built
  for (const check of objectNameChecks) {
    assertEqual(check.objectName, expectedHash, 'objectName matches hashed subject');
    assertNotEqual(check.objectName, key, 'objectName is hashed, not raw subject');
    assertEqual(check.body.limit, 10, 'publish limit is 10');
    assertEqual(check.body.windowMs, 60_000, 'publish window is 60s');
  }
}

/**
 * Regression test: two different AI job IDs for the same actor share the ai.job.run budget.
 * Uses the production resolver and fake DO namespace with enforcement.
 * Proves the shared production-adapter budget is actually exhausted.
 */
async function testAiJobsDifferentIdsShareExecutionBudget(): Promise<void> {
  const { namespace, checks, subjectByObjectName } = createEnforcingDurableNamespace();

  const limiters = resolveOperationRateLimiters(
    {
      APP_ENV: 'production',
      AUTH_RATE_LIMITER: namespace,
    },
    'production',
  );

  const actorId = 'actor1';
  const scope: OperationScope = 'ai.job.run';
  const key = buildOperationKey(scope, actorId);
  const expectedHash = await hashRateLimitSubject(key);

  subjectByObjectName.set(expectedHash, key);

  // First 10 requests (simulating different job IDs but same actor+scope)
  for (let i = 0; i < 10; i++) {
    const result = await limiters[scope].check(key);
    assertEqual(result.allowed, true, `ai run ${i + 1} allowed`);
  }

  // 11th request should be denied by the fake DO
  const deniedResult = await limiters[scope].check(key);
  assertEqual(deniedResult.allowed, false, '11th ai run denied');
  assertEqual(deniedResult.remaining, 0, 'remaining is 0');

  // Verify we made exactly 11 DO calls for this objectName
  const objectNameChecks = checks.filter(c => c.objectName === expectedHash);
  assertEqual(objectNameChecks.length, 11, '11 DO checks recorded for this subject');

  // Verify each check used the exact subject key
  for (const check of objectNameChecks) {
    assertEqual(check.objectName, expectedHash, 'objectName matches hashed subject for ai.job.run');
    assertNotEqual(check.objectName, key, 'objectName is hashed, not raw subject');
    assertEqual(check.body.limit, 10, 'ai run limit is 10');
    assertEqual(check.body.windowMs, 60_000, 'ai run window is 60s');
  }
}

/**
 * Actor isolation: different actors have independent budgets.
 * Uses the production resolver and fake DO namespace with enforcement.
 * Proves different actor IDs produce separate hashed subjects and independently enforced budgets.
 */
async function testDifferentActorsIndependentBudgets(): Promise<void> {
  const { namespace, checks, subjectByObjectName } = createEnforcingDurableNamespace();

  const limiters = resolveOperationRateLimiters(
    {
      APP_ENV: 'production',
      AUTH_RATE_LIMITER: namespace,
    },
    'production',
  );

  const scope: OperationScope = 'catalog.product.publish';
  const key1 = buildOperationKey(scope, 'actor1');
  const key2 = buildOperationKey(scope, 'actor2');
  const hash1 = await hashRateLimitSubject(key1);
  const hash2 = await hashRateLimitSubject(key2);

  subjectByObjectName.set(hash1, key1);
  subjectByObjectName.set(hash2, key2);

  // Exhaust actor1's budget (10 allowed, 11th denied)
  for (let i = 0; i < 10; i++) {
    const result = await limiters[scope].check(key1);
    assertEqual(result.allowed, true, `actor1 request ${i + 1} allowed`);
  }
  const denied1 = await limiters[scope].check(key1);
  assertEqual(denied1.allowed, false, 'actor1 11th request denied');
  assertEqual(denied1.remaining, 0, 'actor1 remaining is 0');

  // Actor2 should still have full budget (10 allowed)
  for (let i = 0; i < 10; i++) {
    const result = await limiters[scope].check(key2);
    assertEqual(result.allowed, true, `actor2 request ${i + 1} allowed`);
  }

  // Verify different actors have different hashed subjects
  assertNotEqual(hash1, hash2, 'different actors have different hashed subjects');

  // Verify DO calls are tracked separately per objectName
  const actor1Checks = checks.filter(c => c.objectName === hash1);
  const actor2Checks = checks.filter(c => c.objectName === hash2);

  assertEqual(actor1Checks.length, 11, 'actor1 made 11 checks (10 allowed + 1 denied)');
  assertEqual(actor2Checks.length, 10, 'actor2 made 10 checks (all allowed)');

  // Verify each check's objectName matches its subject's hash
  for (const check of actor1Checks) {
    assertEqual(check.objectName, hash1, 'actor1 objectName matches hashed subject');
  }
  for (const check of actor2Checks) {
    assertEqual(check.objectName, hash2, 'actor2 objectName matches hashed subject');
  }
}

/**
 * Operation isolation: different operation scopes have independent budgets.
 * Uses the production resolver and fake DO namespace with enforcement.
 * Proves different operation scopes produce different subjects and independent enforcement.
 */
async function testSeparateOperationScopesIndependentBudgets(): Promise<void> {
  const { namespace, checks, subjectByObjectName } = createEnforcingDurableNamespace();

  const limiters = resolveOperationRateLimiters(
    {
      APP_ENV: 'production',
      AUTH_RATE_LIMITER: namespace,
    },
    'production',
  );

  const actorId = 'actor1';
  const scopes: OperationScope[] = [
    'catalog.product.create',
    'catalog.product.publish',
    'ai.job.enqueue',
    'ai.job.run',
    'media.upload.authorization',
    'media.upload.start',
    'review.product.approve',
    'inquiry.create',
    'discovery.search',
    'discovery.read',
  ];

  // Make one request per scope
  const expectedHashes: string[] = [];
  for (const scope of scopes) {
    const key = buildOperationKey(scope, actorId);
    const hash = await hashRateLimitSubject(key);
    expectedHashes.push(hash);
    subjectByObjectName.set(hash, key);
    const result = await limiters[scope].check(key);
    assertEqual(result.allowed, true, `${scope} first request allowed`);
  }

  // Should have 10 DO checks, one per scope
  assertEqual(checks.length, 10, '10 DO checks for 10 scopes');

  // Verify each scope used its own policy and objectName matches the exact subject hash
  const expectedPolicies = new Map([
    ['catalog.product.create', { limit: 30, windowMs: 60_000 }],
    ['catalog.product.publish', { limit: 10, windowMs: 60_000 }],
    ['ai.job.enqueue', { limit: 10, windowMs: 60_000 }],
    ['ai.job.run', { limit: 10, windowMs: 60_000 }],
    ['media.upload.authorization', { limit: 60, windowMs: 60_000 }],
    ['media.upload.start', { limit: 60, windowMs: 60_000 }],
    ['review.product.approve', { limit: 10, windowMs: 60_000 }],
    ['inquiry.create', { limit: 10, windowMs: 60_000 }],
    ['discovery.search', { limit: 60, windowMs: 60_000 }],
    ['discovery.read', { limit: 120, windowMs: 60_000 }],
  ]);

  for (const check of checks) {
    const subject = subjectByObjectName.get(check.objectName);
    assertNotEqual(subject, undefined, `subject recorded for objectName ${check.objectName}`);

    // CRITICAL: Compare each recorded objectName with hash of the exact subject for that request
    if (subject) {
      const expectedHash = await hashRateLimitSubject(subject);
      assertEqual(check.objectName, expectedHash, 'objectName === hashRateLimitSubject(exact subject)');
      assertNotEqual(check.objectName, subject, 'objectName is hashed, not raw subject');
    }

    // Verify policy matches
    let matched = false;
    for (const [scope, policy] of expectedPolicies.entries()) {
      if (check.body.limit === policy.limit && check.body.windowMs === policy.windowMs) {
        matched = true;
        break;
      }
    }
    assertEqual(matched, true, `check matches a known policy: limit=${check.body.limit}, window=${check.body.windowMs}`);
  }

  // Verify all expected policies were used
  for (const [scope, policy] of expectedPolicies.entries()) {
    const found = checks.some(c => c.body.limit === policy.limit && c.body.windowMs === policy.windowMs);
    assertEqual(found, true, `${scope} (limit=${policy.limit}, window=${policy.windowMs}) was checked`);
  }
}

async function testLocalEnvironmentAllowsInMemory(): Promise<void> {
  assertEqual(
    allowsInMemoryOperationRateLimiters(
      { APP_ENV: 'development', LOCAL_IN_MEMORY_AUTH_ENABLED: 'true' },
      'development',
    ),
    true,
    'development with opt-in allows in-memory',
  );

  assertEqual(
    allowsInMemoryOperationRateLimiters(
      { APP_ENV: 'test', LOCAL_IN_MEMORY_AUTH_ENABLED: 'true' },
      'test',
    ),
    true,
    'test with opt-in allows in-memory',
  );

  assertEqual(
    allowsInMemoryOperationRateLimiters(
      { APP_ENV: 'production', LOCAL_IN_MEMORY_AUTH_ENABLED: 'true' },
      'production',
    ),
    false,
    'production does not allow in-memory even with opt-in',
  );

  assertEqual(
    allowsInMemoryOperationRateLimiters(
      { APP_ENV: 'development' },
      'development',
    ),
    false,
    'development without opt-in does not allow in-memory',
  );

  assertEqual(
    allowsInMemoryOperationRateLimiters(
      { APP_ENV: 'test' },
      'test',
    ),
    false,
    'test without opt-in does not allow in-memory',
  );

  assertEqual(
    allowsInMemoryOperationRateLimiters(
      { LOCAL_IN_MEMORY_AUTH_ENABLED: 'true' },
      'test',
    ),
    false,
    'missing APP_ENV does not allow in-memory',
  );

  assertEqual(
    allowsInMemoryOperationRateLimiters(
      { APP_ENV: 'development', LOCAL_IN_MEMORY_AUTH_ENABLED: 'true' },
      'test',
    ),
    false,
    'development app under test build does not allow in-memory',
  );

  assertEqual(
    allowsInMemoryOperationRateLimiters(
      { APP_ENV: 'development', LOCAL_IN_MEMORY_AUTH_ENABLED: 'true' },
      'staging',
    ),
    false,
    'unknown build mode does not allow in-memory',
  );
}

async function testResolverReturnsInMemoryForLocal(): Promise<void> {
  const { namespace } = createDurableNamespace(
    ({ body }) => allowedDurableResponse(body.limit),
  );

  for (const environment of ['development', 'test'] as const) {
    const resolved = resolveOperationRateLimiters(
      {
        APP_ENV: environment,
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        AUTH_RATE_LIMITER: namespace,
      },
      environment,
    );

    const expectedScope = 'catalog.product.create';
    assertNotEqual(
      resolved[expectedScope],
      undefined,
      `${environment} returns limiter for ${expectedScope}`,
    );

    const key = buildOperationKey(expectedScope, 'actor1');
    const result = await resolved[expectedScope].check(key);
    assertEqual(result.allowed, true, `${environment} in-memory limiter allows`);
  }
}

/**
 * Verifies the resolver creates limiters with correct policies and that
 * each DO request's objectName equals the hash of the exact subject used.
 */
async function testResolverUsesDurableObjectPolicies(): Promise<void> {
  const { namespace, checks, subjectByObjectName } = createEnforcingDurableNamespace();

  const limiters = resolveOperationRateLimiters(
    {
      APP_ENV: 'production',
      AUTH_RATE_LIMITER: namespace,
    },
    'production',
  );

  // Exercise each limiter once with a known subject
  for (const [scope, policy] of Object.entries(OPERATION_POLICIES)) {
    const limiter = limiters[scope as OperationScope];
    assertNotEqual(limiter, undefined, `${scope} limiter exists`);

    const key = buildOperationKey(scope as OperationScope, 'actor1');
    const hash = await hashRateLimitSubject(key);
    subjectByObjectName.set(hash, key);

    const result = await limiter.check(key);
    assertEqual(result.allowed, true, `${scope} production check allowed`);
  }

  // Verify each recorded DO request
  for (const check of checks) {
    assertEqual(check.url, 'https://rate-limiter.internal/check', 'check calls correct path');
    assertEqual(check.method, 'POST', 'check uses POST');

    const subject = subjectByObjectName.get(check.objectName);
    assertNotEqual(subject, undefined, `subject recorded for objectName ${check.objectName}`);

    if (subject) {
      // CRITICAL: Compare each recorded objectName with hash of the exact subject for that request
      const expectedHash = await hashRateLimitSubject(subject);
      assertEqual(check.objectName, expectedHash, 'objectName === hashRateLimitSubject(exact subject)');
      assertNotEqual(check.objectName, subject, 'objectName is hashed, not raw subject');
    }

    // Verify the policy matches what we expect for that scope
    // Find which policy this check corresponds to by looking up the subject
    const subjectForCheck = subjectByObjectName.get(check.objectName);
    if (subjectForCheck) {
      const scopeFromSubject = subjectForCheck.split(':')[0];
      const expectedPolicy = OPERATION_POLICIES[scopeFromSubject as OperationScope];
      if (expectedPolicy) {
        assertEqual(check.body.limit, expectedPolicy.limit, `${scopeFromSubject} limit matches policy`);
        assertEqual(check.body.windowMs, expectedPolicy.windowMs, `${scopeFromSubject} window matches policy`);
      }
    }
  }

  // Verify all expected policies were used
  const checkedPolicies = new Set<string>();
  for (const check of checks) {
    checkedPolicies.add(`${check.body.limit}:${check.body.windowMs}`);
  }

  for (const [scope, policy] of Object.entries(OPERATION_POLICIES)) {
    assertEqual(
      checkedPolicies.has(`${policy.limit}:${policy.windowMs}`),
      true,
      `${scope} (limit=${policy.limit}, window=${policy.windowMs}) was checked`,
    );
  }
}

async function testProductionFailsClosedWithoutBinding(): Promise<void> {
  const environments: Array<{
    label: string;
    env: OperationRateLimitEnv;
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
    try {
      resolveOperationRateLimiters(env, buildMode);
      throw new Error(`${label}: expected DEPENDENCY_FAILED, but no error was raised.`);
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        error.code !== 'DEPENDENCY_FAILED'
      ) {
        throw new Error(
          `${label}: expected DEPENDENCY_FAILED, received ${String(error)}.`,
        );
      }
      assertEqual(
        error.message,
        'Rate limiting is unavailable.',
        `${label} uses established message`,
      );
    }
  }
}

async function testFailedDurableCheckStopsProtectedWork(): Promise<void> {
  const { namespace } = createDurableNamespace(
    () => badDurableResponse(),
  );

  const limiters = resolveOperationRateLimiters(
    {
      APP_ENV: 'production',
      AUTH_RATE_LIMITER: namespace,
    },
    'production',
  );

  const scopes: OperationScope[] = [
    'catalog.product.create',
    'catalog.product.publish',
    'ai.job.run',
  ];

  for (const scope of scopes) {
    try {
      await limiters[scope].check(buildOperationKey(scope, 'actor1'));
      throw new Error(`${scope}: expected DEPENDENY_FAILED, but no error was raised.`);
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        error.code !== 'DEPENDENCY_FAILED'
      ) {
        throw new Error(
          `${scope}: expected DEPENDENCY_FAILED, received ${String(error)}.`,
        );
      }
      assertEqual(
        error.message,
        'Rate limiting is unavailable.',
        `${scope} uses established message`,
      );
    }
  }
}

async function testInvalidDurableResponseStopsWork(): Promise<void> {
  const { namespace } = createDurableNamespace(
    () =>
      new Response(
        JSON.stringify({ allowed: true }), // Missing remaining and resetAt
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );

  const limiters = resolveOperationRateLimiters(
    {
      APP_ENV: 'production',
      AUTH_RATE_LIMITER: namespace,
    },
    'production',
  );

  try {
    await limiters['catalog.product.create'].check(
      buildOperationKey('catalog.product.create', 'actor1'),
    );
    throw new Error('expected DEPENDENCY_FAILED for malformed response');
  } catch (error) {
    assertEqual(
      error instanceof AppError && error.code === 'DEPENDENCY_FAILED',
      true,
      'malformed response fails closed',
    );
  }
}

async function testMiddlewareRateLimitEnvelope(): Promise<void> {
  const resetAt = Date.now() + 30_000;
  const limiter: import('./rate-limiter.js').RateLimiter = {
    async check() {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    },
  };

  const testApp = new Hono<ApiEnv>();
  testApp.post('/probe', async (c) => {
    await enforceRateLimit(c, limiter, 'test:actor1', 'test operation');
    return c.text('ok');
  });
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

  const response = await testApp.request('/probe', { method: 'POST' });
  const body = (await response.json()) as {
    error?: { code?: string; details?: { resetAt?: number } };
  };

  assertEqual(response.status, 429, 'middleware returns 429');
  assertEqual(body.error?.code, 'RATE_LIMITED', 'middleware returns standard error code');
  assertEqual(response.headers.get('x-ratelimit-remaining'), '0', 'middleware sets remaining header');
  assertEqual(response.headers.get('x-ratelimit-reset'), String(resetAt), 'middleware sets reset header');
  assertEqual(Number(response.headers.get('retry-after')) > 0, true, 'middleware sets retry-after header');
  assertEqual(body.error?.details?.resetAt, resetAt, 'middleware includes resetAt details');
}

async function testAllowedRequestSetsHeaders(): Promise<void> {
  const limiter: import('./rate-limiter.js').RateLimiter = {
    async check() {
      return {
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 60_000,
      };
    },
  };

  const testApp = new Hono<ApiEnv>();
  testApp.post('/probe', async (c) => {
    await enforceRateLimit(c, limiter, 'test:actor1', 'test operation');
    return c.text('ok');
  });

  const response = await testApp.request('/probe', { method: 'POST' });

  assertEqual(response.status, 200, 'allowed request succeeds');
  assertEqual(response.headers.get('x-ratelimit-remaining'), '5', 'allowed request sets remaining header');
  assertNotEqual(response.headers.get('x-ratelimit-reset'), null, 'allowed request sets reset header');
  assertEqual(response.headers.get('retry-after'), null, 'allowed request does not set retry-after');
}

async function main(): Promise<void> {
  await testBuildOperationKey();
  await testOperationPoliciesCentralized();
  await testIsOperationScopeValidScopes();
  await testIsOperationScopeInvalidValues();
  await testSameActorDifferentResourcesShareBudget();
  await testDifferentActorsIndependentBudgets();
  await testAiJobsDifferentIdsShareExecutionBudget();
  await testSeparateOperationScopesIndependentBudgets();
  await testLocalEnvironmentAllowsInMemory();
  await testResolverReturnsInMemoryForLocal();
  await testResolverUsesDurableObjectPolicies();
  await testProductionFailsClosedWithoutBinding();
  await testFailedDurableCheckStopsProtectedWork();
  await testInvalidDurableResponseStopsWork();
  await testMiddlewareRateLimitEnvelope();
  await testAllowedRequestSetsHeaders();

  console.log('OPERATION RATE LIMIT TESTS PASSED');
}

void main().catch((error) => {
  console.error('OPERATION RATE LIMIT TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});