import assert from "node:assert/strict";

import {
  createLocalProductDraft,
  setLocalProductRemoteId,
} from "../../apps/mobile/src/storage/product-drafts.ts";
import {
  createLocalMediaIntent,
  getSyncOperation,
} from "../../apps/mobile/src/storage/media-intents.ts";
import {
  getLocalMediaIntent,
  listPendingSyncOperations,
  markSyncActionRequired,
  recordMediaRemoteProgress,
  retrySyncOperation,
} from "../../apps/mobile/src/storage/sync-operations.ts";
import {
  MAX_SYNC_ATTEMPTS,
  syncPendingMedia,
} from "../../apps/mobile/src/sync/media-sync.ts";
import { MediaSyncTransportError } from "../../apps/mobile/src/sync/media-sync-contract.ts";
import type {
  CreateMediaAttachmentRequest,
  CreateMediaAttachmentResponse,
  MediaCompletionResponse,
  MediaSyncTransport,
  MediaUploadDescriptor,
  UploadAuthorizationResponse,
} from "../../apps/mobile/src/sync/media-sync-contract.ts";
import type {
  ByteUploader,
  ByteUploadRequest,
} from "../../apps/mobile/src/sync/byte-uploader.ts";

const OWNER = "artisan-owner-1";
const SECRET_FRAGMENT = "X-Amz-Signature=deadbeef";

type Calls = {
  created: CreateMediaAttachmentRequest[];
  authorized: string[];
  started: string[];
  completed: string[];
  uploads: ByteUploadRequest[];
};

function descriptorFor(
  mediaId: string,
): MediaUploadDescriptor {
  return {
    objectKey: `media/owner/product/${mediaId}`,
    url: `https://storage.test/media/owner/product/${mediaId}?${SECRET_FRAGMENT}`,
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    expiresInSeconds: 300,
  };
}

/**
 * A server whose every step is recorded, so the test can assert the order
 * the pipeline drove and the exact bytes it handed to the uploader.
 */
class ScriptedServer implements MediaSyncTransport {
  readonly calls: Calls = {
    created: [],
    authorized: [],
    started: [],
    completed: [],
    uploads: [],
  };

  verified = true;
  remoteStateOnCompletion = "VERIFIED";
  completionFailureCode: string | null = null;
  authorizeError: MediaSyncTransportError | null = null;
  completionError: MediaSyncTransportError | null = null;

  async createMediaAttachment(
    request: CreateMediaAttachmentRequest,
  ): Promise<CreateMediaAttachmentResponse> {
    this.calls.created.push(request);

    return { mediaId: `remote-${request.idempotencyKey}` };
  }

  async authorizeUpload(
    mediaId: string,
  ): Promise<UploadAuthorizationResponse> {
    this.calls.authorized.push(mediaId);

    if (this.authorizeError) {
      throw this.authorizeError;
    }

    return {
      mediaId,
      remoteState: "UPLOAD_AUTHORIZED",
      objectKey: `media/owner/product/${mediaId}`,
      upload: descriptorFor(mediaId),
    };
  }

  async startUpload(
    mediaId: string,
  ): Promise<UploadAuthorizationResponse> {
    this.calls.started.push(mediaId);

    return {
      mediaId,
      remoteState: "UPLOADING",
      objectKey: `media/owner/product/${mediaId}`,
      upload: descriptorFor(mediaId),
    };
  }

  async completeUpload(
    mediaId: string,
  ): Promise<MediaCompletionResponse> {
    this.calls.completed.push(mediaId);

    if (this.completionError) {
      throw this.completionError;
    }

    return {
      mediaId,
      remoteState: this.remoteStateOnCompletion,
      verified: this.verified,
      failureCode: this.completionFailureCode,
      failureMessage: this.completionFailureCode
        ? "The stored object did not match the record."
        : null,
    };
  }
}

class RecordingUploader implements ByteUploader {
  readonly requests: ByteUploadRequest[] = [];

  error: MediaSyncTransportError | null = null;
  progress: { bytesSent: number; totalBytes: number } = {
    bytesSent: 2048,
    totalBytes: 2048,
  };

  /**
   * How many progress events to emit before resolving, so a test can
   * simulate an upload that runs long enough to need a heartbeat.
   */
  progressEvents = 1;

  /**
   * Delay between progress events. A heartbeat written in the same
   * millisecond as the previous one is indistinguishable from no
   * heartbeat at all, so a test that asserts on timestamps must let
   * real time pass.
   */
  progressDelayMs = 0;

  /**
   * Invoked after the first progress event, so a test can record the
   * claim timestamp before any later heartbeat can refresh it.
   */
  afterFirstProgress:
    | (() => Promise<void> | void)
    | null = null;

