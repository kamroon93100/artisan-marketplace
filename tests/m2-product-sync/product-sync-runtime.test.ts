import assert from "node:assert/strict";

import {
  createLocalProductDraft,
  getLocalProductDraft,
  updateLocalProductDraft,
} from "../../apps/mobile/src/storage/product-drafts.ts";
import { syncPendingProducts } from "../../apps/mobile/src/sync/product-sync.ts";
import type {
  CreateProductSyncRequest,
  CreateProductSyncResponse,
  ProductSyncTransport,
} from "../../apps/mobile/src/network/product-sync-contract.ts";
import { ProductSyncTransportError } from "../../apps/mobile/src/network/product-sync-contract.ts";

class SuccessTransport implements ProductSyncTransport {
  calls: CreateProductSyncRequest[] = [];

  async createProduct(
    request: CreateProductSyncRequest,
  ): Promise<CreateProductSyncResponse> {
    this.calls.push(request);

    return {
      remoteProductId: "remote-product-123",
    };
  }
}

class RetryableTransport implements ProductSyncTransport {
  calls = 0;

  async createProduct(
    _request: CreateProductSyncRequest,
  ): Promise<CreateProductSyncResponse> {
    this.calls += 1;

    throw new ProductSyncTransportError(
      "Temporary outage.",
      "TEMPORARY_FAILURE",
      true,
    );
  }
}

async function main(): Promise<void> {
  const successDraft = await createLocalProductDraft();

  await updateLocalProductDraft(successDraft.localId, {
    title: "Handmade basket",
    state: "PENDING_SYNC",
  });

  const successTransport = new SuccessTransport();

  const first = await syncPendingProducts(successTransport);

  assert.equal(first.processed, 1);
  assert.equal(first.succeeded, 1);
  assert.equal(first.retried, 0);
  assert.equal(first.actionRequired, 0);
  assert.equal(successTransport.calls.length, 1);
  assert.equal(
    successTransport.calls[0]?.idempotencyKey,
    `product:${successDraft.localId}`,
  );

  const syncedDraft = await getLocalProductDraft(
    successDraft.localId,
  );

  assert.ok(syncedDraft);
  assert.equal(
    syncedDraft.remoteProductId,
    "remote-product-123",
  );
  assert.equal(syncedDraft.state, "SYNCED");

  const second = await syncPendingProducts(successTransport);

  assert.equal(second.processed, 0);
  assert.equal(successTransport.calls.length, 1);

  const retryDraft = await createLocalProductDraft();

  await updateLocalProductDraft(retryDraft.localId, {
    title: "Retry product",
    state: "PENDING_SYNC",
  });

  const retryTransport = new RetryableTransport();

  const retryResult =
    await syncPendingProducts(retryTransport);

  assert.equal(retryResult.processed, 1);
  assert.equal(retryResult.succeeded, 0);
  assert.equal(retryResult.retried, 1);
  assert.equal(retryResult.actionRequired, 0);

  const pendingDraft = await getLocalProductDraft(
    retryDraft.localId,
  );

  assert.ok(pendingDraft);
  assert.equal(pendingDraft.remoteProductId, null);
  assert.equal(pendingDraft.state, "PENDING_SYNC");

  console.log("M2 PRODUCT SYNC RUNTIME TESTS PASSED");
}

main().catch((error) => {
  console.error("M2 PRODUCT SYNC RUNTIME TESTS FAILED");
  console.error(error);
  process.exitCode = 1;
});
