import { AppError } from '../../../shared/index.js';
import type {
  CatalogProduct,
  CatalogVersion,
  ProductState,
} from '../domain/catalog-product.js';
import type {
  PublishedCatalogProduct,
  PublishedCatalogSearchQuery,
  PublishedCatalogSearchResult,
} from '../domain/catalog-published.js';
import { PUBLISHED_PAGE_SIZE_MAX } from '../domain/catalog-published.js';
import { assertValidTransition } from '../domain/catalog-state.js';
import {
  ApproveStateError,
  AuthorizedOperationRequiredError,
  EditStateError,
  PublishFieldsError,
  PublishStateError,
  assertApprovableState,
  assertAssignableState,
  assertEditable,
  assertPublishableFields,
  assertPublishableState,
} from '../domain/catalog-publish.js';
import {
  CatalogPublishConflictError,
} from './catalog-repository.js';
import type {
  CatalogRepository,
  CreateCatalogDraftInput,
  CreateCatalogDraftResult,
  PublishCatalogResult,
} from './catalog-repository.js';

export type { CreateCatalogDraftResult, PublishCatalogResult };

export type UpdateCatalogProductResult = {
  product: CatalogProduct;
};

/**
 * The outcome of approving a product.
 *
 * `changed` is false when the product was already APPROVED. Approval
 * establishes a state rather than creating a record, so a retry has
 * nothing new to write and converges on the state the first approval
 * established instead of being reported as an error.
 */
export type ApproveCatalogProductResult = {
  product: CatalogProduct;
  changed: boolean;
};

/**
 * The editable half of a product, as a caller supplies it: the fields to
 * write, without the identity they are written against. The identity is
 * a separate argument so it cannot be spoofed by the request body.
 */
export type CatalogProductEdit = {
  title?: string;
  description?: string;
  category?: string;
  materials?: readonly string[];
};

/**
 * Rejects an edit that carries no change. Silently succeeding would let
 * a client believe a correction was saved when nothing was written, which
 * is the sort of quiet divergence the offline sync contract exists to
 * prevent.
 */
function assertNonEmptyEdit(
  input: CatalogProductEdit,
): void {
  const provided = [
    input.title,
    input.description,
    input.category,
    input.materials,
  ].filter((value) => value !== undefined);

  if (provided.length === 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      'At least one product field is required.',
    );
  }
}

/**
 * A provided value replaces the stored one. An empty or whitespace-only
 * string is refused rather than stored, because it would either block a
 * later publish with a confusing error or be published as a blank field.
 */
function assertEditableValues(
  input: CatalogProductEdit,
): void {
  const text: Array<[string, string | undefined]> = [
    ['title', input.title],
    ['description', input.description],
    ['category', input.category],
  ];

  for (const [field, value] of text) {
    if (value !== undefined && !value.trim()) {
      throw new AppError(
        'VALIDATION_FAILED',
        `${field} must not be blank.`,
        { field },
      );
    }
  }

  if (input.materials !== undefined) {
    if (
      !Array.isArray(input.materials) ||
      input.materials.some(
        (material) =>
          typeof material !== 'string' ||
          !material.trim(),
      )
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        'materials must be a list of non-blank strings.',
        { field: 'materials' },
      );
    }
  }
}

