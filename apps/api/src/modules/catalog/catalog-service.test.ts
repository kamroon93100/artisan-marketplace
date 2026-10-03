import { CatalogService } from './application/catalog-service.js';
import { InMemoryCatalogRepository } from './infrastructure/in-memory-catalog-repository.js';

async function main(): Promise<void> {
  const repository = new InMemoryCatalogRepository();
  const service = new CatalogService(repository);

  const draftResult = await service.createDraft({
    ownerId: 'artisan-test-1',
    title: 'Handwoven Basket',
    category: 'basketry',
    materials: ['bamboo'],
  });

  const draft = draftResult.product;

  if (draft.state !== 'LOCAL_DRAFT') {
    throw new Error(`Expected LOCAL_DRAFT, received ${draft.state}`);
  }

  const synced = await service.transition(
      draft.id,
      'PENDING_SYNC',
      'artisan-test-1',
    );

  if (synced.state !== 'PENDING_SYNC') {
    throw new Error(`Expected PENDING_SYNC, received ${synced.state}`);
  }

  let rejected = false;

  try {
    await service.transition(
        draft.id,
        'PUBLISHED',
        'artisan-test-1',
      );
  } catch {
    rejected = true;
  }

  if (!rejected) {
    throw new Error('Expected invalid LOCAL_DRAFT -> PUBLISHED transition to be rejected.');
  }

  // ----- Compare-and-set concurrency protection -----

  // A concurrent stale read must be detected and rejected rather than
  // silently overwriting the product state.
  const concurrent = repository.createDraft({
    ownerId: 'artisan-test-2',
    title: 'Concurrent Basket',
    category: 'basketry',
  });

  const other = (await concurrent).product;

  // Simulate a concurrent caller that transitions this product first.
  await repository.transitionState(other.id, 'PENDING_SYNC', 'LOCAL_DRAFT');

  // Now try to transition from the stale state (LOCAL_DRAFT) -> SYNCED.
  // This must be rejected because the product is now in PENDING_SYNC.
  let casRejected = false;

  try {
    await repository.transitionState(other.id, 'SYNCED', 'LOCAL_DRAFT');
  } catch {
    casRejected = true;
  }

  if (!casRejected) {
    throw new Error('Expected a stale compare-and-set transition to be rejected.');
  }

  // A transition from the correct current state must still succeed.
  const afterCas = await repository.transitionState(other.id, 'SYNCED', 'PENDING_SYNC');

  if (afterCas.state !== 'SYNCED') {
    throw new Error('Expected a valid compare-and-set transition to succeed.');
  }

  // ----- Service-level compare-and-set -----

  // Create a fresh product and test the service properly passes the
  // expected state through to the repository.
  const freshResult = await service.createDraft({
    ownerId: 'artisan-test-3',
    title: 'Fresh Basket',
    category: 'basketry',
  });

  const fresh = freshResult.product;

  // Normal service transition works.
  const freshPending = await service.transition(
      fresh.id,
      'PENDING_SYNC',
      'artisan-test-3',
    );

  if (freshPending.state !== 'PENDING_SYNC') {
    throw new Error('Expected service transition to succeed.');
  }

  // Simulate a race: bypass the service and change state directly.
  await repository.transitionState(fresh.id, 'SYNCED', 'PENDING_SYNC');

  // Now call service.transition with a stale read scenario.
  // The service reads the current state, validates the transition is
  // legal from that state, and passes the current state to the repository.
  // SYNCED -> REVIEW_REQUIRED is valid in the state machine.
  let raceLost = false;

  try {
    await service.transition(
        fresh.id,
        'REVIEW_REQUIRED',
        'artisan-test-3',
      );
  } catch {
    raceLost = true;
  }

  // This should succeed because the service reads SYNCED (the current state)
  // and validates SYNCED -> REVIEW_REQUIRED as a legal transition.
  if (raceLost) {
    throw new Error('Service must transition from the current state, not a stale one.');
  }

  console.log('CATALOG SERVICE TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