  /**
   * Invoked before the upload resolves, so a test can observe or race
   * the pipeline while the operation is still in flight.
   */
  beforeResolve:
    | (() => Promise<void> | void)
    | null = null;

  async upload(request: ByteUploadRequest): Promise<void> {
    this.requests.push(request);

    for (let index = 0; index < this.progressEvents; index += 1) {
      if (index > 0 && this.progressDelayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, this.progressDelayMs);
        });
      }

      request.onProgress?.({
        bytesSent: this.progress.bytesSent,
        totalBytes: this.progress.totalBytes,
      });

      if (index === 0) {
        await this.afterFirstProgress?.();
      }
    }

    await this.beforeResolve?.();

    if (this.error) {
      throw this.error;
    }
  }
}

let sequence = 0;

async function seedMedia(): Promise<{
  localId: string;
  operationId: string;
  media: Awaited<ReturnType<typeof createLocalMediaIntent>>;
}> {
  sequence += 1;

  const draft = await setLocalProductRemoteId(OWNER,
    (await createLocalProductDraft(OWNER)).localId,
    `remote-product-${sequence}`,
  );

  assert.ok(draft.remoteProductId);

  const media = await createLocalMediaIntent(OWNER, {
    localId: `pipeline-media-${sequence}`,
    productId: draft.localId,
    kind: "IMAGE",
    // Unique per intent so a test can scope assertions to one record
    // when the run also picks up other pending work.
    uri: `file:///tmp/pipeline-image-${sequence}.jpg`,
    contentType: "image/jpeg",
    sizeBytes: 2048,
    idempotencyKey: `pipeline:${sequence}`,
  });

  return {
    localId: media.localId,
    operationId: `${media.localId}:CREATE_MEDIA_ATTACHMENT`,
    media,
  };
}

async function testHappyPath(): Promise<void> {
  const { localId, operationId } = await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();
  const progress: Array<{ bytesSent: number; totalBytes: number }> = [];

  const result = await syncPendingMedia(OWNER,
    server,
    uploader,
    10,
    (_id, update) => progress.push(update),
  );

  assert.equal(result.succeeded, 1);
  assert.equal(result.retried, 0);
  assert.equal(result.actionRequired, 0);

  // The lifecycle must be driven in order.
  assert.deepEqual(server.calls.authorized, [
    `remote-pipeline:${sequence}`,
  ]);
  assert.deepEqual(server.calls.started, [
    `remote-pipeline:${sequence}`,
  ]);
  assert.deepEqual(server.calls.completed, [
    `remote-pipeline:${sequence}`,
  ]);

  assert.equal(uploader.requests.length, 1);

  const request = uploader.requests[0]!;

  assert.equal(
    request.uri,
    `file:///tmp/pipeline-image-${sequence}.jpg`,
  );
  assert.equal(request.method, "PUT");
  assert.equal(request.headers["content-type"], "image/jpeg");
  assert.equal(progress.length, 1);
  assert.equal(progress[0]?.bytesSent, 2048);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.equal(stored.state, "SYNCED");
  assert.equal(stored.remoteState, "VERIFIED");
  assert.equal(
    stored.remoteMediaId,
    `remote-pipeline:${sequence}`,
  );

  const operation = await getSyncOperation(OWNER, operationId);

  assert.ok(operation);
  assert.equal(operation.state, "ACKED");
}

/**
 * A refused write must never become a verified local state, and the
 * failure must be recoverable rather than stranding the media.
 */
async function testRefusedUploadRetries(): Promise<void> {
  const { localId, operationId } = await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  // Object storage refused the write: the authorization is no longer
  // usable, which the next attempt recovers from by re-authorizing.
  uploader.error = new MediaSyncTransportError(
    "The upload authorization was rejected or has expired.",
    "UPLOAD_AUTHORIZATION_REJECTED",
    true,
  );

  const result = await syncPendingMedia(OWNER, server, uploader);

  assert.equal(result.retried, 1);
  assert.equal(result.succeeded, 0);
  assert.equal(result.actionRequired, 0);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.notEqual(
    stored.state,
    "SYNCED",
    "a refused upload must not be marked synced",
  );
  assert.equal(stored.state, "PENDING_SYNC");

  const operation = await getSyncOperation(OWNER, operationId);

  assert.ok(operation);
  assert.equal(operation.state, "PENDING");
  assert.equal(
    operation.lastErrorCode,
    "UPLOAD_AUTHORIZATION_REJECTED",
  );
  assert.ok(
    operation.nextAttemptAt,
    "a retry must be scheduled",
  );

  // The retry is deferred by backoff rather than spinning.
  const tooSoon = await syncPendingMedia(OWNER, server, uploader);

  assert.equal(
    tooSoon.processed,
    0,
    "a backed-off operation must not be retried immediately",
  );
  assert.equal(uploader.requests.length, 1);

  await new Promise((resolve) =>
    setTimeout(resolve, 1_100),
  );

  // The retry re-authorizes and succeeds. The media id and progress from
  // the failed attempt are reused rather than starting a new record.
  uploader.error = null;

  const retried = await syncPendingMedia(OWNER, server, uploader);

  assert.equal(retried.succeeded, 1);
  assert.equal(
    server.calls.created.length,
    1,
    "a retry must not create a second media record",
  );
  assert.equal(server.calls.authorized.length, 2);
  assert.equal(uploader.requests.length, 2);
}

