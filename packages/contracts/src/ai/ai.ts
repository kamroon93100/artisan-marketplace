import type { MediaKind } from '../media/media.js';

export const AI_JOB_STATES = [
  'QUEUED',
  'RUNNING',
  'RETRYING',
  'PARTIAL_RESULT',
  'SUCCEEDED',
  'FAILED',
  'DEAD_LETTERED',
] as const;

export type AiJobState = (typeof AI_JOB_STATES)[number];

/**
 * The job kinds this slice supports.
 *
 * `docs/architecture/ai-contract.md` lists image analysis, audio
 * transcription, catalog field generation, embedding generation, and buyer
 * matching as candidate capabilities. Only catalog field generation is
 * declared here, because each capability is a separate interface behind its
 * own adapter and declaring an enum member nothing can produce would be
 * speculative surface.
 */
export const AI_JOB_TYPES = [
  'CATALOG_FIELD_GENERATION',
] as const;

export type AiJobType = (typeof AI_JOB_TYPES)[number];

/**
 * The product fields a proposal may target.
 *
 * These are exactly the fields the Catalog module treats as editable. A
 * proposal for anything else has no canonical destination, so it is not a
 * representable value rather than a value that fails at write time.
 */
export const AI_PROPOSAL_FIELDS = [
  'title',
  'description',
  'category',
  'materials',
] as const;

export type AiProposalField = (typeof AI_PROPOSAL_FIELDS)[number];

export const AI_PROPOSAL_SOURCES = [
  'AI_GENERATED',
] as const;

export type AiProposalSource =
  (typeof AI_PROPOSAL_SOURCES)[number];

export const AI_PROPOSAL_SOURCE_TYPES = [
  'CATALOG_FIELD_GENERATION',
] as const;

export type AiProposalSourceType =
  (typeof AI_PROPOSAL_SOURCE_TYPES)[number];

/**
 * The human decision on a proposal.
 *
 * `PENDING` is the only state in which a proposal is actionable. There is
 * deliberately no "auto-approved" member: ADR-002 reserves every canonical
 * transition for an authorized workflow, and AI confidence is not one.
 */
export const AI_PROPOSAL_DECISIONS = [
  'PENDING',
  'ACCEPTED',
  'EDITED',
  'REJECTED',
] as const;

export type AiProposalDecision =
  (typeof AI_PROPOSAL_DECISIONS)[number];

export const AI_PROPOSAL_VALIDATION_STATUSES = [
  'VALID',
  'REJECTED',
] as const;

export type AiProposalValidationStatus =
  (typeof AI_PROPOSAL_VALIDATION_STATUSES)[number];

export const AI_RISK_LEVELS = [
  'NONE',
  'LOW',
  'MEDIUM',
  'HIGH',
] as const;

export type AiRiskLevel = (typeof AI_RISK_LEVELS)[number];

/**
 * Why a proposal was flagged. These are routing signals that tell a human
 * where to look; none of them authorizes anything.
 */
export const AI_RISK_REASONS = [
  'LOW_CONFIDENCE',
  'MISSING_PUBLISH_BLOCKING_FIELD',
  'SEMANTIC_VALIDATION_REJECTED',
] as const;

export type AiRiskReason =
  (typeof AI_RISK_REASONS)[number];

/**
 * Normalized internal failure categories.
 *
 * ADR-005 requires provider-specific errors to be normalized "without
 * discarding the underlying diagnostic information required for
 * operations", so a failure always carries a category plus the provider's
 * own message. `retryable` is a property of the category, not of the
 * provider call site, so the same failure retries the same way whichever
 * adapter reported it.
 */
export const AI_FAILURE_CODES = [
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_AUTHENTICATION',
  'PROVIDER_OUTPUT_NOT_AN_OBJECT',
  'PROVIDER_OUTPUT_SCHEMA_INVALID',
  'PROVIDER_OUTPUT_EMPTY',
  'VALIDATION_REJECTED',
  'DEPENDENCY_FAILED',
  'JOB_STATE_CONFLICT',
] as const;

export type AiFailureCode =
  (typeof AI_FAILURE_CODES)[number];

/**
 * Version identity for an AI execution.
 *
 * ADR-005 requires an execution to be attributable to the provider, model,
 * model version, prompt version, schema version, and pipeline version, and
 * requires a change to a versioned dependency not to silently reuse an
 * incompatible result. These are the two application-owned halves of that
 * identity; the provider/model halves come from the adapter.
 */
export const AI_PROPOSAL_SCHEMA_VERSION = 'catalog-proposal/1';

export const AI_PIPELINE_VERSION = 'catalog-field-generation/1';

export const AI_PROMPT_VERSION = 'catalog-field-generation/1';

/**
 * Attempts allowed for one job before it is dead-lettered.
 */
export const AI_MAX_ATTEMPTS = 3;

