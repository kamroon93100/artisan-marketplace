import assert from "node:assert/strict";

import {
  createLocalProductDraft,
  getLocalProductDraft,
  setLocalProductRemoteId,
  updateLocalProductDraft,
} from "../../apps/mobile/src/storage/product-drafts.ts";
import {
  createLocalMediaIntent,
  listLocalMediaIntents,
} from "../../apps/mobile/src/storage/media-intents.ts";
import {
  claimSyncOperation,
  getLocalMediaIntent,
  listSyncOperationsForAggregate,
  markMediaSynced,
  markSyncActionRequired,
  retrySyncOperation,
} from "../../apps/mobile/src/storage/sync-operations.ts";

async function main(): Promise<void> {
  const draft = await createLocalProductDraft();

  assert.equal(draft.state, "LOCAL_ONLY");
  assert.equal(draft.title, null);

  const updatedDraft = await updateLocalProductDraft(draft.localId, {
    title: "Handmade basket",
    state: "PENDING_SYNC",
  });

  assert.equal(updatedDraft.title, "Handmade basket");
  assert.equal(updatedDraft.state, "PENDING_SYNC");

  const persistedDraft = await getLocalProductDraft(draft.localId);

  assert.ok(persistedDraft);
  assert.equal(persistedDraft.title, "Handmade basket");
  assert.equal(persistedDraft.state, "PENDING_SYNC");

  const mappedDraft = await setLocalProductRemoteId(
    draft.localId,
    "remote-product-123",
  );

  assert.equal(mappedDraft.remoteProductId, "remote-product-123");

  const media = await createLocalMediaIntent({
    localId: "media-test-image-1",
    productId: draft.localId,
    kind: "IMAGE",
    uri: "file:///tmp/test-image.jpg",
    contentType: "image/jpeg",
    sizeBytes: 1234,
    idempotencyKey: "media:test-image-1",
  });

  assert.equal(media.state, "PENDING_SYNC");

  const mediaRows = await listLocalMediaIntents(draft.localId);

  assert.equal(mediaRows.length, 1);
  assert.equal(mediaRows[0]?.localId, "media-test-image-1");
  assert.equal(mediaRows[0]?.state, "PENDING_SYNC");

  const initialOperations = await listSyncOperationsForAggregate(
    "media-test-image-1",
  );

  assert.equal(initialOperations.length, 1);
  assert.equal(initialOperations[0]?.state, "PENDING");
  assert.equal(initialOperations[0]?.attempts, 0);

  const operationId = initialOperations[0]!.operationId;

  const claimed = await claimSyncOperation(operationId);

  assert.ok(claimed);
  assert.equal(claimed.state, "IN_FLIGHT");
  assert.equal(claimed.attempts, 1);

  await markSyncActionRequired(
    "media-test-image-1",
    operationId,
    "SIMULATED_FAILURE",
    "Simulated M1 sync failure.",
  );

  const failedMedia = await getLocalMediaIntent("media-test-image-1");
  const failedOperation = (await listSyncOperationsForAggregate("media-test-image-1")).find((item) => item.operationId === operationId);

  assert.ok(failedMedia);
  assert.ok(failedOperation);
  assert.equal(failedMedia.state, "ACTION_REQUIRED");
  assert.equal(failedOperation.state, "ACTION_REQUIRED");
  assert.equal(failedOperation.lastErrorCode, "SIMULATED_FAILURE");

  await retrySyncOperation(operationId);

  const retriedMedia = await getLocalMediaIntent("media-test-image-1");
  const retriedOperation = (await listSyncOperationsForAggregate("media-test-image-1")).find((item) => item.operationId === operationId);

  assert.ok(retriedMedia);
  assert.ok(retriedOperation);
  assert.equal(retriedMedia.state, "PENDING_SYNC");
  assert.equal(retriedOperation.state, "PENDING");
  assert.equal(retriedOperation.lastErrorCode, null);
  assert.equal(retriedOperation.lastErrorMessage, null);

  await markMediaSynced(
    "media-test-image-1",
    operationId,
    "remote-media-123",
  );

  const syncedMedia = await getLocalMediaIntent("media-test-image-1");
  const syncedOperation = (await listSyncOperationsForAggregate("media-test-image-1")).find((item) => item.operationId === operationId);

  assert.ok(syncedMedia);
  assert.ok(syncedOperation);
  assert.equal(syncedMedia.state, "SYNCED");
  assert.equal(syncedMedia.remoteMediaId, "remote-media-123");
  assert.equal(syncedOperation.state, "ACKED");

  console.log("M1 STORAGE RUNTIME TESTS PASSED");
}

main().catch((error) => {
  console.error("M1 STORAGE RUNTIME TESTS FAILED");
  console.error(error);
  process.exitCode = 1;
});