export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  async createDraft(
    input: CreateCatalogDraftInput,
  ): Promise<CreateCatalogDraftResult> {
    if (input.idempotencyKey?.trim()) {
      const existing =
        await this.repository.findByIdempotencyKey(
          input.ownerId,
          input.idempotencyKey,
        );

      if (existing) {
        return {
          product: existing,
          created: false,
        };
      }
    }

    return this.repository.createDraft(input);
  }

  /**
   * An unscoped read of a product record.
   *
   * This is deliberately not the artisan-facing read: it is the lookup the
   * module's own ownership checks, the review surface, and the AI pipeline
   * use after they have established authorization for the product. An HTTP
   * handler must not call it with an id the client supplied, because that
   * would expose one artisan's draft to another; use
   * `getOwnedById` at the boundary.
   */
  async getById(id: string): Promise<CatalogProduct> {
    const product = await this.repository.getById(id);

    if (!product) {
      throw new AppError(
        'NOT_FOUND',
        'Catalog product was not found.',
        { id },
      );
    }

    return product;
  }

  /**
   * The product as its owning artisan sees it.
   *
   * Drafts are private working state, not catalog data: only their owner
   * may read them before publication. Ownership is derived from the stored
   * record, so a caller cannot widen the read by asserting anything in the
   * request.
   */
  async getOwnedById(
    id: string,
    actorId: string,
  ): Promise<CatalogProduct> {
    return this.requireOwnedProduct(id, actorId);
  }

  /**
   * Loads a product and refuses it unless the authenticated actor owns
   * it.
   *
   * Authentication happened at the boundary; this is the catalog
   * module's own authorization decision. It is derived from the stored
   * record and never from anything the client asserted, so a client
   * cannot move, edit, or publish a product belonging to another artisan.
   */
  private async requireOwnedProduct(
    id: string,
    actorId: string,
  ): Promise<CatalogProduct> {
    const product = await this.getById(id);

    if (product.ownerId !== actorId) {
      throw new AppError(
        'FORBIDDEN',
        'The product belongs to another artisan.',
        { id },
      );
    }

    return product;
  }

  /**
   * Applies a generic state transition.
   *
   * `APPROVED` and `PUBLISHED` are refused. Both are the outcome of a named
   * operation that checks preconditions and records who authorized them,
   * and ADR-002 reserves them for authorized business workflows. Allowing
   * them here would make the precondition `publish` relies on — that the
   * product is APPROVED — mean nothing, because a client could reach it
   * with a body containing one word. The pure state machine in
   * `catalog-state.ts` still records that the edges exist; this is the
   * application deciding that the edges are not a shortcut.
   */
  async transition(
    id: string,
    nextState: ProductState,
    actorId: string,
  ): Promise<CatalogProduct> {
    const product = await this.requireOwnedProduct(
      id,
      actorId,
    );

    try {
      assertAssignableState(nextState);
      assertValidTransition(product.state, nextState);
    } catch (error) {
      if (
        error instanceof AuthorizedOperationRequiredError
      ) {
        throw new AppError(
          'CONFLICT',
          error.message,
          { id, to: nextState },
        );
      }

      throw new AppError(
        'CONFLICT',
        `Invalid catalog state transition: ${product.state} -> ${nextState}`,
        {
          id,
          from: product.state,
          to: nextState,
        },
      );
    }

    /**
     * Compare-and-set: the repository must atomically verify that the
     * product is still in the state we validated against. If a concurrent
     * caller has moved the product since the read above, the update
     * targets no matching row and the lost race is reported as a conflict
     * instead of silently overwriting the concurrent transition.
     */
    return this.repository.transitionState(
      id,
      nextState,
      product.state,
    );
  }

  /**
   * Approves a product for publication.
   *
   * The state precondition belongs to the Catalog module because the state
   * belongs to the Catalog module. The condition that makes this an
   * authorized operation rather than a state assignment lives one level up:
   * the caller is the review workflow, which refuses to call this while a
   * valid AI proposal for the product is still undecided. Catalog cannot
   * enforce that itself without depending on AI, and depending on AI would
   * make an AI outage block manual product creation — the opposite of what
   * ADR-002 requires.
   *
   * The write is a compare-and-set against the state that was validated,
   * so a product that moved underneath the approval is reported as a
   * conflict rather than approved from a state nobody reviewed.
   */
  async approve(
    id: string,
    actorId: string,
  ): Promise<ApproveCatalogProductResult> {
    const product = await this.requireOwnedProduct(
      id,
      actorId,
    );

    /**
     * A repeat approval is not a transition. `APPROVED -> APPROVED` is
     * not an edge the state machine has, so treating it as one would turn
     * a retried request into a conflict against the state the first
     * approval legitimately established.
     */
    if (product.state === 'APPROVED') {
      return { product, changed: false };
    }

    try {
      assertApprovableState(product.state);
    } catch (error) {
      if (error instanceof ApproveStateError) {
        throw toApproveStateError(product.state);
      }

      throw error;
    }

    return {
      product: await this.repository.transitionState(
        id,
        'APPROVED',
        product.state,
      ),
      changed: true,
    };
  }

  /**
   * Applies a partial edit to a product the actor owns.
   *
   * The write is a field-level assignment, not a whole-row replace, so
   * two concurrent edits to different fields both survive and the
   * documented conflict policy for title/description (newest confirmed
   * edit wins) applies per field rather than per record.
   */
  async update(
    id: string,
    actorId: string,
    input: CatalogProductEdit,
  ): Promise<CatalogProduct> {
    assertNonEmptyEdit(input);
    assertEditableValues(input);

    const product = await this.requireOwnedProduct(
      id,
      actorId,
    );

    try {
      assertEditable(product.state);
    } catch (error) {
      if (error instanceof EditStateError) {
        throw toEditStateError(product.state);
      }

      throw error;
    }

    return this.repository.updateFields({
      id,
      ...(input.title !== undefined
        ? { title: input.title }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.category !== undefined
        ? { category: input.category }
        : {}),
      ...(input.materials !== undefined
        ? { materials: input.materials }
        : {}),
    });
  }

  /**
   * Publishes a product and records the immutable catalog version that
   * buyers become able to see.
   *
   * Publication is an explicit operation rather than a state assignment
   * because it does three things a plain transition must not: check the
   * preconditions, allocate the next catalog version, and record who
   * authorized the change. It is idempotent, so a retry from an offline
   * client that never saw the first response converges on the version
   * that publish already created instead of creating a second one.
   */
  async publish(
    id: string,
    actorId: string,
    idempotencyKey: string,
  ): Promise<PublishCatalogResult> {
    if (!idempotencyKey?.trim()) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Idempotency-Key is required to publish a product.',
      );
    }

    const product = await this.requireOwnedProduct(
      id,
      actorId,
    );

    /**
     * The replay check runs before the preconditions. A retry arrives
     * after the first publish already moved the product to PUBLISHED, so
     * checking state first would report the successful publish as an
     * invalid transition.
     */
    const replayed =
      await this.repository.findVersionByIdempotencyKey(
        id,
        idempotencyKey,
      );

    if (replayed) {
      return {
        product: await this.getById(id),
        version: replayed,
        created: false,
      };
    }

    try {
      assertPublishableState(product.state);
    } catch (error) {
      if (error instanceof PublishStateError) {
        throw new AppError(
          'CONFLICT',
          error.message,
          { id, state: product.state },
        );
      }

      throw error;
    }

    try {
      assertPublishableFields(product);
    } catch (error) {
      if (error instanceof PublishFieldsError) {
        throw new AppError(
          'VALIDATION_FAILED',
          error.message,
          { id, missingFields: error.missingFields },
        );
      }

      throw error;
    }

    try {
      return await this.repository.publish({
        id,
        expectedState: product.state,
        publishedBy: actorId,
        idempotencyKey,
      });
    } catch (error) {
      /**
       * Only a lost compare-and-set is recoverable here. Anything else
       * is an infrastructure failure and must surface as one rather than
       * being reported to the client as a business conflict.
       */
      if (
        !(error instanceof CatalogPublishConflictError)
      ) {
        throw error;
      }

      const settled =
        await this.repository.findVersionByIdempotencyKey(
          id,
          idempotencyKey,
        );

      if (settled) {
        return {
          product: await this.getById(id),
          version: settled,
          created: false,
        };
      }

      const current = await this.getById(id);

      throw new AppError(
        'CONFLICT',
        `Product cannot be published from state ${current.state}.`,
        { id, state: current.state },
      );
    }
  }

  /**
   * The publish history of a product the actor owns, newest first.
   */
  async listVersions(
    id: string,
    actorId: string,
  ): Promise<readonly CatalogVersion[]> {
    await this.requireOwnedProduct(id, actorId);

    return this.repository.listVersions(id);
  }

  /**
   * The published listing a buyer sees for a product, or null when the
   * product is not buyer-visible.
   *
   * There is no actor here, and that is deliberate: reading published
   * catalog data is not a permission decision, so this cannot be made to
   * depend on an identity the caller supplies. What decides visibility is
   * the stored record — the product's published version and whether it has
   * been archived — so a caller cannot widen the result by asserting
   * anything.
   *
   * `null` covers both "no such product" and "not published", and callers
   * are expected to report them identically. Distinguishing them would turn
   * this read into an oracle for unpublished product ids.
   */
  async getPublishedProduct(
    productId: string,
  ): Promise<PublishedCatalogProduct | null> {
    return this.repository.getPublishedSnapshot(
      productId,
    );
  }

  /**
   * A bounded page of buyer-visible listings.
   *
   * The page size is capped here as well as at the boundary. The boundary
   * is the right place to report a too-large request to a client; this is
   * the right place to make sure a caller that skipped the boundary cannot
   * ask the database to serialize the whole catalog.
   */
  async searchPublishedProducts(
    query: PublishedCatalogSearchQuery,
  ): Promise<PublishedCatalogSearchResult> {
    return this.repository.searchPublishedSnapshots({
      ...query,
      limit: Math.min(
        query.limit,
        PUBLISHED_PAGE_SIZE_MAX,
      ),
    });
  }
}

function toEditStateError(state: ProductState): AppError {
  return new AppError(
    'CONFLICT',
    state === 'PUBLISHED'
      ? 'A published product must return to REVIEW_REQUIRED before it can be edited. Publishing the change creates a new catalog version.'
      : 'An archived product cannot be edited.',
    { state },
  );
}

/**
 * Each unapprovable state produces the message that tells the artisan what
 * to do about it, because "cannot be approved from LOCAL_DRAFT" is a dead
 * end and "finish syncing this draft first" is not.
 */
function toApproveStateError(state: ProductState): AppError {
  const message =
    state === 'PUBLISHED'
      ? 'A published product is already buyer-visible. Return it to REVIEW_REQUIRED to change it; publishing the change creates a new catalog version.'
      : state === 'ARCHIVED'
        ? 'An archived product cannot be approved.'
        : 'This product has not finished synchronizing, so it cannot be approved for publication yet.';

  return new AppError('CONFLICT', message, { state });
}
