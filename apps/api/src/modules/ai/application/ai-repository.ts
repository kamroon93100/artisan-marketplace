import type {
  AiFailure,
  AiJob,
  AiJobInput,
  AiJobState,
  AiJobType,
  AiProposal,
  AiProposalDecision,
} from '@artisan-marketplace/contracts';
import type { DraftProposal } from '../domain/ai-validation-pipeline.js';

export type CreateAiJobInput = {
  productId: string;
  ownerId: string;
  jobType: AiJobType;
  provider: string;
  model: string;
  modelVersion: string | null;
  promptVersion: string;
  schemaVersion: string;
  pipelineVersion: string;
  input: AiJobInput;
  inputHash: string;
  maxAttempts: number;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string | null;
};

export type CreateAiJobResult = {
  job: AiJob;
  created: boolean;
};

/**
 * A state change on a job.
 *
 * `expectedState` is a compare-and-set. The job may be advanced by a worker
 * and inspected by a client at the same time, and without the check the
 * later writer would silently erase the earlier one's outcome. A mismatch is
 * reported through `AiJobStateConflictError` so the caller can decide whether
 * to re-read or to stop, rather than discovering it later as an inconsistent
 * record.
 */
export type UpdateAiJobStateInput = {
  id: string;
  expectedState: AiJobState;
  nextState: AiJobState;
  attemptCount: number;
  failure: AiFailure | null;
  nextAttemptAt: string | null;
};

export type RecordAttemptInput = {
  id: string;
  expectedState: AiJobState;
  nextState: AiJobState;
  attemptCount: number;
  failure: AiFailure | null;
  nextAttemptAt: string | null;
};

/**
 * Input for atomically completing an attempt and creating a retry outbox event
 * when the job transitions to RETRYING state. This avoids the failure window
 * where the job could be in RETRYING state without a corresponding outbox event.
 */
export type CompleteAttemptWithRetryOutboxInput = {
  id: string;
  expectedState: AiJobState;
  nextState: AiJobState;
  attemptCount: number;
  failure: AiFailure | null;
  nextAttemptAt: string | null;
  /** Payload for the retry outbox event (only used when nextState === 'RETRYING') */
  retryOutboxPayload?: OutboxEventPayload;
};

export type SaveProposalsInput = {
  job: AiJob;
  attempt: number;
  drafts: readonly DraftProposal[];
};

/**
 * A human decision on one proposal.
 *
 * `decision` is a compare-and-set against `PENDING`, so two concurrent
 * reviewers converge on one outcome and the second is told the proposal was
 * already decided rather than overwriting the first.
 */
export type RecordProposalDecisionInput = {
  id: string;
  expectedDecision: AiProposalDecision;
  decision: AiProposalDecision;
  decidedBy: string;
  appliedValue: string | readonly string[] | null;
};

/**
 * Signals that a job or proposal compare-and-set matched no row.
 *
 * Distinct from an infrastructure failure, exactly as the Catalog module
 * treats a lost publish race: a lost race means another writer already
 * established the outcome and the caller should converge on it, while a
 * database error means nothing is known and must propagate.
 */
export class AiJobStateConflictError extends Error {
  constructor(
    public readonly id: string,
    public readonly expectedState: AiJobState,
    public readonly actualState: AiJobState | null,
  ) {
    super(
      actualState === null
        ? `AI job not found: ${id}`
        : `AI job ${id} is ${actualState}, not ${expectedState}.`,
    );
    this.name = 'AiJobStateConflictError';
  }
}

export class AiProposalDecisionConflictError extends Error {
  constructor(
    public readonly id: string,
    public readonly actualDecision: AiProposalDecision | null,
  ) {
    super(
      actualDecision === null
        ? `AI proposal not found: ${id}`
        : `AI proposal ${id} is already ${actualDecision}.`,
    );
    this.name = 'AiProposalDecisionConflictError';
  }
}

/**
 * Payload for the outbox event that the dispatcher publishes to the queue.
 * Contains everything the consumer needs to re-hydrate actor context and run the job.
 *
 * Note: jobId is NOT included here because it's not known at enqueue time.
 * The repository injects the real jobId when persisting the outbox event
 * after the job is created in the same transaction.
 */