/**
 * A retryable failure has to be retried, but it cannot be retried
 * forever.
 *
 * Below the attempt threshold the failure is still treated as
 * transient and the next attempt is deferred by exponential backoff. At
 * the threshold the operation stops being retried and becomes an
 * explicit action state carrying the reason, because a failure that has
 * survived every attempt will not clear itself and would otherwise stay
 * pending indefinitely without ever reaching a state the artisan can
 * see or act on.
 *
 * Assertions are scoped to this one operation: a run may also pick up
 * unrelated pending work left by earlier cases.
 */
async function testRetriesStopAtAttemptThreshold(): Promise<void> {
  const { localId, operationId } = await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  /**
   * The rejection embeds the presigned URL, the way a real upload
   * failure does. That way the assertions on the persisted reason
   * exercise redaction instead of passing only because the fixture
   * never happened to mention a URL.
   */
  uploader.error = new MediaSyncTransportError(
    `The upload authorization was rejected or has expired for https://storage.test/media/owner/product/pending?${SECRET_FRAGMENT}`,
    "UPLOAD_AUTHORIZATION_REJECTED",
    true,
  );

  /**
   * Waits until the backed-off operation is actually offered again, so
   * the test follows the real backoff schedule rather than assuming a
   * fixed one. The deadline sits above the backoff cap so a raised
   * attempt budget does not fail here for an unrelated reason.
   */
  const waitUntilOffered = async (): Promise<void> => {
    const deadline = Date.now() + 40_000;

    while (Date.now() < deadline) {
      const pending = await listPendingSyncOperations(OWNER, 50);

      if (
        pending.some(
          (operation) =>
            operation.operationId === operationId,
        )
      ) {
        return;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });
    }

    throw new Error(
      "The backed-off operation was never offered again.",
    );
  };

  assert.ok(
    MAX_SYNC_ATTEMPTS > 1,
    "the attempt threshold must leave room for at least one retry",
  );
  assert.equal(
    MAX_SYNC_ATTEMPTS,
    5,
    "the attempt budget is a deliberate decision, not an arbitrary number",
  );

  // Every attempt below the threshold keeps retrying, with backoff.
  for (
    let attempt = 1;
    attempt < MAX_SYNC_ATTEMPTS;
    attempt += 1
  ) {
    await waitUntilOffered();

    const result = await syncPendingMedia(OWNER, server, uploader);

    assert.ok(
      result.processed >= 1,
      `attempt ${attempt} is picked up`,
    );

    const operation = await getSyncOperation(OWNER, operationId);

    assert.ok(operation);
    assert.equal(
      operation.state,
      "PENDING",
      `attempt ${attempt} below the threshold stays retryable`,
    );
    assert.equal(
      operation.attempts,
      attempt,
      `attempt ${attempt} counts exactly one attempt`,
    );
    assert.ok(
      operation.nextAttemptAt,
      `attempt ${attempt} defers the next attempt by backoff`,
    );
    assert.equal(
      operation.lastErrorCode,
      "UPLOAD_AUTHORIZATION_REJECTED",
      `attempt ${attempt} keeps the underlying cause`,
    );

    const stored = await getLocalMediaIntent(OWNER, localId);

    assert.ok(stored);
    assert.equal(
      stored.state,
      "PENDING_SYNC",
      `attempt ${attempt} leaves the media retryable`,
    );
  }

  // The attempt at the threshold stops retrying and escalates.
  await waitUntilOffered();

  await syncPendingMedia(OWNER, server, uploader);

  const escalated = await getSyncOperation(OWNER, operationId);

  assert.ok(escalated);
  assert.equal(
    escalated.attempts,
    MAX_SYNC_ATTEMPTS,
    "the operation was attempted exactly up to the threshold",
  );
  assert.equal(
    escalated.state,
    "ACTION_REQUIRED",
    "an exhausted attempt budget becomes an action state",
  );
  assert.equal(
    escalated.nextAttemptAt,
    null,
    "an escalated operation is not scheduled again",
  );
  assert.equal(
    escalated.lastErrorCode,
    "RETRY_LIMIT_EXCEEDED",
    "the exhausted budget is recorded explicitly",
  );

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.equal(
    stored.state,
    "ACTION_REQUIRED",
    "the media intent escalates with its operation",
  );
  assert.notEqual(
    stored.state,
    "SYNCED",
    "an exhausted budget is never recorded as synced",
  );
  assert.equal(
    uploader.requests.length,
    MAX_SYNC_ATTEMPTS,
    "no attempt happened beyond the threshold",
  );

  // The persisted reason has to be readable, has to carry the cause,
  // and must not carry a credential.
  const reason = escalated.lastErrorMessage ?? "";

  assert.ok(
    reason.includes(String(MAX_SYNC_ATTEMPTS)),
    "the reason states how many attempts were made",
  );
  assert.ok(
    reason.includes(
      "The upload authorization was rejected",
    ),
    "the reason carries the underlying failure",
  );
  assert.ok(
    !reason.includes(SECRET_FRAGMENT),
    "the reason must not carry the presigned credential",
  );
  assert.ok(
    !reason.includes("X-Amz-Signature"),
    "the reason must not carry the signature parameter at all",
  );
  assert.ok(
    !reason.toLowerCase().includes("deadbeef"),
    "no part of the signature value may survive redaction",
  );

  // It stays escalated: nothing retries it on its own.
  const afterEscalation = await syncPendingMedia(OWNER,
    server,
    uploader,
  );

  assert.equal(
    afterEscalation.processed,
    0,
    "an escalated operation is never retried automatically",
  );

  // The artisan's explicit retry re-arms the operation and the media
  // still uploads, so escalating did not strand or lose it.
  await retrySyncOperation(OWNER, operationId);

  const rearmed = await getSyncOperation(OWNER, operationId);

  assert.ok(rearmed);
  assert.equal(
    rearmed.state,
    "PENDING",
    "an explicit retry re-arms the operation",
  );
  assert.equal(
    rearmed.lastErrorCode,
    null,
    "an explicit retry clears the exhausted reason",
  );
  assert.equal(
    rearmed.attempts,
    0,
    "an explicit retry restores a full attempt budget, so re-arming is a usable way forward rather than a single extra try",
  );

  uploader.error = null;

  const recovered = await syncPendingMedia(OWNER, server, uploader);

  assert.equal(
    recovered.succeeded,
    1,
    "an explicit retry recovers the upload",
  );
  assert.equal(
    (await getSyncOperation(OWNER, operationId))?.state,
    "ACKED",
    "the recovered operation is acknowledged",
  );
  assert.equal(
    (await getLocalMediaIntent(OWNER, localId))?.state,
    "SYNCED",
    "the recovered media is synced",
  );
  assert.equal(
    uploader.requests.length,
    MAX_SYNC_ATTEMPTS + 1,
    "the recovered upload wrote bytes exactly once more",
  );
}

