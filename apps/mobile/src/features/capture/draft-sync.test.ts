import type {
  LocalMediaIntent,
  SyncOperation,
} from '../../storage/media-intents';
import {
  createDraftSyncRunner,
  type DraftSyncProgress,
} from './draft-sync';

function assertEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

function assertTrue(
  condition: boolean,
  label: string,
): void {
  if (!condition) {
    throw new Error(label);
  }
}

function aMedia(localId: string): LocalMediaIntent {
  return {
    localId,
    productId: 'local-product',
    kind: 'IMAGE',
    uri: 'file:///synthetic.png',
    contentType: 'image/png',
    sizeBytes: 4386,
    idempotencyKey: `media:${localId}:image`,
    state: 'PENDING_SYNC',
    remoteMediaId: 'remote-media',
    remoteState: 'UPLOADING',
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  };
}

function anOperation(
  operationId: string,
  state: SyncOperation['state'],
): SyncOperation {
  return {
    operationId,
    operationType: 'CREATE_MEDIA_ATTACHMENT',
    aggregateId: 'media-1',
    idempotencyKey: `operation:${operationId}`,
    state,
    attempts: 1,
    lastErrorCode:
      state === 'ACTION_REQUIRED' ? 'FAILED' : null,
    lastErrorMessage: null,
    nextAttemptAt: null,
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  };
}

async function testRetryRearmsBeforeProductAndMediaSync(): Promise<void> {
  const events: string[] = [];
  const progress: {
    localId: string;
    value: DraftSyncProgress;
  }[] = [];
  const working: boolean[] = [];
  let operation = anOperation(
    'op-required',
    'ACTION_REQUIRED',
  );

  const runner = createDraftSyncRunner({
    listMedia: async () => {
      events.push('media-list');
      return [aMedia('media-1')];
    },
    listOperations: async (localId) => {
      events.push(`operations:${localId}`);
      return [operation];
    },
    retryOperation: async (operationId) => {
      events.push(`retry:${operationId}`);
      operation = { ...operation, state: 'PENDING' };
    },
    syncProducts: async () => {
      events.push('products');
    },
    getDraft: async () => ({
      localId: 'local-product',
      remoteProductId: 'remote-product',
    }),
    syncMedia: async (onProgress) => {
      events.push('media');
      onProgress?.('media-1', {
        bytesSent: 2,
        totalBytes: 4,
      });
    },
    enqueueAiJob: async () => {
      events.push('enqueue-ai-job');
    },
    refresh: async () => {
      events.push('refresh');
    },
    onWorkingChange: (value) => {
      working.push(value);
    },
    onProgress: (localId, value) => {
      progress.push({ localId, value });
    },
  });

  const result = await runner('retry');

  assertEqual(
    result.status,
    'completed',
    'retry run completes',
  );
  assertEqual(
    events.join(','),
    'media-list,operations:media-1,retry:op-required,products,media,media-list,refresh',
    'retry rearms before product and media synchronization',
  );
  assertEqual(
    progress.length,
    1,
    'media progress is forwarded to the runner caller',
  );
  assertEqual(
    progress[0]?.localId,
    'media-1',
    'progress identifies the media record',
  );
  assertEqual(
    progress[0]?.value.bytesSent,
    2,
    'progress byte count is forwarded',
  );
  assertEqual(
    progress[0]?.value.totalBytes,
    4,
    'progress total is forwarded',
  );
  assertEqual(
    working.join(','),
    'true,false',
    'working state is set and cleared once',
  );
}

async function testSyncModeDoesNotRearm(): Promise<void> {
  const events: string[] = [];
  let retryCalls = 0;

  const runner = createDraftSyncRunner({
    listMedia: async () => [],
    listOperations: async () => {
      throw new Error(
        'sync mode must not list operations for rearming',
      );
    },
    retryOperation: async () => {
      retryCalls += 1;
    },
    syncProducts: async () => {
      events.push('products');
    },
    getDraft: async () => ({
      localId: 'local-product',
      remoteProductId: 'remote-product',
    }),
    syncMedia: async () => {
      events.push('media');
    },
    enqueueAiJob: async () => {
      events.push('enqueue-ai-job');
    },
    refresh: async () => {
      events.push('refresh');
    },
  });

  const result = await runner('sync');

  assertEqual(
    result.status,
    'completed',
    'sync mode completes',
  );
  assertEqual(
    retryCalls,
    0,
    'sync mode does not invoke the retry/rearm operation',
  );
  assertEqual(
    events.join(','),
    'products,media,refresh',
    'sync mode runs the normal workflow',
  );
}

