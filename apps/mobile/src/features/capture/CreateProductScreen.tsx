import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import {
  createLocalMediaIntent,
  listLocalMediaIntents,
} from '@/storage/media-intents';
import {
  getLocalProductDraft,
  type LocalProductDraft,
  updateLocalProductDraft,
} from '@/storage/product-drafts';
import {
  listSyncOperationsForAggregate,
  markSyncActionRequired,
  retrySyncOperation,
} from '@/storage/sync-operations';

import { DraftStatus } from './DraftStatus';
import { createDraftSyncRunner } from './draft-sync';
import { ReviewProductScreen } from '../review/ReviewProductScreen';
import { syncPendingMedia } from '@/sync/media-sync';
import { syncPendingProducts } from '@/sync/product-sync';
import { HttpProductSyncTransport } from
  '@/network/product-sync-transport';
import { HttpMediaSyncTransport } from '@/network/media-sync-transport';
import { HttpAiJobEnqueueTransport } from '@/network/ai-job-enqueue-transport';
import { ExpoFileByteUploader } from '@/network/expo-file-byte-uploader';
import { ExpoFileSizeProbe } from '@/network/expo-file-size-probe';
import { PhotoCapture } from './PhotoCapture';
import { VoiceRecorder } from './VoiceRecorder';

type Props = {
  draftId: string;
  /** The authenticated artisan who owns the draft and its queued work. */
  ownerId: string;
  onBack: () => void;
};

type UploadProgressMap = Record<
  string,
  { bytesSent: number; totalBytes: number }
>;

