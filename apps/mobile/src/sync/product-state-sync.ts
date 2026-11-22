import type { ProductState } from '@artisan-marketplace/contracts';
import { ProductSyncTransportError } from '../network/product-sync-contract';

type ProductStateSyncTransport = {
  getOwnedProductState(productId: string): Promise<ProductState>;
  transitionProduct(
    productId: string,
    state: 'PENDING_SYNC' | 'SYNCED',
  ): Promise<void>;
};

const SYNC_COMPLETE_STATES: ReadonlySet<ProductState> = new Set([
  'SYNCED',
  'REVIEW_REQUIRED',
  'APPROVED',
  'PUBLISHED',
  'ARCHIVED',
]);

export async function ensureProductSynced(
  productId: string,
  transport: ProductStateSyncTransport,
): Promise<void> {
  if (productId.trim() === '') {
    throw new Error('A product id is required to complete product sync.');
  }

  let state = await transport.getOwnedProductState(productId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (SYNC_COMPLETE_STATES.has(state)) {
      return;
    }

    if (state === 'CONFLICT' || state === 'ACTION_REQUIRED') {
      throw new ProductSyncTransportError(
        `Product sync requires attention; its current state is ${state}.`,
        `PRODUCT_${state}`,
        false,
      );
    }

    let nextState: 'PENDING_SYNC' | 'SYNCED';

    if (state === 'LOCAL_DRAFT') {
      nextState = 'PENDING_SYNC';
    } else if (state === 'PENDING_SYNC') {
      nextState = 'SYNCED';
    } else {
      throw new ProductSyncTransportError(
        `Cannot resume product sync from state ${state}.`,
        'INVALID_PRODUCT_SYNC_STATE',
        false,
      );
    }

    try {
      await transport.transitionProduct(productId, nextState);
    } catch (error) {
      if (
        !(error instanceof ProductSyncTransportError) ||
        error.code !== 'CONFLICT'
      ) {
        throw error;
      }

      const latestState =
        await transport.getOwnedProductState(productId);

      // A conflict is a completed concurrent transition only when the
      // authoritative state has actually changed.
      if (latestState === state) {
        throw error;
      }

      state = latestState;
      continue;
    }

    state = await transport.getOwnedProductState(productId);
  }

  if (SYNC_COMPLETE_STATES.has(state)) {
    return;
  }

  throw new ProductSyncTransportError(
    `Product state did not settle after retries; current state is ${state}.`,
    'STATE_TRANSITION_RACE',
    true,
  );
}