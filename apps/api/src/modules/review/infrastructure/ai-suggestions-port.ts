import type {
  AiJob,
  AiProposal,
  ReviewSuggestion,
} from '@artisan-marketplace/contracts';
import { AppError } from '../../../shared/errors/app-error.js';
import type { AiRepository } from '../../ai/application/ai-repository.js';
import { isProposalStale } from '../../ai/domain/ai-proposal-staleness.js';
import type {
  ReviewProductSnapshot,
  ReviewSuggestionsPort,
} from '../application/review-port.js';

/**
 * Projects undecided AI proposals into the review surface's shape.
 *
 * Two module boundaries are respected here and neither is incidental.
 *
 * The AI module owns proposals, their provenance, and the job input
 * snapshot that staleness is measured against, so this adapter reads
 * through the AI repository rather than through a table. The Review module
 * owns the canonical product and pairs each suggestion with the value it
 * would replace, so the product is passed in by the caller rather than read
 * here — this port is deliberately not given a route to read one.
 *
 * The result carries no decision, no confidence threshold, and no write of
 * any kind. A caller can see a proposal and can name it as a blocker, and
 * cannot make it canonical from here. That is the ADR-002 boundary
 * expressed as a type rather than as a convention.
 */
export class AiRepositoryReviewSuggestionsPort
  implements ReviewSuggestionsPort
{
  constructor(
    private readonly repository: AiRepository,
  ) {}

  async listUndecided(
    productId: string,
    product: ReviewProductSnapshot,
  ): Promise<readonly ReviewSuggestion[]> {
    const proposals =
      await this.repository.listUndecidedProposals(
        productId,
      );

    if (proposals.length === 0) {
      return [];
    }

    /**
     * Staleness is measured per proposal against the snapshot its own job
     * captured, so a product that was run twice has two different
     * baselines and one lookup each. The jobs are memoized per call because
     * a product's four proposals normally share one job, and repeated reads
     * of the same row would otherwise be four round trips for one fact.
     */
    const jobs = new Map<string, AiJob | null>();

    return Promise.all(
      proposals.map(
        (proposal) =>
          toSuggestion(
            proposal,
            product,
            async (jobId) => {
              if (!jobs.has(jobId)) {
                jobs.set(
                  jobId,
                  await this.repository.getJob(jobId),
                );
              }

              return jobs.get(jobId) ?? null;
            },
          ),
      ),
    );
  }
}

type JobLookup = (
  jobId: string,
) => Promise<AiJob | null>;

/**
 * One suggestion, with the provenance ADR-002 requires a value to be
 * explainable by.
 *
 * The staleness baseline needs the job the proposal came from, and a
 * proposal whose job has vanished would otherwise silently report as
 * current. The AI tables forbid deleting a job that has proposals, so that
 * state is unreachable; it is still reported rather than defaulted, because
 * a suggestion whose provenance cannot be established is not a suggestion
 * an artisan should be asked to decide on silently.
 */
async function toSuggestion(
  proposal: AiProposal,
  product: ReviewProductSnapshot,
  lookupJob: JobLookup,
): Promise<ReviewSuggestion> {
  const job = await lookupJob(proposal.jobId);

  if (!job) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'An AI suggestion could not be traced back to the job that produced it. The review surface cannot be trusted until this is resolved.',
      { proposalId: proposal.id, jobId: proposal.jobId },
    );
  }

  return {
    proposalId: proposal.id,
    jobId: proposal.jobId,
    attempt: proposal.attempt,
    field: proposal.field,
    proposedValue: proposal.value,
    currentValue: null,
    confidence: proposal.confidence,
    riskLevel: proposal.riskLevel,
    riskReasons: [...proposal.riskReasons],
    stale: isProposalStale(job, proposal, product),
    provider: proposal.provider,
    model: proposal.model,
    modelVersion: proposal.modelVersion,
    promptVersion: proposal.promptVersion,
    schemaVersion: proposal.schemaVersion,
    pipelineVersion: proposal.pipelineVersion,
  };
}
