/**
 * Buyer-facing published-catalog discovery.
 *
 * Every type here is a projection of an *immutable published catalog
 * version*, never of a product's working draft. That is the whole point of
 * the surface: `docs/architecture/data-and-rls-contract.md` fixes published
 * catalog data as the read boundary for buyer discovery, and the
 * first-vertical-slice acceptance criterion "published data is distinct
 * from draft data" is only true for a buyer if the buyer-facing DTO has no
 * field that a draft edit could change.
 *
 * There is deliberately no `state`, no `ownerId`, no optimistic-concurrency
 * counter, and no AI-derived value on these types. Each of those is either
 * an internal working-state fact or a value a human has not confirmed, and
 * ADR-002 requires an artisan-confirmed value never to be silently
 * overwritten by later AI output — which a buyer-facing contract has no
 * business carrying in the first place.
 */

/** Default number of results when a client does not ask for a size. */
export const DISCOVERY_PAGE_SIZE_DEFAULT = 20;

/**
 * Hard ceiling on a requested page size.
 *
 * A page size is client-controlled, so it is bounded rather than trusted.
 * This is the public promise; the server enforces the same ceiling
 * independently and refuses a larger request instead of silently clamping
 * it, so a client is never misled about how much it received.
 */
export const DISCOVERY_PAGE_SIZE_MAX = 50;

/**
 * Longest accepted search text, in characters.
 *
 * Bounded so a search string cannot be used to push an unbounded amount of
 * text through the request path or into the database.
 */
export const DISCOVERY_SEARCH_MAX_LENGTH = 120;

/**
 * One buyer-visible published listing.
 *
 * `versionNumber` is included because it is the identity of what the buyer
 * is looking at: a later republish produces a new version, and a client
 * that cached version 1 can tell that it is stale. `publishedAt` is
 * included so a client can order and date what it shows without a second
 * request.
 *
 * What is *not* included is as load-bearing as what is: there is no
 * `versionId`, no `publishedBy`, and no owner identity. Those are audit and
 * authorization facts about the publish operation, not information a buyer
 * needs in order to browse.
 */
export type DiscoveryPublishedProductResponse = {
  productId: string;
  versionNumber: number;
  title: string;
  description: string;
  category: string | null;
  materials: readonly string[];
  publishedAt: string;
};

/**
 * Search parameters.
 *
 * `search` is matched case-insensitively as a substring of the published
 * title, description, and category. `limit` and `offset` bound the page;
 * `offset` rather than a cursor because a total-order snapshot page is
 * sufficient for the first slice, and the pagination-stability limitation
 * that comes with it is recorded rather than hidden.
 */
export type SearchPublishedProductsRequest = {
  search?: string;
  limit?: number;
  offset?: number;
};

/**
 * A bounded page of published listings.
 *
 * `total` is reported alongside the page so a client can tell "no more
 * results" from "this page happened to be empty", and `hasMore` saves it
 * from computing that difference itself.
 */
export type SearchPublishedProductsResponse = {
  products: readonly DiscoveryPublishedProductResponse[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/**
 * A single published listing.
 *
 * A product that is not buyer-visible — never published, or archived — is
 * reported the same way as one that does not exist. Distinguishing them
 * would turn this endpoint into an oracle for unpublished product ids.
 */
export type GetPublishedProductResponse = {
  product: DiscoveryPublishedProductResponse;
};
