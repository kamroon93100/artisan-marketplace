import type {
  AiJob,
  AiProposal,
  AiProposalDecision,
  AiProposalField,
} from '@artisan-marketplace/contracts';
import { AppError } from '../../../shared/errors/app-error.js';
import { normalizeField } from '../domain/ai-validation-pipeline.js';
import { isProposalStale } from '../domain/ai-proposal-staleness.js';
import type { CatalogProductPort } from './catalog-product-port.js';
import type { CatalogProductSnapshot } from './catalog-product-port.js';
import type {
  AiRepository,
  RecordProposalDecisionInput,
} from './ai-repository.js';
import {
  AiProposalDecisionConflictError,
} from './ai-repository.js';

export type ProposalDecisionInput = {
  proposalId: string;
  decision: Exclude<AiProposalDecision, 'PENDING'>;
  /**
   * The artisan's own value, required for an `EDITED` decision. It is what
   * reaches the product; the model's value is kept only as evidence.
   */
  value?: string | readonly string[];
};

export type ApplyDecisionsResult = {
  product: {
    id: string;
    ownerId: string;
    state: string;
    title: string | null;
    description: string | null;
    category: string | null;
    materials: readonly string[];
  };
  proposals: readonly AiProposal[];
  applied: readonly AiProposalField[];
  staleFields: readonly AiProposalField[];
};

/**
 * Job states in which a proposal may be decided.
 *
 * A job that is still `QUEUED`, `RUNNING`, or `RETRYING` has produced nothing
 * to review. `FAILED` and `DEAD_LETTERED` are refused explicitly rather than
 * reported as an empty review, because "there is nothing to decide" and
 * "something went wrong and you need to know" are different messages to an
 * artisan. `PARTIAL_RESULT` is included: a partial result is precisely the
 * case that needs a human.
 */
const DECIDABLE_JOB_STATES = ['PARTIAL_RESULT', 'SUCCEEDED'] as const;

function isDecidableJobState(
  state: AiJob['state'],
): boolean {
  return (DECIDABLE_JOB_STATES as readonly string[]).includes(
    state,
  );
}

/**
 * Applies human decisions to proposals.
 *
 * This is the only place in the application where an AI-derived value can
 * reach a canonical product, and it is only ever reached through an explicit
 * decision. There is no method that writes a proposal's value because it
 * scored well, and the write itself is delegated to the Catalog module, which
 * owns authorization and the product state rules.
 */
export class AiReviewService {
  constructor(
    private readonly repository: AiRepository,
    private readonly catalog: CatalogProductPort,
  ) {}

  /**
   * Applies a batch of decisions.
   *
   * Order matters and is deliberate. Every decision is validated first, then
   * recorded, and the product is written last. The reverse order would leave
   * a canonical value with no provenance recorded if the recording failed,
   * which is the one outcome that breaks both the audit requirement and the
   * ability to explain a value later. Recording first can leave a decision
   * recorded but unwritten, which is recoverable in the safe direction: the
   * product is unchanged and the decision can be re-applied.
   *
   * A batch that would write the same field twice is refused *before* any
   * decision is recorded. The record-then-write order is only safe in the
   * usual direction - a recorded decision can always be re-applied - and a
   * batch that maps two proposals onto one field could only be recorded as
   * two decisions neither of which can ever be applied together.
   */
  async applyDecisions(
    productId: string,
    actorId: string,
    decisions: readonly ProposalDecisionInput[],
  ): Promise<ApplyDecisionsResult> {
    if (decisions.length === 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'At least one decision is required.',
      );
    }

    const claimed = new Set<string>();

