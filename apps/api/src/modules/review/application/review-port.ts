import type { ReviewSuggestion } from '@artisan-marketplace/contracts';
import type {
  ReviewProductSnapshot,
} from '../domain/review-readiness.js';

export type { ReviewProductSnapshot };

/**
 * The review module's route to the Catalog module.
 *
 * Two methods, and the split is deliberate. `readProduct` takes no actor
 * and therefore cannot authorize anything, so reading a product to report
 * on is not a permission decision — the caller has already established
 * ownership through the review path's own checks. `approve` takes the
 * actor, and the Catalog module applies its own ownership and state rules,
 * which is where authorization belongs. The Review module therefore cannot
 * skip a rule the Catalog module enforces, because the write only exists
 * through it.
 *
 * Catalog cannot depend on AI in the other direction: the rule that
 * approval requires an empty review queue is only knowable with AI's
 * proposals, and making publication wait on an AI read would let an AI
 * outage block manual product creation. ADR-002 requires the opposite.
 */
export interface ReviewProductPort {
  readProduct(
    productId: string,
  ): Promise<ReviewProductSnapshot | null>;
  /**
   * Approves a product the actor owns. The Catalog module enforces the
   * state precondition and the compare-and-set; the caller is responsible
   * for the review condition, which is what this module owns.
   *
   * `changed` is false when the product was already approved. Approval
   * establishes a state rather than creating a record, so a retry has
   * nothing new to write and converges on the state the first approval
   * established.
   */
  approve(
    productId: string,
    actorId: string,
  ): Promise<{
    product: ReviewProductSnapshot;
    changed: boolean;
  }>;
}

/**
 * The review module's route to undecided AI suggestions.
 *
 * It carries no write operation. Suggestions reach a product only through
 * the AI module's decision API, and this port exists so a review surface
 * can *read* what is outstanding without acquiring any authority to apply
 * it. That is the structural form of the ADR-002 rule at this boundary:
 * the Review module can see a proposal and can name it as a blocker, and
 * cannot make it canonical.
 */
export interface ReviewSuggestionsPort {
  /**
   * Every proposal for a product that is still awaiting a human decision
   * and passed validation, across all of the product's jobs and attempts.
   *
   * Across attempts, not only the newest. Two jobs may both propose a title,
   * and each is a decision the artisan has to make before the product is
   * approved; collapsing them to the newest would leave the older one
   * permanently blocking with no way to act on it. A proposal the pipeline
   * already rejected is excluded because it carries no suggestion and cannot
   * be applied, so it is not an outstanding decision.
   *
   * The product snapshot is passed in because staleness is measured against
   * the product's current values, and the AI module owns both the job input
   * snapshot and the definition of that comparison.
   */
  listUndecided(
    productId: string,
    product: ReviewProductSnapshot,
  ): Promise<readonly ReviewSuggestion[]>;
}
