/**
 * The review surface's types, declared here rather than imported from
 * `@artisan-marketplace/contracts`.
 *
 * The mobile app has no dependency on the contracts package — the existing
 * sync contracts are declared the same way — so importing server types is not
 * available and, more importantly, would not be desirable: this client talks
 * to an untrusted boundary and validates every response before use. Importing
 * the server's type would make those checks look redundant and invite
 * removing them. These declarations are the client's contract; the server's
 * are the server's.
 *
 * The values below are copied from the server enums, which makes a mismatch
 * here a runtime failure rather than a compile-time one. There is no test
 * comparing the two sets: `@artisan-marketplace/contracts` is not resolvable
 * from the mobile app or from the repository's test tree, so a comparison
 * would need a dependency edge that does not exist yet. Until that edge
 * exists, the runtime validation below is what stands between a value the
 * server added and a client that silently rejects it — which fails loudly
 * rather than silently, but does so in the field rather than in CI. Copying
 * a new value into a list here is therefore a deliberate act, and the enum on
 * the server is the one to change first.
 */

export const PRODUCT_STATES = [
  'LOCAL_DRAFT',
  'PENDING_SYNC',
  'SYNCED',
  'REVIEW_REQUIRED',
  'APPROVED',
  'PUBLISHED',
  'ARCHIVED',
  'CONFLICT',
  'ACTION_REQUIRED',
] as const;

export type ProductState = (typeof PRODUCT_STATES)[number];

export type CatalogProductResponse = {
  id: string;
  ownerId: string;
  title: string | null;
  description: string | null;
  category: string | null;
  materials: readonly string[];
  state: ProductState;
  createdAt: string;
  updatedAt: string;
  publishedVersion: number | null;
};

export const AI_PROPOSAL_FIELDS = [
  'title',
  'description',
  'category',
  'materials',
] as const;

export type AiProposalField = (typeof AI_PROPOSAL_FIELDS)[number];

export const AI_RISK_LEVELS = ['NONE', 'LOW', 'MEDIUM', 'HIGH'] as const;

export type AiRiskLevel = (typeof AI_RISK_LEVELS)[number];

export const AI_RISK_REASONS = [
  'LOW_CONFIDENCE',
  'MISSING_PUBLISH_BLOCKING_FIELD',
  'SEMANTIC_VALIDATION_REJECTED',
] as const;

export type AiRiskReason = (typeof AI_RISK_REASONS)[number];

export const REVIEW_BLOCKING_REASONS = [
  'MISSING_PUBLISH_FIELD',
  'UNDECIDED_PROPOSAL',
  'PRODUCT_NOT_APPROVABLE',
] as const;

export type ReviewBlockingReason =
  (typeof REVIEW_BLOCKING_REASONS)[number];

/**
 * One undecided AI suggestion, mirroring the server's `ReviewSuggestion`.
 *
 * Every field the server sends is declared and validated, including the
 * provenance versions, even though the current screen renders only some of
 * them. Dropping a field the server sends would mean the client discards data
 * it cannot account for, and the response validator would stop checking the
 * whole contract.
 */
export type ClientReviewSuggestion = {
  proposalId: string;
  jobId: string;
  attempt: number;
  field: AiProposalField;
  proposedValue: string | readonly string[];
  currentValue: string | readonly string[] | null;
  confidence: number | null;
  riskLevel: AiRiskLevel;
  riskReasons: readonly AiRiskReason[];
  stale: boolean;
  provider: string;
  model: string;
  modelVersion: string | null;
  promptVersion: string;
  schemaVersion: string;
  pipelineVersion: string;
};

/**
 * The three decisions an artisan can make about a suggestion.
 *
 * These are the server's `AI_PROPOSAL_DECISIONS` without `PENDING`. The
 * client's copy is deliberate for the same reason the enums above are copied:
 * this client validates an untrusted boundary rather than importing a server
 * type, and a `PENDING` that reached this layer would be a decision nobody
 * made. `PENDING` is a state the server holds, not a thing a client asks for.
 */
