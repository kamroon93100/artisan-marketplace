import type {
  LocalMediaIntent,
  SyncOperation,
} from '../../storage/media-intents';

export type DraftSyncProgress = {
  bytesSent: number;
  totalBytes: number;
};

export type DraftSyncDeps = {
  listMedia: () => Promise<readonly LocalMediaIntent[]>;
  listOperations: (
    localId: string,
  ) => Promise<readonly SyncOperation[]>;
  retryOperation: (operationId: string) => Promise<void>;
  syncProducts: () => Promise<unknown>;
  getDraft: () => Promise<{
    localId: string;
    remoteProductId: string | null;
  } | null>;
  syncMedia: (
    onProgress?: (
      localId: string,
      progress: DraftSyncProgress,
    ) => void,
  ) => Promise<unknown>;
  enqueueAiJob: (
    productId: string,
    media: readonly { mediaId: string; kind: 'IMAGE' | 'AUDIO' }[],
    idempotencyKey: string,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  onWorkingChange?: (working: boolean) => void;
  onProgress?: (
    localId: string,
    progress: DraftSyncProgress,
  ) => void;
};

export type DraftSyncMode = 'sync' | 'retry';

export type DraftSyncResult =
  | { status: 'completed' }
  | { status: 'already-running' }
  | { status: 'no-action-required' }
  | { status: 'no-remote-product' };

/**
 * Runs the existing draft sync workflow from either control.
 *
 * Retry is not a second sync engine: it rearms the actionable local
 * operation first, then runs the same product/media sync path as Sync now.
 * The in-flight guard is synchronous, so two taps cannot both pass the
 * check while the first run is awaiting storage or network work.
 */
export function createDraftSyncRunner(
  deps: DraftSyncDeps,
): (mode: DraftSyncMode) => Promise<DraftSyncResult> {
  let inFlight = false;

  return async function run(
    mode: DraftSyncMode,
  ): Promise<DraftSyncResult> {
    if (inFlight) {
      return { status: 'already-running' };
    }

    inFlight = true;
    deps.onWorkingChange?.(true);

    try {
      if (mode === 'retry') {
        const media = await deps.listMedia();
        const operations = (
          await Promise.all(
            media.map((item) =>
              deps.listOperations(item.localId),
            ),
          )
        ).flat();
        const operation = operations.find(
          (item) => item.state === 'ACTION_REQUIRED',
        );

        if (!operation) {
          await deps.refresh();
          return { status: 'no-action-required' };
        }

        await deps.retryOperation(operation.operationId);
      }

      await deps.syncProducts();

      const draft = await deps.getDraft();

      if (!draft?.remoteProductId) {
        await deps.refresh();
        return { status: 'no-remote-product' };
      }

      await deps.syncMedia(deps.onProgress);

      // After successful media sync, enqueue AI job if there's verified media
      const media = await deps.listMedia();
      const mediaItems = media.filter(
        (item) => item.remoteMediaId && item.remoteState === 'VERIFIED',
      );

      if (mediaItems.length > 0) {
        const mediaRefs = mediaItems.map((item) => ({
          mediaId: item.remoteMediaId!,
          kind: item.kind as 'IMAGE' | 'AUDIO',
        }));

        // Generate idempotency key for this draft's AI job
        const idempotencyKey = `ai-job:${draft.remoteProductId}:${draft.localId}`;

        await deps.enqueueAiJob(
          draft.remoteProductId,
          mediaRefs,
          idempotencyKey,
        );
      }

      await deps.refresh();

      return { status: 'completed' };
    } catch (error) {
      // The sync layers persist their own failure state. Refresh before
      // propagating an unexpected error so the screen never shows stale
      // success while the operation actually failed.
      await deps.refresh();
      throw error;
    } finally {
      inFlight = false;
      deps.onWorkingChange?.(false);
    }
  };
}
