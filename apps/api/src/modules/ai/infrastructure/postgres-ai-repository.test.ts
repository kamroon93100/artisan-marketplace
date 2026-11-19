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
import type {
  AiFailure,
  AiFailureCode,
  AiJobType,
  AiJobState,
  AiProposalField,
  AiProposalSource,
  AiProposalSourceType,
  AiProposalValidationStatus,
  AiRiskLevel,
  AiRiskReason,
  AiProposalDecision,
} from '@artisan-marketplace/contracts';

type QueryCall = {
  sql: string;
  params?: readonly unknown[];
};

type JobRow = {
  id: string;
  product_id: string;
  owner_id: string;
  job_type: AiJobType;
  state: AiJobState;
  provider: string;
  model: string;
  model_version: string | null;
  prompt_version: string;
  schema_version: string;
  pipeline_version: string;
  input: AiJob['input'];
  input_hash: string;
  attempt_count: string | number;
  max_attempts: string | number;
  correlation_id: string;
  causation_id: string | null;
  idempotency_key: string | null;
  failure_code: AiFailureCode | null;
  failure_message: string | null;
  failure_diagnostic: string | null;
  next_attempt_at: unknown;
  created_at: unknown;
  updated_at: unknown;
  started_at: unknown;
  completed_at: unknown;
};

class FakeDatabase implements Database {
  readonly calls: QueryCall[] = [];
  transactions = 0;
  private queuedRows: Array<readonly unknown[]> = [];
  private queuedErrors: Array<Error | null> = [];

  queueRows(...rows: readonly unknown[][]): void {
    this.queuedRows = [...rows];
  }

  queueErrors(...errors: Array<Error | null>): void {
    this.queuedErrors = [...errors];
  }

