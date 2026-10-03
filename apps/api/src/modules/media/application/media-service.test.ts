import type { MediaKind } from '@artisan-marketplace/contracts';
import { CatalogService } from '../../catalog/application/catalog-service.js';
import { InMemoryCatalogRepository } from '../../catalog/infrastructure/in-memory-catalog-repository.js';
import { InMemoryMediaRepository } from '../infrastructure/in-memory-media-repository.js';
import { MediaService } from './media-service.js';
import type { MediaRepository } from './media-repository.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type {
  ObjectStorage,
  PresignedUpload,
  StoredObjectMetadata,
} from '../../../shared/storage/object-storage.js';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const BYTES = 4096;

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

async function expectAppError(
  label: string,
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      error.code !== code
    ) {
      throw new Error(
        `${label}: expected AppError ${code}, received ${String(error)}.`,
      );
    }

    return;
  }

  throw new Error(
    `${label}: expected AppError ${code}, but no error was raised.`,
  );
}

/**
 * Captures the raised AppError so a test can assert on its details, not
 * only on its code.
 */
async function captureAppError(
  label: string,
  run: () => Promise<unknown>,
  code: string,
): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      error.code !== code
    ) {
      throw new Error(
        `${label}: expected AppError ${code}, received ${String(error)}.`,
      );
    }

    return error;
  }

  throw new Error(
    `${label}: expected AppError ${code}, but no error was raised.`,
  );
}

/**
 * Counts writes so a test can prove a rejected request never reached the
 * repository, rather than only observing that an error surfaced.
 */
function countCreates(
  inner: InMemoryMediaRepository,
): {
  repository: MediaRepository;
  creates: () => number;
} {
  let creates = 0;

  return {
    repository: {
      create: (input) => {
        creates += 1;

        return inner.create(input);
      },
      findByIdempotencyKey: (
        productId: string,
        idempotencyKey: string,
      ) => inner.findByIdempotencyKey(productId, idempotencyKey),
      getById: (id) => inner.getById(id),
      transitionState: (id, to, patch) =>
        inner.transitionState(id, to, patch),
    },
    creates: () => creates,
  };
}

/**
 * In-memory object storage that records the presigned authorizations it
 * issued and the bytes a client actually wrote, so the tests assert on
 * what the server observed rather than on what the client claimed.
 */
class FakeObjectStorage implements ObjectStorage {
  readonly objects = new Map<
    string,
    StoredObjectMetadata
  >();
  readonly issued: Array<{
    objectKey: string;
    contentType: string;
    expiresInSeconds: number | undefined;
  }> = [];

  async createPresignedPutUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number | undefined;
  }): Promise<PresignedUpload> {
    this.issued.push({ ...input });

    return {
      url: `https://storage.test/${input.objectKey}?signature=fake`,
      headers: { 'content-type': input.contentType },
      expiresInSeconds: input.expiresInSeconds ?? 900,
    };
  }

  async headObject(
    objectKey: string,
  ): Promise<StoredObjectMetadata | null> {
    return this.objects.get(objectKey) ?? null;
  }

  put(
    objectKey: string,
    metadata: StoredObjectMetadata,
  ): void {
    this.objects.set(objectKey, metadata);
  }
}

function putMatchingObject(
  objectKey: string,
  storage: FakeObjectStorage,
): void {
  storage.put(objectKey, {
    contentLength: BYTES,
    contentType: 'image/jpeg',
    etag: '"etag-1"',
  });
}

async function buildService(): Promise<{
  service: MediaService;
  storage: FakeObjectStorage;
  productId: string;
}> {
  const catalogService = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const product = await catalogService.createDraft({
    ownerId: OWNER_ID,
    title: 'Test basket',
  });

  const storage = new FakeObjectStorage();

  return {
    service: new MediaService(
      new InMemoryMediaRepository(),
      catalogService,
      storage,
    ),
    storage,
    productId: product.product.id,
  };
}

/**
 * A harness that also exposes the repository, so tests can assert on
 * the persisted record and inject the race the in-memory repository
 * would not otherwise produce.
 */
