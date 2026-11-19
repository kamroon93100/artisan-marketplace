import assert from "node:assert/strict";

import {
  getLocalDatabase,
  requireLocalOwnerId,
} from "../../apps/mobile/src/storage/database.ts";
import {
  createLocalProductDraft,
  getLocalProductDraft,
  listLocalProductDrafts,
  setLocalProductRemoteId,
  updateLocalProductDraft,
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
  listSyncOperationsForAggregate,
  markMediaSynced,
  markSyncActionRequired,
  recordMediaRemoteProgress,
  recoverStaleSyncOperations,
  retrySyncOperation,
} from "../../apps/mobile/src/storage/sync-operations.ts";
import { syncPendingProducts } from "../../apps/mobile/src/sync/product-sync.ts";
import { syncPendingMedia } from "../../apps/mobile/src/sync/media-sync.ts";
import type {
  CreateMediaAttachmentRequest,
  CreateMediaAttachmentResponse,
  MediaCompletionResponse,
  MediaSyncTransport,
  UploadAuthorizationResponse,
} from "../../apps/mobile/src/sync/media-sync-contract.ts";
import type {
  ByteUploader,
  ByteUploadRequest,
} from "../../apps/mobile/src/sync/byte-uploader.ts";
import type {
  CreateProductSyncRequest,
  CreateProductSyncResponse,
  ProductSyncTransport,
} from "../../apps/mobile/src/network/product-sync-contract.ts";

const ALICE = "actor-alice";
const BOB = "actor-bob";

class RecordingMediaTransport implements MediaSyncTransport {
  created: CreateMediaAttachmentRequest[] = [];

  async createMediaAttachment(
    request: CreateMediaAttachmentRequest,
  ): Promise<CreateMediaAttachmentResponse> {
    this.created.push(request);

    return { mediaId: `remote-${request.idempotencyKey}` };
  }

  async authorizeUpload(
    mediaId: string,
  ): Promise<UploadAuthorizationResponse> {
    return this.authorization(mediaId, "UPLOAD_AUTHORIZED");
  }

  async startUpload(
    mediaId: string,
  ): Promise<UploadAuthorizationResponse> {
    return this.authorization(mediaId, "UPLOADING");
  }

  async completeUpload(
    mediaId: string,
  ): Promise<MediaCompletionResponse> {
    return {
      mediaId,
      remoteState: "VERIFIED",
      verified: true,
      failureCode: null,
      failureMessage: null,
    };
  }

  private authorization(
    mediaId: string,
    remoteState: string,
  ): UploadAuthorizationResponse {
    return {
      mediaId,
      remoteState,
      objectKey: `media/${mediaId}`,
      upload: {
        objectKey: `media/${mediaId}`,
        url: `https://storage.test/media/${mediaId}`,
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        expiresInSeconds: 300,
      },
    };
  }
}

class RecordingUploader implements ByteUploader {
  uploads: ByteUploadRequest[] = [];

  async upload(request: ByteUploadRequest): Promise<void> {
    this.uploads.push(request);
    request.onProgress?.({
      bytesSent: 1,
      totalBytes: 1,
    });
  }
}

class RecordingProductTransport implements ProductSyncTransport {
  calls: CreateProductSyncRequest[] = [];

  async createProduct(
    request: CreateProductSyncRequest,
  ): Promise<CreateProductSyncResponse> {
    this.calls.push(request);

    return {
      remoteProductId: `remote-${request.idempotencyKey}`,
    };
  }
}

async function assertOwnerIsRequired(): Promise<void> {
  assert.throws(
    () => requireLocalOwnerId(""),
    /authenticated owner/,
    "an empty owner must be refused by the storage layer",
  );

  assert.throws(
    () => requireLocalOwnerId("   "),
    /authenticated owner/,
    "a blank owner must be refused by the storage layer",
  );

  await assert.rejects(
    () => createLocalProductDraft(""),
    /authenticated owner/,
    "no ownerless draft may be created",
  );
}