/**
 * The client's completion claim is not a conclusion. A failed
 * verification must not be recorded as synced.
 */
async function testFailedVerificationIsNotSynced(): Promise<void> {
  const { localId } = await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  server.verified = false;
  server.remoteStateOnCompletion = "FAILED";
  server.completionFailureCode = "OBJECT_SIZE_MISMATCH";

  const result = await syncPendingMedia(OWNER, server, uploader);

  // The object can be rewritten on the same key, so it stays retryable.
  assert.equal(result.retried, 1);
  assert.equal(result.succeeded, 0);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.notEqual(
    stored.state,
    "SYNCED",
    "a failed verification must not be marked synced",
  );
  assert.equal(stored.remoteState, "FAILED");
}

/**
 * A verified result in an unexpected state is a contract violation, not
 * something to record as a local success.
 */
async function testUnexpectedVerifiedStateIsActionRequired(): Promise<
  void
> {
  const { localId } = await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  server.verified = true;
  server.remoteStateOnCompletion = "UPLOADED";

  const result = await syncPendingMedia(OWNER, server, uploader);

  assert.equal(result.actionRequired, 1);
  assert.equal(result.succeeded, 0);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.equal(stored.state, "ACTION_REQUIRED");
  assert.notEqual(stored.state, "SYNCED");
}

async function testNonRetryableIsActionRequired(): Promise<void> {
  const { localId } = await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  server.authorizeError = new MediaSyncTransportError(
    "Media attachment cannot be authorized from state VERIFIED.",
    "CONFLICT",
    false,
  );

  const result = await syncPendingMedia(OWNER, server, uploader);

  assert.equal(result.actionRequired, 1);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.equal(stored.state, "ACTION_REQUIRED");
}

/**
 * Media cannot upload before its product exists on the server, and that
 * is a real problem the artisan must see rather than an endless retry.
 */