export type OutboxEventPayload = {
  /** Schema version of the payload for future migrations */
  payloadVersion: number;
  /** The product being worked on */
  productId: string;
  /** The artisan who owns the job */
  ownerId: string;
  /** Correlation ID for tracing */
  correlationId: string;
  /** Causation ID for event chaining */
  causationId: string | null;
  /** Idempotency key for deduplication */
  idempotencyKey: string | null;
  /** Current attempt number (1-based) */
  attempt: number;
  /** Maximum attempts allowed */
  maxAttempts: number;
};

/**
 * Result of an atomic job + outbox creation.
 */
export type CreateAiJobWithOutboxResult = {
  job: AiJob;
  outboxEventId: string;
  created: boolean;
};

export interface AiRepository {
  createJob(
    input: CreateAiJobInput,
  ): Promise<CreateAiJobResult>;
  /**
   * Atomically creates an AI job and its corresponding outbox event in a single
   * transaction. This is the primary enqueue path that guarantees no job exists
   * without its dispatch record (ADR-008).
   */
  createJobWithOutbox(
    input: CreateAiJobInput,
    outboxPayload: OutboxEventPayload,
  ): Promise<CreateAiJobWithOutboxResult>;
  /**
   * Creates an outbox event for an existing job that is being retried.
   * Called when a job transitions to RETRYING state so the dispatcher can
   * re-queue it when nextAttemptAt is due.
   */
  createOutboxEventForRetry(
    job: AiJob,
    outboxPayload: OutboxEventPayload,
  ): Promise<string>;
  findJobByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<AiJob | null>;
  getJob(id: string): Promise<AiJob | null>;
  listJobsByProduct(
    productId: string,
  ): Promise<readonly AiJob[]>;
  /**
   * Moves a job to `RUNNING` and counts the attempt, in one write. Attempt
   * counting belongs with the transition so a crash between them cannot
   * leave a job marked running with no attempt recorded.
   */
  beginAttempt(input: {
    id: string;
    expectedState: AiJobState;
    attemptCount: number;
  }): Promise<AiJob>;
  /**
   * Settles an attempt: moves the job to the state the outcome implies and
   * records what the outcome was. `nextState` is part of the same
   * compare-and-set as `expectedState`, so a job's recorded state can never
   * disagree with the outcome recorded beside it.
   */
  completeAttempt(input: RecordAttemptInput): Promise<AiJob>;

  /**
   * Atomically completes an attempt and, if the next state is RETRYING,
   * creates the corresponding retry outbox event in the same transaction.
   * This eliminates the failure window where a job could be marked RETRYING
   * without its retry outbox event, or vice versa.
   *
   * If nextState is not RETRYING, behaves identically to completeAttempt.
   * The retryOutboxPayload is required when nextState === 'RETRYING'.
   */
  completeAttemptWithRetryOutbox(
    input: CompleteAttemptWithRetryOutboxInput,
  ): Promise<AiJob>;

  /**
   * Idempotent within one attempt: a repeated save of the same attempt's
   * proposals returns what is already stored rather than duplicating rows.
   */
  saveProposals(input: SaveProposalsInput): Promise<readonly AiProposal[]>;
  /**
   * The latest attempt's proposals, one per field, which is what a human
   * reviews.
   */
  listProposals(jobId: string): Promise<readonly AiProposal[]>;
  /**
   * Every attempt's proposals, for audit. A proposal from a superseded
   * attempt is evidence of what the model said and must not disappear when a
   * later attempt succeeds.
   */
  listProposalHistory(
    jobId: string,
  ): Promise<readonly AiProposal[]>;
  /**
   * Every proposal for a product that is still `PENDING` and passed
   * validation, across all of the product's jobs and attempts.
   *
   * Across attempts, not the latest one. Two jobs may both propose a title,
   * and each is a decision the artisan has to make before the product is
   * approved; collapsing them to the newest would leave the older one
   * permanently blocking with no way to act on it. A proposal the pipeline
   * rejected is excluded because it carries no suggestion and cannot be
   * applied, so it is not an outstanding decision.
   *
   * The partial index on `(product_id, job_id) where decision = 'PENDING'`
   * exists for exactly this read.
   */
  listUndecidedProposals(
    productId: string,
  ): Promise<readonly AiProposal[]>;
  getProposal(id: string): Promise<AiProposal | null>;
  recordDecision(
    input: RecordProposalDecisionInput,
  ): Promise<AiProposal>;
}