async function createHarness(label: string): Promise<{
  service: MediaService;
  catalogService: CatalogService;
  storage: FakeObjectStorage;
  repository: InMemoryMediaRepository;
  productId: string;
}> {
  const catalogService = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const product = await catalogService.createDraft({
    ownerId: OWNER_ID,
    title: `Harness ${label}`,
  });

  const storage = new FakeObjectStorage();
  const repository = new InMemoryMediaRepository();

  return {
    service: new MediaService(
      repository,
      catalogService,
      storage,
    ),
    catalogService,
    storage,
    repository,
    productId: product.product.id,
  };
}

/**
 * Models the interleaving where a second caller has already completed
 * the upload and verified the record by the time the first caller's
 * compare-and-set runs. The in-memory repository is serialized, so the
 * race is injected here rather than depended upon.
 */
function wrapRacingRepository(
  inner: InMemoryMediaRepository,
): MediaRepository {
  return {
    create: (input) => inner.create(input),
    findByIdempotencyKey: (
      productId: string,
      idempotencyKey: string,
    ) => inner.findByIdempotencyKey(productId, idempotencyKey),
    getById: (id) => inner.getById(id),
    transitionState: async (id, to, patch) => {
      const applied = await inner.transitionState(
        id,
        to,
        patch,
      );

      // Only the arrival edge races: by the time the loser's write
      // runs, a winner has verified the record.
      if (to === 'UPLOADED' && applied) {
        return null;
      }

      return applied;
    },
  };
}

/**
 * Models the interleaving where two genuinely concurrent first-time
 * requests both look up the key and both find nothing, so both attempt
 * to create. The loser's insert is swallowed by the unique constraint
 * and the repository hands back the winner's row instead, which
 * declares different metadata. The in-memory repository is serialized
 * and would never produce this on its own, so it is injected here
 * rather than depended upon.
 */
function wrapConflictingCreateRepository(
  inner: InMemoryMediaRepository,
  winner: {
    kind: MediaKind;
    contentType: string;
    sizeBytes: number;
  },
): MediaRepository {
  return {
    create: (input) =>
      inner.create({
        ...input,
        kind: winner.kind,
        contentType: winner.contentType,
        sizeBytes: winner.sizeBytes,
      }),
    findByIdempotencyKey: () => Promise.resolve(null),
    getById: (id) => inner.getById(id),
    transitionState: (id, to, patch) =>
      inner.transitionState(id, to, patch),
  };
}

async function createAttachment(
  service: MediaService,
  productId: string,
  idempotencyKey: string,
): Promise<string> {
  const result =
    await service.requestAttachment({
      productId,
      kind: 'IMAGE',
      contentType: 'image/jpeg',
      sizeBytes: BYTES,
      idempotencyKey,
      actorId: OWNER_ID,
    });

  return result.attachment.id;
}

