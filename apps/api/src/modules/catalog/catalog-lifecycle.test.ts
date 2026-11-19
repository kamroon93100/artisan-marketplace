import { CatalogService } from './application/catalog-service.js';
import { InMemoryCatalogRepository } from './infrastructure/in-memory-catalog-repository.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { CreateCatalogDraftInput } from './application/catalog-repository.js';
import type { CatalogProduct } from './domain/catalog-product.js';

const OWNER = 'artisan-owner';
const OTHER_ARTISAN = 'artisan-other';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function expectAppError(
  run: () => Promise<unknown>,
  code: string,
  message: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw new Error(
        `${message}: expected AppError, received ${String(error)}`,
      );
    }

    expect(
      error.code === code,
      `${message}: expected ${code}, received ${error.code} (${error.message})`,
    );

    return;
  }

  throw new Error(
    `${message}: expected ${code}, but nothing was raised.`,
  );
}

/**
 * Drives a product to APPROVED through the real operations a client uses, so
 * the lifecycle tests exercise the same edges a client would.
 *
 * The last step is `approve` rather than a generic transition on purpose.
 * `APPROVED` is established by the authorized approval operation, which
 * checks its own preconditions, and a test that reached it by assignment
 * would be testing a path the service no longer permits. These tests are
 * about publication and versioning, so approval is only the setup they need.
 *
 * `overrides` is a draft input rather than a product: a stored product
 * holds `null` for an absent field, while a creation request simply omits
 * it, and the two are not interchangeable.
 */
async function approvedProduct(
  service: CatalogService,
  overrides: Partial<CreateCatalogDraftInput> = {},
): Promise<CatalogProduct> {
  const draft = (
    await service.createDraft({
      ownerId: OWNER,
      title: 'Bamboo Basket',
      description: 'Handwoven storage basket.',
      category: 'basketry',
      materials: ['bamboo'],
      ...overrides,
    })
  ).product;

  for (const state of [
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
  ] as const) {
    await service.transition(draft.id, state, OWNER);
  }

  await service.approve(draft.id, OWNER);

  return service.getById(draft.id);
}

async function testPublishCreatesImmutableVersion(): Promise<void> {
  const repository = new InMemoryCatalogRepository();
  const service = new CatalogService(repository);

  const approved = await approvedProduct(service);

  expect(
    approved.publishedVersion === null,
    'an unpublished product has no catalog version',
  );

  const result = await service.publish(
    approved.id,
    OWNER,
    'publish-key-1',
  );

  expect(result.created, 'the first publish creates a version');
  expect(
    result.product.state === 'PUBLISHED',
    'publishing makes the product PUBLISHED',
  );
  expect(
    result.product.publishedVersion === 1,
    'the first catalog version is 1',
  );
  expect(
    result.version.versionNumber === 1,
    'the version snapshot is numbered 1',
  );
  expect(
    result.version.title === approved.title &&
      result.version.description === approved.description,
    'the version snapshots the published values',
  );
  expect(
    result.version.publishedBy === OWNER,
    'the version records who authorized the publish',
  );
  expect(
    result.version.id !== result.product.id,
    'a version is its own record, not the product row',
  );

  // Published data is distinct from the working record: the version is a
  // historical snapshot with its own identity and timestamps.
  const versions = await service.listVersions(
    approved.id,
    OWNER,
  );

  expect(
    versions.length === 1,
    'publishing records exactly one version',
  );
}

async function testPublishIsIdempotent(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const approved = await approvedProduct(service);

  const first = await service.publish(
    approved.id,
    OWNER,
    'publish-key-retry',
  );

  // An offline client that never saw the first response retries with the
  // same key. It must converge on the version that already exists, not
  // fail against the state its own successful publish produced and not
  // create a second version.
  const retry = await service.publish(
    approved.id,
    OWNER,
    'publish-key-retry',
  );

  expect(
    !retry.created,
    'a retried publish reports deduplication',
  );
  expect(
    retry.version.id === first.version.id,
    'a retried publish returns the version it already created',
  );
  expect(
    retry.product.publishedVersion === 1,
    'a retried publish does not allocate another version',
  );

  const versions = await service.listVersions(
    approved.id,
    OWNER,
  );

  expect(
    versions.length === 1,
    'a retried publish leaves exactly one version',
  );
}

async function testRepublishCreatesNewVersionAndPreservesHistory(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const approved = await approvedProduct(service);

  const first = await service.publish(
    approved.id,
    OWNER,
    'publish-key-v1',
  );

  // A change to a published product goes back through review rather than
  // rewriting the buyer-visible listing.
  await service.transition(
    approved.id,
    'REVIEW_REQUIRED',
    OWNER,
  );

  const edited = await service.update(
    approved.id,
    OWNER,
    {
      title: 'Bamboo Basket, Large',
    },
  );

  expect(
    edited.title === 'Bamboo Basket, Large',
    'the working record accepts the correction',
  );
  expect(
    edited.description ===
      approved.description,
    'an edit to one field leaves other fields alone',
  );

  // Re-approval after a correction, through the authorized operation: the
  // artisan confirms the edited product afresh, which is the same second
  // decision a buyer-visible listing change requires.
  await service.approve(edited.id, OWNER);

  const second = await service.publish(
    edited.id,
    OWNER,
    'publish-key-v2',
  );

  expect(
    second.version.versionNumber === 2,
    'a re-publish allocates the next catalog version',
  );
  expect(
    second.version.title === 'Bamboo Basket, Large',
    'the new version records the corrected title',
  );

  const versions = await service.listVersions(
    approved.id,
    OWNER,
  );

  expect(
    versions.length === 2,
    'both versions remain in history',
  );

  const [newest, oldest] = versions;

  expect(
    newest.versionNumber === 2 &&
      oldest.versionNumber === 1,
    'history is newest first',
  );

  // The published history is not rewritten by the later change.
  expect(
    oldest.title === 'Bamboo Basket',
    'the earlier published version still shows what buyers were shown',
  );
  expect(
    oldest.id === first.version.id,
    'the earlier version record is the same immutable record',
  );
  expect(
    oldest.publishedBy === OWNER,
    'the earlier version keeps its own publish actor',
  );
}

