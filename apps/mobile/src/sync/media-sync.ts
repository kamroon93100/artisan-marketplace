import type { LocalMediaIntent } from '../storage/media-intents';
import { getLocalProductDraft } from '../storage/product-drafts';
import { MediaSyncTransportError } from './media-sync-contract';
import type {
  CreateMediaAttachmentRequest,
  MediaSyncTransport,
  MediaUploadDescriptor,
} from './media-sync-contract';
import { safeFailureMessage } from '../security/redact-secrets';
import type { ByteUploader } from './byte-uploader';
import {
  isUsableSize,
  unmeasuredLocalFile,
} from './local-file-size';
import type { LocalFileSizeProbe } from './local-file-size';
import {
  claimSyncOperation,
  getLocalMediaIntent,
  heartbeatSyncOperation,
  listPendingSyncOperations,
  markMediaSynced,
  markSyncActionRequired,
  markSyncRetry,
  recordMediaRemoteProgress,
  recoverStaleSyncOperations,
  redeclareLocalMediaIntent,
} from '../storage/sync-operations';

export type MediaSyncResult = {
  processed: number;
  succeeded: number;
  retried: number;
  actionRequired: number;
};

/**
 * How long an upload may sit claimed before another attempt may take it
 * over. Long enough that a healthy in-progress upload is never stolen,
 * short enough that a killed app does not strand the artisan's media.
 */
const IN_FLIGHT_STALE_MS = 5 * 60 * 1000;

/**
 * How often a live upload refreshes its claim.
 *
 * Comfortably inside the stale window so several heartbeats can be
 * missed before a live upload becomes reclaimable, and not so often
 * that the database is written for every progress tick.
 */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/**
 * Upload authorizations are short-lived. A retry re-authorizes first, so
 * asking for a modest window avoids burning a fresh signature on every
 * queue poll while still tolerating a slow connection.
 */
const UPLOAD_TTL_SECONDS = 300;

/**
 * How many times one media upload may be attempted before it is handed
 * back to the artisan.
 *
 * A retryable failure is usually transient, so a bounded number of
 * attempts with exponential backoff recovers on its own from a weak or
 * interrupted connection. Without a ceiling, a failure that never
 * clears keeps retrying forever: the operation stays PENDING, its
 * backoff grows to the cap, and it never reaches a state the artisan
 * can see or act on. The media record is not lost by escalating, it
 * stops being invisible, and the artisan can re-arm it.
 */
export const MAX_SYNC_ATTEMPTS = 5;

/**
 * The reason persisted when the attempt budget is exhausted.
 *
 * Kept distinct from the underlying transport code so the cause is
 * queryable, while the message still carries what actually went wrong
 * so the artisan is not left with a bare internal label.
 */
const RETRY_LIMIT_EXCEEDED = 'RETRY_LIMIT_EXCEEDED';

function backoff(attempts: number): string {
  const delayMs =
    Math.min(2 ** Math.max(attempts - 1, 0), 32) * 1000;

  return new Date(Date.now() + delayMs).toISOString();
}

/**
 * Explains an exhausted attempt budget in terms the artisan can act on.
 *
 * The underlying failure is already redacted by the caller, so it is
 * safe to persist alongside the count.
 */
function retryLimitMessage(
  attempts: number,
  lastFailure: string,
): string {
  return `This media could not be uploaded after ${attempts} attempts. Last error: ${lastFailure}`;
}

function toRequest(
  intent: LocalMediaIntent,
  remoteProductId: string,
): CreateMediaAttachmentRequest {
  return {
    productId: remoteProductId,
    kind: intent.kind,
    contentType: intent.contentType,
    sizeBytes: intent.sizeBytes,
    idempotencyKey: intent.idempotencyKey,
  };
}

/**
 * The idempotency key for a record that is being re-declared against a
 * different file length.
 *
 * Derived from the corrected size rather than from the previous key, so the
 * same correction always lands on the same logical request: re-measuring an
 * already-corrected file reuses its server record instead of creating a
 * second one, and a file that genuinely changed length gets the distinct
 * request its new declaration needs.
 *
 * The key cannot collide with the original because the original is derived
 * from the capture (`media:<localId>:image`) and this is derived from the
 * operation, so the two are different strings for the same record.
 */
function redeclaredIdempotencyKey(
  localId: string,
  sizeBytes: number,
): string {
  return `${localId}:CREATE_MEDIA_ATTACHMENT:size=${sizeBytes}`;
}

