import type {
  ApproveProductReviewResponse,
  GetProductReviewResponse,
  ReviewSuggestion,
} from '@artisan-marketplace/contracts';
import { AppError } from '../../../shared/errors/app-error.js';
import {
  currentValueFor,
  evaluateApprovalReadiness,
} from '../domain/review-readiness.js';
import type {
  ReviewProductSnapshot,
} from '../domain/review-readiness.js';
import type {
  ReviewProductPort,
  ReviewSuggestionsPort,
} from './review-port.js';

export type {
  GetProductReviewResponse,
  ApproveProductReviewResponse,
};

export type ApproveProductReviewResult = {
  product: ReviewProductSnapshot;
  deduplicated: boolean;
};

/**
 * The artisan's path from AI suggestions to a product cleared for
 * publication.
 *
 * This service owns exactly one thing: the rule that a product may be
 * approved only when nothing is outstanding in its review. It holds no
 * proposal store and no product store, so it cannot write either. Reading
 * a suggestion and naming it as a blocker is the whole of its authority
 * over AI output, which is the shape ADR-002 requires at this boundary.
 *
 * Applying a suggestion is deliberately not here: that is the AI module's
 * decision API, the only place an AI-derived value may reach a product, and
 * it is a separate explicit act from approving the product afterwards.
 * An artisan who accepts a suggestion and an artisan who approves the
 * product are two decisions, and conflating them would let one stand in
 * for the other.
 */
export class ReviewService {
  constructor(
    private readonly catalog: ReviewProductPort,
    private readonly suggestions: ReviewSuggestionsPort,
  ) {}

  /**
   * Everything an artisan needs to decide, in one read.
   *
   * The canonical values, the outstanding suggestions, and the list of what
   * blocks approval are returned together, so a client renders the screen
   * and enables the approve button from this response rather than
   * re-deriving the rule and possibly re-deriving it differently.
   */
  async getReview(
    productId: string,
    actorId: string,
  ): Promise<GetProductReviewResponse> {
    const product = await this.requireOwnedProduct(
      productId,
      actorId,
    );

    const suggestions =
      await this.suggestions.listUndecided(
        productId,
        product,
      );

    const readiness = evaluateApprovalReadiness(
      product,
      suggestions,
    );

    return {
      product,
      suggestions: suggestions.map((suggestion) =>
        withCurrentValue(suggestion, product),
      ),
      blocking: readiness.blocking,
      readyForApproval: readiness.readyForApproval,
    };
  }

  /**
   * Approves a product for publication, or refuses and says why.
   *
   * The readiness check runs immediately before the write, against a fresh
   * read of the product and a fresh read of the outstanding suggestions.
   * That ordering is what makes the refusal honest in the common case: a
   * client that read the review surface a moment ago cannot be told about a
   * blocker that has since stopped existing, and a client that read it
   * before a suggestion was created is refused rather than approving past
   * a suggestion nobody has looked at.
   *
   * KNOWN GAP, not covered by this method: the two reads and the write are
   * not one atomic step, so a proposal that is written in the window
   * between the suggestion read and the Catalog compare-and-set would not
   * be seen here. The Catalog compare-and-set does not close it, because it
   * matches on the product's state and knows nothing about AI.
   *
   * Closing it properly needs a single atomic guard spanning the product's
   * state and `ai_proposals` — a conditional insert in the AI path plus a
   * `NOT EXISTS` guard in the approval statement, or a shared
   * product-scoped lock. Either one makes one module's SQL read the other's
   * tables or share its lock discipline, which is a change to the
   * module-boundary contract and therefore not taken unilaterally here.
   * Recorded in `docs/agent/m5-review-publish-task.md`.
   *
   * What is true today, and bounds the gap: the AI module refuses to
   * *enqueue* work for a product outside its working states, and `APPROVED`
   * is deliberately not one of them, so a job created after this approval
   * cannot exist and the only remaining interleaving is a job enqueued
   * before the approval and still running when it happened. Approval and
   * publication are also separate explicit operations, so an affected
   * product is left `APPROVED` rather than buyer-visible until a second,
   * deliberate publish. The AI module does not currently re-check the
   * product state when it saves proposals, which is the other half of the
   * gap.
   */
  async approve(
    productId: string,
    actorId: string,
  ): Promise<ApproveProductReviewResult> {
    const product = await this.requireOwnedProduct(
      productId,
      actorId,
    );

    const suggestions =
      await this.suggestions.listUndecided(
        productId,
        product,
      );

    const readiness = evaluateApprovalReadiness(
      product,
      suggestions,
    );

    if (readiness.blocking.length > 0) {
      throw new AppError(
        'CONFLICT',
        'This product is not ready to be approved yet.',
        {
          productId,
          blocking: readiness.blocking,
        },
      );
    }

    const result = await this.catalog.approve(
      productId,
      actorId,
    );

    return {
      product: result.product,
      deduplicated: !result.changed,
    };
  }

  /**
   * Loads a product and refuses it unless the authenticated actor owns it.
   *
   * Authentication happened at the HTTP boundary; this is the review
   * module's own authorization decision. It is derived from the stored
   * record and never from anything the client asserted, so a client cannot
   * read or approve another artisan's review surface.
   */
  private async requireOwnedProduct(
    productId: string,
    actorId: string,
  ): Promise<ReviewProductSnapshot> {
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

/**
 * A suggestion paired with the canonical value it would replace.
 *
 * Computed here rather than inside the suggestions port because the
 * canonical product is the Review module's to report on, and the AI
 * module's port is deliberately not given a route to read one. This pairing
 * is what makes "accept" a decision about a visible change rather than a
 * blind write.
 */
function withCurrentValue(
  suggestion: ReviewSuggestion,
  product: ReviewProductSnapshot,
): ReviewSuggestion {
  return {
    ...suggestion,
    currentValue: currentValueFor(product, suggestion.field),
  };
}
