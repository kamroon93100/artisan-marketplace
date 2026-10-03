import { AppError } from '../../../shared/errors/app-error.js';
import type {
  PublishedCatalogProduct,
} from '../../catalog/domain/catalog-published.js';
import type { DiscoveryQuery } from '../domain/discovery-query.js';
import type { PublishedCatalogReadPort } from './discovery-port.js';

/**
 * A bounded page, with the bounds the client actually needs reported back.
 *
 * `hasMore` is computed here rather than left to the client because the
 * client cannot compute it correctly from the page alone: an empty page at
 * an offset inside the catalog is not the same thing as an exhausted
 * catalog, and only the total can tell them apart.
 */
export type DiscoveryPageResult = {
  products: readonly PublishedCatalogProduct[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/**
 * Buyer-facing discovery over published catalog state.
 *
 * The service is read-only in the strongest sense available: it holds a port
 * with no write method, so there is no discovery operation that could
 * change a product, a version, or an inquiry. That is a property of the
 * types rather than of the discipline of whoever writes the next method.
 *
 * It also never reads a working draft. Visibility is decided by the catalog
 * through `PublishedCatalogReadPort`, which resolves to an immutable
 * published version, and this service does nothing that could substitute the
 * draft for it.
 */
export class DiscoveryService {
  constructor(
    private readonly publishedCatalog:
      PublishedCatalogReadPort,
  ) {}

  /**
   * A bounded page of buyer-visible listings.
   *
   * Validation runs before any read, so a malformed query is reported as the
   * malformed input it is and the catalog is never asked about it.
   */
  async search(
    query: DiscoveryQuery,
  ): Promise<DiscoveryPageResult> {
    const page =
      await this.publishedCatalog.searchPublishedProducts(query);

    return {
      products: page.items,
      total: page.total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + page.items.length < page.total,
    };
  }

  /**
   * One buyer-visible listing.
   *
   * A product that is not buyer-visible is reported as not found, with the
   * same status and the same message as a product that does not exist. The
   * two cases are genuinely different — one is an unpublished draft, the
   * other is a wrong id — but reporting them differently would let a caller
   * probe for the existence of products an artisan has not published, which
   * is exactly the information a discovery surface must not leak.
   */
  async getPublishedProduct(
    productId: string,
  ): Promise<PublishedCatalogProduct> {
    const product =
      await this.publishedCatalog.getPublishedProduct(productId);

    if (!product) {
      throw new AppError(
        'NOT_FOUND',
        'Published product was not found.',
        { productId },
      );
    }

    return product;
  }
}