  async query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly T[]> {
    this.calls.push({ sql, params });

    const error = this.queuedErrors.shift() ?? null;
    if (error) {
      throw error;
    }

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

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'number' ? value : Number(value);
}

function toFailure(row: JobRow): AiFailure | null {
  if (!row.failure_code || !row.failure_message) {
    return null;
  }

  return {
    code: row.failure_code,
    message: row.failure_message,
    diagnostic: row.failure_diagnostic,
    retryable:
      row.failure_code === 'PROVIDER_TIMEOUT' ||
      row.failure_code === 'PROVIDER_UNAVAILABLE' ||
      row.failure_code === 'PROVIDER_RATE_LIMITED',
  };
}

function mapJob(row: JobRow): AiJob {
  return {
    id: row.id,
    productId: row.product_id,
    ownerId: row.owner_id,
    jobType: row.job_type,
    state: row.state,
    provider: row.provider,
    model: row.model,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    pipelineVersion: row.pipeline_version,
    input: row.input,
    inputHash: row.input_hash,
    attemptCount: toNumber(row.attempt_count) ?? 0,
    maxAttempts: toNumber(row.max_attempts) ?? 3,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    idempotencyKey: row.idempotency_key,
    failure: toFailure(row),
    nextAttemptAt:
      row.next_attempt_at === null ||
      row.next_attempt_at === undefined
        ? null
        : toIso(row.next_attempt_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    startedAt:
      row.started_at === null || row.started_at === undefined
        ? null
        : toIso(row.started_at),
    completedAt:
      row.completed_at === null || row.completed_at === undefined
        ? null
        : toIso(row.completed_at),
  };
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

async function testCreateOutboxEventForRetry(): Promise<void> {
  const database = new FakeDatabase();
  const now = new Date().toISOString();

  // Mock a job in RETRYING state with nextAttemptAt
  const retryingJob = jobRow({
    state: 'RETRYING',
    attempt_count: 1,
    next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
    failure_code: 'PROVIDER_UNAVAILABLE',
    failure_message: 'transient failure',
    failure_diagnostic: 'fixture',
  });

  const repository = new PostgresAiRepository(database);

  const outboxEventId = await repository.createOutboxEventForRetry(
    mapJob(retryingJob as JobRow),
    {
      payloadVersion: 1,
      productId: PRODUCT_ID,
      ownerId: OWNER_ID,
      correlationId: 'corr-1',
      causationId: null,
      idempotencyKey: 'key-1',
      attempt: 1,
      maxAttempts: 3,
    },
  );

  // Repository generates its own UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(outboxEventId)) {
    throw new Error('createOutboxEventForRetry must return a valid UUID');
  }

  const sql = database.calls[0]?.sql ?? '';

  for (const fragment of [
    'INSERT INTO ai_job_outbox',
    'job_id',
    'owner_id',
    'payload_version',
    'payload',
    'state',
    'PENDING',
    'dispatch_attempt',
    'max_dispatch_attempts',
    'next_dispatch_at',
    'created_at',
    'updated_at',
  ]) {
    if (!sql.includes(fragment)) {
      throw new Error(`createOutboxEventForRetry must ${fragment}`);
    }
  }

  // Verify the payload contains the jobId and updated attempt
  const params = database.calls[0]?.params ?? [];
  const payloadParam = params[3] as string;
  const payload = JSON.parse(payloadParam);

  if (payload.jobId !== JOB_ID) {
    throw new Error('Outbox payload must contain the jobId');
  }
  if (payload.attempt !== 1) {
    throw new Error('Outbox payload must contain the updated attempt count');
  }
  if (payload.payloadVersion !== 1) {
    throw new Error('Outbox payload must contain payloadVersion');
  }
}

// ============================================================================
// completeAttemptWithRetryOutbox tests
// ============================================================================

async function testCompleteAttemptWithRetryOutboxSuccess(): Promise<void> {
  const database = new FakeDatabase();

  // Mock successful job update and outbox insert
  database.queueRows(
    [jobRow({ state: 'RETRYING', attempt_count: 1, next_attempt_at: new Date(Date.now() + 60_000).toISOString() })], // UPDATE returns updated job
    [] // INSERT outbox returns nothing
  );

  const repository = new PostgresAiRepository(database);

  const result = await repository.completeAttemptWithRetryOutbox({
    id: JOB_ID,
    expectedState: 'RUNNING',
    nextState: 'RETRYING',
    attemptCount: 1,
    failure: {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'transient failure',
      diagnostic: 'fixture',
      retryable: true,
    },
    nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
    retryOutboxPayload: {
      payloadVersion: 1,
      productId: PRODUCT_ID,
      ownerId: OWNER_ID,
      correlationId: 'corr-1',
      causationId: null,
      idempotencyKey: 'key-1',
      attempt: 1,
      maxAttempts: 3,
    },
  });

  if (result.state !== 'RETRYING') {
    throw new Error('Job must be in RETRYING state');
  }
  if (result.attemptCount !== 1) {
    throw new Error('Attempt count must be 1');
  }
  if (!result.nextAttemptAt) {
    throw new Error('Next attempt at must be set');
  }

  // Verify transaction was used
  if (database.transactions !== 1) {
    throw new Error('completeAttemptWithRetryOutbox must use a transaction');
  }

  // Verify both UPDATE and INSERT were called in the transaction
  if (database.calls.length < 2) {
    throw new Error('Must execute both UPDATE job and INSERT outbox');
  }

  const updateSql = database.calls[0]?.sql ?? '';
  const insertSql = database.calls[1]?.sql ?? '';

  if (!updateSql.includes('UPDATE ai_jobs') || !updateSql.includes("state = $1")) {
    throw new Error('Must update job state (parameterized)');
  }
  if (!insertSql.includes('INSERT INTO ai_job_outbox')) {
    throw new Error('Must insert outbox event');
  }

  // Verify outbox payload contains correct data
  const insertParams = database.calls[1]?.params ?? [];
  const payloadParam = insertParams[3] as string;
  const payload = JSON.parse(payloadParam);

  if (payload.jobId !== JOB_ID) {
    throw new Error('Outbox payload must contain the jobId');
  }
  if (payload.productId !== PRODUCT_ID) {
    throw new Error('Outbox payload must contain the productId');
  }
  if (payload.ownerId !== OWNER_ID) {
    throw new Error('Outbox payload must contain the ownerId');
  }
  if (payload.attempt !== 1) {
    throw new Error('Outbox payload must contain the updated attempt count');
  }
  if (payload.maxAttempts !== 3) {
    throw new Error('Outbox payload must contain maxAttempts');
  }
  if (payload.payloadVersion !== 1) {
    throw new Error('Outbox payload must contain payloadVersion');
  }
  if (payload.correlationId !== 'corr-1') {
    throw new Error('Outbox payload must contain correlationId');
  }
  if (payload.causationId !== null) {
    throw new Error('Outbox payload must contain causationId');
  }
  if (payload.idempotencyKey !== 'key-1') {
    throw new Error('Outbox payload must contain idempotencyKey');
  }
}

async function testCompleteAttemptWithRetryOutboxMissingPayloadThrows(): Promise<void> {
  const database = new FakeDatabase();
  const repository = new PostgresAiRepository(database);

  let thrown = false;
  try {
    await repository.completeAttemptWithRetryOutbox({
      id: JOB_ID,
      expectedState: 'RUNNING',
      nextState: 'RETRYING',
      attemptCount: 1,
      failure: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'transient failure',
        diagnostic: 'fixture',
        retryable: true,
      },
      nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
      // retryOutboxPayload is missing
    });
  } catch (error) {
    thrown = true;
    if (!(error instanceof Error) || !error.message.includes('retryOutboxPayload is required')) {
      throw new Error('Must throw when retryOutboxPayload is missing for RETRYING state');
    }
  }

  if (!thrown) {
    throw new Error('Must throw when retryOutboxPayload is missing');
  }

  // No database calls should have been made
  if (database.calls.length > 0) {
    throw new Error('No database calls should be made when payload is missing');
  }
}

async function testCompleteAttemptWithRetryOutboxCompareAndSetConflict(): Promise<void> {
  const database = new FakeDatabase();

  // UPDATE returns no rows (compare-and-set failed), then SELECT returns current job state
  database.queueRows(
    [], // UPDATE returns no rows
    [jobRow({ state: 'SUCCEEDED' })] // getJob in jobConflict returns current state
  );

  const repository = new PostgresAiRepository(database);

  let thrown = false;
  try {
    await repository.completeAttemptWithRetryOutbox({
      id: JOB_ID,
      expectedState: 'RUNNING',
      nextState: 'RETRYING',
      attemptCount: 1,
      failure: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'transient failure',
        diagnostic: 'fixture',
        retryable: true,
      },
      nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
      retryOutboxPayload: {
        payloadVersion: 1,
        productId: PRODUCT_ID,
        ownerId: OWNER_ID,
        correlationId: 'corr-1',
        causationId: null,
        idempotencyKey: 'key-1',
        attempt: 1,
        maxAttempts: 3,
      },
    });
  } catch (error) {
    thrown = true;
    if (!(error instanceof AiJobStateConflictError)) {
      throw new Error('Must throw AiJobStateConflictError on compare-and-set conflict');
    }
    if (error.actualState !== 'SUCCEEDED') {
      throw new Error('Conflict error must indicate the actual state');
    }
  }