async function testFullLifecycle(): Promise<void> {
  const { service, storage, productId } =
    await buildService();

  const mediaId = await createAttachment(
    service,
    productId,
    'media-key-1',
  );

  const repeated = await service.requestAttachment({
    productId,
    kind: 'IMAGE',
    contentType: 'image/jpeg',
    sizeBytes: BYTES,
    idempotencyKey: 'media-key-1',
    actorId: OWNER_ID,
  });

  assertEqual(
    repeated.created,
    false,
    'repeated creation is deduplicated',
  );
  assertEqual(
    repeated.attachment.id,
    mediaId,
    'deduplicated creation returns one record',
  );

  const authorized = await service.authorizeUpload(
    mediaId,
    OWNER_ID,
  );

  assertEqual(
    authorized.attachment.state,
    'UPLOAD_AUTHORIZED',
    'authorization moves to UPLOAD_AUTHORIZED',
  );
  assertEqual(
    authorized.upload.method,
    'PUT',
    'upload descriptor uses PUT',
  );
  assertEqual(
    authorized.upload.expiresInSeconds,
    300,
    'upload authorization is short-lived',
  );
  assertEqual(
    authorized.upload.objectKey,
    `media/${OWNER_ID}/${productId}/${mediaId}`,
    'object key is server-owned and object-specific',
  );

  // Reporting completion before any bytes exist must not verify.
  const premature = await service.completeUpload(
    mediaId,
    OWNER_ID,
  );

  assertEqual(
    premature.verification.verified,
    false,
    'completion without bytes does not verify',
  );
  assertEqual(
    premature.verification.failure?.code,
    'OBJECT_NOT_FOUND',
    'premature completion reports the missing object',
  );
  assertEqual(
    premature.attachment.state,
    'FAILED',
    'premature completion is an explicit state',
  );

  const started = await service.startUpload(mediaId, OWNER_ID);

  assertEqual(
    started.attachment.state,
    'UPLOADING',
    'start moves to UPLOADING',
  );

  putMatchingObject(started.upload.objectKey, storage);

  const completed = await service.completeUpload(
    mediaId,
    OWNER_ID,
  );

  assertEqual(
    completed.verification.verified,
    true,
    'completion after a matching upload verifies',
  );
  assertEqual(
    completed.attachment.state,
    'VERIFIED',
    'verification reaches VERIFIED',
  );
  assertEqual(
    completed.verification.observedContentLength,
    BYTES,
    'verification reports the server-observed length',
  );
  assertEqual(
    completed.verification.observedEtag,
    '"etag-1"',
    'verification reports the server-observed etag',
  );

  // A verified object must never be handed out for overwrite.
  await expectAppError(
    'authorize a verified record',
    () => service.authorizeUpload(mediaId, OWNER_ID),
    'CONFLICT',
  );
  await expectAppError(
    'start upload on a verified record',
    () => service.startUpload(mediaId, OWNER_ID),
    'CONFLICT',
  );
}

async function testRejectsWrongBytes(): Promise<void> {
  const { service, storage, productId } =
    await buildService();

  const mediaId = await createAttachment(
    service,
    productId,
    'media-key-wrong',
  );

  const authorized = await service.authorizeUpload(
    mediaId,
    OWNER_ID,
  );

  await service.startUpload(mediaId, OWNER_ID);

  // The client claims success, but the stored object disagrees.
  storage.put(authorized.upload.objectKey, {
    contentLength: BYTES / 2,
    contentType: 'image/jpeg',
    etag: '"truncated"',
  });

  const completed = await service.completeUpload(
    mediaId,
    OWNER_ID,
  );

  assertEqual(
    completed.verification.verified,
    false,
    'a truncated object never verifies',
  );
  assertEqual(
    completed.verification.failure?.code,
    'OBJECT_SIZE_MISMATCH',
    'truncated object reports a size mismatch',
  );
  assertEqual(
    completed.attachment.state,
    'FAILED',
    'mismatched object is an explicit failure state',
  );

  // FAILED is recoverable on the same logical record and object key.
  const resumed = await service.startUpload(mediaId, OWNER_ID);

  assertEqual(
    resumed.attachment.state,
    'UPLOADING',
    'a failed upload can resume on the same record',
  );
  assertEqual(
    resumed.upload.objectKey,
    authorized.upload.objectKey,
    'resume reuses the same object key',
  );

  putMatchingObject(resumed.upload.objectKey, storage);

  const recovered = await service.completeUpload(
    mediaId,
    OWNER_ID,
  );

  assertEqual(
    recovered.attachment.state,
    'VERIFIED',
    'a correct re-upload verifies the same record',
  );
}