/**
 * Reconciles a record's declared size with the file that is actually on the
 * device, before any server call is made.
 *
 * A declared size is a claim captured at one moment, while the file on the
 * device is what will actually be uploaded. When the two disagree, the
 * claim is wrong in a way the server will refuse to accept: media
 * declarations are immutable, so the wrong size replays onto the same server
 * record forever, and every retry would spend an attempt re-uploading bytes
 * to an object that can never verify. Recovering from that means abandoning
 * the record that was declared with the wrong size, which is why the remote
 * binding is cleared rather than reused.
 *
 * The correction is local-only. The old server record and object are left
 * untouched rather than being deleted or overwritten, so the artisan's
 * earlier attempt stays inspectable and nothing that was written is silently
 * replaced.
 *
 * The sync result is deliberately not a verified state: the record has only
 * been re-declared. It becomes verified when the server confirms the object
 * it stored, which is the same bar as any other upload.
 */
async function resolveMeasuredDeclaration(
  deps: MediaSyncDeps,
  intent: LocalMediaIntent,
): Promise<LocalMediaIntent> {
  const measured = deps.sizeProbe.sizeBytes(intent.uri);

  // An unmeasurable file is not evidence that the declaration is wrong,
  // so an unknown size is left alone rather than being guessed at.
  if (!isUsableSize(measured) || measured === intent.sizeBytes) {
    return intent;
  }

  const idempotencyKey = redeclaredIdempotencyKey(
    intent.localId,
    measured,
  );

  await redeclareLocalMediaIntent(
    intent.localId,
    idempotencyKey,
    measured,
  );

  return {
    ...intent,
    sizeBytes: measured,
    idempotencyKey,
    remoteMediaId: null,
    remoteState: null,
  };
}

type MediaSyncDeps = {
  transport: MediaSyncTransport;
  uploader: ByteUploader;
  /**
   * Measures the file that is about to be uploaded. Wired to the device
   * filesystem in the app; omitted where there is no filesystem, which
   * leaves a record's declaration exactly as it was recorded.
   */
  sizeProbe: LocalFileSizeProbe;
  onProgress?: (
    localId: string,
    progress: { bytesSent: number; totalBytes: number },
  ) => void;
  /**
   * Overrides the heartbeat cadence. Exists so a test can drive
   * heartbeats deterministically instead of waiting out the real
   * interval; production never sets it.
   */
  heartbeatIntervalMs?: number;
};

/**
 * Drives one media record to a verified state on the server.
 *
 * Every step is idempotent on the server, so this is safe to re-run after
 * any interruption, and safe to run twice concurrently. Progress is
 * persisted as it happens, so a restarted app resumes rather than
 * starting blind. Nothing reaches a verified local state on the client's
 * say-so alone: only the server's verification result decides that.
 */
async function uploadMedia(
  deps: MediaSyncDeps,
  intent: LocalMediaIntent,
  operationId: string,
  remoteProductId: string,
): Promise<void> {
  const { transport, uploader } = deps;
  const heartbeatIntervalMs =
    deps.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;

  // Measured before the first server call, so a record that is going to be
  // re-declared never reaches the server in its wrong form.
  const measured = await resolveMeasuredDeclaration(deps, intent);

  // A media record that already exists is reused rather than recreated.
  // Creation is keyed by the same idempotency key, so this is safe even
  // when the previous attempt never saw the response.
  const mediaId =
    measured.remoteMediaId ??
    (
      await transport.createMediaAttachment(
        toRequest(measured, remoteProductId),
      )
    ).mediaId;

  // The server allocates the object key and owns it. Re-authorizing on
  // every attempt is what makes an expired or lost URL self-healing.
  const authorization =
    await transport.authorizeUpload(
      mediaId,
      UPLOAD_TTL_SECONDS,
    );

  await recordMediaRemoteProgress(
    measured.localId,
    mediaId,
    authorization.remoteState,
  );

  const started = await transport.startUpload(
    mediaId,
    UPLOAD_TTL_SECONDS,
  );

  await recordMediaRemoteProgress(
    measured.localId,
    mediaId,
    started.remoteState,
  );

  const descriptor: MediaUploadDescriptor =
    started.upload;

  // A large upload on a slow connection can outlive the stale-recovery
  // window. The heartbeat proves the operation is still live, so a
  // concurrent run does not reclaim and restart it mid-write. It is
  // written from the progress callback rather than on a timer because
  // that is the only signal available while bytes are moving.
  //
  // The first tick always heartbeats: the claim was written before the
  // upload began, so it is the stalest it will ever be at the moment the
  // first bytes start moving.
  let lastHeartbeatAt = 0;

  await uploader.upload({
    uri: measured.uri,
    url: descriptor.url,
    method: descriptor.method,
    headers: descriptor.headers,
    onProgress: (progress) => {
      const now = Date.now();

      if (now - lastHeartbeatAt >= heartbeatIntervalMs) {
        lastHeartbeatAt = now;

        // The write is intentionally not awaited: the progress
        // callback must not block the byte stream, and a failed
        // heartbeat is recoverable because the next one retries.
        void heartbeatSyncOperation(operationId).catch(
          () => undefined,
        );
      }

      deps.onProgress?.(measured.localId, progress);
    },
  });

  // Reporting completion is a claim, not a conclusion. The server
  // verifies the stored object itself and returns what it observed.
  const completion = await transport.completeUpload(
    mediaId,
  );

  if (!completion.verified) {
    // Record what the server actually observed before deciding the
    // outcome, so the local record does not keep claiming the upload is
    // still in progress after the server rejected it.
    await recordMediaRemoteProgress(
      measured.localId,
      mediaId,
      completion.remoteState,
    );

    // The bytes did not match what the record declared. This is
    // recoverable: the record stays on the same object key and the next
    // attempt can write it again.
    throw new MediaSyncTransportError(
      completion.failureMessage ??
        'The uploaded media did not match the recorded media.',
      completion.failureCode ??
        'MEDIA_VERIFICATION_FAILED',
      true,
    );
  }

  if (completion.remoteState !== 'VERIFIED') {
    await recordMediaRemoteProgress(
      measured.localId,
      mediaId,
      completion.remoteState,
    );

    // Verified, but not in the state the client expects. Do not record a
    // verified local state on a state the client does not understand.
    throw new MediaSyncTransportError(
      'The API reported a verified upload in an unexpected state.',
      'INVALID_SERVER_RESPONSE',
      false,
    );
  }

  await recordMediaRemoteProgress(
    measured.localId,
    mediaId,
    completion.remoteState,
  );

  await markMediaSynced(
    measured.localId,
    operationId,
    mediaId,
  );
}