  if (!thrown) {
    throw new Error('Must throw on compare-and-set conflict');
  }

  // Only UPDATE should have been attempted, no INSERT
  const updateCalls = database.calls.filter(c => c.sql.includes('UPDATE ai_jobs'));
  const insertCalls = database.calls.filter(c => c.sql.includes('INSERT INTO ai_job_outbox'));

  if (updateCalls.length !== 1) {
    throw new Error('Must attempt job UPDATE');
  }
  if (insertCalls.length !== 0) {
    throw new Error('Must NOT insert outbox event when job update fails');
  }
}

async function testCompleteAttemptWithRetryOutboxInsertFailureRollsBack(): Promise<void> {
  const database = new FakeDatabase();

  // UPDATE succeeds, INSERT fails with a simulated database error
  database.queueRows(
    [jobRow({ state: 'RETRYING', attempt_count: 1, next_attempt_at: new Date(Date.now() + 60_000).toISOString() })], // UPDATE succeeds
  );
  database.queueErrors(
    null, // No error for UPDATE
    new Error('simulated insert failure: duplicate key violation'), // Error for INSERT
  );

  const repository = new PostgresAiRepository(database);

  let thrown = false;
  try {
    await repository.completeAttemptWithRetryOutbox({
      id: JOB_ID,
      expectedState: 'RUNNING',
      nextState: 'RETRYING',
      attemptCount: 1,
      failure: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'transient failure',
        diagnostic: 'fixture',
        retryable: true,
      },
      nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
      retryOutboxPayload: {
        payloadVersion: 1,
        productId: PRODUCT_ID,
        ownerId: OWNER_ID,
        correlationId: 'corr-1',
        causationId: null,
        idempotencyKey: 'key-1',
        attempt: 1,
        maxAttempts: 3,
      },
    });
  } catch (error) {
    thrown = true;
    if (!(error instanceof Error) || !error.message.includes('simulated insert failure')) {
      throw new Error('Must throw the simulated INSERT failure');
    }
  }

  if (!thrown) {
    throw new Error('Must throw when INSERT fails');
  }

  // Verify transaction was attempted
  if (database.transactions !== 1) {
    throw new Error('completeAttemptWithRetryOutbox must use a transaction');
  }

  // Verify both UPDATE and INSERT were attempted in the transaction
  const updateCalls = database.calls.filter(c => c.sql.includes('UPDATE ai_jobs'));
  const insertCalls = database.calls.filter(c => c.sql.includes('INSERT INTO ai_job_outbox'));

  if (updateCalls.length !== 1) {
    throw new Error('Must attempt job UPDATE');
  }
  if (insertCalls.length !== 1) {
    throw new Error('Must attempt outbox INSERT');
  }

  // Note: The FakeDatabase cannot verify actual PostgreSQL rollback behavior
  // (it has no persistent state to roll back). This test verifies that:
  // 1. Both UPDATE and INSERT are attempted within a transaction
  // 2. INSERT failure propagates out of the transaction
  // 3. The operation rejects with the database error
  //
  // Real transaction rollback behavior on INSERT failure should be tested
  // against a real PostgreSQL database in an integration test.
}

