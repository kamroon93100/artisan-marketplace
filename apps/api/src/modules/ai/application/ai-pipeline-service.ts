import {
  AI_JOB_TYPES,
  AI_PIPELINE_VERSION,
  AI_PROMPT_VERSION,
  AI_PROPOSAL_SCHEMA_VERSION,
} from '@artisan-marketplace/contracts';
import type {
  AiJob,
  AiJobInput,
  AiJobMediaReference,
  AiJobState,
  AiJobType,
  AiProposal,
  AiProposalField,
  ProductState,
} from '@artisan-marketplace/contracts';
import { AppError } from '../../../shared/errors/app-error.js';
import { toAiFailure } from '../domain/ai-error.js';
import { computeAiInputHash } from '../domain/ai-input-hash.js';
import {
  defaultMaxAttempts,
  isRunnableJobState,
  isRetryDue,
  nextAttemptAt,
  resolveFailureState,
} from '../domain/ai-job.js';
import { runValidationPipeline } from '../domain/ai-validation-pipeline.js';
import type { CatalogAiProvider } from '../domain/catalog-ai-provider.js';
import type { CatalogProductPort } from './catalog-product-port.js';
import type {
  AiRepository,
  CreateAiJobResult,
  CreateAiJobWithOutboxResult,
  OutboxEventPayload,
  CompleteAttemptWithRetryOutboxInput,
} from './ai-repository.js';

/**
 * The only job type this slice produces.
 *
 * Named rather than indexed so a change to `AI_JOB_TYPES` order cannot
 * silently change what the pipeline enqueues.
 */
const CATALOG_FIELD_GENERATION: AiJobType =
  'CATALOG_FIELD_GENERATION';

/**
 * Product states in which AI work may be started.
 *
 * `PUBLISHED` and `ARCHIVED` are excluded because the Catalog module already
 * freezes a product's fields in both, so a proposal generated for either
 * could never be applied and would be work whose result cannot be used.
 *
 * `APPROVED` is excluded for a different reason. Approval records that
 * nothing was outstanding at the moment it was made, so a job enqueued for
 * an already-approved product produces its proposals *after* that statement
 * and the readiness check that produced it never sees them. The artisan
 * would then be one deliberate publish away from a buyer-visible listing
 * carrying a suggestion no human looked at. Refusing the enqueue leaves only
 * one interleaving — a job enqueued before the approval and still running
 * when it happened — which is the Review module's recorded known gap, not
 * something this list solves.
 *
 * The rest are working states, including `CONFLICT` and `ACTION_REQUIRED`,
 * where a proposal is often exactly what the artisan needs to resolve the
 * problem.
 */
const AI_ELIGIBLE_STATES: readonly ProductState[] = [
  'LOCAL_DRAFT',
  'PENDING_SYNC',
  'SYNCED',
  'REVIEW_REQUIRED',
  'CONFLICT',
  'ACTION_REQUIRED',
];

const CONFIDENCE_FIELDS = [
  'title',
  'description',
  'category',
  'materials',
] as const;

export type EnqueueAiJobInput = {
  productId: string;
  actorId: string;
  idempotencyKey?: string;
  media?: readonly AiJobMediaReference[];
  transcription?: string;
  correlationId: string;
  causationId?: string;
  maxAttempts?: number;
};

export type RunAiJobResult = {
  job: AiJob;
  proposals: readonly AiProposal[];
};

/**
 * Runs the AI pipeline.
 *
 * The service holds a job repository, a provider capability, and a read-only
 * port onto the product. It has no dependency that can write canonical
 * catalog state, and that is the structural form of the ADR-002 rule: the
 * pipeline produces proposals, and the only thing that can move a value into
 * a product is a separate human decision through the review service.
 */
export class AiPipelineService {
  constructor(
    private readonly repository: AiRepository,
    private readonly provider: CatalogAiProvider,
    private readonly catalog: CatalogProductPort,
  ) {}

