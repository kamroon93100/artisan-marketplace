import type {
  CatalogProductResponse,
} from '../catalog/catalog.js';
import type {
  AiProposalField,
  AiRiskLevel,
  AiRiskReason,
} from '../ai/ai.js';

/**
 * Why a product cannot be approved for publication yet.
 *
 * These are reported, never enforced silently: the artisan is told the
 * specific thing standing between the current state and a published
 * listing. `confidence` is deliberately absent — ADR-002 states confidence
 * is routing information and not approval, so there is no confidence
 * threshold that could resolve one of these reasons.
 */
export const REVIEW_BLOCKING_REASONS = [
  /**
   * A publish-required field is blank. A buyer cannot use a listing with
   * no title or no description, so publication would be meaningless.
   */
  'MISSING_PUBLISH_FIELD',
  /**
   * A valid AI proposal for this product has no human decision yet. This
   * is the review condition itself: until every suggestion has been
   * accepted, edited, or rejected, nobody has looked at what the model
   * proposed.
   */
  'UNDECIDED_PROPOSAL',
  /**
   * The product is in a state it cannot be approved from — a draft that
   * has not finished synchronizing, an archived product, or a product
   * already published (which must return to review before it can change).
   */
  'PRODUCT_NOT_APPROVABLE',
] as const;

export type ReviewBlockingReason =
  (typeof REVIEW_BLOCKING_REASONS)[number];

export type ReviewBlocking = {
  reason: ReviewBlockingReason;
  /**
   * The field the reason is about. Present for `MISSING_PUBLISH_FIELD`
   * and `UNDECIDED_PROPOSAL`; absent for `PRODUCT_NOT_APPROVABLE`, which
   * is a property of the product as a whole.
   */
  field?: AiProposalField;
  /**
   * A human-safe explanation. This is what a client shows, so it is
   * written for an artisan rather than for a log reader.
   */
  message: string;
};

/**
 * One undecided AI suggestion, as a review surface presents it.
 *
 * This is deliberately not an `AiProposal`. ADR-009 forbids letting a
 * storage or module shape become the public contract, and a review surface
 * needs something an `AiProposal` does not carry: the canonical value this
 * suggestion would replace, and whether the input it was generated from is
 * still current. The proposal id is included so the decision API can be
 * called with it.
 */
export type ReviewSuggestion = {
  proposalId: string;
  jobId: string;
  /**
   * The attempt that produced this suggestion. A retry writes a new
   * attempt, so the artisan is reviewing the latest one and older attempts
   * stay available through the audit endpoint.
   */
  attempt: number;
  field: AiProposalField;
  /**
   * What the model proposed, normalized.
   */
  proposedValue: string | readonly string[];
  /**
   * The canonical value that would be replaced, or null when the field is
   * currently empty. Shown beside the proposal so "accept" is a decision
   * about a real change rather than a blind write.
   */
  currentValue: string | readonly string[] | null;
  confidence: number | null;
  riskLevel: AiRiskLevel;
  riskReasons: readonly AiRiskReason[];
  /**
   * True when the product's value for this field has changed since the job
   * captured its input, so the suggestion rests on input that no longer
   * holds. Reported rather than hidden: the documented conflict policy is
   * that the newest confirmed edit wins, and the artisan decides.
   */
  stale: boolean;
  provider: string;
  model: string;
  modelVersion: string | null;
  promptVersion: string;
  schemaVersion: string;
  pipelineVersion: string;
};

/**
 * The artisan's review surface for one product.
 *
 * `blocking` and `readyForApproval` are both present so a client never has
 * to re-derive the rule: it renders the list and enables the button.
 */
export type GetProductReviewResponse = {
  product: CatalogProductResponse;
  suggestions: readonly ReviewSuggestion[];
  blocking: readonly ReviewBlocking[];
  readyForApproval: boolean;
};

/**
 * The result of approving a product for publication.
 *
 * `deduplicated` distinguishes a first approval from a repeat of the same
 * one. Approval is a state transition rather than a new record, so a retry
 * converges on the state it already established instead of failing.
 */
export type ApproveProductReviewResponse = {
  product: CatalogProductResponse;
  deduplicated: boolean;
};
