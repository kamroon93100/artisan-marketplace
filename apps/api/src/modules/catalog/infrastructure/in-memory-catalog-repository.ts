import type {
  CatalogRepository,
  CreateCatalogDraftInput,
  CreateCatalogDraftResult,
  PublishCatalogInput,
  PublishCatalogResult,
  UpdateCatalogProductInput,
} from '../application/catalog-repository.js';
import { CatalogPublishConflictError } from '../application/catalog-repository.js';
import type {
  CatalogProduct,
  CatalogVersion,
  ProductState,
} from '../domain/catalog-product.js';
import type {
  PublishedCatalogProduct,
  PublishedCatalogSearchQuery,
  PublishedCatalogSearchResult,
} from '../domain/catalog-published.js';
import {
  comparePublishedProducts,
  isPublishedReadVisible,
  publishedSearchText,
  toPublishedProduct,
} from '../domain/catalog-published.js';

/**
 * Version replay keys are kept beside the snapshots rather than on them,
 * mirroring the database's `catalog_versions.idempotency_key` column
 * without turning an internal retry key into a published field.
 */
function versionKey(productId: string, idempotencyKey: string): string {
  return `${productId}:${idempotencyKey}`;
}

export class InMemoryCatalogRepository implements CatalogRepository {
  private readonly products = new Map<string, CatalogProduct>();
  private readonly versions = new Map<string, CatalogVersion[]>();
  private readonly publishedKeys = new Map<string, string>();
  private readonly idempotency = new Map<string, string>();

  async createDraft(
    input: CreateCatalogDraftInput,
  ): Promise<CreateCatalogDraftResult> {
    if (input.idempotencyKey?.trim()) {
      const existing = await this.findByIdempotencyKey(
        input.ownerId,
        input.idempotencyKey,
      );

      if (existing) {
        return {
          product: existing,
          created: false,
        };
      }
    }

    const now = new Date().toISOString();

    const product: CatalogProduct = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      title: input.title ?? null,
      description: input.description ?? null,
      category: input.category ?? null,
      materials: input.materials ?? [],
      state: 'LOCAL_DRAFT',
      createdAt: now,
      updatedAt: now,
      publishedVersion: null,
    };

    this.products.set(product.id, product);

    if (input.idempotencyKey?.trim()) {
      this.idempotency.set(
        `${input.ownerId}:${input.idempotencyKey}`,
        product.id,
      );
    }