  /**
   * Creates durable work.
   *
   * The product's current values are captured into the job input, so the
   * provider call has a stable basis even if the artisan edits the product
   * while the job waits, and so staleness is measurable afterwards.
   */
  async enqueue(
    input: EnqueueAiJobInput,
  ): Promise<CreateAiJobResult> {
    const idempotencyKey = input.idempotencyKey?.trim();

    if (!idempotencyKey) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Idempotency-Key is required to enqueue an AI job.',
      );
    }

    const product =
      await this.catalog.readProduct(input.productId);

    if (!product) {
      throw new AppError(
        'NOT_FOUND',
        'Catalog product was not found.',
        { productId: input.productId },
      );
    }

    if (product.ownerId !== input.actorId) {
      throw new AppError(
        'FORBIDDEN',
        'The product belongs to another artisan.',
        { productId: input.productId },
      );
    }

    if (!AI_ELIGIBLE_STATES.includes(product.state)) {
      throw new AppError(
        'CONFLICT',
        `AI assistance is not available for a product in state ${product.state}.`,
        { productId: product.id, state: product.state },
      );
    }

    const replayed =
      await this.repository.findJobByIdempotencyKey(
        input.actorId,
        idempotencyKey,
      );

    if (replayed) {
      return {
        job: replayed,
        created: false,
      };
    }

    const jobInput: AiJobInput = {
      productId: product.id,
      capturedAt: new Date().toISOString(),
      product: {
        title: product.title,
        description: product.description,
        category: product.category,
        materials: [...product.materials],
      },
      media: input.media ? [...input.media] : [],
      transcription:
        input.transcription?.trim() || null,
    };

    // Build the outbox payload that the consumer needs to re-hydrate context.
    // Note: jobId is NOT included here because it's not known at enqueue time.
    // The repository injects the real jobId when persisting the outbox event
    // after the job is created in the same transaction.
    const outboxPayload: OutboxEventPayload = {
      payloadVersion: 1,
      productId: product.id,
      ownerId: input.actorId,
      correlationId: input.correlationId,
      causationId: input.causationId ?? null,
      idempotencyKey,
      attempt: 0,
      maxAttempts: defaultMaxAttempts(input.maxAttempts),
    };

    const result = await this.repository.createJobWithOutbox({
      productId: product.id,
      ownerId: input.actorId,
      jobType: CATALOG_FIELD_GENERATION,
      provider: this.provider.attribution.provider,
      model: this.provider.attribution.model,
      modelVersion: this.provider.attribution.modelVersion,
      promptVersion: AI_PROMPT_VERSION,
      schemaVersion: AI_PROPOSAL_SCHEMA_VERSION,
      pipelineVersion: AI_PIPELINE_VERSION,
      input: jobInput,
      inputHash: await computeAiInputHash(jobInput),
      maxAttempts: defaultMaxAttempts(input.maxAttempts),
      correlationId: input.correlationId,
      causationId: input.causationId ?? null,
      idempotencyKey,
    }, outboxPayload);

    return {
      job: result.job,
      created: result.created,
    };
  }

  /**
   * Executes one attempt.
   *
   * The state machine, not this method, is what makes a redelivered message
   * safe: a terminal job refuses to run again, and a job already in flight is
   * `RUNNING`, which is not a runnable state. The two repository writes that
   * bracket the provider call both compare-and-set on the state they expect,
   * so a lost race is reported rather than written over.
   *
   * `actorId` is the owning artisan rather than a worker identity. In this
   * slice execution is a local, artisan-initiated seam; a queue consumer
   * would call the same method and would be authorized by the job's owner
   * because it is doing that artisan's work. Transport is a separate slice,
   * and nothing here depends on who calls.
   */
  async run(
    jobId: string,
    actorId: string,
    correlationId?: string,
  ): Promise<RunAiJobResult> {
    const job = await this.requireOwnedJob(jobId, actorId);

    if (!isRunnableJobState(job.state)) {
      throw new AppError(
        'CONFLICT',
        `AI job ${job.id} is ${job.state} and cannot run.`,
        { jobId: job.id, state: job.state },
      );
    }

    if (!isRetryDue(job, Date.now())) {
      throw new AppError(
        'CONFLICT',
        `AI job ${job.id} is not due for another attempt until ${job.nextAttemptAt}.`,
        {
          jobId: job.id,
          nextAttemptAt: job.nextAttemptAt,
        },
      );
    }

    const started = await this.repository.beginAttempt({
      id: job.id,
      expectedState: job.state,
      attemptCount: job.attemptCount + 1,
    });

    try {
      const raw = await this.provider.generateCatalogDraft({
        requestId: started.id,
        correlationId:
          correlationId ?? started.correlationId,
        jobId: started.id,
        jobType: started.jobType,
        productId: started.productId,
        promptVersion: started.promptVersion,
        schemaVersion: started.schemaVersion,
        pipelineVersion: started.pipelineVersion,
        input: started.input,
        media: started.input.media,
      });

      return await this.settle(started, raw);
    } catch (error) {
      return this.fail(started, error);
    }
  }

  /**
   * Validates the provider's answer and records it.
   *
   * Proposals are written before the job is settled, so a crash in between
   * leaves a `RUNNING` job whose proposals are already stored, and a retry
   * converges on the same attempt's rows instead of producing a second set.
   */
  private async settle(
    job: AiJob,
    raw: unknown,
  ): Promise<RunAiJobResult> {
    const outcome = runValidationPipeline(
      raw,
      readConfidences(raw),
    );

    if (outcome.kind === 'rejected') {
      return this.fail(job, outcome.failure);
    }

    const proposals =
      await this.repository.saveProposals({
        job,
        attempt: job.attemptCount,
        drafts: outcome.drafts,
      });

    const settled =
      await this.repository.completeAttempt({
        id: job.id,
        expectedState: 'RUNNING',
        nextState:
          outcome.kind === 'complete'
            ? 'SUCCEEDED'
            : 'PARTIAL_RESULT',
        attemptCount: job.attemptCount,
        failure: null,
        nextAttemptAt: null,
      });

    return {
      job: settled,
      proposals,
    };
  }

  /**
   * Records a failure and decides what the job becomes.
   *
   * The failure category drives the outcome, not the call site: a permanent
   * failure is `FAILED` however much budget remains, and a transient one
   * retries until the budget is gone and is then `DEAD_LETTERED`.
   */
  private async fail(
    job: AiJob,
    error: unknown,
  ): Promise<RunAiJobResult> {
    const failure = toAiFailure(error);

    const nextState: AiJobState = resolveFailureState(
      job.attemptCount,
      job.maxAttempts,
      failure,
    );

    const nextAttemptAtValue =
      nextState === 'RETRYING'
        ? nextAttemptAt(job.attemptCount, Date.now())
        : null;

    // Build retry outbox payload if needed (only used when nextState === 'RETRYING')
    const retryOutboxPayload: OutboxEventPayload | undefined =
      nextState === 'RETRYING'
        ? {
            payloadVersion: 1,
            productId: job.productId,
            ownerId: job.ownerId,
            correlationId: job.correlationId,
            causationId: job.causationId,
            idempotencyKey: job.idempotencyKey,
            attempt: job.attemptCount, // Current attempt count (already incremented by beginAttempt)
            maxAttempts: job.maxAttempts,
          }
        : undefined;

    // Atomically complete the attempt and create retry outbox event (if RETRYING)
    const settled = await this.repository.completeAttemptWithRetryOutbox({
      id: job.id,
      expectedState: 'RUNNING',
      nextState,
      attemptCount: job.attemptCount,
      failure,
      nextAttemptAt: nextAttemptAtValue,
      retryOutboxPayload,
    });

    return {
      job: settled,
      proposals:
        await this.repository.listProposals(job.id),
    };
  }

  async getJob(
    jobId: string,
    actorId: string,
  ): Promise<{ job: AiJob; proposals: readonly AiProposal[] }> {
    const job = await this.requireOwnedJob(jobId, actorId);

    return {
      job,
      proposals: await this.repository.listProposals(
        job.id,
      ),
    };
  }

  async listJobs(
    productId: string,
    actorId: string,
  ): Promise<readonly AiJob[]> {
    const product =
      await this.catalog.readProduct(productId);

    if (!product) {
      throw new AppError(
        'NOT_FOUND',
        'Catalog product was not found.',
        { productId },
      );
    }

    if (product.ownerId !== actorId) {
      throw new AppError(
        'FORBIDDEN',
        'The product belongs to another artisan.',
        { productId },
      );
    }

    return this.repository.listJobsByProduct(
      productId,
    );
  }

  /**
   * The proposal history of a job, every attempt included.
   *
   * A superseded attempt is evidence of what the model said. It is exposed
   * rather than overwritten, because a proposal that later became a different
   * proposal is exactly the kind of thing an audit has to be able to show.
   */
  async listProposalHistory(
    jobId: string,
    actorId: string,
  ): Promise<readonly AiProposal[]> {
    const job = await this.requireOwnedJob(jobId, actorId);

    return this.repository.listProposalHistory(
      job.id,
    );
  }

  /**
   * Loads a job and refuses it unless the actor owns it.
   *
   * The decision is taken from the stored record, never from anything the
   * caller asserted, so a client cannot read or run another artisan's job by
   * naming its id.
   */
  async requireOwnedJob(
    jobId: string,
    actorId: string,
  ): Promise<AiJob> {
    const job = await this.repository.getJob(jobId);

    if (!job) {
      throw new AppError(
        'NOT_FOUND',
        'AI job was not found.',
        { jobId },
      );
    }

    if (job.ownerId !== actorId) {
      throw new AppError(
        'FORBIDDEN',
        'The AI job belongs to another artisan.',
        { jobId },
      );
    }

    return job;
  }
}

/**
 * Reads per-field confidence out of a provider answer.
 *
 * A per-field value wins over the response-level one, because a model that
 * reports confidence for each field is saying something a single number
 * cannot. A missing or unusable value is stored as `null` rather than
 * defaulted, so "did not measure" stays distinguishable from "measured and
 * found low", which are different things for a human reviewer.
 */
function readConfidences(
  raw: unknown,
): ReadonlyMap<AiProposalField, unknown> {
  const confidences = new Map<AiProposalField, unknown>();

  if (
    typeof raw !== 'object' ||
    raw === null ||
    Array.isArray(raw)
  ) {
    return confidences;
  }

  const source = raw as Record<string, unknown>;

  const perField = source.fieldConfidence;
  const perFieldMap =
    typeof perField === 'object' &&
    perField !== null &&
    !Array.isArray(perField)
      ? (perField as Record<string, unknown>)
      : null;

  for (const field of CONFIDENCE_FIELDS) {
    confidences.set(
      field,
      perFieldMap && field in perFieldMap
        ? perFieldMap[field]
        : source.confidence,
    );
  }

  return confidences;
}