async function testUnsyncedProductIsActionRequired(): Promise<void> {
  const draft = await createLocalProductDraft(OWNER);
  const media = await createLocalMediaIntent(OWNER, {
    localId: `pipeline-unsynced-${++sequence}`,
    productId: draft.localId,
    kind: "IMAGE",
    uri: "file:///tmp/unsynced.jpg",
    contentType: "image/jpeg",
    sizeBytes: 10,
    idempotencyKey: `pipeline:unsynced:${sequence}`,
  });

  const result = await syncPendingMedia(OWNER,
    new ScriptedServer(),
    new RecordingUploader(),
  );

  const operation = await getSyncOperation(OWNER,
    `${media.localId}:CREATE_MEDIA_ATTACHMENT`,
  );

  assert.ok(operation);
  assert.equal(operation.state, "ACTION_REQUIRED");
  assert.equal(operation.lastErrorCode, "PRODUCT_NOT_SYNCED");
  assert.ok(result.actionRequired >= 1);
}

/**
 * An interrupted upload is resumed from the persisted remote state and
 * the existing server record, not started over.
 */
async function testResumeAfterInterruption(): Promise<void> {
  const { localId, operationId } = await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  await markSyncActionRequired(OWNER,
    localId,
    operationId,
    "INTERRUPTED",
    "The app was closed mid-upload.",
  );

  const { retrySyncOperation } = await import(
    "../../apps/mobile/src/storage/sync-operations.ts"
  );

  await retrySyncOperation(OWNER, operationId);

  const result = await syncPendingMedia(OWNER, server, uploader);

  assert.equal(result.succeeded, 1);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.equal(stored.state, "SYNCED");
  assert.equal(
    server.calls.created.length,
    1,
    "resuming must not create a second media record",
  );
}

/**
 * The presigned URL is a temporary credential. Nothing durable may retain
 * it, because that record survives on the device.
 */
async function testNoCredentialIsPersisted(): Promise<void> {
  const { localId } = await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  await syncPendingMedia(OWNER, server, uploader);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);

  const durable = JSON.stringify(stored);

  assert.ok(
    !durable.includes(SECRET_FRAGMENT),
    "the presigned URL must not be persisted locally",
  );
  assert.ok(
    !durable.includes("https://"),
    "no remote URL may be persisted locally",
  );
}

/**
 * Once acknowledged, work must not be offered again.
 */
async function testAcknowledgedWorkIsNotRepeated(): Promise<void> {
  await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  const first = await syncPendingMedia(OWNER, server, uploader);

  assert.equal(first.succeeded, 1);

  const second = await syncPendingMedia(OWNER, server, uploader);

  assert.equal(second.processed, 0);
  assert.equal(server.calls.created.length, 1);
  assert.equal(uploader.requests.length, 1);
}

/**
 * A heartbeat only proves liveness while the operation is still
 * in flight. It must never resurrect work that has already been
 * reclaimed, acked, or set aside for the artisan, or a stale upload
 * could overwrite a newer decision.
 */
async function testHeartbeatCannotResurrectSettledWork(): Promise<void> {
  const { localId, operationId } = await seedMedia();
  const { heartbeatSyncOperation, retrySyncOperation } =
    await import("../../apps/mobile/src/storage/sync-operations.ts");

  // An acknowledged operation must not be revived.
  await syncPendingMedia(OWNER, new ScriptedServer(), new RecordingUploader());

  const acked = await getSyncOperation(OWNER, operationId);

  assert.equal(acked?.state, "ACKED");

  await heartbeatSyncOperation(OWNER, operationId);

  const stillAcked = await getSyncOperation(OWNER, operationId);

  assert.equal(
    stillAcked?.state,
    "ACKED",
    "a heartbeat must not change an acknowledged operation",
  );
  assert.equal(
    stillAcked?.updatedAt,
    acked?.updatedAt,
    "a heartbeat must not touch a settled operation",
  );

  // An operation set aside for the artisan must not be revived either.
  const second = await seedMedia();

  await markSyncActionRequired(OWNER,
    second.localId,
    second.operationId,
    "MANUAL",
    "Waiting for the artisan.",
  );

  await heartbeatSyncOperation(OWNER, second.operationId);

  const setAside = await getSyncOperation(OWNER, second.operationId);

  assert.equal(
    setAside?.state,
    "ACTION_REQUIRED",
    "a heartbeat must not revive work that needs the artisan",
  );

  // A pending operation is not in flight, so it is not heartbeatable
  // either: the heartbeat is a liveness proof, not a claim.
  const third = await seedMedia();

  assert.equal(
    (await getSyncOperation(OWNER, third.operationId))?.state,
    "PENDING",
  );

  await heartbeatSyncOperation(OWNER, third.operationId);

  const pending = await getSyncOperation(OWNER, third.operationId);

  assert.equal(
    pending?.state,
    "PENDING",
    "a heartbeat must not claim a pending operation",
  );
}

