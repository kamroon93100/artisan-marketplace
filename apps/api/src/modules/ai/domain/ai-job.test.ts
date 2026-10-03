import assert from 'node:assert/strict';
import {
  assertValidJobTransition,
  canTransitionJob,
  defaultMaxAttempts,
  describeJobFailure,
  isRetryDue,
  isRunnableJobState,
  isTerminalJobState,
  nextAttemptAt,
  resolveFailureState,
  retryDelayMs,
  AiJobTransitionError,
} from './ai-job.js';
import type { AiFailure, AiJob } from '@artisan-marketplace/contracts';

function failure(
  code: AiFailure['code'],
  retryable: boolean,
): AiFailure {
  return {
    code,
    message: `fixture ${code}`,
    diagnostic: null,
    retryable,
  };
}

function job(overrides: Partial<AiJob> = {}): AiJob {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    productId: '00000000-0000-4000-8000-000000000002',
    ownerId: 'artisan-1',
    jobType: 'CATALOG_FIELD_GENERATION',
    state: 'QUEUED',
    provider: 'deterministic-local',
    model: 'fixture',
    modelVersion: '1',
    promptVersion: 'p/1',
    schemaVersion: 's/1',
    pipelineVersion: 'v/1',
    input: {
      productId: '00000000-0000-4000-8000-000000000002',
      capturedAt: '2026-09-26T00:00:00.000Z',
      product: {
        title: null,
        description: null,
        category: null,
        materials: [],
      },
      media: [],
      transcription: null,
    },
    inputHash: 'hash',
    attemptCount: 0,
    maxAttempts: 3,
    correlationId: 'corr-1',
    causationId: null,
    idempotencyKey: 'key-1',
    failure: null,
    nextAttemptAt: null,
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function testTransitions(): void {
  assert.ok(
    canTransitionJob('QUEUED', 'RUNNING'),
    'QUEUED may begin an attempt.',
  );
  assert.ok(
    canTransitionJob('RUNNING', 'SUCCEEDED'),
    'RUNNING may succeed.',
  );
  assert.ok(
    canTransitionJob('RUNNING', 'PARTIAL_RESULT'),
    'RUNNING may produce a partial result.',
  );
  assert.ok(
    canTransitionJob('RUNNING', 'RETRYING'),
    'RUNNING may be retried.',
  );
  assert.ok(
    canTransitionJob('RETRYING', 'RUNNING'),
    'RETRYING may begin the next attempt.',
  );

  assert.ok(
    !canTransitionJob('SUCCEEDED', 'RUNNING'),
    'a terminal job must never run again.',
  );
  assert.ok(
    !canTransitionJob('FAILED', 'RUNNING'),
    'a permanent failure must not run again.',
  );
  assert.ok(
    !canTransitionJob('DEAD_LETTERED', 'RUNNING'),
    'a dead letter must not run again.',
  );

  assert.throws(
    () => assertValidJobTransition('QUEUED', 'SUCCEEDED'),
    AiJobTransitionError,
    'a job cannot skip RUNNING.',
  );
}

function testRunnableAndTerminal(): void {
  assert.ok(
    isRunnableJobState('QUEUED'),
    'QUEUED is runnable.',
  );
  assert.ok(
    isRunnableJobState('RETRYING'),
    'RETRYING is runnable when due.',
  );
  assert.ok(
    isRunnableJobState('PARTIAL_RESULT'),
    'PARTIAL_RESULT is runnable.',
  );
  assert.ok(
    !isRunnableJobState('RUNNING'),
    'RUNNING is already in flight.',
  );

  for (const state of ['SUCCEEDED', 'FAILED', 'DEAD_LETTERED']) {
    assert.ok(
      isTerminalJobState(state as AiJob['state']),
      `${state} is terminal.`,
    );
    assert.ok(
      !isRunnableJobState(state as AiJob['state']),
      `${state} must not be runnable.`,
    );
  }

  assert.ok(
    !isTerminalJobState('PARTIAL_RESULT'),
    'PARTIAL_RESULT is recoverable, not terminal.',
  );
  assert.ok(
    !isTerminalJobState('RETRYING'),
    'RETRYING is recoverable, not terminal.',
  );
}

function testFailureStateResolution(): void {
  assert.equal(
    resolveFailureState(1, 3, failure('PROVIDER_AUTHENTICATION', false)),
    'FAILED',
    'a permanent failure is FAILED however much budget remains.',
  );

  assert.equal(
    resolveFailureState(1, 3, failure('PROVIDER_UNAVAILABLE', true)),
    'RETRYING',
    'a transient failure with budget remains RETRYING.',
  );

  assert.equal(
    resolveFailureState(3, 3, failure('PROVIDER_UNAVAILABLE', true)),
    'DEAD_LETTERED',
    'a transient failure at the budget limit is DEAD_LETTERED.',
  );
}

function testBackoff(): void {
  assert.equal(retryDelayMs(1), 1_000, 'attempt 1 waits the base delay.');
  assert.equal(retryDelayMs(2), 2_000, 'attempt 2 doubles the delay.');
  assert.equal(retryDelayMs(3), 4_000, 'attempt 3 doubles again.');
  assert.equal(
    retryDelayMs(10),
    60_000,
    'the delay is capped at the maximum.',
  );
  assert.equal(retryDelayMs(0), 0, 'no retired attempt waits.');

  const due = nextAttemptAt(1, Date.now());
  assert.ok(
    Date.parse(due) >= Date.now() + 900,
    'the persisted delay is the base delay.',
  );
}

function testDueAndBudget(): void {
  assert.ok(
    isRetryDue(job({ nextAttemptAt: null }), Date.now()),
    'no backoff means an attempt is due now.',
  );

  assert.ok(
    !isRetryDue(
      job({ nextAttemptAt: new Date(Date.now() + 5_000).toISOString() }),
      Date.now(),
    ),
    'a job with a future backoff is not due.',
  );

  assert.ok(
    isRetryDue(
      job({ nextAttemptAt: new Date(Date.now() - 5_000).toISOString() }),
      Date.now(),
    ),
    'a job whose backoff has passed is due.',
  );

  assert.equal(defaultMaxAttempts(undefined), 3, 'defaults to the contract value.');
  assert.equal(defaultMaxAttempts(5), 5, 'an explicit budget is honored.');
  assert.equal(defaultMaxAttempts(0), 3, 'an invalid budget falls back.');
  assert.equal(defaultMaxAttempts(-2), 3, 'a negative budget falls back.');
  assert.equal(defaultMaxAttempts(1.5), 3, 'a fractional budget falls back.');
}

function testDescribe(): void {
  const description = describeJobFailure(
    job({
      state: 'FAILED',
      attemptCount: 2,
      failure: failure('PROVIDER_TIMEOUT', true),
    }),
  );

  assert.match(description, /FAILED/);
  assert.match(description, /2 attempt/);
  assert.match(description, /PROVIDER_TIMEOUT/);
}

async function main(): Promise<void> {
  testTransitions();
  testRunnableAndTerminal();
  testFailureStateResolution();
  testBackoff();
  testDueAndBudget();
  testDescribe();

  console.log('AI JOB STATE MACHINE TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});