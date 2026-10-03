import {
  PostgresAiRepository,
} from './postgres-ai-repository.js';
import assert from 'node:assert/strict';
import {
  AiJobStateConflictError,
  AiProposalDecisionConflictError,
} from '../application/ai-repository.js';
import type {
  Database,
  Transaction,
} from '../../../shared/persistence/database.js';
import type { DraftProposal } from '../domain/ai-validation-pipeline.js';
import type { AiJob } from '@artisan-marketplace/contracts';

type QueryCall = {
  sql: string;
  params?: readonly unknown[];
};

class FakeDatabase implements Database {
  readonly calls: QueryCall[] = [];
  transactions = 0;
  private queuedRows: Array<readonly unknown[]> = [];

  queueRows(...rows: readonly unknown[][]): void {
    this.queuedRows = [...rows];
  }

  async query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly T[]> {
    this.calls.push({ sql, params });

    return (this.queuedRows.shift() ?? []) as readonly T[];
  }

  async transaction<T>(
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    this.transactions += 1;

    return operation({
      query: (sql, params) => this.query(sql, params),
    });
  }
}

const JOB_ID = '00000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000002';
const OWNER_ID = '00000000-0000-4000-8000-000000000003';

function job(): AiJob {
  return {
    id: JOB_ID,
    productId: PRODUCT_ID,
    ownerId: OWNER_ID,
    jobType: 'CATALOG_FIELD_GENERATION',
    state: 'QUEUED',
    provider: 'deterministic-local',
    model: 'catalog-draft-fixture',
    modelVersion: '1',
    promptVersion: 'p/1',
    schemaVersion: 's/1',
    pipelineVersion: 'v/1',
    input: {
      productId: PRODUCT_ID,
      capturedAt: '2026-09-26T00:00:00.000Z',
      product: {
        title: 'Bamboo Basket',
        description: null,
        category: null,
        materials: ['bamboo'],
      },
      media: [],
      transcription: null,
    },
    inputHash: 'hash-1',
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
  };
}

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    product_id: PRODUCT_ID,
    owner_id: OWNER_ID,
    job_type: 'CATALOG_FIELD_GENERATION',
    state: 'QUEUED',
    provider: 'deterministic-local',
    model: 'catalog-draft-fixture',
    model_version: '1',
    prompt_version: 'p/1',
    schema_version: 's/1',
    pipeline_version: 'v/1',
    input: {
      productId: PRODUCT_ID,
      capturedAt: '2026-09-26T00:00:00.000Z',
      product: {
        title: 'Bamboo Basket',
        description: null,
        category: null,
        materials: ['bamboo'],
      },
      media: [],
      transcription: null,
    },
    input_hash: 'hash-1',
    attempt_count: 0,
    max_attempts: 3,
    correlation_id: 'corr-1',
    causation_id: null,
    idempotency_key: 'key-1',
    failure_code: null,
    failure_message: null,
    failure_diagnostic: null,
    next_attempt_at: null,
    created_at: new Date('2026-09-26T00:00:00.000Z'),
    updated_at: new Date('2026-09-26T00:00:00.000Z'),
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function proposalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-00000000000a',
    job_id: JOB_ID,
    product_id: PRODUCT_ID,
    attempt: 1,
    field: 'title',
    value: 'Bamboo Basket',
    source: 'AI_GENERATED',
    source_type: 'CATALOG_FIELD_GENERATION',
    provider: 'deterministic-local',
    model: 'catalog-draft-fixture',
    model_version: '1',
    prompt_version: 'p/1',
    schema_version: 's/1',
    pipeline_version: 'v/1',
    confidence: 0.9,
    validation_status: 'VALID',
    validation_issues: [],
    risk_level: 'NONE',
    risk_reasons: [],
    decision: 'PENDING',
    decided_by: null,
    decided_at: null,
    applied_value: null,
    created_at: new Date('2026-09-26T00:00:00.000Z'),
    updated_at: new Date('2026-09-26T00:00:00.000Z'),
    ...overrides,
  };
}