async function assertDraftIsolation(): Promise<void> {
  const aliceDraft = await createLocalProductDraft(ALICE);
  const bobDraft = await createLocalProductDraft(BOB);

  const aliceList = await listLocalProductDrafts(ALICE);
  const bobList = await listLocalProductDrafts(BOB);

  assert.deepEqual(
    aliceList.map((draft) => draft.localId),
    [aliceDraft.localId],
    "Alice sees only her own draft",
  );
  assert.deepEqual(
    bobList.map((draft) => draft.localId),
    [bobDraft.localId],
    "Bob sees only his own draft",
  );

  assert.equal(
    await getLocalProductDraft(BOB, aliceDraft.localId),
    null,
    "Bob cannot read Alice's draft by id",
  );

  await assert.rejects(
    () =>
      updateLocalProductDraft(BOB, aliceDraft.localId, {
        title: "Taken over",
        state: "PENDING_SYNC",
      }),
    /does not exist/,
    "Bob cannot write Alice's draft",
  );

  await assert.rejects(
    () =>
      setLocalProductRemoteId(
        BOB,
        aliceDraft.localId,
        "remote-attacker",
      ),
    /does not exist/,
    "Bob cannot bind Alice's draft to a remote product",
  );

  const untouched = await getLocalProductDraft(
    ALICE,
    aliceDraft.localId,
  );

  assert.ok(untouched);
  assert.equal(untouched.title, null);
  assert.equal(untouched.remoteProductId, null);
  assert.equal(untouched.state, "LOCAL_ONLY");

  const bobOwned = await updateLocalProductDraft(
    BOB,
    bobDraft.localId,
    { title: "Bob's basket" },
  );

  assert.equal(bobOwned.title, "Bob's basket");
}

async function assertQueueIsolation(): Promise<void> {
  const aliceDraft = await createLocalProductDraft(ALICE);

  await setLocalProductRemoteId(
    ALICE,
    aliceDraft.localId,
    "remote-product-alice",
  );

  const media = await createLocalMediaIntent(ALICE, {
    localId: "media-alice-image-1",
    productId: aliceDraft.localId,
    kind: "IMAGE",
    uri: "file:///tmp/alice-image.jpg",
    contentType: "image/jpeg",
    sizeBytes: 1234,
    idempotencyKey: "media:alice-image-1",
  });

  const operationId =
    `${media.localId}:CREATE_MEDIA_ATTACHMENT`;

  assert.equal(
    (await listLocalMediaIntents(BOB, aliceDraft.localId)).length,
    0,
    "Bob cannot list Alice's media",
  );
  assert.equal(
    await getLocalMediaIntent(BOB, media.localId),
    null,
    "Bob cannot read Alice's media by id",
  );
  assert.equal(
    await getSyncOperation(BOB, operationId),
    null,
    "Bob cannot read Alice's sync operation",
  );
  assert.equal(
    (
      await listSyncOperationsForAggregate(
        BOB,
        media.localId,
      )
    ).length,
    0,
    "Bob cannot list Alice's operations",
  );
  assert.equal(
    (
      await listPendingSyncOperations(BOB, 50)
    ).some((operation) => operation.operationId === operationId),
    false,
    "Alice's queued work is not offered to Bob",
  );
  assert.equal(
    (
      await listPendingSyncOperations(ALICE, 50)
    ).some((operation) => operation.operationId === operationId),
    true,
    "Alice's queued work is offered to Alice",
  );

  await assert.rejects(
    () =>
      createLocalMediaIntent(BOB, {
        localId: "media-cross-owner",
        productId: aliceDraft.localId,
        kind: "IMAGE",
        uri: "file:///tmp/cross.jpg",
        contentType: "image/jpeg",
        sizeBytes: 10,
        idempotencyKey: "media:cross-owner",
      }),
    /does not belong to this account/,
    "Bob cannot attach media to Alice's draft",
  );

  assert.equal(
    await getSyncOperation(
      BOB,
      "media-cross-owner:CREATE_MEDIA_ATTACHMENT",
    ),
    null,
    "the refused write leaves no queued operation behind",
  );

  assert.equal(
    await claimSyncOperation(BOB, operationId),
    null,
    "Bob cannot claim Alice's operation",
  );

  const claimed = await claimSyncOperation(
    ALICE,
    operationId,
  );

  assert.ok(claimed);
  assert.equal(claimed.state, "IN_FLIGHT");

  await recordMediaRemoteProgress(
    BOB,
    media.localId,
    "remote-attacker",
    "UPLOADING",
  );

  const afterBobProgress = await getLocalMediaIntent(
    ALICE,
    media.localId,
  );

  assert.ok(afterBobProgress);
  assert.equal(
    afterBobProgress.remoteMediaId,
    null,
    "Bob's write cannot advance Alice's media",
  );

  await recordMediaRemoteProgress(
    ALICE,
    media.localId,
    "remote-media-alice",
    "UPLOADING",
  );

  await markSyncActionRequired(
    ALICE,
    media.localId,
    operationId,
    "SIMULATED_FAILURE",
    "Simulated failure.",
  );

  await retrySyncOperation(BOB, operationId);

  assert.equal(
    await getSyncOperation(BOB, operationId),
    null,
    "Bob cannot read the operation he tried to retry",
  );
  assert.equal(
    (await getSyncOperation(ALICE, operationId))?.state,
    "ACTION_REQUIRED",
    "Bob's retry does not re-arm Alice's operation",
  );

  await retrySyncOperation(ALICE, operationId);

  assert.equal(
    (await getSyncOperation(ALICE, operationId))?.state,
    "PENDING",
    "Alice can re-arm her own operation",
  );

  await markMediaSynced(
    ALICE,
    media.localId,
    operationId,
    "remote-media-alice",
  );

  assert.equal(
    (await getLocalMediaIntent(ALICE, media.localId))?.state,
    "SYNCED",
  );
}

