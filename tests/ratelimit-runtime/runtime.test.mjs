import assert from 'node:assert/strict';

const baseUrl = process.argv[2];
const phase = process.argv[3];

if (!baseUrl) {
  throw new Error('RUNTIME TEST: base URL argument is required.');
}

if (phase !== 'phase-a' && phase !== 'phase-b') {
  throw new Error('RUNTIME TEST: phase must be phase-a or phase-b.');
}

const PERSISTENCE_SUBJECT = 'login:203.0.113.10:runtime-persistence';
const PERSISTENCE_LIMIT = 2;
const PERSISTENCE_WINDOW_MS = 1_000;

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed = null;

  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  return { status: response.status, body: parsed };
}

async function postText(path, text) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: text,
  });
  let parsed = null;

  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  return { status: response.status, body: parsed };
}

function assertResult(result, expected, label) {
  assert.equal(result.allowed, expected.allowed, `${label}: allowed`);
  assert.equal(result.remaining, expected.remaining, `${label}: remaining`);
  assert.equal(result.resetAt, expected.resetAt, `${label}: resetAt`);
}

function asResult(body, label) {
  assert.equal(typeof body, 'object', `${label}: result must be an object`);
  assert.notEqual(body, null, `${label}: result must not be null`);
  assert.equal(typeof body.allowed, 'boolean', `${label}: allowed type`);
  assert.equal(typeof body.remaining, 'number', `${label}: remaining type`);
  assert.equal(typeof body.resetAt, 'number', `${label}: resetAt type`);
  assert.equal(Number.isInteger(body.remaining), true, `${label}: remaining integer`);
  assert.equal(Number.isFinite(body.resetAt), true, `${label}: resetAt finite`);

  return body;
}

async function check(subject, limit, windowMs, now) {
  const response = await postJson('/check', {
    subject,
    limit,
    windowMs,
    now,
  });

  assert.equal(
    response.status,
    200,
    `rate-limit check failed with status ${response.status}`,
  );

  return asResult(response.body, 'rate-limit check');
}

async function testAllowDenyAndNoConsumption() {
  const subject = PERSISTENCE_SUBJECT;
  const first = await check(subject, PERSISTENCE_LIMIT, PERSISTENCE_WINDOW_MS, 10_000);
  const second = await check(subject, PERSISTENCE_LIMIT, PERSISTENCE_WINDOW_MS, 10_100);
  const denied = await check(subject, PERSISTENCE_LIMIT, PERSISTENCE_WINDOW_MS, 10_200);
  const deniedAgain = await check(subject, PERSISTENCE_LIMIT, PERSISTENCE_WINDOW_MS, 10_300);
  const boundary = await check(subject, PERSISTENCE_LIMIT, PERSISTENCE_WINDOW_MS, 11_000);

  assertResult(
    first,
    { allowed: true, remaining: 1, resetAt: 11_000 },
    'first attempt',
  );
  assertResult(
    second,
    { allowed: true, remaining: 0, resetAt: 11_000 },
    'limit-th attempt',
  );
  assertResult(
    denied,
    { allowed: false, remaining: 0, resetAt: 11_000 },
    'attempt over limit',
  );
  assertResult(
    deniedAgain,
    { allowed: false, remaining: 0, resetAt: 11_000 },
    'repeated denial does not consume or move the boundary',
  );
  assertResult(
    boundary,
    { allowed: true, remaining: 0, resetAt: 11_100 },
    'first attempt expires exactly at the boundary',
  );
}

async function testIndependentSubjectsAndStableIdentity() {
  const firstSubject = 'login:203.0.113.11:runtime-independent-a';
  const secondSubject = 'login:203.0.113.12:runtime-independent-b';

  const first = await check(firstSubject, 1, 1_000, 12_000);
  const firstAgain = await check(firstSubject, 1, 1_000, 12_001);
  const second = await check(secondSubject, 1, 1_000, 12_002);
  const secondAgain = await check(secondSubject, 1, 1_000, 12_003);

  assertResult(
    first,
    { allowed: true, remaining: 0, resetAt: 13_000 },
    'first independent subject',
  );
  assertResult(
    firstAgain,
    { allowed: false, remaining: 0, resetAt: 13_000 },
    'same subject resolves to the same stored state',
  );
  assertResult(
    second,
    { allowed: true, remaining: 0, resetAt: 13_002 },
    'second subject has independent state',
  );
  assertResult(
    secondAgain,
    { allowed: false, remaining: 0, resetAt: 13_002 },
    'second subject denies independently',
  );
}

