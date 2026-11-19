import type {
  AiFailure,
  AiFailureCode,
  AiJob,
  AiJobInput,
  AiJobState,
  AiJobType,
  AiProposal,
  AiProposalDecision,
  AiProposalField,
  AiProposalSource,
  AiProposalSourceType,
  AiProposalValidationStatus,
  AiRiskLevel,
  AiRiskReason,
} from '@artisan-marketplace/contracts';
import type {
  AiRepository,
  CreateAiJobInput,
  CreateAiJobResult,
  CreateAiJobWithOutboxResult,
  OutboxEventPayload,
  RecordAttemptInput,
  RecordProposalDecisionInput,
  SaveProposalsInput,
  CompleteAttemptWithRetryOutboxInput,
} from '../application/ai-repository.js';
import {
  AiJobStateConflictError,
  AiProposalDecisionConflictError,
} from '../application/ai-repository.js';
import type {
  Database,
  Transaction,
} from '../../../shared/persistence/database.js';

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
  input: AiJobInput;
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

type ProposalRow = {
  id: string;
  job_id: string;
  product_id: string;
  attempt: string | number;
  field: AiProposalField;
  value: string | string[];
  source: AiProposalSource;
  source_type: AiProposalSourceType;
  provider: string;
  model: string;
  model_version: string | null;
  prompt_version: string;
  schema_version: string;
  pipeline_version: string;
  confidence: string | number | null;
  validation_status: AiProposalValidationStatus;
  validation_issues: string[];
  risk_level: AiRiskLevel;
  risk_reasons: AiRiskReason[];
  decision: AiProposalDecision;
  decided_by: string | null;
  decided_at: unknown;
  applied_value: string | string[] | null;
  created_at: unknown;
  updated_at: unknown;
};

/**
 * node-postgres returns `timestamptz` columns as `Date` objects and
 * `numeric` columns as strings. The domain types declare ISO strings and
 * numbers, so both shapes are normalized on the way out. Reading the raw
 * driver shape into the domain model is the repository's one job; passing
 * it through would leak the driver into every caller.
 */
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