async function testCreateJobMapsAndUsesDurableColumns(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([jobRow()]);

  const repository = new PostgresAiRepository(database);

  const result = await repository.createJob({
    productId: PRODUCT_ID,
    ownerId: OWNER_ID,
    jobType: 'CATALOG_FIELD_GENERATION',
    provider: 'deterministic-local',
    model: 'catalog-draft-fixture',
    modelVersion: '1',
    promptVersion: 'p/1',
    schemaVersion: 's/1',
    pipelineVersion: 'v/1',
    input: jobRow().input,
    inputHash: 'hash-1',
    maxAttempts: 3,
    correlationId: 'corr-1',
    causationId: null,
    idempotencyKey: 'key-1',
  });

  if (!result.created || result.job.id !== JOB_ID) {
    throw new Error('AI job insert did not map the returned row.');
  }

  const sql = database.calls[0]?.sql ?? '';

  for (const fragment of [
    'INSERT INTO ai_jobs',
    "'QUEUED'",
    'ON CONFLICT (owner_id, idempotency_key)',
    'DO NOTHING',
    'RETURNING',
  ]) {
    if (!sql.includes(fragment)) {
      throw new Error(`AI job insert must ${fragment}.`);
    }
  }
}

async function testCreateJobConvergesOnReplay(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows(
    [], // INSERT matched no row (dedupe)
    [jobRow()], // idempotency lookup
  );

  const repository = new PostgresAiRepository(database);

  const result = await repository.createJob({
    productId: PRODUCT_ID,
    ownerId: OWNER_ID,
    jobType: 'CATALOG_FIELD_GENERATION',
    provider: 'deterministic-local',
    model: 'catalog-draft-fixture',
    modelVersion: '1',
    promptVersion: 'p/1',
    schemaVersion: 's/1',
    pipelineVersion: 'v/1',
    input: jobRow().input,
    inputHash: 'hash-1',
    maxAttempts: 3,
    correlationId: 'corr-1',
    causationId: null,
    idempotencyKey: 'key-1',
  });

  if (result.created) {
    throw new Error('A replayed AI job insert must not report creation.');
  }

  if (
    !database.calls[1]?.sql.includes('WHERE owner_id = $1')
  ) {
    throw new Error('A replayed AI job must be looked up by owner + key.');
  }
}

async function testBeginAttemptIsAStateGuardedUpdate(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([jobRow({ state: 'RUNNING', attempt_count: 1 })]);

  const repository = new PostgresAiRepository(database);

  const running = await repository.beginAttempt({
    id: JOB_ID,
    expectedState: 'QUEUED',
    attemptCount: 1,
  });

  if (running.state !== 'RUNNING' || running.attemptCount !== 1) {
    throw new Error('beginAttempt must mark the job RUNNING.');
  }

  const sql = database.calls[0]?.sql ?? '';

  for (const fragment of [
    'UPDATE ai_jobs',
    "state = 'RUNNING'",
    'WHERE id = $2',
    'AND state = $3',
  ]) {
    if (!sql.includes(fragment)) {
      throw new Error(`beginAttempt must ${fragment}.`);
    }
  }
}

async function testBeginAttemptLostRace(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([], [jobRow({ state: 'SUCCEEDED' })]);

  const repository = new PostgresAiRepository(database);

  let thrown = false;

  try {
    await repository.beginAttempt({
      id: JOB_ID,
      expectedState: 'QUEUED',
      attemptCount: 1,
    });
  } catch (error) {
    thrown = true;

    if (
      !(error instanceof AiJobStateConflictError) ||
      error.actualState !== 'SUCCEEDED'
    ) {
      throw new Error(
        'A lost job race must report the current state.',
      );
    }
  }

  if (!thrown) {
    throw new Error('A lost job race must throw.');
  }
}