async function assertQueuedWorkIsNotUploadedAcrossAccounts(): Promise<void> {
  const aliceDraft = await createLocalProductDraft(ALICE);

  await setLocalProductRemoteId(
    ALICE,
    aliceDraft.localId,
    "remote-product-alice-2",
  );

  const media = await createLocalMediaIntent(ALICE, {
    localId: "media-alice-image-2",
    productId: aliceDraft.localId,
    kind: "IMAGE",
    uri: "file:///tmp/alice-image-2.jpg",
    contentType: "image/jpeg",
    sizeBytes: 4321,
    idempotencyKey: "media:alice-image-2",
  });

  const operationId =
    `${media.localId}:CREATE_MEDIA_ATTACHMENT`;

  const bobTransport = new RecordingMediaTransport();
  const bobUploader = new RecordingUploader();

  const bobRun = await syncPendingMedia(
    BOB,
    bobTransport,
    bobUploader,
  );

  assert.equal(bobRun.processed, 0);
  assert.equal(bobRun.succeeded, 0);
  assert.equal(bobTransport.created.length, 0);
  assert.equal(bobUploader.uploads.length, 0);
  assert.equal(
    (await getSyncOperation(ALICE, operationId))?.state,
    "PENDING",
    "Alice's operation is untouched by Bob's sync",
  );
  assert.equal(
    (await getLocalMediaIntent(ALICE, media.localId))?.state,
    "PENDING_SYNC",
  );

  const aliceTransport = new RecordingMediaTransport();
  const aliceUploader = new RecordingUploader();

  const aliceRun = await syncPendingMedia(
    ALICE,
    aliceTransport,
    aliceUploader,
  );

  assert.equal(aliceRun.processed, 1);
  assert.equal(aliceRun.succeeded, 1);
  assert.equal(aliceTransport.created.length, 1);
  assert.equal(aliceUploader.uploads.length, 1);
  assert.equal(
    (await getSyncOperation(ALICE, operationId))?.state,
    "ACKED",
  );

  const pendingDraft = await createLocalProductDraft(ALICE);

  await updateLocalProductDraft(
    ALICE,
    pendingDraft.localId,
    {
      title: "Alice's queued product",
      state: "PENDING_SYNC",
    },
  );

  const bobProducts = new RecordingProductTransport();

  const bobProductRun = await syncPendingProducts(
    BOB,
    bobProducts,
  );

  assert.equal(bobProductRun.processed, 0);
  assert.equal(bobProducts.calls.length, 0);

  const stillQueued = await getLocalProductDraft(
    ALICE,
    pendingDraft.localId,
  );

  assert.ok(stillQueued);
  assert.equal(stillQueued.remoteProductId, null);
  assert.equal(stillQueued.state, "PENDING_SYNC");

  const aliceProducts = new RecordingProductTransport();

  const aliceProductRun = await syncPendingProducts(
    ALICE,
    aliceProducts,
  );

  assert.equal(aliceProductRun.processed, 1);
  assert.equal(aliceProductRun.succeeded, 1);
  assert.equal(aliceProducts.calls.length, 1);

  const synced = await getLocalProductDraft(
    ALICE,
    pendingDraft.localId,
  );

  assert.ok(synced);
  assert.equal(
    synced.remoteProductId,
    `remote-product:${pendingDraft.localId}`,
  );
  assert.equal(synced.state, "SYNCED");
}