/**
 * A long upload on a slow connection must not be reclaimed by a
 * concurrent run while it is still writing bytes. Stale recovery
 * reclaims by `updated_at`, so a live upload has to keep refreshing its
 * claim.
 */
async function testLongUploadIsNotStolenWhileInFlight(): Promise<void> {
  const { localId, operationId } = await seedMedia();
  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  // Four ticks with real time between them, against a zero heartbeat
  // cadence, so later ticks must refresh the claim.
  uploader.progressEvents = 4;
  uploader.progressDelayMs = 5;

  let claimBeforeHeartbeat = "";

  // The claim written when the operation was claimed, before any
  // heartbeat could have run.
  uploader.afterFirstProgress = async () => {
    claimBeforeHeartbeat = (
      await getSyncOperation(OWNER, operationId)
    )?.updatedAt ?? "";
  };

  uploader.beforeResolve = async () => {
    const { listPendingSyncOperations } = await import(
      "../../apps/mobile/src/storage/sync-operations.ts"
    );

    const inFlight = await getSyncOperation(OWNER, operationId);

    assert.equal(
      inFlight?.state,
      "IN_FLIGHT",
      "the operation is claimed while bytes are moving",
    );

    // The claim was refreshed by a heartbeat while bytes were moving.
    // Without one, the timestamp would still be the one written at claim
    // time.
    assert.ok(claimBeforeHeartbeat.length > 0, "the claim was observed");
    assert.ok(
      new Date(inFlight!.updatedAt).getTime() >
        new Date(claimBeforeHeartbeat).getTime(),
      "a long upload refreshes its claim instead of going stale",
    );

    const pending = await listPendingSyncOperations(OWNER, 10);

    assert.equal(
      pending.filter(
        (operation) => operation.operationId === operationId,
      ).length,
      0,
      "live work must not be offered to another attempt",
    );
  };

  const result = await syncPendingMedia(OWNER,
    server,
    uploader,
    10,
    undefined,
    0,
  );

  assert.equal(result.succeeded, 1);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.equal(stored?.state, "SYNCED");
  // Scoped to this media record: the run may also pick up unrelated
  // pending work left by earlier cases.
  const mediaId = `remote-pipeline:${sequence}`;

  assert.equal(
    server.calls.created.filter(
      (request) => request.idempotencyKey === `pipeline:${sequence}`,
    ).length,
    1,
    "this operation created exactly one server record",
  );
  assert.equal(
    server.calls.authorized.filter((id) => id === mediaId).length,
    1,
    "this operation was authorized exactly once",
  );
  assert.equal(
    server.calls.completed.filter((id) => id === mediaId).length,
    1,
    "this operation was completed exactly once",
  );
  assert.equal(
    uploader.requests.filter(
      (request) => request.uri === stored?.uri,
    ).length,
    1,
    "this record's bytes were written exactly once",
  );
}

/**
 * Seeds a record whose declared size is wrong on purpose, already bound to
 * the server record that was created for that wrong declaration.
 *
 * This is the state a real device is left in when a capture recorded a size
 * that did not describe the file it copied: the declaration and the binding
 * both point at a record the server will refuse forever.
 */
async function seedStaleMedia(
  declaredSizeBytes: number,
): Promise<{
  localId: string;
  operationId: string;
  uri: string;
  declaredRemoteMediaId: string;
  originalIdempotencyKey: string;
}> {
  sequence += 1;

  const draft = await setLocalProductRemoteId(OWNER,
    (await createLocalProductDraft(OWNER)).localId,
    `remote-product-${sequence}`,
  );

  assert.ok(draft.remoteProductId);

  const localId = `pipeline-stale-${sequence}`;
  const originalIdempotencyKey = `pipeline:stale:${sequence}`;

  const media = await createLocalMediaIntent(OWNER, {
    localId,
    productId: draft.localId,
    kind: "IMAGE",
    uri: `file:///tmp/pipeline-stale-${sequence}.jpg`,
    contentType: "image/jpeg",
    sizeBytes: declaredSizeBytes,
    idempotencyKey: originalIdempotencyKey,
  });

  const declaredRemoteMediaId = `remote-stale-${sequence}`;

  await recordMediaRemoteProgress(OWNER,
    localId,
    declaredRemoteMediaId,
    "UPLOAD_AUTHORIZED",
  );

  return {
    localId: media.localId,
    operationId: `${media.localId}:CREATE_MEDIA_ATTACHMENT`,
    uri: media.uri,
    declaredRemoteMediaId,
    originalIdempotencyKey,
  };
}