async function testAuthorizationIsIdempotent(): Promise<void> {
  const { service, storage, productId } =
    await buildService();

  const mediaId = await createAttachment(
    service,
    productId,
    'media-key-idem',
  );

  const first = await service.authorizeUpload(mediaId, OWNER_ID);
  const second = await service.authorizeUpload(mediaId, OWNER_ID);
  const third = await service.authorizeUpload(mediaId, OWNER_ID);

  assertEqual(
    first.upload.objectKey,
    second.upload.objectKey,
    'repeat authorization keeps one object key',
  );
  assertEqual(
    second.upload.objectKey,
    third.upload.objectKey,
    'repeat authorization stays stable',
  );
  assertEqual(
    storage.issued.length,
    3,
    'each authorization issues its own short-lived URL',
  );
  assertEqual(
    storage.issued[1]?.expiresInSeconds,
    300,
    'repeat authorization stays short-lived',
  );

  // Repeated start is a resume, not a rejected transition.
  const startedOnce = await service.startUpload(mediaId, OWNER_ID);
  const startedTwice = await service.startUpload(mediaId, OWNER_ID);

  assertEqual(
    startedOnce.attachment.state,
    'UPLOADING',
    'first start reaches UPLOADING',
  );
  assertEqual(
    startedTwice.attachment.state,
    'UPLOADING',
    'repeat start stays UPLOADING',
  );
  assertEqual(
    startedTwice.upload.objectKey,
    first.upload.objectKey,
    'repeat start keeps the same object key',
  );
}

async function testCompletionIsIdempotentAfterAmbiguousRetry(): Promise<
  void
> {
  const { service, storage, productId } =
    await buildService();

  const mediaId = await createAttachment(
    service,
    productId,
    'media-key-ambiguous',
  );

  await service.authorizeUpload(mediaId, OWNER_ID);
  const started = await service.startUpload(mediaId, OWNER_ID);

  putMatchingObject(started.upload.objectKey, storage);

  const first = await service.completeUpload(mediaId, OWNER_ID);

  assertEqual(
    first.attachment.state,
    'VERIFIED',
    'first completion verifies',
  );

  // The client never saw the response and retries completion.
  const retry = await service.completeUpload(mediaId, OWNER_ID);

  assertEqual(
    retry.attachment.state,
    'VERIFIED',
    'repeated completion stays VERIFIED',
  );
  assertEqual(
    retry.attachment.id,
    first.attachment.id,
    'repeated completion keeps one media record',
  );
  assertEqual(
    retry.verification.verified,
    true,
    'repeated completion re-verifies against object storage',
  );
  assertEqual(
    retry.verification.observedContentLength,
    BYTES,
    'repeated completion re-observes the object',
  );

  // A verified record whose object later disappears must become an
  // explicit action state rather than silently remaining valid.
  storage.objects.delete(started.upload.objectKey);

  const regressed = await service.completeUpload(
    mediaId,
    OWNER_ID,
  );

  assertEqual(
    regressed.verification.verified,
    false,
    'a verified record with no object does not re-verify',
  );
  assertEqual(
    regressed.verification.failure?.code,
    'OBJECT_NOT_FOUND',
    'missing object after verification is reported',
  );
  assertEqual(
    regressed.attachment.state,
    'ACTION_REQUIRED',
    'a verified record that stops matching becomes an action state',
  );
}

async function testAuthorizationBoundaries(): Promise<void> {
  const { service, productId } = await buildService();

  const mediaId = await createAttachment(
    service,
    productId,
    'media-key-bounds',
  );

  await expectAppError(
    'start before authorization',
    () => service.startUpload(mediaId, OWNER_ID),
    'CONFLICT',
  );

  await expectAppError(
    'complete before authorization',
    () => service.completeUpload(mediaId, OWNER_ID),
    'CONFLICT',
  );

  await expectAppError(
    'unknown media',
    () => service.authorizeUpload('missing-media', OWNER_ID),
    'NOT_FOUND',
  );

  await expectAppError(
    'non-positive ttl',
    () => service.authorizeUpload(mediaId, OWNER_ID, 0),
    'VALIDATION_FAILED',
  );

  // A requested ttl may never exceed the maximum.
  const bounded = await service.authorizeUpload(
    mediaId,
    OWNER_ID,
    86400,
  );

  assertEqual(
    bounded.upload.expiresInSeconds,
    900,
    'requested ttl is capped at the maximum',
  );
}