export const PROPOSAL_DECISIONS = [
  'ACCEPTED',
  'EDITED',
  'REJECTED',
] as const;

export type ProposalDecision = (typeof PROPOSAL_DECISIONS)[number];

/**
 * One decision, as the decision API requires it.
 *
 * The union is discriminated on purpose. The server refuses a `value` on
 * anything that is not an `EDITED` decision and refuses an `EDITED` decision
 * without one, so a client that could pass a value with an `ACCEPTED` would
 * be able to build a request the API will always reject. The type makes the
 * only two valid shapes constructible.
 *
 * An `EDITED` value is the artisan's own text, never the model's proposal.
 * That is the whole point of an edit, and `docs/architecture/ai-contract.md`
 * states that an artisan-confirmed value is authoritative over an
 * AI-generated one.
 */
export type ClientProposalDecisionInput =
  | { proposalId: string; decision: 'ACCEPTED' }
  | { proposalId: string; decision: 'REJECTED' }
  | {
      proposalId: string;
      decision: 'EDITED';
      value: string | readonly string[];
    };

/**
 * The product as the decision API reports it.
 *
 * A distinct type from `CatalogProductResponse` because this is not one: the
 * decision route returns the product's fields after the write, not the whole
 * catalog projection, and reading it as a full response would fail on every
 * field the route does not send. Every field that *is* sent is validated, so
 * a response the client cannot read still fails closed.
 */
export type ClientDecidedProduct = {
  id: string;
  ownerId: string;
  state: ProductState;
  title: string | null;
  description: string | null;
  category: string | null;
  materials: readonly string[];
};

/**
 * The result of deciding on one suggestion.
 *
 * `applied` is the fields the server wrote, and `staleFields` the ones whose
 * suggestion rested on input the artisan has since changed. Both are read
 * rather than ignored, because they are the only two things the response says
 * about what actually happened; the review surface is re-read afterwards for
 * everything else.
 */
export type ClientProposalDecisionResult = {
  product: ClientDecidedProduct;
  applied: readonly AiProposalField[];
  staleFields: readonly AiProposalField[];
};

/**
 * Why a product cannot be approved yet.
 *
 * `field` is present for `MISSING_PUBLISH_FIELD` and `UNDECIDED_PROPOSAL`
 * and absent for `PRODUCT_NOT_APPROVABLE`, which is a property of the product
 * as a whole.
 */
export type ClientReviewBlocking = {
  reason: ReviewBlockingReason;
  field?: AiProposalField;
  message: string;
};

export type ClientProductReview = {
  product: CatalogProductResponse;
  suggestions: readonly ClientReviewSuggestion[];
  blocking: readonly ClientReviewBlocking[];
  readyForApproval: boolean;
};

export type ClientApproval = {
  product: CatalogProductResponse;
  deduplicated: boolean;
};

export type ReviewTransport = {
  getReview(
    remoteProductId: string,
  ): Promise<ClientProductReview>;
  /**
   * One artisan decision about one suggestion.
   *
   * Keyed by job rather than by product, because the decision route is: a
   * decision belongs to the job that produced the proposal, and the job's
   * product is the authoritative answer, so a client cannot assert which
   * product its own value is written to.
   */
  decideProposal(
    jobId: string,
    decision: ClientProposalDecisionInput,
  ): Promise<ClientProposalDecisionResult>;
  approve(remoteProductId: string): Promise<ClientApproval>;
  publish(
    remoteProductId: string,
    idempotencyKey: string,
  ): Promise<{
    product: CatalogProductResponse;
    versionNumber: number;
  }>;
};

export class ReviewTransportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    /**
     * What stands between this product and approval, when the server said.
     * The screen shows these rather than a generic failure, because "not
     * ready" with no reason is the least useful thing a client can say about
     * a refusal it caused.
     */
    readonly blocking: readonly ClientReviewBlocking[] = [],
  ) {
    super(message);
    this.name = 'ReviewTransportError';
  }
}