async function assertLegacyRowsArePreservedButUnreachable(): Promise<void> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  await db.runAsync(
    `
      INSERT INTO local_product_drafts (
        local_id,
        owner_id,
        remote_product_id,
        title,
        state,
        created_at,
        updated_at
      )
      VALUES (?, NULL, NULL, ?, 'PENDING_SYNC', ?, ?)
    `,
    "legacy-draft",
    "Legacy work",
    now,
    now,
  );

  await db.runAsync(
    `
      INSERT INTO media_intents (
        local_id,
        owner_id,
        product_id,
        kind,
        uri,
        content_type,
        size_bytes,
        idempotency_key,
        state,
        remote_media_id,
        remote_state,
        created_at,
        updated_at
      )
      VALUES (
        ?, NULL, ?, 'IMAGE', ?, 'image/jpeg', 100, ?,
        'PENDING_SYNC', NULL, NULL, ?, ?
      )
    `,
    "legacy-media",
    "legacy-draft",
    "file:///tmp/legacy.jpg",
    "media:legacy",
    now,
    now,
  );

  await db.runAsync(
    `
      INSERT INTO sync_operations (
        operation_id,
        owner_id,
        operation_type,
        aggregate_id,
        idempotency_key,
        state,
        attempts,
        last_error_code,
        last_error_message,
        next_attempt_at,
        created_at,
        updated_at
      )
      VALUES (
        ?, NULL, 'CREATE_MEDIA_ATTACHMENT', ?, ?, 'PENDING',
        0, NULL, NULL, NULL, ?, ?
      )
    `,
    "legacy-media:CREATE_MEDIA_ATTACHMENT",
    "legacy-media",
    "media:legacy",
    now,
    now,
  );

  await db.runAsync(
    `
      INSERT INTO sync_operations (
        operation_id,
        owner_id,
        operation_type,
        aggregate_id,
        idempotency_key,
        state,
        attempts,
        last_error_code,
        last_error_message,
        next_attempt_at,
        created_at,
        updated_at
      )
      VALUES (
        ?, NULL, 'CREATE_MEDIA_ATTACHMENT', ?, ?,
        'IN_FLIGHT', 2, NULL, NULL, NULL, ?, ?
      )
    `,
    "legacy-inflight:CREATE_MEDIA_ATTACHMENT",
    "legacy-inflight",
    "media:legacy-inflight",
    old,
    old,
  );

  for (const owner of [ALICE, BOB]) {
    assert.equal(
      (
        await listLocalProductDrafts(owner)
      ).some((draft) => draft.localId === "legacy-draft"),
      false,
      "an unowned legacy draft is not assigned to an account",
    );

    assert.equal(
      await getLocalProductDraft(owner, "legacy-draft"),
      null,
    );

    await assert.rejects(
      () =>
        updateLocalProductDraft(owner, "legacy-draft", {
          title: "Claimed",
        }),
      /does not exist/,
    );

    assert.equal(
      (
        await listLocalMediaIntents(owner, "legacy-draft")
      ).length,
      0,
    );

    assert.equal(
      (
        await listPendingSyncOperations(owner, 50)
      ).some((operation) =>
        operation.operationId.startsWith("legacy-"),
      ),
      false,
      "legacy queued work is not offered to any account",
    );

    assert.equal(
      await claimSyncOperation(
        owner,
        "legacy-media:CREATE_MEDIA_ATTACHMENT",
      ),
      null,
    );

    await recoverStaleSyncOperations(
      owner,
      new Date(Date.now() + 60_000).toISOString(),
    );
  }

  const legacyDraft = await db.getFirstAsync<{
    owner_id: string | null;
    title: string;
    state: string;
  }>(
    `
      SELECT owner_id, title, state
      FROM local_product_drafts
      WHERE local_id = ?
    `,
    "legacy-draft",
  );

  assert.ok(legacyDraft);
  assert.equal(
    legacyDraft.owner_id,
    null,
    "the legacy row remains unowned rather than being adopted",
  );
  assert.equal(legacyDraft.title, "Legacy work");
  assert.equal(legacyDraft.state, "PENDING_SYNC");

  const legacyMedia = await db.getFirstAsync<{
    owner_id: string | null;
  }>(
    `
      SELECT owner_id
      FROM media_intents
      WHERE local_id = ?
    `,
    "legacy-media",
  );

  assert.ok(legacyMedia);
  assert.equal(legacyMedia.owner_id, null);

  const legacyPending = await db.getFirstAsync<{
    owner_id: string | null;
    state: string;
  }>(
    `
      SELECT owner_id, state
      FROM sync_operations
      WHERE operation_id = ?
    `,
    "legacy-media:CREATE_MEDIA_ATTACHMENT",
  );

  assert.ok(legacyPending);
  assert.equal(legacyPending.owner_id, null);
  assert.equal(legacyPending.state, "PENDING");

  const legacyInFlight = await db.getFirstAsync<{
    owner_id: string | null;
    state: string;
    attempts: number;
  }>(
    `
      SELECT owner_id, state, attempts
      FROM sync_operations
      WHERE operation_id = ?
    `,
    "legacy-inflight:CREATE_MEDIA_ATTACHMENT",
  );

  assert.ok(legacyInFlight);
  assert.equal(legacyInFlight.owner_id, null);
  assert.equal(
    legacyInFlight.state,
    "IN_FLIGHT",
    "recovery leaves another account's stranded work untouched",
  );
  assert.equal(legacyInFlight.attempts, 2);
}

