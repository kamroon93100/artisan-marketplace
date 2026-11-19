/**
 * Centralized registry of rate-limit operation scopes and their policies.
 *
 * This replaces the scattered limiter singletons in index.ts with a single
 * source of truth. Each operation has a stable, explicit scope identifier
 * that does not include dynamic resource IDs (product IDs, job IDs, etc.).
 * The scope + authenticated actor ID forms the rate-limit key.
 */

export type OperationScope =
  | 'catalog.product.create'
  | 'catalog.product.publish'
  | 'media.upload.authorization'
  | 'media.upload.start'
  | 'ai.job.enqueue'
  | 'ai.job.run'
  | 'review.product.approve'
  | 'inquiry.create'
  | 'discovery.search'
  | 'discovery.read';

export interface OperationPolicy {
  readonly limit: number;
  readonly windowMs: number;
  readonly label: string;
}

export const OPERATION_POLICIES: Readonly<Record<OperationScope, OperationPolicy>> = {
  'catalog.product.create': { limit: 30, windowMs: 60_000, label: 'product creation' },
  'catalog.product.publish': { limit: 10, windowMs: 60_000, label: 'product publication' },
  'media.upload.authorization': { limit: 60, windowMs: 60_000, label: 'upload authorization' },
  'media.upload.start': { limit: 60, windowMs: 60_000, label: 'upload start' },
  'ai.job.enqueue': { limit: 10, windowMs: 60_000, label: 'AI job enqueue' },
  'ai.job.run': { limit: 10, windowMs: 60_000, label: 'AI job execution' },
  'review.product.approve': { limit: 10, windowMs: 60_000, label: 'review approval' },
  'inquiry.create': { limit: 10, windowMs: 60_000, label: 'inquiry creation' },
  'discovery.search': { limit: 60, windowMs: 60_000, label: 'discovery search' },
  'discovery.read': { limit: 120, windowMs: 60_000, label: 'discovery read' },
} as const;

/**
 * Validates that an operation scope is known.
 *
 * This is a compile-time guard via the type system, but also provides
 * a runtime check for defense in depth when constructing keys dynamically.
 * Uses Object.hasOwn to avoid prototype-pollution vectors (toString, constructor, __proto__).
 */
export function isOperationScope(value: string): value is OperationScope {
  return Object.hasOwn(OPERATION_POLICIES, value);
}