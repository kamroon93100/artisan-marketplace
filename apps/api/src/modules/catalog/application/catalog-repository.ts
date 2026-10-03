import type { ProductState } from '@artisan-marketplace/contracts';
import type {
  CatalogProduct,
  CatalogVersion,
} from '../domain/catalog-product.js';
import type {
  PublishedCatalogProduct,
  PublishedCatalogSearchQuery,
  PublishedCatalogSearchResult,
} from '../domain/catalog-published.js';

export type CreateCatalogDraftInput = {
  ownerId: string;
  title?: string;
  description?: string;
  category?: string;
  materials?: readonly string[];
  idempotencyKey?: string;
};

export type CreateCatalogDraftResult = {
  product: CatalogProduct;
  created: boolean;
};

/**
 * A partial product edit. Only the supplied fields are written, so an
 * edit to one field never clobbers a concurrent edit to another.
 */
export type UpdateCatalogProductInput = {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  materials?: readonly string[];
};

export type PublishCatalogInput = {
  id: string;
  /**
   * The state the caller validated against. Publication is a
   * compare-and-set against it, so a product that moved underneath the
   * caller is not published from a state nobody approved.
   */
  expectedState: ProductState;
  publishedBy: string;
  idempotencyKey: string;
};

export type PublishCatalogResult = {
  product: CatalogProduct;
  version: CatalogVersion;
  created: boolean;
};

/**
 * Signals that a publish's compare-and-set matched no row.
 *
 * This is deliberately distinct from an infrastructure failure. A lost
 * race means a concurrent caller already established the outcome and the
 * caller should converge on it; a database error means nothing is known
 * and must propagate rather than being reported as a business conflict.
 */
export class CatalogPublishConflictError extends Error {
  constructor(
    public readonly productId: string,
  ) {
    super(
      `Catalog publish lost a race for product ${productId}.`,
    );
    this.name = 'CatalogPublishConflictError';
  }
}

export interface CatalogRepository {
  createDraft(
    input: CreateCatalogDraftInput,
  ): Promise<CreateCatalogDraftResult>;
  findByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<CatalogProduct | null>;
  getById(id: string): Promise<CatalogProduct | null>;
  transitionState(
    id: string,
    state: ProductState,
    expectedState: ProductState,
  ): Promise<CatalogProduct>;
  updateFields(
    input: UpdateCatalogProductInput,
  ): Promise<CatalogProduct>;
  publish(
    input: PublishCatalogInput,
  ): Promise<PublishCatalogResult>;
  findVersionByIdempotencyKey(
    productId: string,
    idempotencyKey: string,
  ): Promise<CatalogVersion | null>;
  listVersions(
    productId: string,
  ): Promise<readonly CatalogVersion[]>;
  /**
   * The single published version a buyer currently sees for a product, or
   * null when the product has never been published or has been archived.
   *
   * This is the read that must never fall back to the working draft: a
   * buyer asking "what is this product" is asking what was published, and
   * returning the draft would report values a human has not confirmed as
   * though they were the listing.
   */
  getPublishedSnapshot(
    productId: string,
  ): Promise<PublishedCatalogProduct | null>;
  /**
   * A bounded page of buyer-visible listings, newest publication first.
   *
   * Ordered by a total order (publication time, then product id) so that
   * offset pagination cannot skip or repeat a listing between two pages.
   */
  searchPublishedSnapshots(
    query: PublishedCatalogSearchQuery,
  ): Promise<PublishedCatalogSearchResult>;
}
