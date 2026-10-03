import type {
  CatalogService,
} from '../../catalog/application/catalog-service.js';
import type {
  PublishedCatalogProduct,
} from '../../catalog/domain/catalog-published.js';
import type {
  DiscoveryPage,
  PublishedCatalogReadPort,
} from '../application/discovery-port.js';
import type { DiscoveryQuery } from '../domain/discovery-query.js';

/**
 * Adapts the Catalog module's public service to the published-read port the
 * Discovery module is allowed to hold.
 *
 * This is the whole of the Discovery module's knowledge of the catalog: two
 * read methods that return immutable published snapshots. The catalog does
 * not know Discovery exists, and nothing here queries `catalog_versions` or
 * `catalog_products` directly — the SQL for the published read belongs to
 * the module that owns those tables, and a second copy of it here would be
 * a second thing that has to be kept in step with the first.
 *
 * The mapping is thin on purpose. `PublishedCatalogProduct` is already the
 * buyer-safe projection the catalog decided on, and copying it field by
 * field here would add one more place a field could be dropped. A dropped
 * field is a quiet failure: the endpoint answers, and it is simply missing
 * something the client needed.
 */
export class CatalogServicePublishedCatalogReadPort
  implements PublishedCatalogReadPort
{
  constructor(
    private readonly catalog: CatalogService,
  ) {}

  async searchPublishedProducts(
    query: DiscoveryQuery,
  ): Promise<DiscoveryPage> {
    return this.catalog.searchPublishedProducts(query);
  }

  async getPublishedProduct(
    productId: string,
  ): Promise<PublishedCatalogProduct | null> {
    return this.catalog.getPublishedProduct(productId);
  }
}
