import assert from "node:assert/strict";

import {
  createLocalProductDraft,
  setLocalProductRemoteId,
} from "../../apps/mobile/src/storage/product-drafts.ts";
import {
  createLocalMediaIntent,
  getSyncOperation,
  listLocalMediaIntents,
} from "../../apps/mobile/src/storage/media-intents.ts";
import {
  claimSyncOperation,
  getLocalMediaIntent,
  listPendingSyncOperations,
  markMediaSynced,
  recordMediaRemoteProgress,
  recoverStaleSyncOperations,
} from "../../apps/mobile/src/storage/sync-operations.ts";

const STALE_CUTOFF_MS = 60_000;

async function main(): Promise<void> {
  const OWNER = "artisan-owner-1";
  const draft = await setLocalProductRemoteId(
    OWNER,
    (await createLocalProductDraft(OWNER)).localId,
    "remote-product-storage",
  );

  assert.ok(draft.remoteProductId);

  const media = await createLocalMediaIntent(OWNER, {
    localId: "storage-media-1",
    productId: draft.localId,
    kind: "IMAGE",
    uri: "file:///tmp/storage-image.jpg",
    contentType: "image/jpeg",
    sizeBytes: 1234,
    idempotencyKey: "media:storage-1",
  });

  // A newly captured file has no server record yet.
  assert.equal(media.state, "PENDING_SYNC");
  assert.equal(media.remoteMediaId, null);
  assert.equal(media.remoteState, null);

  const operationId = `${media.localId}:CREATE_MEDIA_ATTACHMENT`;

  const claimed = await claimSyncOperation(OWNER, operationId);

  assert.ok(claimed);
  assert.equal(claimed.state, "IN_FLIGHT");
  assert.equal(claimed.attempts, 1);

  // Recording progress must not acknowledge the operation: the bytes are
  // not verified yet, so an interrupted upload still has to be retried.
  await recordMediaRemoteProgress(
    OWNER,
    media.localId,
    "remote-media-1",
    "UPLOAD_AUTHORIZED",
  );

  const afterAuthorization =
    await getLocalMediaIntent(OWNER, media.localId);

  assert.ok(afterAuthorization);
  assert.equal(afterAuthorization.remoteMediaId, "remote-media-1");
  assert.equal(
    afterAuthorization.remoteState,
    "UPLOAD_AUTHORIZED",
  );
  assert.equal(afterAuthorization.state, "PENDING_SYNC");

  const stillInFlight = await getSyncOperation(
    OWNER,
    operationId,
  );

  assert.ok(stillInFlight);
  assert.equal(
    stillInFlight.state,
    "IN_FLIGHT",
    "an unverified upload must not be acknowledged",
  );

  // The remote state advances through the lifecycle and is what a
  // restarted app reads to decide where to resume.
  for (const remoteState of [
    "UPLOADING",
    "UPLOADED",
  ] as const) {
    await recordMediaRemoteProgress(
      OWNER,
      media.localId,
      "remote-media-1",
      remoteState,
    );

    const current = await getLocalMediaIntent(
      OWNER,
      media.localId,
    );

    assert.ok(current);
    assert.equal(current.remoteState, remoteState);
  }

  // An unrecognized state must never be written, so a local record can
  // not claim something the rest of the app does not understand.
  await recordMediaRemoteProgress(
    OWNER,
    media.localId,
    "remote-media-1",
    "SOMETHING_ELSE",
  );

  const afterUnknown = await getLocalMediaIntent(
    OWNER,
    media.localId,
  );

  assert.ok(afterUnknown);
  assert.equal(
    afterUnknown.remoteState,
    "UPLOADED",
    "an unknown remote state must not overwrite a known one",
  );

  // Only verified media is acknowledged.
  await recordMediaRemoteProgress(
    OWNER,
    media.localId,
    "remote-media-1",
    "VERIFIED",
  );
  await markMediaSynced(
    OWNER,
    media.localId,
    operationId,
    "remote-media-1",
  );

  const verified = await getLocalMediaIntent(
    OWNER,
    media.localId,
  );

  assert.ok(verified);
  assert.equal(verified.state, "SYNCED");
  assert.equal(verified.remoteState, "VERIFIED");

  const acked = await getSyncOperation(OWNER, operationId);

  assert.ok(acked);
  assert.equal(acked.state, "ACKED");

  // Acknowledged work is not offered again.
  const pendingAfterAck =
    await listPendingSyncOperations(OWNER, 50);

  assert.equal(
    pendingAfterAck.filter(
      (operation) =>
        operation.operationId === operationId,
    ).length,
    0,
    "acknowledged work must not be re-queued",
  );

  // -------------------------------------------------------------------
  // Restart recovery: an operation stranded IN_FLIGHT by a killed app
  // must return to the queue, or the artisan's media is stuck forever.
  // -------------------------------------------------------------------

  const stranded = await createLocalMediaIntent(OWNER, {
    localId: "storage-media-2",
    productId: draft.localId,
    kind: "IMAGE",
    uri: "file:///tmp/storage-image-2.jpg",
    contentType: "image/jpeg",
    sizeBytes: 4321,
    idempotencyKey: "media:storage-2",
  });

  const strandedOperationId =
    `${stranded.localId}:CREATE_MEDIA_ATTACHMENT`;

  const strandedClaim = await claimSyncOperation(
    OWNER,
    strandedOperationId,
  );

  assert.ok(strandedClaim);
  assert.equal(strandedClaim.state, "IN_FLIGHT");

  await recordMediaRemoteProgress(
    OWNER,
    stranded.localId,
    "remote-media-2",
    "UPLOADING",
  );

  // Recovery selects operations whose last update is older than the
  // cutoff. A cutoff in the past therefore finds nothing recent, and the
  // live claim must survive.
  const immediateRecovery =
    await recoverStaleSyncOperations(
      OWNER,
      new Date(Date.now() - STALE_CUTOFF_MS).toISOString(),
    );

  assert.equal(
    immediateRecovery,
    0,
    "nothing recent is stale yet",
  );

  const stillClaimed = await getSyncOperation(
    OWNER,
    strandedOperationId,
  );

  assert.ok(stillClaimed);
  assert.equal(
    stillClaimed.state,
    "IN_FLIGHT",
    "an operation inside the freshness window must stay claimed",
  );

  // A cutoff beyond this claim makes it stale, and it must be recovered.
  const recovered = await recoverStaleSyncOperations(
    OWNER,
    new Date(Date.now() + STALE_CUTOFF_MS).toISOString(),
  );

  assert.ok(
    recovered >= 1,
    "a stranded operation must be recovered",
  );

  const requeued = await getSyncOperation(
    OWNER,
    strandedOperationId,
  );

  assert.ok(requeued);
  assert.equal(
    requeued.state,
    "PENDING",
    "a stranded operation returns to the queue",
  );

  // The remote state survives, so the retry resumes rather than starting
  // over blind.
  const resumable = await getLocalMediaIntent(
    OWNER,
    stranded.localId,
  );

  assert.ok(resumable);
  assert.equal(
    resumable.remoteState,
    "UPLOADING",
    "resume state survives the restart",
  );
  assert.equal(
    resumable.remoteMediaId,
    "remote-media-2",
    "the server media id survives the restart",
  );

  const queued = await listPendingSyncOperations(OWNER, 50);

  assert.ok(
    queued.some(
      (operation) =>
        operation.operationId === strandedOperationId,
    ),
    "a recovered operation is offered for retry",
  );

  // The recovered operation can be claimed again, and the attempt
  // counter keeps growing rather than resetting.
  const reclaimed = await claimSyncOperation(
    OWNER,
    strandedOperationId,
  );

  assert.ok(reclaimed);
  assert.equal(reclaimed.state, "IN_FLIGHT");
  assert.equal(
    reclaimed.attempts,
    strandedClaim.attempts + 1,
    "attempts accumulate across restarts",
  );

  // Listing intents still reports the persisted remote state.
  const listed = await listLocalMediaIntents(
    OWNER,
    draft.localId,
  );

  const listedStranded = listed.find(
    (intent) => intent.localId === stranded.localId,
  );

  assert.ok(listedStranded);
  assert.equal(
    listedStranded.remoteState,
    "UPLOADING",
  );

  console.log(
    "M2B MEDIA UPLOAD STORAGE RUNTIME TESTS PASSED",
  );
}

void main().catch((error) => {
  console.error(
    "M2B MEDIA UPLOAD STORAGE RUNTIME TESTS FAILED",
  );
  console.error(error);
  process.exitCode = 1;
});
