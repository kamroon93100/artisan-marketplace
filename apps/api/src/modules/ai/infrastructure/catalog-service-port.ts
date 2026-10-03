import { CatalogService } from '../../catalog/application/catalog-service.js';
import type { ProductState } from '@artisan-marketplace/contracts';
import { AppError } from '../../../shared/errors/app-error.js';
import type {
  CatalogProductPort,
  CatalogProductSnapshot,
  ConfirmedCatalogValues,
} from '../application/catalog-product-port.js';

function toSnapshot(product: {
  id: string;
  ownerId: string;
  state: ProductState;
  title: string | null;
  description: string | null;
  category: string | null;
  materials: readonly string[];
}): CatalogProductSnapshot {
  return {
    id: product.id,
    ownerId: product.ownerId,
    state: product.state,
    title: product.title,
    description: product.description,
    category: product.category,
    materials: [...product.materials],
  };
}

/**
 * Adapts the Catalog module's public service to the read-and-apply port
 * the AI module is allowed to hold.
 *
 * Reading is not a permission decision, so `readProduct` carries no actor.
 * Applying is: `applyConfirmedValues` hands the actor to the Catalog
 * service, which applies its own ownership and product-state rules. The
 * AI module therefore cannot skip a rule the Catalog module enforces,
 * because the write only exists through it.
 *
 * A missing product is reported as `null` on the read path, preserving the
 * distinction the pipeline needs between "the job input cannot be built"
 * and "this write is for a product that does not exist". The apply path
 * surfaces the Catalog service's own errors untouched.
 */
export class CatalogServiceCatalogProductPort
  implements CatalogProductPort
{
  constructor(
    private readonly service: CatalogService,
  ) {}

  async readProduct(
    productId: string,
  ): Promise<CatalogProductSnapshot | null> {
    try {
      return toSnapshot(
        await this.service.getById(productId),
      );
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === 'NOT_FOUND'
      ) {
        return null;
      }

      throw error;
    }
  }

  async applyConfirmedValues(
    productId: string,
    actorId: string,
    values: ConfirmedCatalogValues,
  ): Promise<CatalogProductSnapshot> {
    return toSnapshot(
      await this.service.update(
        productId,
        actorId,
        values,
      ),
    );
  }
}