async function testPublishedProductCannotBeEdited(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const approved = await approvedProduct(service);

  await service.publish(
    approved.id,
    OWNER,
    'publish-key-frozen',
  );

  await expectAppError(
    () =>
      service.update(approved.id, OWNER, {
        title: 'Silently Rewritten',
      }),
    'CONFLICT',
    'editing a published product',
  );

  const after = await service.getById(approved.id);

  expect(
    after.title === approved.title,
    'a refused edit leaves the published record untouched',
  );
}

async function testPublishRequiresPreconditions(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  // Not yet approved: the review condition is unmet.
  const draft = (
    await service.createDraft({
      ownerId: OWNER,
      title: 'Draft Basket',
      description: 'Not reviewed yet.',
    })
  ).product;

  await expectAppError(
    () => service.publish(draft.id, OWNER, 'publish-too-early'),
    'CONFLICT',
    'publishing a product that was never approved',
  );

  expect(
    (await service.getById(draft.id)).state === 'LOCAL_DRAFT',
    'a refused publish does not change state',
  );

  // Approved, but missing the required description.
  const incomplete = await approvedProduct(service, {
    description: undefined,
  });

  await expectAppError(
    () =>
      service.publish(
        incomplete.id,
        OWNER,
        'publish-incomplete',
      ),
    'VALIDATION_FAILED',
    'publishing without a required field',
  );

  expect(
    (await service.getById(incomplete.id)).state === 'APPROVED',
    'a refused publish leaves the product in APPROVED',
  );

  expect(
    (await service.listVersions(incomplete.id, OWNER)).length ===
      0,
    'a refused publish records no version',
  );
}

async function testPublishRequiresIdempotencyKey(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const approved = await approvedProduct(service);

  await expectAppError(
    () => service.publish(approved.id, OWNER, '   '),
    'VALIDATION_FAILED',
    'publishing without an idempotency key',
  );
}

async function testOwnershipIsEnforced(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const approved = await approvedProduct(service);

  for (const [label, run] of [
    [
      'publishing another artisan’s product',
      () =>
        service.publish(approved.id, OTHER_ARTISAN, 'publish-not-mine'),
    ],
    [
      'editing another artisan’s product',
      () =>
        service.update(approved.id, OTHER_ARTISAN, {
          title: 'Hijacked',
        }),
    ],
    [
      'transitioning another artisan’s product',
      () =>
        service.transition(
          approved.id,
          'REVIEW_REQUIRED',
          OTHER_ARTISAN,
        ),
    ],
    [
      'reading another artisan’s publish history',
      () => service.listVersions(approved.id, OTHER_ARTISAN),
    ],
    [
      'reading another artisan’s draft',
      () => service.getOwnedById(approved.id, OTHER_ARTISAN),
    ],
  ] as Array<[string, () => Promise<unknown>]>) {
    await expectAppError(run, 'FORBIDDEN', label);
  }

  const own = await service.getOwnedById(approved.id, OWNER);

  expect(
    own.id === approved.id,
    'the owning artisan can still read the product',
  );

  // The refusals above must not have advanced anything.
  const after = await service.getById(approved.id);

  expect(
    after.state === 'APPROVED' &&
      after.title === approved.title &&
      after.publishedVersion === null,
    'a forbidden operation changes nothing',
  );
}

async function testEditConvergesOnReplay(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const approved = await approvedProduct(service);

  const first = await service.update(
    approved.id,
    OWNER,
    { title: 'Bamboo Basket' },
  );

  // The same edit delivered twice converges: the request carries absolute
  // values, so replaying it cannot compound.
  const replay = await service.update(
    approved.id,
    OWNER,
    { title: 'Bamboo Basket' },
  );

  expect(
    replay.title === first.title &&
      replay.description === first.description,
    'a replayed edit converges on the same values',
  );
}

async function testEditRefusesBlankAndEmptyEdits(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const approved = await approvedProduct(service);

  await expectAppError(
    () => service.update(approved.id, OWNER, {}),
    'VALIDATION_FAILED',
    'an edit with no fields',
  );

  await expectAppError(
    () =>
      service.update(approved.id, OWNER, {
        title: '   ',
      }),
    'VALIDATION_FAILED',
    'a blank title',
  );

  await expectAppError(
    () =>
      service.update(approved.id, OWNER, {
        materials: ['bamboo', ''],
      }),
    'VALIDATION_FAILED',
    'a blank material',
  );

  expect(
    (await service.getById(approved.id)).title ===
      approved.title,
    'a refused edit stores nothing',
  );
}

async function main(): Promise<void> {
  await testPublishCreatesImmutableVersion();
  await testPublishIsIdempotent();
  await testRepublishCreatesNewVersionAndPreservesHistory();
  await testPublishedProductCannotBeEdited();
  await testPublishRequiresPreconditions();
  await testPublishRequiresIdempotencyKey();
  await testOwnershipIsEnforced();
  await testEditConvergesOnReplay();
  await testEditRefusesBlankAndEmptyEdits();

  console.log('CATALOG LIFECYCLE TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