async function testOperationScopesAreIndependent() {
  const refreshSubject = 'refresh:203.0.113.20';
  const logoutSubject = 'logout:203.0.113.20';

  const refreshAllowed = await check(refreshSubject, 1, 1_000, 13_000);
  const refreshDenied = await check(refreshSubject, 1, 1_000, 13_001);
  const logoutAllowed = await check(logoutSubject, 1, 1_000, 13_002);
  const logoutDenied = await check(logoutSubject, 1, 1_000, 13_003);

  assertResult(
    refreshAllowed,
    { allowed: true, remaining: 0, resetAt: 14_000 },
    'refresh scope is allowed',
  );
  assertResult(
    refreshDenied,
    { allowed: false, remaining: 0, resetAt: 14_000 },
    'refresh scope denies independently',
  );
  assertResult(
    logoutAllowed,
    { allowed: true, remaining: 0, resetAt: 14_002 },
    'logout scope is independent from refresh',
  );
  assertResult(
    logoutDenied,
    { allowed: false, remaining: 0, resetAt: 14_002 },
    'logout scope denies independently',
  );
}

async function testInvalidInternalRequestsDoNotMutate() {
  const subject = 'login:203.0.113.30:runtime-invalid-do';

  const unknownField = await postJson('/raw-do', {
    subject,
    body: {
      limit: 2,
      windowMs: 1_000,
      now: 14_000,
      unexpected: true,
    },
  });
  const invalidLimit = await postJson('/raw-do', {
    subject,
    body: {
      limit: 0,
      windowMs: 1_000,
      now: 14_001,
    },
  });

  assert.equal(unknownField.status, 400, 'unknown DO field must be rejected');
  assert.deepEqual(
    unknownField.body,
    { error: 'INVALID_REQUEST' },
    'unknown DO field safe rejection',
  );
  assert.equal(invalidLimit.status, 400, 'invalid DO limit must be rejected');
  assert.deepEqual(
    invalidLimit.body,
    { error: 'INVALID_REQUEST' },
    'invalid DO limit safe rejection',
  );

  const firstValid = await check(subject, 2, 1_000, 14_000);

  assertResult(
    firstValid,
    { allowed: true, remaining: 1, resetAt: 15_000 },
    'invalid internal requests did not mutate storage',
  );
}

async function testMalformedCheckBodiesAreRejected() {
  const subject = 'login:203.0.113.31:runtime-invalid-check';

  const unknownField = await postJson('/check', {
    subject,
    limit: 2,
    windowMs: 1_000,
    now: 15_000,
    unexpected: true,
  });
  const malformedJson = await postText('/check', '{');

  assert.equal(unknownField.status, 400, 'unknown /check field must be rejected');
  assert.deepEqual(
    unknownField.body,
    { error: 'INVALID_REQUEST' },
    'unknown /check field safe rejection',
  );
  assert.equal(malformedJson.status, 400, 'malformed /check JSON must be rejected');
  assert.deepEqual(
    malformedJson.body,
    { error: 'INVALID_REQUEST' },
    'malformed /check JSON safe rejection',
  );

  const firstValid = await check(subject, 2, 1_000, 15_000);

  assertResult(
    firstValid,
    { allowed: true, remaining: 1, resetAt: 16_000 },
    'malformed /check requests never reached the rate-limit operation',
  );
}

async function runPhaseA() {
  await testAllowDenyAndNoConsumption();
  await testIndependentSubjectsAndStableIdentity();
  await testOperationScopesAreIndependent();
  await testInvalidInternalRequestsDoNotMutate();
  await testMalformedCheckBodiesAreRejected();

  console.log('LOCAL DURABLE OBJECT RUNTIME PHASE A PASSED');
}

async function runPhaseB() {
  const beforeBoundary = await check(
    PERSISTENCE_SUBJECT,
    PERSISTENCE_LIMIT,
    PERSISTENCE_WINDOW_MS,
    11_099,
  );
  const atBoundary = await check(
    PERSISTENCE_SUBJECT,
    PERSISTENCE_LIMIT,
    PERSISTENCE_WINDOW_MS,
    11_100,
  );
  const freshSubject = await check(
    'login:203.0.113.32:runtime-fresh-after-restart',
    2,
    1_000,
    11_100,
  );

  assertResult(
    beforeBoundary,
    { allowed: false, remaining: 0, resetAt: 11_100 },
    'stored attempts survive Worker restart',
  );
  assertResult(
    atBoundary,
    { allowed: true, remaining: 0, resetAt: 12_000 },
    'stored attempts expire exactly at the boundary after restart',
  );
  assertResult(
    freshSubject,
    { allowed: true, remaining: 1, resetAt: 12_100 },
    'fresh subject remains independently usable after restart',
  );

  console.log('LOCAL DURABLE OBJECT RESTART PERSISTENCE PASSED');
}

try {
  if (phase === 'phase-a') {
    await runPhaseA();
  } else {
    await runPhaseB();
  }
} catch (error) {
  console.error('LOCAL DURABLE OBJECT RUNTIME TEST FAILED');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
