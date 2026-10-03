import type { ProductState } from '@artisan-marketplace/contracts';

/**
 * The product fields, as the Catalog module holds them.
 *
 * This is a read model, not a product. The AI module never constructs or
 * stores one: it reads a snapshot to build a job input, and it hands
 * human-confirmed values back to the Catalog module, which owns the product
 * and every rule about writing to it.
 */
export type CatalogProductSnapshot = {
  id: string;
  ownerId: string;
  state: ProductState;
  title: string | null;
  description: string | null;
  category: string | null;
  materials: readonly string[];
};

/**
 * Values an artisan confirmed, and only those.
 *
 * Every member is optional because a decision may cover one field. There is
 * no member for "the state", because AI never transitions a product.
 */
export type ConfirmedCatalogValues = {
  title?: string;
  description?: string;
  category?: string;
  materials?: readonly string[];
};

/**
 * The only route from the AI module to the Catalog module.
 *
 * Two methods is the entire surface, and the split is deliberate:
 * `readProduct` has no actor and therefore cannot authorize anything, so
 * reading a product to snapshot it is not a permission decision. `apply-
 * ConfirmedValues` takes the actor and the Catalog module applies its own
 * ownership and state rules, which is where authorization belongs.
 *
 * A composition root adapts the Catalog service to this. The AI module never
 * imports Catalog internals, so a change to how products are stored cannot
 * reach into the pipeline.
 */
export interface CatalogProductPort {
  readProduct(
    productId: string,
  ): Promise<CatalogProductSnapshot | null>;
  applyConfirmedValues(
    productId: string,
    actorId: string,
    values: ConfirmedCatalogValues,
  ): Promise<CatalogProductSnapshot>;
}
