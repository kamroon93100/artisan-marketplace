import { AppError } from '../../../shared/errors/app-error.js';
import { CatalogService } from '../../catalog/application/catalog-service.js';
import type {
  ReviewProductPort,
  ReviewProductSnapshot,
} from '../application/review-port.js';

/**
 * Adapts the Catalog module's public service to the read-and-approve port
 * the Review module is allowed to hold.
 *
 * Reading is not a permission decision, so `readProduct` carries no actor
 * and reports a missing product as `null`, preserving the distinction the
 * review service needs between "not found" and "not yours". Approving is:
 * the actor is handed to the Catalog service, which applies its own
 * ownership and product-state rules, so the Review module cannot skip a
 * rule the Catalog module enforces.
 *
 * The Catalog module has no route back into the Review module, which is
 * what keeps the approval precondition in one place rather than being
 * half-checked at each end.
 *
 * Products cross this boundary as-is. The Catalog domain product and the
 * catalog API's product response are the same shape, so mapping it here
 * would only be an opportunity to drop a field, and a dropped
 * `publishedVersion` on a re-review would read as "never published" rather
 * than as a missing value.
 */
export class CatalogServiceReviewProductPort
  implements ReviewProductPort
{
  constructor(
    private readonly service: CatalogService,
  ) {}

  async readProduct(
    productId: string,
  ): Promise<ReviewProductSnapshot | null> {
    try {
      return await this.service.getById(productId);
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

  async approve(
    productId: string,
    actorId: string,
  ): Promise<{
    product: ReviewProductSnapshot;
    changed: boolean;
  }> {
    const result = await this.service.approve(
      productId,
      actorId,
    );

    return result;
  }
}