    for (const decision of decisions) {
      if (claimed.has(decision.proposalId)) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Proposal ${decision.proposalId} was decided more than once in one request.`,
          { proposalId: decision.proposalId },
        );
      }

      claimed.add(decision.proposalId);
    }

    /**
     * Read once, before any decision is recorded. It is the ownership check
     * for the whole batch and the baseline staleness is measured against, so
     * a batch cannot half-succeed against a product the actor does not own.
     */
    const product = await this.requireOwnedProduct(
      productId,
      actorId,
    );

    /**
     * Validation is read-only and records nothing. Splitting it from the
     * recording loop is what makes the field-collision guard below able to
     * refuse a bad batch with nothing written.
     */
    const resolved: ResolvedDecision[] = [];

    for (const decision of decisions) {
      resolved.push(
        await this.validateDecision(
          productId,
          product,
          actorId,
          decision,
        ),
      );
    }

    /**
     * Two accepted proposals for the same field would mean silently choosing
     * one of them, and which one depends on request order. The request is
     * refused instead, because "apply the newer one" is a decision the
     * artisan has not made.
     */
    const writeFields = new Set<AiProposalField>();

    for (const entry of resolved) {
      if (entry.decision === 'REJECTED') {
        continue;
      }

      if (writeFields.has(entry.proposal.field)) {
        throw new AppError(
          'VALIDATION_FAILED',
          `More than one decision in this request would write ${entry.proposal.field}.`,
          { field: entry.proposal.field },
        );
      }

      writeFields.add(entry.proposal.field);
    }

    /**
     * Record every decision. Each recording is a compare-and-set that began
     * as `PENDING`, so a concurrent reviewer who recorded first surfaces as
     * a conflict here, after which the whole batch stops before any write.
     */
    const recorded: ResolvedDecision[] = [];

    for (const entry of resolved) {
      recorded.push(
        await this.recordOne(entry, actorId),
      );
    }

    const confirmed: Partial<
      Record<AiProposalField, string | readonly string[]>
    > = {};

    for (const entry of recorded) {
      if (entry.decision === 'REJECTED') {
        continue;
      }

      /**
       * Only a rejected decision has no write value. Every other outcome
       * resolves to one, so reaching this guard for a non-rejected entry
       * is an internal invariant violation and must surface rather than
       * silently dropping the field from the write.
       */
      if (entry.value === null) {
        throw new Error(
          'Internal invariant violated: a decidable proposal resolved to no value.',
        );
      }

      confirmed[entry.proposal.field] = entry.value;
    }

    const updated = await this.writeConfirmedValues(
      productId,
      actorId,
      confirmed,
      writeFields,
      recorded,
    );

    return {
      product: updated,
      proposals: recorded.map(
        (entry) => entry.proposal,
      ),
      applied: [...writeFields],
      staleFields: [
        ...new Set(
          recorded
            .filter(
              (entry) =>
                entry.decision !== 'REJECTED' &&
                entry.isStale,
            )
            .map((entry) => entry.proposal.field),
        ),
      ],
    };
  }

  private async writeConfirmedValues(
    productId: string,
    actorId: string,
    confirmed: Partial<
      Record<AiProposalField, string | readonly string[]>
    >,
    writeFields: ReadonlySet<AiProposalField>,
    resolved: readonly ResolvedDecision[],
  ) {
    if (writeFields.size === 0) {
      return this.requireOwnedProduct(
        productId,
        actorId,
      );
    }

    try {
      return await this.catalog.applyConfirmedValues(
        productId,
        actorId,
        {
          ...(confirmed.title !== undefined
            ? { title: confirmed.title as string }
            : {}),
          ...(confirmed.description !== undefined
            ? {
                description:
                  confirmed.description as string,
              }
            : {}),
          ...(confirmed.category !== undefined
            ? {
                category:
                  confirmed.category as string,
              }
            : {}),
          ...(confirmed.materials !== undefined
            ? {
                materials:
                  confirmed.materials as readonly string[],
              }
            : {}),
        },
      );
    } catch (error) {
      /**
       * The decisions are already recorded, so this is reported as what it
       * is: the product was not updated and the recorded decisions still need
       * applying. The original code is preserved so a dependency failure is
       * not misreported as a business conflict, and a message that promises a
       * retry is not attached to something that will never succeed on retry.
       */
      const code =
        error instanceof AppError
          ? error.code
          : 'DEPENDENCY_FAILED';

      throw new AppError(
        code,
        'The decisions were recorded but the product could not be updated. Correct the reported problem and re-apply the decisions; the product is unchanged until then.',
        {
          productId,
          pendingFields: [...writeFields],
          recordedProposals: resolved
            .filter(
              (entry) => entry.decision !== 'REJECTED',
            )
            .map((entry) => ({
              proposalId: entry.proposal.id,
              field: entry.proposal.field,
            })),
          cause:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );
    }
  }

  /**
   * Validates one decision against the stored records, recording nothing.
   *
   * Every check that can fail here is read-only: the proposal exists, it
   * belongs to the product and job being decided, the job has produced
   * something decidable, the proposal is actionable, and the value a
   * decision would write is well-formed. Only a decision that passes all of
   * them is later recorded, so a batch cannot half-record against a job
   * that has nothing to decide.
   */
  private async validateDecision(
    productId: string,
    product: CatalogProductSnapshot,
    actorId: string,
    decision: ProposalDecisionInput,
  ): Promise<ResolvedDecision> {
    const proposal =
      await this.repository.getProposal(
        decision.proposalId,
      );

    if (!proposal) {
      throw new AppError(
        'NOT_FOUND',
        'AI proposal was not found.',
        { proposalId: decision.proposalId },
      );
    }

    if (proposal.productId !== productId) {
      throw new AppError(
        'VALIDATION_FAILED',
        'The proposal does not belong to this product.',
        {
          proposalId: proposal.id,
          productId,
        },
      );
    }

    const job = await this.requireOwnedJob(
      proposal,
      actorId,
    );

    if (!isDecidableJobState(job.state)) {
      throw new AppError(
        'CONFLICT',
        `AI job ${job.id} is ${job.state} and has no decision to make.`,
        { jobId: job.id, state: job.state },
      );
    }

    if (proposal.validationStatus !== 'VALID') {
      throw new AppError(
        'CONFLICT',
        `Proposal ${proposal.id} failed validation and cannot be applied.`,
        {
          proposalId: proposal.id,
          validationIssues: proposal.validationIssues,
        },
      );
    }

    if (proposal.decision !== 'PENDING') {
      throw new AppError(
        'CONFLICT',
        `Proposal ${proposal.id} was already ${proposal.decision}.`,
        {
          proposalId: proposal.id,
          decision: proposal.decision,
        },
      );
    }

    return {
      proposal,
      decision: decision.decision,
      value: resolveDecisionValue(
        proposal,
        decision,
      ),
      isStale: isProposalStale(job, proposal, product),
    };
  }

  /**
   * Records one validated decision.
   *
   * The recording itself is a compare-and-set in the repository, so two
   * reviewers racing produce one outcome and one conflict rather than a
   * last-writer-wins overwrite.
   */
  private async recordOne(
    entry: ResolvedDecision,
    actorId: string,
  ): Promise<ResolvedDecision> {
    const input: RecordProposalDecisionInput = {
      id: entry.proposal.id,
      expectedDecision: 'PENDING',
      decision: entry.decision,
      decidedBy: actorId,
      appliedValue:
        entry.decision === 'REJECTED' ? null : entry.value,
    };

    try {
      const recorded =
        await this.repository.recordDecision(input);

      return {
        ...entry,
        proposal: recorded,
      };
    } catch (error) {
      if (error instanceof AiProposalDecisionConflictError) {
        throw new AppError(
          'CONFLICT',
          error.message,
          { proposalId: entry.proposal.id },
        );
      }

      throw error;
    }
  }

  private async requireOwnedJob(
    proposal: AiProposal,
    actorId: string,
  ): Promise<AiJob> {
    const job = await this.repository.getJob(
      proposal.jobId,
    );

    if (!job) {
      throw new AppError(
        'NOT_FOUND',
        'AI job was not found.',
        { jobId: proposal.jobId },
      );
    }

    if (job.ownerId !== actorId) {
      throw new AppError(
        'FORBIDDEN',
        'The AI job belongs to another artisan.',
        { jobId: proposal.jobId },
      );
    }

    return job;
  }

  private async requireOwnedProduct(
    productId: string,
    actorId: string,
  ) {
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

    return product;
  }
}

type ResolvedDecision = {
  proposal: AiProposal;
  decision: Exclude<AiProposalDecision, 'PENDING'>;
  value: string | readonly string[] | null;
  isStale: boolean;
};

/**
 * The value a decision writes.
 *
 * `ACCEPTED` writes the model's normalized value. `EDITED` writes the
 * artisan's own value and never the model's — that is the entire point of an
 * edit — and it is normalized on the way in so what is recorded as applied
 * and what reaches the product cannot differ by whitespace.
 */
function resolveDecisionValue(
  proposal: AiProposal,
  decision: ProposalDecisionInput,
): string | readonly string[] | null {
  if (decision.decision === 'REJECTED') {
    return null;
  }

  if (decision.decision === 'ACCEPTED') {
    return proposal.value;
  }

  if (decision.value === undefined) {
    throw new AppError(
      'VALIDATION_FAILED',
      `value is required to edit proposal ${proposal.id}.`,
      { proposalId: proposal.id },
    );
  }

  return normalizeField(
    proposal.field,
    decision.value,
  ) as string | string[];
}

