import { AppError } from '../../../shared/errors/app-error.js';
import type {
  CatalogProductPort,
  CatalogProductSnapshot,
  ConfirmedCatalogValues,
} from './catalog-product-port.js';

/**
 * A test double for the Catalog module's read/apply port.
 *
 * The name says what it is: this is not a fallback the composition root can
 * select. It exists so the AI service tests exercise the AI side of the
 * boundary without standing up the Catalog module, whose ownership and frozen
 * state rules the catalog's own tests already cover. A write is recorded so a
 * test can assert what was applied, and when nothing was.
 */
export class MemoryCatalogPort implements CatalogProductPort {
  readonly writes: ConfirmedCatalogValues[] = [];

  constructor(
    readonly products: Map<string, CatalogProductSnapshot>,
  ) {}

  /**
   * Test convenience: replace the held product, e.g. to simulate the
   * artisan editing a field between proposal generation and decision.
   */
  setProduct(product: CatalogProductSnapshot): void {
    this.products.set(product.id, product);
  }

  async readProduct(
    productId: string,
  ): Promise<CatalogProductSnapshot | null> {
    return this.products.get(productId) ?? null;
  }

  async applyConfirmedValues(
    productId: string,
    actorId: string,
    values: ConfirmedCatalogValues,
  ): Promise<CatalogProductSnapshot> {
    const product = this.products.get(productId);

    if (!product) {
      throw new AppError(
        'NOT_FOUND',
        'Catalog product was not found.',
        { productId },
      );
    }

    if (product.ownerId !== actorId) {
      throw new AppError(
        'FORBIDDEN',
        'The product belongs to another artisan.',
        { productId },
      );
    }

    if (
      product.state === 'PUBLISHED' ||
      product.state === 'ARCHIVED'
    ) {
      throw new AppError(
        'CONFLICT',
        `Product cannot be edited in state ${product.state}.`,
        { productId, state: product.state },
      );
    }

    this.writes.push(values);

    const updated: CatalogProductSnapshot = {
      ...product,
      ...(values.title !== undefined
        ? { title: values.title }
        : {}),
      ...(values.description !== undefined
        ? { description: values.description }
        : {}),
      ...(values.category !== undefined
        ? { category: values.category }
        : {}),
      ...(values.materials !== undefined
        ? { materials: [...values.materials] }
        : {}),
    };

    this.products.set(productId, updated);
    return updated;
  }
}