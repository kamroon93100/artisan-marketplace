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

export type ProductState = typeof PRODUCT_STATES[number];

export type CreateCatalogProductRequest = {
  title?: string;
  description?: string;
  category?: string;
  materials?: readonly string[];
};

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
  /**
   * The catalog version buyers currently see, or null before the first
   * publish. This is a published-history pointer and is deliberately not
   * the product's optimistic-concurrency counter, which is internal and
   * is not part of the product contract.
   */
  publishedVersion: number | null;
};

/**
 * One immutable published snapshot of a product.
 *
 * A version is a historical fact about what was published, so it is
 * never updated in place. A change to an already published product
 * produces a new version rather than mutating an existing one.
 */
export type CatalogVersionResponse = {
  id: string;
  productId: string;
  versionNumber: number;
  title: string;
  description: string;
  category: string | null;
  materials: readonly string[];
  publishedAt: string;
  publishedBy: string;
};

export type CreateCatalogProductResponse = {
  product: CatalogProductResponse;
};

export type GetCatalogProductResponse = {
  product: CatalogProductResponse;
};

export type TransitionCatalogProductRequest = {
  state: ProductState;
};

export type TransitionCatalogProductResponse = {
  product: CatalogProductResponse;
};

/**
 * Partial product edit. Only the supplied fields are written, so two
 * concurrent edits to different fields do not overwrite each other, and
 * a repeated delivery of the same edit converges on the same values.
 */
export type UpdateCatalogProductRequest = {
  title?: string;
  description?: string;
  category?: string;
  materials?: readonly string[];
};

export type UpdateCatalogProductResponse = {
  product: CatalogProductResponse;
};

/**
 * Publication is an explicit operation, not a state assignment: it
 * checks the preconditions, allocates the next immutable catalog
 * version, and records who authorized it. The request is idempotent
 * under the `Idempotency-Key` header.
 */
export type PublishCatalogProductResponse = {
  product: CatalogProductResponse;
  version: CatalogVersionResponse;
  deduplicated: boolean;
};

export type ListCatalogVersionsResponse = {
  versions: readonly CatalogVersionResponse[];
};