export async function syncPendingMedia(
  transport: MediaSyncTransport,
  uploader: ByteUploader,
  limit = 10,
  onProgress?: MediaSyncDeps['onProgress'],
  heartbeatIntervalMs?: number,
  sizeProbe: LocalFileSizeProbe = unmeasuredLocalFile,
): Promise<MediaSyncResult> {
  const deps: MediaSyncDeps = {
    transport,
    uploader,
    sizeProbe,
    onProgress,
    heartbeatIntervalMs,
  };

  // Recover work stranded by a previous run before selecting new work,
  // otherwise an interrupted upload would never be retried.
  await recoverStaleSyncOperations(
    new Date(Date.now() - IN_FLIGHT_STALE_MS).toISOString(),
  );

  const operations = await listPendingSyncOperations(limit);

  const result: MediaSyncResult = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    actionRequired: 0,
  };

  for (const operation of operations) {
    result.processed += 1;

    const claimed = await claimSyncOperation(
      operation.operationId,
    );

    if (!claimed) {
      continue;
    }

    const intent = await getLocalMediaIntent(
      claimed.aggregateId,
    );

    if (!intent) {
      await markSyncActionRequired(
        claimed.aggregateId,
        claimed.operationId,
        'LOCAL_DATA_MISSING',
        'The local media intent no longer exists.',
      );

      result.actionRequired += 1;
      continue;
    }

    const draft = await getLocalProductDraft(
      intent.productId,
    );

    if (!draft?.remoteProductId) {
      await markSyncActionRequired(
        intent.localId,
        claimed.operationId,
        'PRODUCT_NOT_SYNCED',
        'The product must be synchronized before its media can upload.',
      );

      result.actionRequired += 1;
      continue;
    }

    try {
      await uploadMedia(
        deps,
        intent,
        claimed.operationId,
        draft.remoteProductId,
      );

      result.succeeded += 1;
    } catch (error) {
      // Whatever the layer, the text that reaches the device database
      // is untrusted and may embed a presigned URL, so it is redacted
      // before it is persisted or shown to the artisan.
      const message = safeFailureMessage(
        error,
        'The media could not be uploaded.',
      );

      if (
        error instanceof MediaSyncTransportError &&
        error.retryable
      ) {
        /**
         * The attempt budget is finite. Below the threshold the
         * failure is still treated as transient and the next attempt
         * is scheduled with exponential backoff. At the threshold the
         * operation stops being retried and becomes explicit, because
         * a failure that has survived every attempt will not clear
         * itself and would otherwise be retried forever without ever
         * reaching a state the artisan can see.
         */
        if (claimed.attempts >= MAX_SYNC_ATTEMPTS) {
          await markSyncActionRequired(
            intent.localId,
            claimed.operationId,
            RETRY_LIMIT_EXCEEDED,
            retryLimitMessage(
              claimed.attempts,
              message,
            ),
          );

          result.actionRequired += 1;
          continue;
        }

        await markSyncRetry(
          intent.localId,
          claimed.operationId,
          error.code,
          message,
          backoff(claimed.attempts),
        );

        result.retried += 1;
        continue;
      }

      const code =
        error instanceof MediaSyncTransportError
          ? error.code
          : 'SYNC_FAILED';

      await markSyncActionRequired(
        intent.localId,
        claimed.operationId,
        code,
        message,
      );

      result.actionRequired += 1;
    }
  }

  return result;
}
