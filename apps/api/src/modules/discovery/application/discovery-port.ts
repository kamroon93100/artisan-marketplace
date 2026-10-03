import type {
  PublishedCatalogProduct,
} from '../../catalog/domain/catalog-published.js';
import type {
  DiscoveryQuery,
} from '../domain/discovery-query.js';

/**
 * One page of buyer-visible listings.
 *
 * Discovery owns the *query* — what was asked for and how it is bounded —
 * and the catalog owns what a published listing is. This type is the join
 * between the two, and it deliberately carries nothing else: no draft
 * field, no product state, no AI value. A port is a boundary, and a field
 * that crosses it is a field every implementation of it is expected to
 * supply.
 */
export type DiscoveryPage = {
  items: readonly PublishedCatalogProduct[];
  total: number;
};

/**
 * The read the Discovery module is allowed to perform.
 *
 * The module has no write operation of any kind, and that is not an
 * oversight to be corrected later by a caller with more permissions. Buyer
 * discovery is a read over published state; a buyer has no reason to change
 * it, so the surface for changing it is not part of the port.
 *
 * Both methods are reads of immutable published snapshots, so neither takes
 * an actor: who is asking does not change what is published, and a
 * caller-supplied identity could only widen the result.
 */
export interface PublishedCatalogReadPort {
  searchPublishedProducts(
    query: DiscoveryQuery,
  ): Promise<DiscoveryPage>;
  getPublishedProduct(
    productId: string,
  ): Promise<PublishedCatalogProduct | null>;
}