/**
 * Backoff base in milliseconds. The delay for attempt N is
 * `AI_RETRY_BASE_DELAY_MS * 2 ** (N - 1)`, capped at `AI_RETRY_MAX_DELAY_MS`.
 * Jitter is deliberately not applied: the delay is persisted on the job and
 * asserted in tests, so it has to be reproducible.
 */
export const AI_RETRY_BASE_DELAY_MS = 1_000;

export const AI_RETRY_MAX_DELAY_MS = 60_000;

/**
 * A failure recorded against a job. `diagnostic` carries the provider's own
 * message for operators; it must never contain a credential or a raw
 * authorization header.
 */
export type AiFailure = {
  code: AiFailureCode;
  message: string;
  diagnostic: string | null;
  retryable: boolean;
};

/**
 * A reference to one input media object.
 *
 * The job stores a reference, not the bytes and not a URL. Media objects
 * live in object storage and their metadata in PostgreSQL; an AI job must
 * not become a second copy of either.
 */
export type AiJobMediaReference = {
  mediaId: string;
  kind: MediaKind;
};

/**
 * The canonical values as they stood when the job was enqueued.
 *
 * The snapshot is what staleness is measured against. A job that finishes
 * after the artisan has edited a field is proposing against input that is no
 * longer current, and that has to be visible rather than assumed away.
 */
export type AiJobInput = {
  productId: string;
  capturedAt: string;
  product: {
    title: string | null;
    description: string | null;
    category: string | null;
    materials: readonly string[];
  };
  media: readonly AiJobMediaReference[];
  transcription: string | null;
};

/**
 * An AI job, exactly as `docs/architecture/ai-contract.md` requires: id,
 * type, input reference, provider, model, model version, prompt/schema/
 * pipeline versions, status, retry information, and timestamps.
 */
export type AiJob = {
  id: string;
  productId: string;
  ownerId: string;
  jobType: AiJobType;
  state: AiJobState;
  provider: string;
  model: string;
  modelVersion: string | null;
  promptVersion: string;
  schemaVersion: string;
  pipelineVersion: string;
  input: AiJobInput;
  inputHash: string;
  attemptCount: number;
  maxAttempts: number;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string | null;
  failure: AiFailure | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

/**
 * One proposed value for one product field, with the provenance ADR-002
 * requires it to retain.
 */
export type AiProposal = {
  id: string;
  jobId: string;
  productId: string;
  attempt: number;
  field: AiProposalField;
  value: string | readonly string[];
  source: AiProposalSource;
  sourceType: AiProposalSourceType;
  provider: string;
  model: string;
  modelVersion: string | null;
  promptVersion: string;
  schemaVersion: string;
  pipelineVersion: string;
  confidence: number | null;
  validationStatus: AiProposalValidationStatus;
  validationIssues: readonly string[];
  riskLevel: AiRiskLevel;
  riskReasons: readonly AiRiskReason[];
  decision: AiProposalDecision;
  decidedBy: string | null;
  decidedAt: string | null;
  /**
   * The value that was actually written to the catalog, which is the
   * artisan's value for an `EDITED` decision and the proposed value
   * otherwise. Null until a decision applies the proposal.
   */
  appliedValue: string | readonly string[] | null;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ *
 * API contracts
 * ------------------------------------------------------------------ */

export type EnqueueAiJobRequest = {
  media?: readonly AiJobMediaReference[];
  transcription?: string;
};

export type EnqueueAiJobResponse = {
  job: AiJob;
  deduplicated: boolean;
};

export type ListAiJobsResponse = {
  jobs: readonly AiJob[];
};

export type ListAiJobProposalHistoryResponse = {
  /**
   * Every proposal of every attempt, so a value later edited away or
   * superseded by a retry remains explainable.
   */
  proposals: readonly AiProposal[];
};

export type GetAiJobResponse = {
  job: AiJob;
  /**
   * The latest attempt's proposals for every field, which is what a human
   * reviews. Older attempts remain queryable through the audit endpoint.
   */
  proposals: readonly AiProposal[];
};

export type RunAiJobResponse = {
  job: AiJob;
  proposals: readonly AiProposal[];
};

export type AiProposalDecisionRequest = {
  proposalId: string;
  decision: Exclude<AiProposalDecision, 'PENDING'>;
  /**
   * The artisan's own value for an `EDITED` decision. It is the canonical
   * value in that case and the AI's value is retained only as evidence.
   */
  value?: string | readonly string[];
};

export type ApplyAiProposalDecisionsRequest = {
  decisions: readonly AiProposalDecisionRequest[];
};

export type ApplyAiProposalDecisionsResponse = {
  product: {
    id: string;
    state: string;
    title: string | null;
    description: string | null;
    category: string | null;
    materials: readonly string[];
  };
  proposals: readonly AiProposal[];
  /**
   * Fields whose proposals were generated from an input snapshot that no
   * longer matches the product. The artisan decides; this only makes the
   * staleness visible.
   */
  staleFields: readonly AiProposalField[];
  applied: readonly AiProposalField[];
};