async function testCompleteAttemptWithRetryOutboxNoRetryForTerminalStates(): Promise<void> {
  // Test SUCCEEDED state
  {
    const database = new FakeDatabase();
    database.queueRows([jobRow({ state: 'SUCCEEDED', attempt_count: 1 })]);

    const repository = new PostgresAiRepository(database);

    const succeeded = await repository.completeAttemptWithRetryOutbox({
      id: JOB_ID,
      expectedState: 'RUNNING',
      nextState: 'SUCCEEDED',
      attemptCount: 1,
      failure: null,
      nextAttemptAt: null,
    });

    if (succeeded.state !== 'SUCCEEDED') {
      throw new Error('Job must be SUCCEEDED');
    }

    const insertCalls = database.calls.filter(c => c.sql.includes('INSERT INTO ai_job_outbox'));
    if (insertCalls.length !== 0) {
      throw new Error('Must NOT insert outbox event for SUCCEEDED state');
    }
  }

  // Test FAILED state
  {
    const database = new FakeDatabase();
    database.queueRows([jobRow({ state: 'FAILED', attempt_count: 2, completed_at: new Date() })]);

    const repository = new PostgresAiRepository(database);

    const failed = await repository.completeAttemptWithRetryOutbox({
      id: JOB_ID,
      expectedState: 'RUNNING',
      nextState: 'FAILED',
      attemptCount: 2,
      failure: {
        code: 'PROVIDER_AUTHENTICATION',
        message: 'auth failed',
        diagnostic: 'fixture',
        retryable: false,
      },
      nextAttemptAt: null,
    });

    if (failed.state !== 'FAILED') {
      throw new Error('Job must be FAILED');
    }

    const insertCalls2 = database.calls.filter(c => c.sql.includes('INSERT INTO ai_job_outbox'));
    if (insertCalls2.length !== 0) {
      throw new Error('Must NOT insert outbox event for FAILED state');
    }
  }

  // Test DEAD_LETTERED state
  {
    const database = new FakeDatabase();
    database.queueRows([jobRow({ state: 'DEAD_LETTERED', attempt_count: 3, completed_at: new Date() })]);

    const repository = new PostgresAiRepository(database);

    const deadLettered = await repository.completeAttemptWithRetryOutbox({
      id: JOB_ID,
      expectedState: 'RUNNING',
      nextState: 'DEAD_LETTERED',
      attemptCount: 3,
      failure: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'transient failure',
        diagnostic: 'fixture',
        retryable: true,
      },
      nextAttemptAt: null,
    });

    if (deadLettered.state !== 'DEAD_LETTERED') {
      throw new Error('Job must be DEAD_LETTERED');
    }

    const insertCalls3 = database.calls.filter(c => c.sql.includes('INSERT INTO ai_job_outbox'));
    if (insertCalls3.length !== 0) {
      throw new Error('Must NOT insert outbox event for DEAD_LETTERED state');
    }
  }
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
  await testCreateOutboxEventForRetry();
  await testCompleteAttemptWithRetryOutboxSuccess();
  await testCompleteAttemptWithRetryOutboxMissingPayloadThrows();
  await testCompleteAttemptWithRetryOutboxCompareAndSetConflict();
  await testCompleteAttemptWithRetryOutboxInsertFailureRollsBack();
  await testCompleteAttemptWithRetryOutboxNoRetryForTerminalStates();

  console.log('POSTGRES AI REPOSITORY TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});