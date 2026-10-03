import type {
  AiJob,
  AiJobState,
  AiProposal,
} from '@artisan-marketplace/contracts';
import type {
  AiRepository,
  CreateAiJobInput,
  CreateAiJobResult,
  RecordAttemptInput,
  RecordProposalDecisionInput,
  SaveProposalsInput,
} from '../application/ai-repository.js';
import {
  AiJobStateConflictError,
  AiProposalDecisionConflictError,
} from '../application/ai-repository.js';

function jobKey(
  ownerId: string,
  idempotencyKey: string,
): string {
  return `${ownerId}:${idempotencyKey}`;
}

/**
 * Volatile job and proposal storage.
 *
 * Same role as the Catalog module's in-memory repository: a local
 * development and test convenience, never a fallback. The composition root
 * refuses to build one outside development and test, so a deployment missing
 * its database configuration fails loudly instead of quietly serving a store
 * that loses every job.
 */
export class InMemoryAiRepository implements AiRepository {
  private readonly jobs = new Map<string, AiJob>();
  private readonly proposals = new Map<string, AiProposal>();
  private readonly idempotency = new Map<string, string>();

  async createJob(
    input: CreateAiJobInput,
  ): Promise<CreateAiJobResult> {
    if (input.idempotencyKey) {
      const existing =
        await this.findJobByIdempotencyKey(
          input.ownerId,
          input.idempotencyKey,
        );

      if (existing) {
        return {
          job: existing,
          created: false,
        };
      }
    }

    const now = new Date().toISOString();

    const job: AiJob = {
      id: crypto.randomUUID(),
      productId: input.productId,
      ownerId: input.ownerId,
      jobType: input.jobType,
      state: 'QUEUED',
      provider: input.provider,
      model: input.model,
      modelVersion: input.modelVersion,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      pipelineVersion: input.pipelineVersion,
      input: input.input,
      inputHash: input.inputHash,
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      correlationId: input.correlationId,
      causationId: input.causationId,
      idempotencyKey: input.idempotencyKey,
      failure: null,
      nextAttemptAt: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    };

    this.jobs.set(job.id, job);

    if (input.idempotencyKey) {
      this.idempotency.set(
        jobKey(input.ownerId, input.idempotencyKey),
        job.id,
      );
    }

    return {
      job,
      created: true,
    };
  }

  async findJobByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<AiJob | null> {
    const id = this.idempotency.get(
      jobKey(ownerId, idempotencyKey),
    );

    return id ? this.jobs.get(id) ?? null : null;
  }

  async getJob(id: string): Promise<AiJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async listJobsByProduct(
    productId: string,
  ): Promise<readonly AiJob[]> {
    return [...this.jobs.values()]
      .filter((job) => job.productId === productId)
      .sort((left, right) =>
        left.createdAt < right.createdAt
          ? -1
          : left.createdAt > right.createdAt
            ? 1
            : 0,
      );
  }