async function testUploadAuthorizationIsObjectSpecific(): Promise<void> {
  const { service, productId } = await buildService();

  const first = await createAttachment(
    service,
    productId,
    'media-key-a',
  );
  const second = await createAttachment(
    service,
    productId,
    'media-key-b',
  );

  const a = await service.authorizeUpload(first, OWNER_ID);
  const b = await service.authorizeUpload(second, OWNER_ID);

  if (a.upload.objectKey === b.upload.objectKey) {
    throw new Error(
      'Distinct media records must not share an object key.',
    );
  }

  if (!a.upload.url.includes(a.upload.objectKey)) {
    throw new Error(
      'Upload URL must be bound to its own object key.',
    );
  }

  if (!b.upload.url.includes(b.upload.objectKey)) {
    throw new Error(
      'Upload URL must be bound to its own object key.',
    );
  }
}

async function testMediaOwnershipBoundaries(): Promise<void> {
  const { service, productId } = await buildService();

  await expectAppError(
    'media for an unknown product',
    () =>
      service.requestAttachment({
        productId: '00000000-0000-0000-0000-00000000dead',
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: BYTES,
        idempotencyKey: 'orphan',
        actorId: OWNER_ID,
      }),
    'NOT_FOUND',
  );

  // Input validation must reject malformed requests before any
  // ownership or existence lookup happens.
  await expectAppError(
    'blank idempotency key',
    () =>
      service.requestAttachment({
        productId,
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: BYTES,
        idempotencyKey: '   ',
        actorId: OWNER_ID,
      }),
    'VALIDATION_FAILED',
  );

  await expectAppError(
    'content type that contradicts the media kind',
    () =>
      service.requestAttachment({
        productId,
        kind: 'AUDIO',
        contentType: 'image/png',
        sizeBytes: BYTES,
        idempotencyKey: 'mismatched-kind',
        actorId: OWNER_ID,
      }),
    'VALIDATION_FAILED',
  );

  await expectAppError(
    'non-positive size',
    () =>
      service.requestAttachment({
        productId,
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 0,
        idempotencyKey: 'zero-size',
        actorId: OWNER_ID,
      }),
    'VALIDATION_FAILED',
  );

  await expectAppError(
    'oversized image',
    () =>
      service.requestAttachment({
        productId,
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 26 * 1024 * 1024,
        idempotencyKey: 'too-big',
        actorId: OWNER_ID,
      }),
    'VALIDATION_FAILED',
  );

  // A different idempotency key on the same product must create a
  // separate media record rather than silently reusing the first.
  const first = await createAttachment(
    service,
    productId,
    'distinct-key-a',
  );
  const second = await createAttachment(
    service,
    productId,
    'distinct-key-b',
  );

  if (first === second) {
    throw new Error(
      'Distinct idempotency keys must create distinct media records.',
    );
  }
}

/**
 * Authentication is proved at the HTTP boundary; authorization is
 * decided here. No other artisan may act on a media record they do not
 * own, and the anonymous actor may never act at all.
 */
async function testMediaOwnershipIsEnforced(): Promise<void> {
  const { service, storage, productId } =
    await createHarness('ownership');

  const mediaId = await createAttachment(
    service,
    productId,
    'owned',
  );

  // A different artisan may not attach media to someone else's product.
  await expectAppError(
    'foreign product',
    () =>
      service.requestAttachment({
        productId,
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: BYTES,
        idempotencyKey: 'foreign-product',
        actorId: 'artisan-2',
      }),
    'FORBIDDEN',
  );

  await expectAppError(
    'foreign authorize',
    () => service.authorizeUpload(mediaId, 'artisan-2'),
    'FORBIDDEN',
  );

  await expectAppError(
    'foreign start',
    () => service.startUpload(mediaId, 'artisan-2'),
    'FORBIDDEN',
  );

  await expectAppError(
    'foreign complete',
    () => service.completeUpload(mediaId, 'artisan-2'),
    'FORBIDDEN',
  );

  // A non-owner learns nothing about which media ids exist.
  await expectAppError(
    'foreign missing media',
    () => service.authorizeUpload('missing-media', 'artisan-2'),
    'NOT_FOUND',
  );

  // The owner is unaffected by a foreign attempt.
  const authorized = await service.authorizeUpload(
    mediaId,
    OWNER_ID,
  );

  assertEqual(
    authorized.attachment.state,
    'UPLOAD_AUTHORIZED',
    'the owning artisan may still authorize after a foreign attempt',
  );

  putMatchingObject(authorized.attachment.objectKey!, storage);

  const completed = await service.completeUpload(
    mediaId,
    OWNER_ID,
  );

  assertEqual(
    completed.attachment.state,
    'VERIFIED',
    'the owning artisan completes their own media',
  );
}

