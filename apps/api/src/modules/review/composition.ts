import { getCatalogService } from '../catalog/composition.js';
import type { DatabaseBindingEnv } from '../catalog/composition.js';
import { getAiRepository } from '../ai/composition.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ReviewService } from './application/review-service.js';
import { CatalogServiceReviewProductPort } from './infrastructure/catalog-review-port.js';
import { AiRepositoryReviewSuggestionsPort } from './infrastructure/ai-suggestions-port.js';
import type {
  ReviewSuggestionsPort,
} from './application/review-port.js';
import type {
  ReviewSuggestion,
} from '@artisan-marketplace/contracts';

export type ReviewBindingEnv = DatabaseBindingEnv;

/**
 * A suggestions port for an environment with no AI provider configured.
 *
 * It reports no outstanding suggestions, which is the honest answer when no
 * AI work was ever created: there is nothing to decide. This is the
 * difference between "no suggestions" and "cannot tell", and ADR-002
 * requires the review condition not to become a publication outage when AI
 * is unavailable — an AI failure must not prevent manual product creation
 * or correction.
 *
 * What it deliberately does not do is report a blocker, because a product
 * whose artisan filled every field in themselves is approvable whether or
 * not an AI provider happens to be configured.
 */
class NoSuggestionsPort implements ReviewSuggestionsPort {
  async listUndecided(): Promise<
    readonly ReviewSuggestion[]
  > {
    return [];
  }
}

/**
 * Builds the review service.
 *
 * The Review module depends on Catalog and on AI, in that direction, and
 * this is the only place the two are joined. Neither of them knows the
 * other exists: the Catalog module cannot see whether a suggestion is
 * outstanding, and the AI module cannot approve a product. Keeping the
 * wiring here is what makes the review condition — "nothing outstanding" —
 * enforceable without either module taking a dependency it must not have.
 */
export function getReviewService(
  env: ReviewBindingEnv,
): ReviewService {
  return new ReviewService(
    new CatalogServiceReviewProductPort(
      getCatalogService(env),
    ),
    getSuggestionsPort(env),
  );
}

/**
 * The suggestions port for this environment.
 *
 * `getAiRepository` throws in an environment where AI is not configured,
 * which is a refusal rather than a fault. Approval has to keep working in
 * such an environment, so the refusal resolves to "no suggestions" instead
 * of propagating: a product with no AI work has no outstanding suggestion
 * to block it.
 */
function getSuggestionsPort(
  env: ReviewBindingEnv,
): ReviewSuggestionsPort {
  try {
    return new AiRepositoryReviewSuggestionsPort(
      getAiRepository(env),
    );
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      error.code !== 'DEPENDENCY_FAILED'
    ) {
      /**
       * Anything else is a real fault — a missing catalog binding, a bad
       * connection string. Swallowing it would let approval proceed on a
       * review surface that cannot see AI at all, which is precisely the
       * silent corruption the AI contract exists to prevent.
       */
      throw error;
    }

    return new NoSuggestionsPort();
  }
}