  async beginAttempt(input: {
    id: string;
    expectedState: AiJobState;
    attemptCount: number;
  }): Promise<AiJob> {
    return this.updateJob(input.id, (job) => {
      if (job.state !== input.expectedState) {
        throw new AiJobStateConflictError(
          input.id,
          input.expectedState,
          job.state,
        );
      }

      return {
        ...job,
        state: 'RUNNING',
        attemptCount: input.attemptCount,
        failure: null,
        nextAttemptAt: null,
        startedAt:
          job.startedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async completeAttempt(
    input: RecordAttemptInput,
  ): Promise<AiJob> {
    return this.updateJob(input.id, (job) => {
      if (job.state !== input.expectedState) {
        throw new AiJobStateConflictError(
          input.id,
          input.expectedState,
          job.state,
        );
      }

      const terminal =
        input.nextState === 'SUCCEEDED' ||
        input.nextState === 'FAILED' ||
        input.nextState === 'DEAD_LETTERED';

      return {
        ...job,
        state: input.nextState,
        attemptCount: input.attemptCount,
        failure: input.failure,
        nextAttemptAt: input.nextAttemptAt,
        completedAt: terminal
          ? new Date().toISOString()
          : job.completedAt,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async saveProposals(
    input: SaveProposalsInput,
  ): Promise<readonly AiProposal[]> {
    /**
     * Idempotent within one attempt. A retry that re-runs the same attempt
     * converges on what is already stored, so a partially written attempt
     * cannot leave duplicate rows for the same field.
     */
    const already = new Set(
      this.proposalsForAttempt(
        input.job.id,
        input.attempt,
      ).map((proposal) => proposal.field),
    );

    const stored: AiProposal[] = [];

    for (const draft of input.drafts) {
      if (already.has(draft.field)) {
        continue;
      }

      const now = new Date().toISOString();

      const proposal: AiProposal = {
        id: crypto.randomUUID(),
        jobId: input.job.id,
        productId: input.job.productId,
        attempt: input.attempt,
        field: draft.field,
        value: draft.value,
        source: 'AI_GENERATED',
        sourceType: input.job.jobType,
        provider: input.job.provider,
        model: input.job.model,
        modelVersion: input.job.modelVersion,
        promptVersion: input.job.promptVersion,
        schemaVersion: input.job.schemaVersion,
        pipelineVersion: input.job.pipelineVersion,
        confidence: draft.confidence,
        validationStatus: draft.validationStatus,
        validationIssues: [...draft.validationIssues],
        riskLevel: draft.riskLevel,
        riskReasons: [...draft.riskReasons],
        decision: 'PENDING',
        decidedBy: null,
        decidedAt: null,
        appliedValue: null,
        createdAt: now,
        updatedAt: now,
      };

      this.proposals.set(proposal.id, proposal);
      stored.push(proposal);
    }

    return [
      ...this.proposalsForAttempt(
        input.job.id,
        input.attempt,
      ),
    ];
  }

  async listProposals(
    jobId: string,
  ): Promise<readonly AiProposal[]> {
    const all = this.proposalsForJob(jobId);

    const latestAttempt = new Map<
      AiProposal['field'],
      AiProposal
    >();

    for (const proposal of all) {
      const held = latestAttempt.get(proposal.field);

      if (
        !held ||
        proposal.attempt >= held.attempt
      ) {
        latestAttempt.set(proposal.field, proposal);
      }
    }

    return [...latestAttempt.values()].sort(
      (left, right) =>
        left.field < right.field
          ? -1
          : left.field > right.field
            ? 1
            : 0,
    );
  }

  async listProposalHistory(
    jobId: string,
  ): Promise<readonly AiProposal[]> {
    return [...this.proposalsForJob(jobId)].sort(
      (left, right) =>
        left.attempt - right.attempt ||
        (left.field < right.field
          ? -1
          : left.field > right.field
          ? 1
          : 0),
    );
  }

  async listUndecidedProposals(
    productId: string,
  ): Promise<readonly AiProposal[]> {
    return [...this.proposals.values()]
      .filter(
        (proposal) =>
          proposal.productId === productId &&
          proposal.decision === 'PENDING' &&
          proposal.validationStatus === 'VALID',
      )
      .sort(
        (left, right) =>
          (left.field < right.field
            ? -1
            : left.field > right.field
              ? 1
              : 0) ||
          (left.createdAt < right.createdAt
            ? -1
            : left.createdAt > right.createdAt
              ? 1
              : 0),
      );
  }

  async getProposal(
    id: string,
  ): Promise<AiProposal | null> {
    return this.proposals.get(id) ?? null;
  }

  async recordDecision(
    input: RecordProposalDecisionInput,
  ): Promise<AiProposal> {
    const proposal = this.proposals.get(input.id);

    if (!proposal) {
      throw new AiProposalDecisionConflictError(
        input.id,
        null,
      );
    }

    if (proposal.decision !== input.expectedDecision) {
      throw new AiProposalDecisionConflictError(
        input.id,
        proposal.decision,
      );
    }

    const decided: AiProposal = {
      ...proposal,
      decision: input.decision,
      decidedBy: input.decidedBy,
      decidedAt: new Date().toISOString(),
      appliedValue: input.appliedValue,
      updatedAt: new Date().toISOString(),
    };

    this.proposals.set(input.id, decided);

    return decided;
  }

  private proposalsForJob(
    jobId: string,
  ): AiProposal[] {
    return [...this.proposals.values()].filter(
      (proposal) => proposal.jobId === jobId,
    );
  }

  private proposalsForAttempt(
    jobId: string,
    attempt: number,
  ): AiProposal[] {
    return this.proposalsForJob(jobId).filter(
      (proposal) => proposal.attempt === attempt,
    );
  }

  private async updateJob(
    id: string,
    mutate: (job: AiJob) => AiJob,
  ): Promise<AiJob> {
    const job = this.jobs.get(id);

    if (!job) {
      throw new AiJobStateConflictError(
        id,
        'QUEUED',
        null,
      );
    }

    const updated = mutate(job);

    this.jobs.set(id, updated);
    return updated;
  }
}
