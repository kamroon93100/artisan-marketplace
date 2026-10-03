import type { ProductState } from '@artisan-marketplace/contracts';

export type { ProductState } from '@artisan-marketplace/contracts';

export type CatalogProduct = {
  id: string;
  ownerId: string;
  title: string | null;
  description: string | null;
  category: string | null;
  materials: readonly string[];
  state: ProductState;
  createdAt: string;
  updatedAt: string;
  /**
   * Number of the catalog version currently published to buyers, or null
   * before the first publish. This is published history, not the
   * optimistic-concurrency counter the repository maintains internally.
   */
  publishedVersion: number | null;
};

/**
 * An immutable snapshot of the product as it stood at the moment it was
 * published. A version is a historical record of what buyers were shown,
 * so it is created once and never rewritten; a later change to a
 * published product produces the next version instead.
 */
export type CatalogVersion = {
  id: string;
  productId: string;
  versionNumber: number;
  title: string;
  description: string;
  category: string | null;
  materials: readonly string[];
  publishedAt: string;
  publishedBy: string;
};