/**
 * Two clients reporting the same arrival must both observe success. The
 * loser of the compare-and-set previously reported a conflict for an
 * upload that had in fact been verified.
 */
async function testConcurrentCompletionConverges(): Promise<void> {
  const { service, storage, repository, catalogService, productId } =
    await createHarness('concurrent');

  const mediaId = await createAttachment(
    service,
    productId,
    'concurrent',
  );

  const authorized = await service.authorizeUpload(
    mediaId,
    OWNER_ID,
  );

  await service.startUpload(mediaId, OWNER_ID);

  putMatchingObject(authorized.attachment.objectKey!, storage);

  // The racing repository reports a lost compare-and-set on the
  // arrival edge, which is what a second concurrent caller sees once
  // the first has already moved the record past UPLOADED.
  const racy = new MediaService(
    wrapRacingRepository(repository),
    catalogService,
    storage,
  );

  const first = await racy.completeUpload(mediaId, OWNER_ID);

  assertEqual(
    first.attachment.state,
    'VERIFIED',
    'the winning caller verifies',
  );

  // The second caller must converge on the verified record, not fail.
  const second = await racy.completeUpload(mediaId, OWNER_ID);

  assertEqual(
    second.attachment.state,
    'VERIFIED',
    'the losing caller converges on the verified record',
  );
  assertEqual(
    second.verification.verified,
    true,
    'the losing caller still re-reconciles against object storage',
  );

  // Converging must not double-verify: the record is written once, so
  // its last write timestamp is the winner's, not a fresh mutation.
  const stored = await repository.getById(mediaId);

  assertEqual(
    stored!.state,
    'VERIFIED',
    'the record is verified exactly once',
  );
  assertEqual(
    stored!.updatedAt,
    first.attachment.updatedAt,
    'convergence does not advance the record again',
  );
  assertEqual(
    second.attachment.updatedAt,
    first.attachment.updatedAt,
    'the losing caller observes the winner’s record',
  );
}

/**
 * A record that fails verification can no longer claim a stored object.
 * The service and both repositories must reject the write instead of
 * applying it because an individual caller allowed the edge.
 */
async function testFailedRecordsCannotRecordArrival(): Promise<void> {
  const { service, repository, productId } =
    await createHarness('failed-state');

  const mediaId = await createAttachment(
    service,
    productId,
    'failed',
  );

  await service.authorizeUpload(mediaId, OWNER_ID);
  await service.startUpload(mediaId, OWNER_ID);

  // Verification fails because the client wrote nothing, which is
  // observable as a recorded failure rather than an exception.
  const result = await service.completeUpload(mediaId, OWNER_ID);

  assertEqual(
    result.attachment.state,
    'FAILED',
    'a mismatched object records a failure',
  );

  // The illegal edge is refused at the repository boundary.
  const illegal = await repository.transitionState(
    mediaId,
    'UPLOADED',
  );

  assertEqual(
    illegal,
    null,
    'FAILED -> UPLOADED is refused by the state machine',
  );

  const stored = await repository.getById(mediaId);

  assertEqual(
    stored!.state,
    'FAILED',
    'the refused transition did not mutate the record',
  );

  // And the service refuses to complete it a second time.
  await expectAppError(
    'complete after failure',
    () => service.completeUpload(mediaId, OWNER_ID),
    'CONFLICT',
  );

  // Recovery remains possible: re-uploading the same object is the
  // documented interrupted-upload path.
  const rearmed = await service.authorizeUpload(mediaId, OWNER_ID);

  assertEqual(
    rearmed.attachment.state,
    'UPLOAD_AUTHORIZED',
    'a failed record may be re-armed for the same object',
  );
}