export function CreateProductScreen({
  draftId,
  ownerId,
  onBack,
}: Props) {
  const safeAreaInsets = useSafeAreaInsets();
  const [draft, setDraft] =
    useState<LocalProductDraft | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [hasAttention, setHasAttention] = useState(false);
  const [working, setWorking] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressMap>({});
  const [reviewingRemoteId, setReviewingRemoteId] =
    useState<string | null>(null);

  // Only one upload runs at a time, so the most recent progress entry is
  // the one the artisan is waiting on.
  const activeUpload = useMemo(() => {
    const entries = Object.values(uploadProgress);

    return entries.length > 0
      ? entries[entries.length - 1]!
      : null;
  }, [uploadProgress]);

  const refresh = useCallback(async (): Promise<void> => {
    const [nextDraft, media] =
      await Promise.all([
        getLocalProductDraft(ownerId, draftId),
        listLocalMediaIntents(ownerId, draftId),
      ]);

    const operations = (
      await Promise.all(
        media.map((item) =>
          listSyncOperationsForAggregate(
            ownerId,
            item.localId,
          ),
        ),
      )
    ).flat();

    setDraft(nextDraft);
    setPhotoUri(
      media.find((item) => item.kind === 'IMAGE')?.uri ?? null,
    );
    setVoiceUri(
      media.find((item) => item.kind === 'AUDIO')?.uri ?? null,
    );
    setSyncing(
      operations.some((item) => item.state === 'IN_FLIGHT'),
    );
    setHasAttention(
      operations.some(
        (item) => item.state === 'ACTION_REQUIRED',
      ),
    );
  }, [draftId, ownerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runDraftSync = useMemo(
    () =>
      createDraftSyncRunner({
        listMedia: () =>
          listLocalMediaIntents(ownerId, draftId),
        listOperations: (localId) =>
          listSyncOperationsForAggregate(ownerId, localId),
        retryOperation: (operationId) =>
          retrySyncOperation(ownerId, operationId),
        syncProducts: async () => {
          const synced = await syncPendingProducts(
            ownerId,
            new HttpProductSyncTransport(),
          );
          // The product has its server id now; show the Review button without
          // waiting for media upload and AI enqueue to finish.
          await refresh();
          return synced;
        },
        getDraft: async () => {
          const draft = await getLocalProductDraft(ownerId, draftId);
          return draft
            ? { localId: draft.localId, remoteProductId: draft.remoteProductId }
            : null;
        },
        syncMedia: (onProgress) =>
          syncPendingMedia(
            ownerId,
            new HttpMediaSyncTransport(),
            new ExpoFileByteUploader(),
            10,
            onProgress,
            undefined,
            new ExpoFileSizeProbe(),
          ),
        enqueueAiJob: async (productId, mediaRefs, idempotencyKey) => {
          await new HttpAiJobEnqueueTransport().enqueue(
            productId,
            { media: mediaRefs },
            idempotencyKey,
          );
        },
        refresh,
        onWorkingChange: setWorking,
        onProgress: (localId, progress) => {
          setUploadProgress((current) => ({
            ...current,
            [localId]: progress,
          }));
        },
      }),
    [draftId, ownerId, refresh],
  );

  function startDraftSync(mode: 'sync' | 'retry'): void {
    // The runner refreshes persisted state before rethrowing a sync error,
    // so the screen must not also produce an unhandled rejection.
    void runDraftSync(mode).catch(() => undefined);
  }

  async function savePhoto(
    asset: ImagePicker.ImagePickerAsset,
  ): Promise<void> {
    setWorking(true);

    try {
      const extension =
        asset.fileName?.split('.').pop() ?? 'jpg';
      const localId = ['media', draftId, 'image', Date.now(), Math.random().toString(36).slice(2, 8)].join('-');
      const destination = new File(
        Paths.document,
        `product-${draftId}-photo-${Date.now()}.${extension}`,
      );

      const source = new File(asset.uri);
      source.copy(destination);

      await createLocalMediaIntent(ownerId, {
        localId,
        productId: draftId,
        kind: 'IMAGE',
        uri: destination.uri,
        contentType: asset.mimeType ?? 'image/jpeg',
        /**
         * The size of the file this record will upload, which is the copy
         * the app owns. The picker's `fileSize` describes a different URI
         * and is not a measurement of these bytes, so it is never used as
         * the declaration. A copy whose size cannot be read is declared as
         * 0 so the record fails validation outright, instead of claiming a
         * size that would only be discovered to be wrong after uploading.
         */
        sizeBytes: destination.size ?? 0,
        idempotencyKey: `media:${localId}:image`,
      });

      await updateLocalProductDraft(ownerId, draftId, {
        state: 'PENDING_SYNC',
      });

      await refresh();
    } finally {
      setWorking(false);
    }
  }

  async function saveVoice(uri: string): Promise<void> {
    setWorking(true);

    try {
      const localId = ['media', draftId, 'audio', Date.now(), Math.random().toString(36).slice(2, 8)].join('-');

      const file = new File(uri);

      await createLocalMediaIntent(ownerId, {
        localId,
        productId: draftId,
        kind: 'AUDIO',
        uri,
        contentType: 'audio/mp4',
        sizeBytes: file.size ?? 0,
        idempotencyKey: `media:${localId}:audio`,
      });

      await updateLocalProductDraft(ownerId, draftId, {
        state: 'PENDING_SYNC',
      });

      await refresh();
    } finally {
      setWorking(false);
    }
  }

  if (reviewingRemoteId) {
    return (
      <ReviewProductScreen
        remoteProductId={reviewingRemoteId}
        onBack={() => {
          setReviewingRemoteId(null);
          void refresh();
        }}
      />
    );
  }

  if (!draft) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: safeAreaInsets.top + Spacing.two },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>Back</Text>
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.title}>Create Product</Text>
          <DraftStatus
            state={draft.state}
            syncing={syncing}
            hasAttention={hasAttention}
            uploading={activeUpload}
          />
        </View>
      </View>

      <Text style={styles.subtitle}>
        Start with a photo, then record how you describe it.
        Everything is saved on this phone.
      </Text>

      <PhotoCapture
        uri={photoUri}
        onCaptured={savePhoto}
      />

      {photoUri ? (
        <VoiceRecorder
          uri={voiceUri}
          onRecorded={saveVoice}
        />
      ) : (
        <View style={styles.locked}>
          <Text style={styles.lockedTitle}>
            Add a photo first
          </Text>
          <Text style={styles.lockedText}>
            Voice description becomes available after the
            product photo is saved.
          </Text>
        </View>
      )}

      {working ? (
        <View style={styles.saving}>
          <ActivityIndicator size="small" />
          <Text style={styles.savingText}>Saving on this phone�</Text>
        </View>
      ) : null}

      {/*
        * Review is offered only once the product exists on the server, and
        * it is a separate screen rather than another step here: reviewing
        * and publishing read and write canonical state, so a screen whose
        * job is capture should not also be the place where a publication
        * decision is made.
        */}
      {draft.remoteProductId ? (
        <Pressable
          onPress={() =>
            setReviewingRemoteId(draft.remoteProductId)
          }
          style={styles.reviewButton}
          accessibilityRole="button">
          <Text style={styles.reviewButtonText}>
            Review this product
          </Text>
        </Pressable>
      ) : null}


      <Pressable
        onPress={() => {
          startDraftSync('sync');
        }}
        disabled={working}
        style={styles.devButton}>
        <Text style={styles.devButtonText}>
          Sync now
        </Text>
      </Pressable>

      {__DEV__ && process.env.EXPO_PUBLIC_SHOW_DEV_TOOLS === '1' && !hasAttention ? (
        <Pressable
          onPress={async () => {
            const media =
              await listLocalMediaIntents(ownerId, draftId);

            const mediaItem =
              media.find((item) => item.kind === 'IMAGE') ??
              media.find((item) => item.kind === 'AUDIO');

            const operations = mediaItem
              ? await listSyncOperationsForAggregate(
                  ownerId,
                  mediaItem.localId,
                )
              : [];
            const operation = operations.find(
              (item) => item.aggregateId === mediaItem?.localId,
            );

            if (mediaItem && operation) {
              await markSyncActionRequired(
                ownerId,
                mediaItem.localId,
                operation.operationId,
                'SIMULATED_FAILURE',
                'Simulated M1 sync failure.',
              );

              await refresh();
            }
          }}
          style={styles.devButton}>
          <Text style={styles.devButtonText}>
            Simulate sync failure
          </Text>
        </Pressable>
      ) : null}
      {hasAttention ? (
        <View style={styles.attention}>
          <Text style={styles.attentionTitle}>
            Needs attention
          </Text>
          <Text style={styles.attentionText}>
            A sync operation needs another attempt.
          </Text>
          <Pressable
            onPress={() => {
              startDraftSync('retry');
            }}
            disabled={working}
            style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  attention: {
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Spacing.three,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  attentionText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
  attentionTitle: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '700',
  },
  back: {
    color: Colors.light.text,
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.three,
  },
  headerCopy: {
    flex: 1,
    gap: Spacing.two,
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  locked: {
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Spacing.three,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  lockedText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
  lockedTitle: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '700',
  },
  devButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  devButtonText: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },  retry: {
    alignSelf: 'flex-start',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  retryText: {
    color: Colors.light.text,
    fontWeight: '700',
  },
  reviewButton: {
    alignItems: 'center',
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.two,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.four,
  },
  reviewButtonText: {
    color: Colors.light.text,
    fontSize: 15,
    fontWeight: '600',
  },
  saving: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  savingText: {
    color: Colors.light.textSecondary,
    fontSize: 13,
  },
  subtitle: {
    color: Colors.light.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  title: {
    color: Colors.light.text,
    fontSize: 28,
    fontWeight: '800',
  },
});