/**
 * A declared size is a claim made at capture time; the file on the device is
 * what will actually be uploaded. When the two disagree, the record has to
 * be re-declared onto a new logical request before it reaches the server,
 * because a server record's declared size is immutable: reusing the record
 * that was created with the wrong size replays the wrong size onto it
 * forever, and every attempt spends itself re-uploading bytes to an object
 * that can never verify.
 *
 * The sizes are the ones a real Android run produced, where the picker
 * claimed 72,987 bytes for the file the app had actually copied, and the
 * copied file measured 33,740 bytes.
 */
async function testStaleDeclarationIsRedeclaredAgainstTheRealFile(): Promise<void> {
  const {
    localId,
    operationId,
    uri,
    declaredRemoteMediaId,
    originalIdempotencyKey,
  } = await seedStaleMedia(72_987);

  const server = new ScriptedServer();
  const uploader = new RecordingUploader();

  const result = await syncPendingMedia(OWNER,
    server,
    uploader,
    10,
    undefined,
    undefined,
    { sizeBytes: () => 33_740 },
  );

  assert.equal(result.succeeded, 1);
  assert.equal(result.retried, 0);
  assert.equal(result.actionRequired, 0);

  assert.equal(
    server.calls.created.length,
    1,
    "exactly one record is created, for the corrected declaration",
  );

  const created = server.calls.created[0]!;

  assert.equal(
    created.sizeBytes,
    33_740,
    "the record must declare the bytes that will actually be uploaded",
  );
  assert.notEqual(
    created.idempotencyKey,
    originalIdempotencyKey,
    "a corrected declaration is a different logical request",
  );

  const correctedKey = `${localId}:CREATE_MEDIA_ATTACHMENT:size=33740`;

  assert.equal(created.idempotencyKey, correctedKey);

  const correctedRemoteMediaId = `remote-${correctedKey}`;

  // The record created for the wrong declaration is abandoned, not
  // reused: nothing is authorized, started, or completed against it.
  assert.deepEqual(server.calls.authorized, [correctedRemoteMediaId]);
  assert.deepEqual(server.calls.started, [correctedRemoteMediaId]);
  assert.deepEqual(server.calls.completed, [correctedRemoteMediaId]);

  // The bytes handed to the uploader are still the file on the device.
  assert.equal(uploader.requests.length, 1);
  assert.equal(uploader.requests[0]!.uri, uri);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.equal(stored.sizeBytes, 33_740);
  assert.equal(stored.idempotencyKey, correctedKey);
  assert.equal(stored.remoteMediaId, correctedRemoteMediaId);
  assert.equal(stored.remoteState, "VERIFIED");
  assert.equal(
    stored.state,
    "SYNCED",
    "a corrected record is only synced once the server verifies it",
  );
  assert.ok(
    !stored.remoteMediaId?.includes(declaredRemoteMediaId),
    "the abandoned record must not remain bound locally",
  );

  const operation = await getSyncOperation(OWNER, operationId);

  assert.ok(operation);
  assert.equal(
    operation.idempotencyKey,
    correctedKey,
    "the operation's key and the record's key must stay the same request",
  );
  assert.equal(operation.state, "ACKED");
  assert.equal(
    operation.attempts,
    0,
    "a correction restores the attempt budget, so the record is not " +
      "escalated by the failures of its wrong declaration",
  );
}

/**
 * A correction converges. Once the record declares the file's real size,
 * later attempts are ordinary retries of one logical request rather than a
 * fresh record per attempt, and the artisan's explicit retry is a usable
 * way forward.
 */
async function testCorrectedDeclarationConvergesOnOneRecord(): Promise<void> {
  const { localId, operationId } = await seedStaleMedia(72_987);
  const server = new ScriptedServer();
  const probe = { sizeBytes: () => 33_740 };
  const correctedKey = `${localId}:CREATE_MEDIA_ATTACHMENT:size=33740`;

  // The first attempt fails for a reason the correction cannot fix, and
  // escalates, which is the state a real device is left in once its attempts
  // are spent.
  server.completionError = new MediaSyncTransportError(
    "Object storage rejected the write.",
    "STORAGE_WRITE_REJECTED",
    false,
  );

  const first = await syncPendingMedia(OWNER,
    server,
    new RecordingUploader(),
    10,
    undefined,
    undefined,
    probe,
  );

  assert.equal(first.actionRequired, 1);
  assert.equal(first.retried, 0);

  const afterFirst = await getLocalMediaIntent(OWNER, localId);

  assert.ok(afterFirst);
  assert.equal(
    afterFirst.sizeBytes,
    33_740,
    "the correction survives the attempt that triggered it",
  );
  assert.equal(afterFirst.idempotencyKey, correctedKey);

  await retrySyncOperation(OWNER, operationId);

  server.completionError = null;

  const second = await syncPendingMedia(OWNER,
    server,
    new RecordingUploader(),
    10,
    undefined,
    undefined,
    probe,
  );

  assert.equal(second.succeeded, 1);

  const keys = server.calls.created.map((call) => call.idempotencyKey);

  assert.equal(
    keys.length,
    1,
    "the retry reuses the record the corrected attempt created, so a " +
      "correction plus a retry still leaves exactly one server record",
  );
  assert.equal(keys[0], correctedKey);

  const correctedRemoteMediaId = `remote-${correctedKey}`;

  assert.deepEqual(
    server.calls.authorized,
    [correctedRemoteMediaId, correctedRemoteMediaId],
    "both attempts act on the same record",
  );

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.equal(stored.sizeBytes, 33_740);
  assert.equal(stored.idempotencyKey, correctedKey);
  assert.equal(stored.state, "SYNCED");
}