/**
 * The conflict rule also has to hold when the record is created
 * concurrently rather than found.
 *
 * Two first-time requests can both look the key up, both find nothing,
 * and both try to create. The unique constraint settles that race inside
 * the repository, and the loser is handed the winner's row. If only the
 * pre-create lookup were compared, the loser would silently adopt the
 * winner's object and report a successful creation, which is the exact
 * absorption the rule exists to prevent.
 */
async function testConcurrentCreationStillRejectsMismatchedMetadata(): Promise<
  void
> {
  const {
    catalogService,
    storage,
    repository,
    productId,
  } = await createHarness('m7-race');

  const racy = wrapConflictingCreateRepository(repository, {
    kind: 'IMAGE',
    contentType: 'image/png',
    sizeBytes: BYTES + 1,
  });

  const service = new MediaService(
    racy,
    catalogService,
    storage,
  );

  const error = await captureAppError(
    'a concurrent creation that lost the race',
    () =>
      service.requestAttachment({
        productId,
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: BYTES,
        idempotencyKey: 'm7-race-key',
        actorId: OWNER_ID,
      }),
    'CONFLICT',
  );

  const reported = error.details?.conflictingFields;

  if (
    !Array.isArray(reported) ||
    reported.join(',') !== 'contentType,sizeBytes'
  ) {
    throw new Error(
      `a concurrent creation that lost the race: expected conflicting fields [contentType, sizeBytes], received ${JSON.stringify(reported)}.`,
    );
  }

  assertEqual(
    error.details?.productId,
    productId,
    'a concurrent creation that lost the race names the product',
  );
}

/**
 * An idempotency key names one logical upload request, so a replay of
 * that key has to describe the same object.
 *
 * Deduplicating on the key alone answers a request that declares
 * different bytes, a different content type, or a different kind with
 * the original record as though it had been accepted. The client then
 * uploads against a record whose declared metadata does not describe its
 * object, and verification either fails later or accepts a substitute.
 * A key replay that disagrees about immutable metadata is a conflict,
 * and must be reported as one rather than silently absorbed.
 */
async function testIdempotencyKeyReuseRejectsMismatchedMetadata(): Promise<
  void
