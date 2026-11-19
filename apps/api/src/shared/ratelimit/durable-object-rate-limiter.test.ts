import { AppError } from '../errors/app-error.js';
import {
  DurableObjectRateLimiter,
  hashRateLimitSubject,
} from './durable-object-rate-limiter.js';
import type { RateLimitResult } from './rate-limiter.js';

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

async function assertDependencyFailure(
  action: () => Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof AppError && error.code === 'DEPENDENCY_FAILED') {
      return;
    }

    throw new Error(
      `${label}: expected DEPENDENCY_FAILED, received ${String(error)}.`,
    );
  }

  throw new Error(`${label}: expected a dependency failure.`);
}

type CapturedRequest = {
  url: string;
  init?: RequestInit;
};

function fakeNamespace(
  handler: (request: CapturedRequest) => Response | Promise<Response>,
) {
  const names: string[] = [];
  const requests: CapturedRequest[] = [];

  const namespace = {
    idFromName(name: string) {
      names.push(name);
      return { toString: () => name } as unknown as DurableObjectId;
    },
    get() {
      return {
        async fetch(url: string, init?: RequestInit) {
          const request = { url, init };
          requests.push(request);
          return handler(request);
        },
      };
    },
  } as unknown as DurableObjectNamespace;

  return { namespace, names, requests };
}

function jsonResponse(
  value: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function testHashIdentity(): Promise<void> {
  const first = await hashRateLimitSubject(
    'login:203.0.113.10:caseuser',
  );
  const second = await hashRateLimitSubject(
    'login:203.0.113.10:caseuser',
  );
  const different = await hashRateLimitSubject(
    'login:203.0.113.11:caseuser',
  );

  assertEqual(first, second, 'same subject has stable SHA-256 identity');
  assertNotEqual(first, different, 'different subjects have different hashes');
  assertEqual(
    /^[0-9a-f]{64}$/.test(first),
    true,
    'object identity is lowercase SHA-256 hex',
  );
  assertNotEqual(
    first,
    'login:203.0.113.10:caseuser',
    'object identity never equals the raw subject',
  );
}

async function testAdapterRequestAndValidResult(): Promise<void> {
  const expectedResult: RateLimitResult = {
    allowed: true,
    remaining: 4,
    resetAt: 61_000,
  };
  const { namespace, names, requests } = fakeNamespace(() =>
    jsonResponse(expectedResult),
  );
  const subject = 'register:203.0.113.10:CaseUser';
  const adapter = new DurableObjectRateLimiter(
    namespace,
    5,
    60_000,
    () => 12_345,
  );

  const result = await adapter.check(subject);
  const expectedName = await hashRateLimitSubject(subject);
  const request = requests[0];

  assertEqual(result.allowed, true, 'valid result allowed');
  assertEqual(result.remaining, 4, 'valid result remaining');
  assertEqual(result.resetAt, 61_000, 'valid result resetAt');
  assertEqual(names.length, 1, 'one object id derived');
  assertEqual(names[0], expectedName, 'object id is the subject hash');
  assertNotEqual(names[0], subject, 'raw subject is not the object id');
  assertEqual(
    request?.url,
    'https://rate-limiter.internal/check',
    'internal request path',
  );
  assertEqual(request?.init?.method, 'POST', 'internal request method');
  assertEqual(
    new Headers(request?.init?.headers).get('content-type'),
    'application/json',
    'internal request content type',
  );

  const body = JSON.parse(String(request?.init?.body)) as {
    limit?: number;
    windowMs?: number;
    now?: number;
  };

  assertEqual(body.limit, 5, 'request carries limit');
  assertEqual(body.windowMs, 60_000, 'request carries window');
  assertEqual(body.now, 12_345, 'request carries injected timestamp');
}

async function testAdapterRejectsMalformedResults(): Promise<void> {
  const cases: Array<[string, unknown]> = [
    ['missing allowed', { remaining: 0, resetAt: 1 }],
    ['string remaining', { allowed: true, remaining: '0', resetAt: 1 }],
    ['negative remaining', { allowed: true, remaining: -1, resetAt: 1 }],
    ['fractional remaining', { allowed: true, remaining: 1.5, resetAt: 1 }],
    ['remaining over limit', { allowed: true, remaining: 6, resetAt: 1 }],
    ['missing resetAt', { allowed: true, remaining: 0 }],
    ['non-numeric resetAt', { allowed: true, remaining: 0, resetAt: null }],
    ['array result', [true, 0, 1]],
  ];

  for (const [label, result] of cases) {
    const { namespace } = fakeNamespace(() => jsonResponse(result));
    const adapter = new DurableObjectRateLimiter(namespace, 5, 60_000);

    await assertDependencyFailure(
      () => adapter.check('login:203.0.113.10:caseuser'),
      label,
    );
  }
}

async function testAdapterFailsClosed(): Promise<void> {
  const missingBinding = new DurableObjectRateLimiter(
    undefined,
    5,
    60_000,
  );

  await assertDependencyFailure(
    () => missingBinding.check('login:203.0.113.10:caseuser'),
    'missing namespace',
  );

  const { namespace: failedNamespace } = fakeNamespace(() => {
    throw new Error('network failure');
  });
  const failedFetch = new DurableObjectRateLimiter(
    failedNamespace,
    5,
    60_000,
  );

  await assertDependencyFailure(
    () => failedFetch.check('login:203.0.113.10:caseuser'),
    'failed fetch',
  );

  const { namespace: nonOkNamespace } = fakeNamespace(() =>
    jsonResponse({ error: 'nope' }, 500),
  );
  const nonOk = new DurableObjectRateLimiter(nonOkNamespace, 5, 60_000);

  await assertDependencyFailure(
    () => nonOk.check('login:203.0.113.10:caseuser'),
    'non-200 response',
  );

  const { namespace: invalidJsonNamespace } = fakeNamespace(() =>
    new Response('not-json', { status: 200 }),
  );
  const invalidJson = new DurableObjectRateLimiter(
    invalidJsonNamespace,
    5,
    60_000,
  );

  await assertDependencyFailure(
    () => invalidJson.check('login:203.0.113.10:caseuser'),
    'invalid JSON response',
  );
}

function testInvalidAdapterConfiguration(): void {
  for (const limit of [0, -1, 1.5, Number.NaN]) {
    let threw = false;

    try {
      new DurableObjectRateLimiter(undefined, limit, 60_000);
    } catch (error) {
      threw = error instanceof RangeError;
    }

    assertEqual(threw, true, `invalid adapter limit ${String(limit)}`);
  }

  for (const windowMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    let threw = false;

    try {
      new DurableObjectRateLimiter(undefined, 5, windowMs);
    } catch (error) {
      threw = error instanceof RangeError;
    }

    assertEqual(threw, true, `invalid adapter window ${String(windowMs)}`);
  }
}

async function main(): Promise<void> {
  await testHashIdentity();
  await testAdapterRequestAndValidResult();
  await testAdapterRejectsMalformedResults();
  await testAdapterFailsClosed();
  testInvalidAdapterConfiguration();

  console.log('DURABLE OBJECT RATE LIMITER TESTS PASSED');
}

void main().catch((error) => {
  console.error('DURABLE OBJECT RATE LIMITER TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