    return {
      product,
      created: true,
    };
  }

  async findByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<CatalogProduct | null> {
    const id = this.idempotency.get(
      `${ownerId}:${idempotencyKey}`,
    );

    return id ? this.products.get(id) ?? null : null;
  }

  async getById(id: string): Promise<CatalogProduct | null> {
    return this.products.get(id) ?? null;
  }

  async transitionState(
    id: string,
    state: ProductState,
    expectedState: ProductState,
  ): Promise<CatalogProduct> {
    const product = this.products.get(id);

    if (!product) {
      throw new Error(`Product not found: ${id}`);
    }

    if (product.state !== expectedState) {
      throw new Error(
        `Invalid catalog state transition: ${product.state} -> ${state}`,
      );
    }

    const updated: CatalogProduct = {
      ...product,
      state,
      updatedAt: new Date().toISOString(),
    };

    this.products.set(id, updated);
    return updated;
  }

  /**
   * Only the supplied fields are written, so a partial edit never
   * reverts a field the request did not mention.
   */
  async updateFields(
    input: UpdateCatalogProductInput,
  ): Promise<CatalogProduct> {
    const product = this.products.get(input.id);

    if (!product) {
      throw new Error(`Product not found: ${input.id}`);
    }

    const updated: CatalogProduct = {
      ...product,
      ...(input.title !== undefined
        ? { title: input.title }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.category !== undefined
        ? { category: input.category }
        : {}),
      ...(input.materials !== undefined
        ? { materials: [...input.materials] }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    this.products.set(input.id, updated);
    return updated;
  }

  async publish(
    input: PublishCatalogInput,
  ): Promise<PublishCatalogResult> {
    const replayed =
      await this.findVersionByIdempotencyKey(
        input.id,
        input.idempotencyKey,
      );

    if (replayed) {
      return {
        product: this.requireProduct(input.id),
        version: replayed,
        created: false,
      };
    }

    const product = this.products.get(input.id);

    if (!product) {
      throw new Error(`Product not found: ${input.id}`);
    }

    if (product.state !== input.expectedState) {
      throw new CatalogPublishConflictError(input.id);
    }

    const publishedAt = new Date().toISOString();

    const version: CatalogVersion = {
      id: crypto.randomUUID(),
      productId: product.id,
      versionNumber: (product.publishedVersion ?? 0) + 1,
      title: product.title ?? '',
      description: product.description ?? '',
      category: product.category,
      materials: [...product.materials],
      publishedAt,
      publishedBy: input.publishedBy,
    };

    /**
     * The product pointer and its snapshot are applied together so this
     * store cannot reach the split state the database transaction exists
     * to prevent: a PUBLISHED product with no version behind it, or a
     * version recording something buyers were never shown.
     */
    this.products.set(input.id, {
      ...product,
      state: 'PUBLISHED',
      publishedVersion: version.versionNumber,
      updatedAt: publishedAt,
    });

    this.versions.set(input.id, [
      version,
      ...(this.versions.get(input.id) ?? []),
    ]);

    this.publishedKeys.set(
      versionKey(input.id, input.idempotencyKey),
      version.id,
    );

    return {
      product: this.products.get(input.id)!,
      version,
      created: true,
    };
  }

  async findVersionByIdempotencyKey(
    productId: string,
    idempotencyKey: string,
  ): Promise<CatalogVersion | null> {
    const versionId = this.publishedKeys.get(
      versionKey(productId, idempotencyKey),
    );

    if (!versionId) {
      return null;
    }

    return (
      (this.versions.get(productId) ?? []).find(
        (version) => version.id === versionId,
      ) ?? null
    );
  }

  async listVersions(
    productId: string,
  ): Promise<readonly CatalogVersion[]> {
    return [...(this.versions.get(productId) ?? [])].sort(
      (left, right) =>
        right.versionNumber - left.versionNumber,
    );
  }

  async getPublishedSnapshot(
    productId: string,
  ): Promise<PublishedCatalogProduct | null> {
    return (
      this.visiblePublishedProducts().find(
        (product) => product.productId === productId,
      ) ?? null
    );
  }

  async searchPublishedSnapshots(
    query: PublishedCatalogSearchQuery,
  ): Promise<PublishedCatalogSearchResult> {
    const search = query.search?.trim().toLowerCase();
    const needle =
      search && search.length > 0 ? search : null;

    /**
     * The same two steps the database query performs, in the same order:
     * decide visibility, then decide the text match. Both use the shared
     * domain functions, so this store cannot answer a different question
     * from PostgreSQL about what a buyer can see or which listing a term
     * matches.
     */
    const matched = this.visiblePublishedProducts().filter(
      (product) =>
        needle === null ||
        publishedSearchText(product).includes(needle),
    );

    return {
      items: matched.slice(
        query.offset,
        query.offset + query.limit,
      ),
      total: matched.length,
    };
  }

  /**
   * Every currently buyer-visible published snapshot, newest first.
   *
   * Visibility resolves through `isPublishedReadVisible` and the value read
   * is the version row, not the product row, which is the same pair of
   * decisions the SQL makes.
   */
  private visiblePublishedProducts(): PublishedCatalogProduct[] {
    const visible: PublishedCatalogProduct[] = [];

    for (const product of this.products.values()) {
      if (
        product.publishedVersion === null ||
        !isPublishedReadVisible(product)
      ) {
        continue;
      }

      const version = (
        this.versions.get(product.id) ?? []
      ).find(
        (candidate) =>
          candidate.versionNumber ===
          product.publishedVersion,
      );

      if (version) {
        visible.push(toPublishedProduct(version));
      }
    }

    return visible.sort(comparePublishedProducts);
  }

  private requireProduct(id: string): CatalogProduct {
    const product = this.products.get(id);

    if (!product) {
      throw new Error(`Product not found: ${id}`);
    }

    return product;
  }
}