> {
  const {
    catalogService,
    storage,
    repository,
    productId,
  } = await createHarness('m7-metadata');

  const counted = countCreates(repository);
  const service = new MediaService(
    counted.repository,
    catalogService,
    storage,
  );

  const IDEMPOTENCY_KEY = 'm7-metadata-key';

  const original = {
    productId,
    kind: 'IMAGE' as const,
    contentType: 'image/jpeg',
    sizeBytes: BYTES,
    idempotencyKey: IDEMPOTENCY_KEY,
    actorId: OWNER_ID,
  };

  const created =
    await service.requestAttachment(original);

  assertEqual(
    created.created,
    true,
    'the first request creates the record',
  );

  // A genuine retry of the same logical request is still deduplicated.
  // The conflict rule must not turn a legitimate replay into a failure.
  const replay =
    await service.requestAttachment(original);

  assertEqual(
    replay.created,
    false,
    'a same-metadata retry is still deduplicated',
  );
  assertEqual(
    replay.attachment.id,
    created.attachment.id,
    'a same-metadata retry reuses the one record',
  );

  const beforeConflicts =
    await repository.getById(created.attachment.id);

  /**
   * A kind change is only expressible together with a content-type
   * change, because the kind and its content type are validated against
   * each other. The reported field list states exactly which comparisons
   * failed, so the kind comparison is asserted directly rather than
   * inferred.
   */
  const cases: Array<{
    label: string;
    kind: MediaKind;
    contentType: string;
    sizeBytes: number;
    conflictingFields: string[];
  }> = [
    {
      label: 'content type',
      kind: 'IMAGE',
      contentType: 'image/png',
      sizeBytes: BYTES,
      conflictingFields: ['contentType'],
    },
    {
      label: 'size',
      kind: 'IMAGE',
      contentType: 'image/jpeg',
      sizeBytes: BYTES * 2,
      conflictingFields: ['sizeBytes'],
    },
    {
      label: 'kind',
      kind: 'AUDIO',
      contentType: 'audio/mpeg',
      sizeBytes: BYTES,
      conflictingFields: ['kind', 'contentType'],
    },
    {
      label: 'every immutable field',
      kind: 'AUDIO',
      contentType: 'audio/mpeg',
      sizeBytes: BYTES * 3,
      conflictingFields: [
        'kind',
        'contentType',
        'sizeBytes',
      ],
    },
  ];

  for (const testCase of cases) {
    const error = await captureAppError(
      `a key reused with a different ${testCase.label}`,
      () =>
        service.requestAttachment({
          productId,
          kind: testCase.kind,
          contentType: testCase.contentType,
          sizeBytes: testCase.sizeBytes,
          idempotencyKey: IDEMPOTENCY_KEY,
          actorId: OWNER_ID,
        }),
      'CONFLICT',
    );

    const reported = error.details?.conflictingFields;

    if (
      !Array.isArray(reported) ||
      reported.join(',') !==
        testCase.conflictingFields.join(',')
    ) {
      throw new Error(
        `a key reused with a different ${testCase.label}: expected conflicting fields [${testCase.conflictingFields.join(', ')}], received ${JSON.stringify(reported)}.`,
      );
    }

    assertEqual(
      error.details?.mediaId,
      created.attachment.id,
      `a key reused with a different ${testCase.label} names the existing record`,
    );
    assertEqual(
      error.details?.productId,
      productId,
      `a key reused with a different ${testCase.label} names the product`,
    );
  }

  assertEqual(
    counted.creates(),
    1,
    'a mismatched replay must never create a second media record',
  );

  const afterConflicts =
    await repository.getById(created.attachment.id);

  assertEqual(
    afterConflicts!.kind,
    'IMAGE',
    'a mismatched replay does not overwrite the recorded kind',
  );
  assertEqual(
    afterConflicts!.contentType,
    'image/jpeg',
    'a mismatched replay does not overwrite the recorded content type',
  );
  assertEqual(
    afterConflicts!.sizeBytes,
    BYTES,
    'a mismatched replay does not overwrite the recorded size',
  );
  assertEqual(
    afterConflicts!.updatedAt,
    beforeConflicts!.updatedAt,
    'a mismatched replay does not mutate the record at all',
  );

  // The conflict is about the request, not about the key: a correct
  // retry of the same logical upload still deduplicates afterwards.
  const recovered =
    await service.requestAttachment(original);

  assertEqual(
    recovered.created,
    false,
    'a correct retry after a conflict still deduplicates',
  );
  assertEqual(
    recovered.attachment.id,
    created.attachment.id,
    'a correct retry after a conflict still reuses the record',
  );

  // The key is scoped to a product. The same key on a different product
  // is a different logical request and must not be treated as a reuse.
  const otherProduct =
    await catalogService.createDraft({
      ownerId: OWNER_ID,
      title: 'Second basket',
    });

  const onOtherProduct =
    await service.requestAttachment({
      ...original,
      productId: otherProduct.product.id,
    });

  assertEqual(
    onOtherProduct.created,
    true,
    'the same key on another product is a separate record',
  );

  if (
    onOtherProduct.attachment.id ===
    created.attachment.id
  ) {
    throw new Error(
      'A key scoped to another product must not reuse this record.',
    );
  }
}

async function main(): Promise<void> {
  await testFullLifecycle();
  await testMediaOwnershipIsEnforced();
  await testConcurrentCompletionConverges();
  await testFailedRecordsCannotRecordArrival();
  await testRejectsWrongBytes();
  await testAuthorizationIsIdempotent();
  await testCompletionIsIdempotentAfterAmbiguousRetry();
  await testAuthorizationBoundaries();
  await testUploadAuthorizationIsObjectSpecific();
  await testMediaOwnershipBoundaries();
  await testIdempotencyKeyReuseRejectsMismatchedMetadata();
  await testConcurrentCreationStillRejectsMismatchedMetadata();

  console.log('MEDIA SERVICE LIFECYCLE TESTS PASSED');
}

void main().catch((error) => {
  console.error('MEDIA SERVICE LIFECYCLE TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