async function testFailureRefreshesAndReleasesGuard(): Promise<void> {
  let fail = true;
  let mediaCalls = 0;
  let refreshCalls = 0;
  const working: boolean[] = [];

  const runner = createDraftSyncRunner({
    listMedia: async () => [],
    listOperations: async () => [],
    retryOperation: async () => undefined,
    syncProducts: async () => undefined,
    getDraft: async () => ({
      localId: 'local-product',
      remoteProductId: 'remote-product',
    }),
    syncMedia: async () => {
      mediaCalls += 1;

      if (fail) {
        throw new Error('synthetic sync failure');
      }
    },
    enqueueAiJob: async () => undefined,
    refresh: async () => {
      refreshCalls += 1;
    },
    onWorkingChange: (value) => {
      working.push(value);
    },
  });

  let caught: unknown;

  try {
    await runner('sync');
  } catch (error) {
    caught = error;
  }

  assertTrue(
    caught instanceof Error,
    'unexpected sync failure is propagated',
  );
  assertEqual(
    caught instanceof Error ? caught.message : null,
    'synthetic sync failure',
    'the original sync error reaches the caller',
  );
  assertEqual(
    refreshCalls,
    1,
    'failure refreshes persisted state before propagating',
  );
  assertEqual(
    working.join(','),
    'true,false',
    'failure clears the working state',
  );

  fail = false;

  const second = await runner('sync');

  assertEqual(
    second.status,
    'completed',
    'the in-flight guard is released after failure',
  );
  assertEqual(
    mediaCalls,
    2,
    'a later run is allowed to start media work',
  );
  assertEqual(
    refreshCalls,
    2,
    'the later successful run refreshes state',
  );
  assertEqual(
    working.join(','),
    'true,false,true,false',
    'working state is balanced after the retry',
  );
}

async function testConcurrentCallsDoNotDuplicateWork(): Promise<void> {
  let releaseProducts: () => void = () => undefined;
  const productsGate = new Promise<void>((resolve) => {
    releaseProducts = resolve;
  });
  let productCalls = 0;
  let mediaCalls = 0;
  let retryCalls = 0;

  const runner = createDraftSyncRunner({
    listMedia: async () => [aMedia('media-1')],
    listOperations: async () => [
      anOperation('op-required', 'ACTION_REQUIRED'),
    ],
    retryOperation: async () => {
      retryCalls += 1;
    },
    syncProducts: async () => {
      productCalls += 1;
      await productsGate;
    },
    getDraft: async () => ({
      localId: 'local-product',
      remoteProductId: 'remote-product',
    }),
    syncMedia: async () => {
      mediaCalls += 1;
    },
    enqueueAiJob: async () => undefined,
    refresh: async () => undefined,
  });

  const first = runner('sync');
  const second = await runner('retry');

  assertEqual(
    second.status,
    'already-running',
    'a concurrent trigger is rejected',
  );
  assertEqual(
    productCalls,
    1,
    'concurrent trigger does not duplicate product sync',
  );
  assertEqual(
    mediaCalls,
    0,
    'concurrent trigger does not start media sync',
  );
  assertEqual(
    retryCalls,
    0,
    'concurrent retry does not rearm while a run is in flight',
  );

  releaseProducts();

  const firstResult = await first;

  assertEqual(
    firstResult.status,
    'completed',
    'the original run completes',
  );
  assertEqual(
    productCalls,
    1,
    'product sync ran once in total',
  );
  assertEqual(
    mediaCalls,
    1,
    'media sync ran once in total',
  );
}

async function main(): Promise<void> {
  await testRetryRearmsBeforeProductAndMediaSync();
  await testSyncModeDoesNotRearm();
  await testFailureRefreshesAndReleasesGuard();
  await testConcurrentCallsDoNotDuplicateWork();

  console.log('DRAFT SYNC RUNNER TESTS PASSED');
}

void main().catch((error) => {
  console.error('DRAFT SYNC RUNNER TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