/**
 * A record that already declares the file's real size is left exactly as it
 * is, including its server binding. The correction is a recovery, not a
 * habit: a correct record must keep reusing its record.
 */
async function testCorrectDeclarationKeepsItsServerRecord(): Promise<void> {
  const { localId, declaredRemoteMediaId, originalIdempotencyKey } =
    await seedStaleMedia(2_048);

  const server = new ScriptedServer();

  const result = await syncPendingMedia(OWNER,
    server,
    new RecordingUploader(),
    10,
    undefined,
    undefined,
    { sizeBytes: () => 2_048 },
  );

  assert.equal(result.succeeded, 1);
  assert.equal(
    server.calls.created.length,
    0,
    "a correct declaration must not create a second record",
  );
  assert.deepEqual(server.calls.authorized, [declaredRemoteMediaId]);
  assert.deepEqual(server.calls.completed, [declaredRemoteMediaId]);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.equal(stored.sizeBytes, 2_048);
  assert.equal(stored.idempotencyKey, originalIdempotencyKey);
  assert.equal(stored.remoteMediaId, declaredRemoteMediaId);
  assert.equal(stored.state, "SYNCED");
}

/**
 * A file that cannot be measured is unknown, not wrong. Rewriting a record
 * on an unknown size would replace a real declaration with a guess, so an
 * unmeasurable file leaves the record untouched and the attempt fails
 * honestly instead.
 */
async function testUnmeasurableFileLeavesTheRecordAlone(): Promise<void> {
  const { localId, declaredRemoteMediaId, originalIdempotencyKey } =
    await seedStaleMedia(72_987);

  const server = new ScriptedServer();

  const result = await syncPendingMedia(OWNER,
    server,
    new RecordingUploader(),
    10,
    undefined,
    undefined,
    { sizeBytes: () => null },
  );

  assert.equal(result.succeeded, 1);
  assert.equal(
    server.calls.created.length,
    0,
    "an unmeasurable file does not justify a new record",
  );
  assert.deepEqual(server.calls.authorized, [declaredRemoteMediaId]);

  const stored = await getLocalMediaIntent(OWNER, localId);

  assert.ok(stored);
  assert.equal(
    stored.sizeBytes,
    72_987,
    "an unmeasurable file must not rewrite the declared size",
  );
  assert.equal(stored.idempotencyKey, originalIdempotencyKey);
  assert.equal(stored.remoteMediaId, declaredRemoteMediaId);
  assert.equal(stored.state, "SYNCED");
}

async function main(): Promise<void> {
  await testHappyPath();
  await testRefusedUploadRetries();
  await testRetriesStopAtAttemptThreshold();
  await testFailedVerificationIsNotSynced();
  await testUnexpectedVerifiedStateIsActionRequired();
  await testNonRetryableIsActionRequired();
  await testUnsyncedProductIsActionRequired();
  await testResumeAfterInterruption();
  await testNoCredentialIsPersisted();
  await testAcknowledgedWorkIsNotRepeated();
  await testHeartbeatCannotResurrectSettledWork();
  await testLongUploadIsNotStolenWhileInFlight();
  await testStaleDeclarationIsRedeclaredAgainstTheRealFile();
  await testCorrectedDeclarationConvergesOnOneRecord();
  await testCorrectDeclarationKeepsItsServerRecord();
  await testUnmeasurableFileLeavesTheRecordAlone();

  console.log(
    "M2B MEDIA UPLOAD PIPELINE RUNTIME TESTS PASSED",
  );
}

void main().catch((error) => {
  console.error(
    "M2B MEDIA UPLOAD PIPELINE RUNTIME TESTS FAILED",
  );
  console.error(error);
  process.exitCode = 1;
});