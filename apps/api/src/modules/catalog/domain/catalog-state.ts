import type { ProductState } from '@artisan-marketplace/contracts';

const ALLOWED_TRANSITIONS: Readonly<Record<ProductState, readonly ProductState[]>> = {
  LOCAL_DRAFT: ['PENDING_SYNC', 'CONFLICT', 'ACTION_REQUIRED'],
  PENDING_SYNC: ['SYNCED', 'CONFLICT', 'ACTION_REQUIRED'],
  SYNCED: ['REVIEW_REQUIRED', 'APPROVED', 'CONFLICT', 'ACTION_REQUIRED', 'ARCHIVED'],
  REVIEW_REQUIRED: ['APPROVED', 'SYNCED', 'CONFLICT', 'ACTION_REQUIRED'],
  APPROVED: ['PUBLISHED', 'REVIEW_REQUIRED', 'CONFLICT', 'ACTION_REQUIRED', 'ARCHIVED'],
  PUBLISHED: ['REVIEW_REQUIRED', 'ARCHIVED', 'CONFLICT', 'ACTION_REQUIRED'],
  ARCHIVED: [],
  CONFLICT: ['LOCAL_DRAFT', 'PENDING_SYNC', 'SYNCED', 'ACTION_REQUIRED'],
  ACTION_REQUIRED: ['LOCAL_DRAFT', 'PENDING_SYNC', 'SYNCED', 'REVIEW_REQUIRED', 'ARCHIVED'],
};

export function canTransition(
  from: ProductState,
  to: ProductState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(
  from: ProductState,
  to: ProductState,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid catalog state transition: ${from} -> ${to}`);
  }
}
