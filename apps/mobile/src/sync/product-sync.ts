import {
  listLocalProductDrafts,
  updateLocalProductDraft,
  setLocalProductRemoteId,
} from '../storage/product-drafts';
import {
  ProductSyncTransportError,
  type ProductSyncTransport,
} from '../network/product-sync-contract';

export type ProductSyncResult = {
  processed: number;
  succeeded: number;
  retried: number;
  actionRequired: number;
};

export async function syncPendingProducts(
  transport: ProductSyncTransport,
): Promise<ProductSyncResult> {
  const drafts = await listLocalProductDrafts();

  const result: ProductSyncResult = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    actionRequired: 0,
  };

  for (const draft of drafts) {
    if (
      draft.remoteProductId ||
      draft.state !== 'PENDING_SYNC'
    ) {
      continue;
    }

    result.processed += 1;

    const idempotencyKey = `product:${draft.localId}`;

    try {
      const response = await transport.createProduct({
        title: draft.title,
        idempotencyKey,
      });

      await setLocalProductRemoteId(
        draft.localId,
        response.remoteProductId,
      );

      await updateLocalProductDraft(draft.localId, {
        state: 'SYNCED',
      });

      result.succeeded += 1;
    } catch (error) {
      if (
        error instanceof ProductSyncTransportError &&
        error.retryable
      ) {
        result.retried += 1;
        continue;
      }

      result.actionRequired += 1;

      await updateLocalProductDraft(draft.localId, {
        state: 'ACTION_REQUIRED',
      });
    }
  }

  return result;
}
