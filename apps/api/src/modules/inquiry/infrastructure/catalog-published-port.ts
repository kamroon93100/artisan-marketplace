import type { CatalogService } from '../../catalog/application/catalog-service.js';
import type {
  PublishedCatalogProduct,
} from '../../catalog/domain/catalog-published.js';
import type { PublishedProductPort } from '../application/published-product-port.js';

/**
 * Adapts the Catalog module's public service to the single question the
 * Inquiry module is allowed to ask it.
 *
 * The port is one method wide on purpose. The inquiry needs to know whether
 * a product is buyer-visible and which published version is current, and
 * nothing else — so the adapter exposes exactly that, and a future change
 * that makes the inquiry want the draft, the owner, or the media is a change
 * to this port rather than a widening that happens silently.
 *
 * The catalog does not know the inquiry module exists. That is what keeps
 * "an inquiry must not depend on a local-only draft or an AI proposal"
 * enforceable in one direction: the only values that reach an inquiry row
 * are the ones this method returns.
 */
export class CatalogServicePublishedProductPort
  implements PublishedProductPort
{
  constructor(
    private readonly catalog: CatalogService,
  ) {}

  async getPublishedProduct(
    productId: string,
  ): Promise<PublishedCatalogProduct | null> {
    return this.catalog.getPublishedProduct(productId);
  }
}