function mapProposal(row: ProposalRow): AiProposal {
  return {
    id: row.id,
    jobId: row.job_id,
    productId: row.product_id,
    attempt: toNumber(row.attempt) ?? 0,
    field: row.field,
    value: row.value,
    source: row.source,
    sourceType: row.source_type,
    provider: row.provider,
    model: row.model,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    pipelineVersion: row.pipeline_version,
    confidence: toNumber(row.confidence),
    validationStatus: row.validation_status,
    validationIssues: [...row.validation_issues],
    riskLevel: row.risk_level,
    riskReasons: [...row.risk_reasons],
    decision: row.decision,
    decidedBy: row.decided_by,
    decidedAt:
      row.decided_at === null || row.decided_at === undefined
        ? null
        : toIso(row.decided_at),
    appliedValue: row.applied_value,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const JOB_COLUMNS = `
  id,
  product_id,
  owner_id,
  job_type,
  state,
  provider,
  model,
  model_version,
  prompt_version,
  schema_version,
  pipeline_version,
  input,
  input_hash,
  attempt_count,
  max_attempts,
  correlation_id,
  causation_id,
  idempotency_key,
  failure_code,
  failure_message,
  failure_diagnostic,
  next_attempt_at,
  created_at,
  updated_at,
  started_at,
  completed_at
`;

const PROPOSAL_COLUMNS = `
  id,
  job_id,
  product_id,
  attempt,
  field,
  value,
  source,
  source_type,
  provider,
  model,
  model_version,
  prompt_version,
  schema_version,
  pipeline_version,
  confidence,
  validation_status,
  validation_issues,
  risk_level,
  risk_reasons,
  decision,
  decided_by,
  decided_at,
  applied_value,
  created_at,
  updated_at
`;

export class PostgresAiRepository implements AiRepository {
  constructor(private readonly database: Database) {}

  async createJob(
    input: CreateAiJobInput,
  ): Promise<CreateAiJobResult> {
    const now = new Date().toISOString();

    const rows = await this.database.query<JobRow>(
      `
        INSERT INTO ai_jobs (
          id,
          product_id,
          owner_id,
          job_type,
          state,
          provider,
          model,
          model_version,
          prompt_version,
          schema_version,
          pipeline_version,
          input,
          input_hash,
          attempt_count,
          max_attempts,
          correlation_id,
          causation_id,
          idempotency_key,
          created_at,
          updated_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          'QUEUED',
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::jsonb,
          $11,
          0,
          $12,
          $13,
          $14,
          $15,
          $16,
          $16
        )
        ON CONFLICT (owner_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL
        DO NOTHING
        RETURNING ${JOB_COLUMNS}
      `,
      [
        input.productId,
        input.ownerId,
        input.jobType,
        input.provider,
        input.model,
        input.modelVersion,
        input.promptVersion,
        input.schemaVersion,
        input.pipelineVersion,
        JSON.stringify(input.input),
        input.inputHash,
        input.maxAttempts,
        input.correlationId,
        input.causationId,
        input.idempotencyKey,
        now,
      ],
    );

    if (rows[0]) {
      return {
        job: mapJob(rows[0]),
        created: true,
      };
    }

    const existing =
      input.idempotencyKey
        ? await this.findJobByIdempotencyKey(
            input.ownerId,
            input.idempotencyKey,
          )
        : null;

    if (existing) {
      return {
        job: existing,
        created: false,
      };
    }

    throw new Error(
      'AI job insert returned no row and no idempotent match.',
    );
  }

  async createJobWithOutbox(
    input: CreateAiJobInput,
    outboxPayload: OutboxEventPayload,
  ): Promise<CreateAiJobWithOutboxResult> {
    const now = new Date().toISOString();

    return this.database.transaction(async (tx) => {
      // Insert the job
      const jobRows = await tx.query<JobRow>(
        `
          INSERT INTO ai_jobs (
            id,
            product_id,
            owner_id,
            job_type,
            state,
            provider,
            model,
            model_version,
            prompt_version,
            schema_version,
            pipeline_version,
            input,
            input_hash,
            attempt_count,
            max_attempts,
            correlation_id,
            causation_id,
            idempotency_key,
            created_at,
            updated_at
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            'QUEUED',
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::jsonb,
            $11,
            0,
            $12,
            $13,
            $14,
            $15,
            $16,
            $16
          )
          ON CONFLICT (owner_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL
          DO NOTHING
          RETURNING ${JOB_COLUMNS}
        `,
        [
          input.productId,
          input.ownerId,
          input.jobType,
          input.provider,
          input.model,
          input.modelVersion,
          input.promptVersion,
          input.schemaVersion,
          input.pipelineVersion,
          JSON.stringify(input.input),
          input.inputHash,
          input.maxAttempts,
          input.correlationId,
          input.causationId,
          input.idempotencyKey,
          now,
        ],
      );

      if (jobRows[0]) {
        // Job was created, now insert the outbox event with the real jobId
        const outboxEventId = crypto.randomUUID();

        // Build the complete payload with the actual jobId
        const completePayload = {
          ...outboxPayload,
          jobId: jobRows[0].id,
        };

        await tx.query(
          `
            INSERT INTO ai_job_outbox (
              id,
              job_id,
              owner_id,
              payload_version,
              payload,
              state,
              dispatch_attempt,
              max_dispatch_attempts,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2,
              $3,
              1,
              $4::jsonb,
              'PENDING',
              0,
              5,
              $5,
              $5
            )
          `,
          [
            outboxEventId,
            jobRows[0].id,
            input.ownerId,
            JSON.stringify(completePayload),
            now,
          ],
        );

        return {
          job: mapJob(jobRows[0]),
          outboxEventId,
          created: true,
        };
      }

      // Job already existed (idempotent replay)
      const existing = input.idempotencyKey
        ? await this.findJobByIdempotencyKey(input.ownerId, input.idempotencyKey)
        : null;

      if (existing) {
        // For idempotent replay, we still need to ensure an outbox event exists
        // Check if one exists, if not create it
        const outboxRows = await tx.query<{ id: string }>(
          `
            SELECT id
            FROM ai_job_outbox
            WHERE job_id = $1
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [existing.id],
        );

        let outboxEventId: string;
        if (outboxRows[0]) {
          outboxEventId = outboxRows[0].id;
        } else {
          outboxEventId = crypto.randomUUID();

          // Build the complete payload with the actual jobId
          const completePayload = {
            ...outboxPayload,
            jobId: existing.id,
          };

          await tx.query(
            `
              INSERT INTO ai_job_outbox (
                id,
                job_id,
                owner_id,
                payload_version,
                payload,
                state,
                dispatch_attempt,
                max_dispatch_attempts,
                created_at,
                updated_at
              )
              VALUES (
                $1,
                $2,
                $3,
                1,
                $4::jsonb,
                'PENDING',
                0,
                5,
                $5,
                $5
              )
            `,
            [
              outboxEventId,
              existing.id,
              input.ownerId,
              JSON.stringify(completePayload),
              now,
            ],
          );
        }

        return {
          job: existing,
          outboxEventId,
          created: false,
        };
      }

      throw new Error(
        'AI job insert returned no row and no idempotent match.',
      );
    });
  }

  async findJobByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<AiJob | null> {
    const rows = await this.database.query<JobRow>(
      `
        SELECT ${JOB_COLUMNS}
        FROM ai_jobs
        WHERE owner_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [ownerId, idempotencyKey],
    );

    return rows[0] ? mapJob(rows[0]) : null;
  }

  async getJob(id: string): Promise<AiJob | null> {
    const rows = await this.database.query<JobRow>(
      `
        SELECT ${JOB_COLUMNS}
        FROM ai_jobs
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return rows[0] ? mapJob(rows[0]) : null;
  }

  async listJobsByProduct(
    productId: string,
  ): Promise<readonly AiJob[]> {
    const rows = await this.database.query<JobRow>(
      `
        SELECT ${JOB_COLUMNS}
        FROM ai_jobs
        WHERE product_id = $1
        ORDER BY created_at ASC
      `,
      [productId],
    );

    return rows.map(mapJob);
  }

  async beginAttempt(input: {
    id: string;
    expectedState: AiJobState;
    attemptCount: number;
  }): Promise<AiJob> {
    const rows = await this.database.query<JobRow>(
      `
        UPDATE ai_jobs
        SET
          state = 'RUNNING',
          attempt_count = $1,
          failure_code = NULL,
          failure_message = NULL,
          failure_diagnostic = NULL,
          next_attempt_at = NULL,
          started_at = COALESCE(started_at, now()),
          updated_at = now()
        WHERE id = $2
          AND state = $3
        RETURNING ${JOB_COLUMNS}
      `,
      [
        input.attemptCount,
        input.id,
        input.expectedState,
      ],
    );

    const job = rows[0];

    if (!job) {
      throw await this.jobConflict(
        input.id,
        input.expectedState,
      );
    }

    return mapJob(job);
  }

  async completeAttempt(
    input: RecordAttemptInput,
  ): Promise<AiJob> {
    const terminal =
      input.nextState === 'SUCCEEDED' ||
      input.nextState === 'FAILED' ||
      input.nextState === 'DEAD_LETTERED';

    const rows = await this.database.query<JobRow>(
      `
        UPDATE ai_jobs
        SET
          state = $1,
          attempt_count = $2,
          failure_code = $3,
          failure_message = $4,
          failure_diagnostic = $5,
          next_attempt_at = $6,
          completed_at = CASE
            WHEN $7 THEN now()
            ELSE completed_at
          END,
          updated_at = now()
        WHERE id = $8
          AND state = $9
        RETURNING ${JOB_COLUMNS}
      `,
      [
        input.nextState,
        input.attemptCount,
        input.failure?.code ?? null,
        input.failure?.message ?? null,
        input.failure?.diagnostic ?? null,
        input.nextAttemptAt,
        terminal,
        input.id,
        input.expectedState,
      ],
    );

    const job = rows[0];

    if (!job) {
      throw await this.jobConflict(
        input.id,
        input.expectedState,
      );
    }

    return mapJob(job);
  }

  async completeAttemptWithRetryOutbox(
    input: CompleteAttemptWithRetryOutboxInput,
  ): Promise<AiJob> {
    // For non-RETRYING states, delegate to completeAttempt
    if (input.nextState !== 'RETRYING') {
      return this.completeAttempt({
        id: input.id,
        expectedState: input.expectedState,
        nextState: input.nextState,
        attemptCount: input.attemptCount,
        failure: input.failure,
        nextAttemptAt: input.nextAttemptAt,
      });
    }

    // For RETRYING state, we need both the job update and outbox insert in one transaction
    if (!input.retryOutboxPayload) {
      throw new Error(
        'retryOutboxPayload is required when nextState is RETRYING',
      );
    }

    return this.database.transaction(async (tx) => {
      const terminal =
        input.nextState === 'SUCCEEDED' ||
        input.nextState === 'FAILED' ||
        input.nextState === 'DEAD_LETTERED';

      // Update the job state
      const jobRows = await tx.query<JobRow>(
        `
          UPDATE ai_jobs
          SET
            state = $1,
            attempt_count = $2,
            failure_code = $3,
            failure_message = $4,
            failure_diagnostic = $5,
            next_attempt_at = $6,
            completed_at = CASE
              WHEN $7 THEN now()
              ELSE completed_at
            END,
            updated_at = now()
          WHERE id = $8
            AND state = $9
          RETURNING ${JOB_COLUMNS}
        `,
        [
          input.nextState,
          input.attemptCount,
          input.failure?.code ?? null,
          input.failure?.message ?? null,
          input.failure?.diagnostic ?? null,
          input.nextAttemptAt,
          terminal,
          input.id,
          input.expectedState,
        ],
      );

      const job = jobRows[0];

      if (!job) {
        throw await this.jobConflict(input.id, input.expectedState);
      }

      // Create the retry outbox event in the same transaction
      const now = new Date().toISOString();
      const outboxEventId = crypto.randomUUID();

      // Build the complete payload with the actual jobId and updated attempt
      const completePayload = {
        ...input.retryOutboxPayload,
        jobId: job.id,
        attempt: job.attempt_count, // Use the current attempt count (which was just incremented)
      };

      await tx.query(
        `
          INSERT INTO ai_job_outbox (
            id,
            job_id,
            owner_id,
            payload_version,
            payload,
            state,
            dispatch_attempt,
            max_dispatch_attempts,
            next_dispatch_at,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            1,
            $4::jsonb,
            'PENDING',
            0,
            5,
            $5,
            $6,
            $6
          )
        `,
        [
          outboxEventId,
          job.id,
          job.owner_id,
          JSON.stringify(completePayload),
          job.next_attempt_at, // Schedule for when the retry is due
          now,
        ],
      );

      return mapJob(job);
    });
  }

  /**
   * Idempotent within one attempt.
   *
   * The unique index on `(job_id, attempt, field)` makes a repeated save
   * of the same attempt converge: the conflicting rows do nothing and the
   * attempt's stored rows are returned. A crash between the proposal save
   * and the job settling leaves a `RUNNING` job whose proposals are
   * already present, and the retry converges on them instead of writing a
   * second set. Writing the whole attempt in one transaction keeps the
   * attempt from appearing half-saved if the insert fails midway.
   */
  async saveProposals(
    input: SaveProposalsInput,
  ): Promise<readonly AiProposal[]> {
    return this.database.transaction(async (tx) => {
      for (const draft of input.drafts) {
        await tx.query(
          `
            INSERT INTO ai_proposals (
              id,
              job_id,
              product_id,
              attempt,
              field,
              value,
              source,
              source_type,
              provider,
              model,
              model_version,
              prompt_version,
              schema_version,
              pipeline_version,
              confidence,
              validation_status,
              validation_issues,
              risk_level,
              risk_reasons,
              created_at,
              updated_at
            )
            VALUES (
              gen_random_uuid(),
              $1,
              $2,
              $3,
              $4,
              $5::jsonb,
              'AI_GENERATED',
              'CATALOG_FIELD_GENERATION',
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              $12,
              $13,
              $14,
              $15,
              $16,
              $17,
              $17
            )
            ON CONFLICT (job_id, attempt, field)
              DO NOTHING
          `,
          [
            input.job.id,
            input.job.productId,
            input.attempt,
            draft.field,
            JSON.stringify(draft.value),
            input.job.provider,
            input.job.model,
            input.job.modelVersion,
            input.job.promptVersion,
            input.job.schemaVersion,
            input.job.pipelineVersion,
            draft.confidence,
            draft.validationStatus,
            draft.validationIssues,
            draft.riskLevel,
            draft.riskReasons,
            new Date().toISOString(),
          ],
        );
      }

      return this.selectAttempt(tx, input.job.id, input.attempt);
    });
  }

  async listProposals(
    jobId: string,
  ): Promise<readonly AiProposal[]> {
    const rows = await this.database.query<ProposalRow>(
      `
        SELECT DISTINCT ON (field) ${PROPOSAL_COLUMNS}
        FROM ai_proposals
        WHERE job_id = $1
        ORDER BY field, attempt DESC
      `,
      [jobId],
    );

    return rows.map(mapProposal);
  }

  async listProposalHistory(
    jobId: string,
  ): Promise<readonly AiProposal[]> {
    const rows = await this.database.query<ProposalRow>(
      `
        SELECT ${PROPOSAL_COLUMNS}
        FROM ai_proposals
        WHERE job_id = $1
        ORDER BY attempt ASC, field ASC
      `,
      [jobId],
    );

    return rows.map(mapProposal);
  }

  async listUndecidedProposals(
    productId: string,
  ): Promise<readonly AiProposal[]> {
    const rows = await this.database.query<ProposalRow>(
      `
        SELECT ${PROPOSAL_COLUMNS}
        FROM ai_proposals
        WHERE product_id = $1
          AND decision = 'PENDING'
          AND validation_status = 'VALID'
        ORDER BY field ASC, created_at ASC
      `,
      [productId],
    );

    return rows.map(mapProposal);
  }

  async getProposal(
    id: string,
  ): Promise<AiProposal | null> {
    const rows = await this.database.query<ProposalRow>(
      `
        SELECT ${PROPOSAL_COLUMNS}
        FROM ai_proposals
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return rows[0] ? mapProposal(rows[0]) : null;
  }

  async recordDecision(
    input: RecordProposalDecisionInput,
  ): Promise<AiProposal> {
    const rows = await this.database.query<ProposalRow>(
      `
        UPDATE ai_proposals
        SET
          decision = $1,
          decided_by = $2,
          decided_at = now(),
          applied_value = $3,
          updated_at = now()
        WHERE id = $4
          AND decision = $5
        RETURNING ${PROPOSAL_COLUMNS}
      `,
      [
        input.decision,
        input.decidedBy,
        input.appliedValue === null
          ? null
          : JSON.stringify(input.appliedValue),
        input.id,
        input.expectedDecision,
      ],
    );

    const proposal = rows[0];

    if (!proposal) {
      const current = await this.getProposal(input.id);

      if (!current) {
        throw new AiProposalDecisionConflictError(
          input.id,
          null,
        );
      }

      throw new AiProposalDecisionConflictError(
        input.id,
        current.decision,
      );
    }

    return mapProposal(proposal);
  }

  /**
   * Distinguishes a lost compare-and-set from a missing job by reading the
   * row the update did not reach. The two are different failures: a lost
   * race means another writer already moved the job, while an absent row
   * means the caller named something that does not exist.
   */
  private async jobConflict(
    id: string,
    expectedState: AiJobState,
  ): Promise<AiJobStateConflictError> {
    const current = await this.getJob(id);

    return new AiJobStateConflictError(
      id,
      expectedState,
      current?.state ?? null,
    );
  }

  private async selectAttempt(
    executor: Database | Transaction,
    jobId: string,
    attempt: number,
  ): Promise<readonly AiProposal[]> {
    const rows = await executor.query<ProposalRow>(
      `
        SELECT ${PROPOSAL_COLUMNS}
        FROM ai_proposals
        WHERE job_id = $1
          AND attempt = $2
        ORDER BY field ASC
      `,
      [jobId, attempt],
    );

    return rows.map(mapProposal);
  }

  async createOutboxEventForRetry(
    job: AiJob,
    outboxPayload: OutboxEventPayload,
  ): Promise<string> {
    const now = new Date().toISOString();
    const outboxEventId = crypto.randomUUID();

    // Build the complete payload with the actual jobId and updated attempt
    const completePayload = {
      ...outboxPayload,
      jobId: job.id,
      attempt: job.attemptCount, // Use the current attempt count (which was just incremented)
    };

    await this.database.query(
      `
        INSERT INTO ai_job_outbox (
          id,
          job_id,
          owner_id,
          payload_version,
          payload,
          state,
          dispatch_attempt,
          max_dispatch_attempts,
          next_dispatch_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          1,
          $4::jsonb,
          'PENDING',
          0,
          5,
          $5,
          $6,
          $6
        )
      `,
      [
        outboxEventId,
        job.id,
        job.ownerId,
        JSON.stringify(completePayload),
        job.nextAttemptAt, // Schedule for when the retry is due
        now,
      ],
    );

    return outboxEventId;
  }
}