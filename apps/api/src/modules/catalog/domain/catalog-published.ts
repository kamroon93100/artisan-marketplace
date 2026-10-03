import type { CatalogVersion, ProductState } from './catalog-product.js';

/**
 * The buyer-visible read model of the catalog.
 *
 * This is a projection of one immutable `catalog_versions` row, and it is
 * the *only* shape the catalog hands to a buyer-facing reader. It is
 * narrower than `CatalogVersion` on purpose. `versionId` and `publishedBy`
 * are audit facts about the publish operation; `CatalogProduct` carries the
 * working draft. A buyer-facing read model built from either of those would
 * leak a field that a draft edit, a later AI proposal, or a second artisan
 * session could change after the buyer had already seen the listing.
 *
 * A change to a published product produces a *new* version rather than
 * editing this one, so a value read through this projection is stable until
 * the product is published again.
 */
export type PublishedCatalogProduct = {
  productId: string;
  versionNumber: number;
  title: string;
  description: string;
  category: string | null;
  materials: readonly string[];
  publishedAt: string;
};

/**
 * A bounded query against the buyer-visible catalog.
 *
 * `search` is expected to be already normalized by the caller's own rules
 * (trimmed, lowercased, bounded in length); the catalog applies the same
 * normalization again when it builds its match, so a caller that reaches it
 * by a different path still gets one defined behaviour rather than two.
 */
export type PublishedCatalogSearchQuery = {
  search?: string;
  limit: number;
  offset: number;
};

/**
 * One page of buyer-visible listings plus the untruncated total.
 *
 * The total is counted separately from the page rather than derived from the
 * page length, because an offset past the end of the result set returns no
 * rows and a client that inferred "no more results" from an empty page
 * would be wrong about a catalog that has thousands of listings.
 */
export type PublishedCatalogSearchResult = {
  items: readonly PublishedCatalogProduct[];
  total: number;
};

/**
 * Ceiling on the page size the published read accepts.
 *
 * The catalog applies this itself rather than relying on every caller to
 * have bounded the value, because an unbounded `limit` against the published
 * catalog is a request to serialize the whole catalog to one caller.
 */
export const PUBLISHED_PAGE_SIZE_MAX = 50;

/**
 * The working states in which a product stops being buyer-visible.
 *
 * `ARCHIVED` is the explicit delisting operation, and it is the *only*
 * state that hides a product that has been published. Everything else is a
 * working state that says something about what the artisan is doing, not
 * about whether the listing buyers were already shown has been withdrawn:
 *
 * - a never-published product is invisible because it has no version row at
 *   all, not because of its state;
 * - a product that has been published and then returned to
 *   `REVIEW_REQUIRED` for a correction is still showing the version buyers
 *   were shown. Hiding it the moment the artisan starts editing would make
 *   an artisan-side workflow step silently delist a live listing, and the
 *   published version is exactly the record that must not be rewritten
 *   underneath them.
 *
 * The withdrawal of a live listing is therefore an explicit act —
 * `ARCHIVED` — rather than a side effect of entering a working state.
 */
export const PUBLISHED_READ_HIDDEN_STATES: readonly ProductState[] =
  ['ARCHIVED'];

/**
 * Whether a product is currently buyer-visible.
 *
 * The single named rule for that decision. Every read path that answers
 * "can a buyer see this?" resolves through here, so the rule is stated once
 * and cannot be one thing in the service and another thing in the query.
 *
 * Visibility is the *existence of a published version* that has not been
 * archived. It is not the product's current state, because the current
 * state is the artisan's working state and the buyer is reading a
 * published snapshot.
 */
export function isPublishedReadVisible(product: {
  publishedVersion: number | null;
  state: ProductState;
}): boolean {
  if (product.publishedVersion === null) {
    return false;
  }

  return !PUBLISHED_READ_HIDDEN_STATES.includes(
    product.state,
  );
}

/**
 * The text a published listing is searched against.
 *
 * Deliberately title, description, and category only. `materials` is
 * excluded because joining an array is not an immutable SQL expression and
 * therefore cannot take part in the index that makes the search
 * deterministic at a usable cost; including it would mean an unindexed
 * search. It is returned in the listing, so a client can still display it,
 * and its absence from the search surface is a recorded limitation rather
 * than an accident.
 *
 * Normalized to lower case here so that the case-insensitivity of the
 * search is defined once, in one function, rather than as a `lower()` call
 * repeated in a query string.
 */
export function publishedSearchText(
  product: PublishedCatalogProduct,
): string {
  return [
    product.title,
    product.description,
    product.category ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * The order buyer-visible listings are returned in.
 *
 * Newest publication first, with the product id as a tie-breaker so the
 * order is *total*. A total order is what makes offset pagination
 * deterministic: without it, two listings published in the same
 * millisecond can swap places between two requests, and a page boundary
 * then silently drops one and repeats another.
 */
export function comparePublishedProducts(
  left: PublishedCatalogProduct,
  right: PublishedCatalogProduct,
): number {
  if (left.publishedAt !== right.publishedAt) {
    return left.publishedAt < right.publishedAt
      ? 1
      : -1;
  }

  if (left.productId === right.productId) {
    return 0;
  }

  return left.productId < right.productId ? -1 : 1;
}

/**
 * Projects an immutable version row into the buyer-visible shape.
 *
 * The projection is explicit rather than a spread, so adding a field to
 * `CatalogVersion` cannot accidentally make it buyer-visible: the new field
 * has to be named here, in the one file whose whole purpose is deciding
 * what a buyer may read.
 */
export function toPublishedProduct(
  version: CatalogVersion,
): PublishedCatalogProduct {
  return {
    productId: version.productId,
    versionNumber: version.versionNumber,
    title: version.title,
    description: version.description,
    category: version.category,
    materials: [...version.materials],
    publishedAt: version.publishedAt,
  };
}