async function testCompleteAttemptPersistsFailureAndTimestamps(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([
    jobRow({
      state: 'FAILED',
      attempt_count: 1,
      failure_code: 'PROVIDER_AUTHENTICATION',
      failure_message: 'denied',
      failure_diagnostic: 'fixture',
      completed_at: new Date('2026-09-26T01:00:00.000Z'),
    }),
  ]);

  const repository = new PostgresAiRepository(database);

  const failed = await repository.completeAttempt({
    id: JOB_ID,
    expectedState: 'RUNNING',
    nextState: 'FAILED',
    attemptCount: 1,
    failure: {
      code: 'PROVIDER_AUTHENTICATION',
      message: 'denied',
      diagnostic: 'fixture',
      retryable: false,
    },
    nextAttemptAt: null,
  });

  if (failed.state !== 'FAILED' || failed.failure?.code !== 'PROVIDER_AUTHENTICATION') {
    throw new Error('completeAttempt must persist the failure.');
  }

  if (!failed.completedAt) {
    throw new Error('A terminal attempt must record completion.');
  }

  const sql = database.calls[0]?.sql ?? '';

  for (const fragment of [
    'UPDATE ai_jobs',
    'state = $1',
    'WHERE id = $8',
    'AND state = $9',
  ]) {
    if (!sql.includes(fragment)) {
      throw new Error(`completeAttempt must ${fragment}.`);
    }
  }
}

const DRAFT: DraftProposal = {
  field: 'title',
  value: 'Bamboo Basket',
  confidence: 0.9,
  validationStatus: 'VALID',
  validationIssues: [],
  riskLevel: 'NONE',
  riskReasons: [],
};

async function testSaveProposalsIsTransactionalAndIdempotent(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows(
    [], // INSERT returns nothing
    [proposalRow()], // selectAttempt result
  );

  const repository = new PostgresAiRepository(database);

  const proposals = await repository.saveProposals({
    job: job(),
    attempt: 1,
    drafts: [DRAFT],
  });

  if (database.transactions !== 1) {
    throw new Error('saveProposals must share one transaction.');
  }

  const insert = database.calls[0]?.sql ?? '';

  for (const fragment of [
    'INSERT INTO ai_proposals',
    'ON CONFLICT (job_id, attempt, field)',
    'DO NOTHING',
  ]) {
    if (!insert.includes(fragment)) {
      throw new Error(`saveProposals must ${fragment}.`);
    }
  }

  if (proposals.length !== 1 || proposals[0]?.field !== 'title') {
    throw new Error('saveProposals must return the attempt rows.');
  }
}

async function testListProposalsKeepsNewestAttemptPerField(): Promise<void> {
  const database = new FakeDatabase();
  // The query's DISTINCT ON (field) with ORDER BY attempt DESC is what
  // keeps the newest attempt; the fake returns what the database would.
  database.queueRows([
    proposalRow({
      id: '00000000-0000-4000-8000-00000000000b',
      attempt: 2,
      value: 'New Title',
    }),
  ]);

  const repository = new PostgresAiRepository(database);

  const proposals = await repository.listProposals(JOB_ID);

  const sql = database.calls[0]?.sql ?? '';

  for (const fragment of [
    'SELECT DISTINCT ON (field)',
    'ORDER BY field, attempt DESC',
  ]) {
    if (!sql.includes(fragment)) {
      throw new Error(`listProposals must ${fragment}.`);
    }
  }

  if (
    proposals[0]?.attempt !== 2 ||
    proposals[0]?.field !== 'title'
  ) {
    throw new Error('listProposals must return the latest attempt.');
  }
}

async function testListProposalHistoryKeepsEveryAttempt(): Promise<void> {
  const database = new FakeDatabase();
  queueProposalHistoryRows(database);

  const repository = new PostgresAiRepository(database);

  const history = await repository.listProposalHistory(JOB_ID);

  if (!database.calls[0]?.sql.includes('ORDER BY attempt ASC, field ASC')) {
    throw new Error('history must be ordered by attempt then field.');
  }

  if (history.length !== 2) {
    throw new Error('history must keep superseded attempts.');
  }
}