async function assertAccountSwitchingPreservesEachAccount(): Promise<void> {
  const aliceBefore = await listLocalProductDrafts(ALICE);
  const bobBefore = await listLocalProductDrafts(BOB);

  await createLocalProductDraft(BOB);

  const aliceAfter = await listLocalProductDrafts(ALICE);
  const bobAfter = await listLocalProductDrafts(BOB);

  assert.deepEqual(
    aliceAfter.map((draft) => draft.localId),
    aliceBefore.map((draft) => draft.localId),
    "signing in as Bob does not change Alice's drafts",
  );
  assert.equal(
    bobAfter.length,
    bobBefore.length + 1,
    "Bob still gets a new draft of his own",
  );

  const aliceIds = new Set(
    aliceAfter.map((draft) => draft.localId),
  );
  const bobIds = new Set(
    bobAfter.map((draft) => draft.localId),
  );

  for (const localId of aliceIds) {
    assert.equal(
      bobIds.has(localId),
      false,
      "no draft is visible to both accounts",
    );
  }
}

async function main(): Promise<void> {
  await assertOwnerIsRequired();
  await assertDraftIsolation();
  await assertQueueIsolation();
  await assertQueuedWorkIsNotUploadedAcrossAccounts();
  await assertLegacyRowsArePreservedButUnreachable();
  await assertAccountSwitchingPreservesEachAccount();

  console.log("M2 ACCOUNT ISOLATION RUNTIME TESTS PASSED");
}

void main().catch((error) => {
  console.error("M2 ACCOUNT ISOLATION RUNTIME TESTS FAILED");
  console.error(error);
  process.exitCode = 1;
});
