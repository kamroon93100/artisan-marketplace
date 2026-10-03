import type {
  PublishedCatalogProduct,
} from '../../catalog/domain/catalog-published.js';

/**
 * The narrow question the Inquiry module is allowed to ask about the
 * catalog: is this product buyer-visible, and if so which version is
 * current?
 *
 * It is deliberately smaller than a general catalog read. The inquiry needs
 * a version number to reference and nothing else — no draft, no owner, no
 * media — and a port shaped like the catalog module would make it easy to
 * reach for a field the inquiry has no business holding.
 *
 * Returning `null` for "not visible" is the point. "Never published" and
 * "archived" are different facts about a product, and neither is
 * something a buyer needs to distinguish in order to be told they cannot
 * inquire about it.
 */
export interface PublishedProductPort {
  getPublishedProduct(
    productId: string,
  ): Promise<PublishedCatalogProduct | null>;
}