function queueProposalHistoryRows(database: FakeDatabase): void {
  database.queueRows([
    proposalRow({
      id: '00000000-0000-4000-8000-00000000000a',
      attempt: 1,
      value: 'Old Title',
    }),
    proposalRow({
      id: '00000000-0000-4000-8000-00000000000b',
      attempt: 2,
      value: 'New Title',
    }),
  ]);
}

async function testRecordDecisionIsAnAttributedCompareAndSet(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([
    proposalRow({
      decision: 'ACCEPTED',
      decided_by: 'artisan-1',
      applied_value: 'Bamboo Basket',
    }),
  ]);

  const repository = new PostgresAiRepository(database);

  const accepted = await repository.recordDecision({
    id: proposalRow().id,
    expectedDecision: 'PENDING',
    decision: 'ACCEPTED',
    decidedBy: 'artisan-1',
    appliedValue: 'Bamboo Basket',
  });

  if (
    accepted.decision !== 'ACCEPTED' ||
    accepted.decidedBy !== 'artisan-1'
  ) {
    throw new Error('recordDecision must return the attributed decision.');
  }

  const sql = database.calls[0]?.sql ?? '';

  for (const fragment of [
    'UPDATE ai_proposals',
    'decision = $1',
    'WHERE id = $4',
    'AND decision = $5',
  ]) {
    if (!sql.includes(fragment)) {
      throw new Error(`recordDecision must ${fragment}.`);
    }
  }
}

async function testRecordDecisionConflict(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows(
    [], // UPDATE matched no row (decision already changed)
    [proposalRow({ decision: 'REJECTED' })], // current row
  );

  const repository = new PostgresAiRepository(database);

  let thrown = false;

  try {
    await repository.recordDecision({
      id: proposalRow().id,
      expectedDecision: 'PENDING',
      decision: 'ACCEPTED',
      decidedBy: 'artisan-1',
      appliedValue: 'Bamboo Basket',
    });
  } catch (error) {
    thrown = true;

    if (
      !(error instanceof AiProposalDecisionConflictError) ||
      error.actualDecision !== 'REJECTED'
    ) {
      throw new Error(
        'A decision race must report the current decision.',
      );
    }
  }

  if (!thrown) {
    throw new Error('A decision race must throw.');
  }
}

async function testProposalMappingRoundTrips(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([
    proposalRow({
      attempt: '2',
      confidence: '0.75',
      risk_reasons: ['LOW_CONFIDENCE'],
      risk_level: 'LOW',
      next_attempt_at: null,
      decided_at: new Date('2026-09-27T00:00:00.000Z'),
      applied_value: ['bamboo'],
    }),
  ]);

  const proposal = (await new PostgresAiRepository(
    database,
  ).listProposals(JOB_ID))[0];

  if (!proposal) {
    throw new Error('Expected a mapped proposal.');
  }

  if (
    proposal.attempt !== 2 ||
    proposal.confidence !== 0.75
  ) {
    throw new Error('Driver numbers and strings must coerce to numbers.');
  }

  if (
    !proposal.riskReasons.includes('LOW_CONFIDENCE')
  ) {
    throw new Error('Risk reasons must survive the round trip.');
  }

  if (
    proposal.decidedAt !== '2026-09-27T00:00:00.000Z'
  ) {
    throw new Error('Timestamps must map to ISO strings.');
  }

  assert.deepEqual(
    proposal.appliedValue,
    ['bamboo'],
    'The applied value must map to a domain value.',
  );
}

async function main(): Promise<void> {
  await testCreateJobMapsAndUsesDurableColumns();
  await testCreateJobConvergesOnReplay();
  await testBeginAttemptIsAStateGuardedUpdate();
  await testBeginAttemptLostRace();
  await testCompleteAttemptPersistsFailureAndTimestamps();
  await testSaveProposalsIsTransactionalAndIdempotent();
  await testListProposalsKeepsNewestAttemptPerField();
  await testListProposalHistoryKeepsEveryAttempt();
  await testRecordDecisionIsAnAttributedCompareAndSet();
  await testRecordDecisionConflict();
  await testProposalMappingRoundTrips();

  console.log('POSTGRES AI REPOSITORY TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});