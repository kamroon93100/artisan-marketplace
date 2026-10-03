import { CatalogService } from './application/catalog-service.js';
import { InMemoryCatalogRepository } from './infrastructure/in-memory-catalog-repository.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  ApproveStateError,
  AuthorizedOperationRequiredError,
  assertApprovableState,
  isApprovableState,
} from './domain/catalog-publish.js';
import type { ProductState } from '@artisan-marketplace/contracts';
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
 * A draft driven to REVIEW_REQUIRED, the state an artisan reviews from.
 *
 * Approval is the last step and is deliberately not included: these tests are
 * about the approval operation itself, so reaching its precondition has to be
 * visible rather than folded into a helper that would also hide whether the
 * operation was the thing that moved the product.
 */
async function reviewableProduct(
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

  return draft;
}

/**
 * `APPROVED` is not reachable by assignment at the service.
 *
 * The state machine still records that `REVIEW_REQUIRED -> APPROVED` and
 * `APPROVED -> PUBLISHED` are real edges, so this is the layer that has to
 * refuse them. If it did not, a caller with one word in a request body could
 * approve a product that no human ever reviewed, and `publish`'s `APPROVED`
 * precondition would stop meaning that a human said yes.
 */
async function testGenericTransitionCannotAssignApproval(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const product = await reviewableProduct(service);

  await expectAppError(
    () => service.transition(product.id, 'APPROVED', OWNER),
    'CONFLICT',
    'assigning APPROVED through the generic transition',
  );

  await expectAppError(
    () => service.transition(product.id, 'PUBLISHED', OWNER),
    'CONFLICT',
    'assigning PUBLISHED through the generic transition',
  );

  const after = await service.getById(product.id);

  expect(
    after.state === 'REVIEW_REQUIRED',
    'neither shortcut advanced the product',
  );
}

/**
 * The refusal names the operation that would work, so a client is told where
 * to go instead of receiving a bare conflict.
 */
async function testRefusalNamesTheAuthorizedOperation(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const product = await reviewableProduct(service);

  try {
    await service.transition(product.id, 'APPROVED', OWNER);

    throw new Error(
      'TEST FAILED: expected the assignment to be refused.',
    );
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }

    expect(
      error.message.includes(
        '/catalog/products/{id}/review/approve',
      ),
      `the refusal points at the approval route (received: ${error.message})`,
    );
  }
}

/**
 * The states the state machine says can reach APPROVED are exactly the states
 * `approve` accepts.
 *
 * Both the explicit approvable list and the transition table are consulted by
 * `assertApprovableState`. This asserts the two agree, so the table and the
 * list cannot drift apart unnoticed.
 */
async function testApprovableStatesAgreeWithTheStateMachine(): Promise<void> {
  const states: readonly ProductState[] = [
    'LOCAL_DRAFT',
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
    'APPROVED',
    'PUBLISHED',
    'ARCHIVED',
    'CONFLICT',
    'ACTION_REQUIRED',
  ];

  for (const state of states) {
    const reachable = (() => {
      try {
        assertApprovableState(state);
        return true;
      } catch (error) {
        if (error instanceof ApproveStateError) {
          return false;
        }

        throw error;
      }
    })();

    /**
     * An already-approved product is the one state where the two differ on
     * purpose: `assertApprovableState` reports it as a conflict because
     * `APPROVED -> APPROVED` is not an edge, while the read-only predicate
     * reports it as approvable because a repeat approval has to converge.
     * Every other state must agree exactly.
     */
    if (state === 'APPROVED') {
      expect(
        !reachable,
        'assertApprovableState refuses APPROVED as a source state',
      );
      expect(
        isApprovableState(state),
        'a product that already reached its goal is not blocked',
      );
      continue;
    }

    expect(
      reachable === isApprovableState(state),
      `read-only and asserting approval agree on ${state}`,
    );
    expect(
      reachable === (state === 'SYNCED' || state === 'REVIEW_REQUIRED'),
      `${state} ${reachable ? 'can' : 'cannot'} be approved from`,
    );
  }
}

async function testApproveReachesApprovalFromEitherSource(): Promise<void> {
  for (const source of ['SYNCED', 'REVIEW_REQUIRED'] as const) {
    const service = new CatalogService(
      new InMemoryCatalogRepository(),
    );

    const draft = (
      await service.createDraft({
        ownerId: OWNER,
        title: 'Bamboo Basket',
        description: 'Handwoven storage basket.',
      })
    ).product;

    await service.transition(draft.id, 'PENDING_SYNC', OWNER);
    await service.transition(draft.id, 'SYNCED', OWNER);

    if (source === 'REVIEW_REQUIRED') {
      await service.transition(
        draft.id,
        'REVIEW_REQUIRED',
        OWNER,
      );
    }

    const result = await service.approve(draft.id, OWNER);

    expect(
      result.changed,
      `approval from ${source} reports that it changed the product`,
    );
    expect(
      result.product.state === 'APPROVED',
      `approval from ${source} reaches APPROVED`,
    );
  }
}

async function testApproveIsRefusedFromUnapprovableStates(): Promise<void> {
  for (const state of [
    'LOCAL_DRAFT',
    'PENDING_SYNC',
  ] as const) {
    const service = new CatalogService(
      new InMemoryCatalogRepository(),
    );

    const draft = (
      await service.createDraft({
        ownerId: OWNER,
        title: 'Bamboo Basket',
        description: 'Handwoven storage basket.',
      })
    ).product;

    if (state === 'PENDING_SYNC') {
      await service.transition(
        draft.id,
        'PENDING_SYNC',
        OWNER,
      );
    }

    await expectAppError(
      () => service.approve(draft.id, OWNER),
      'CONFLICT',
      `approving from ${state}`,
    );

    const after = await service.getById(draft.id);

    expect(
      after.state === state,
      `a refused approval leaves the product in ${state}`,
    );
  }
}

/**
 * Approval is state-idempotent rather than key-idempotent.
 *
 * It establishes a state and creates no record, so there is nothing to key a
 * replay on; converging on the state the first approval established is the
 * only honest answer. A retry after a dropped response must be able to tell
 * that its intention was carried out, which is what `changed` reports.
 */
async function testApproveIsIdempotent(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const product = await reviewableProduct(service);

  const first = await service.approve(product.id, OWNER);

  expect(
    first.changed,
    'the first approval reports that it changed the product',
  );

  const second = await service.approve(product.id, OWNER);

  expect(
    !second.changed,
    'a repeat approval reports that it changed nothing',
  );
  expect(
    second.product.state === 'APPROVED',
    'a repeat approval converges on the approved product',
  );
  expect(
    second.product.updatedAt === first.product.updatedAt,
    'a repeat approval writes nothing, so the record is untouched',
  );
}

/**
 * Ownership is the catalog module's own decision, derived from the stored
 * record rather than from anything the caller asserted.
 */
async function testApproveIsRefusedForAnotherArtisan(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const product = await reviewableProduct(service);

  await expectAppError(
    () => service.approve(product.id, OTHER_ARTISAN),
    'FORBIDDEN',
    'approving another artisan’s product',
  );

  const after = await service.getById(product.id);

  expect(
    after.state === 'REVIEW_REQUIRED',
    'a forbidden approval changes nothing',
  );
}

async function testApproveRefusesAMissingProduct(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  await expectAppError(
    () => service.approve('00000000-0000-4000-8000-00000000dead', OWNER),
    'NOT_FOUND',
    'approving a product that does not exist',
  );
}

/**
 * The refusal for a state the product cannot be approved from tells the
 * artisan what to do about it.
 *
 * "cannot be approved from LOCAL_DRAFT" is a dead end and "finish syncing
 * this draft first" is not, so the message is part of the operation rather
 * than a detail of the error.
 */
async function testApproveRefusalIsActionable(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const draft = (
    await service.createDraft({
      ownerId: OWNER,
      title: 'Bamboo Basket',
      description: 'Handwoven storage basket.',
    })
  ).product;

  try {
    await service.approve(draft.id, OWNER);

    throw new Error(
      'TEST FAILED: expected the approval to be refused.',
    );
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }

    expect(
      error.message.includes('synchronizing'),
      `the refusal says the draft has not finished syncing (received: ${error.message})`,
    );
  }
}

/**
 * The domain error is distinct from the authorized-operation error.
 *
 * They mean different things to a caller: one means "you used the wrong
 * operation", the other means "this product is not in a state that can be
 * approved". Conflating them would make the first look like a state problem
 * and send an integrator looking in the wrong place.
 */
async function testDomainErrorsAreDistinct(): Promise<void> {
  const operationError = new AuthorizedOperationRequiredError('APPROVED');

  expect(
    operationError.message.includes('review/approve'),
    'the authorized-operation error names the operation',
  );
  expect(
    operationError.state === 'APPROVED',
    'the authorized-operation error carries the state',
  );

  const stateError = new ApproveStateError('ARCHIVED');

  expect(
    stateError.message.includes('ARCHIVED'),
    'the approve-state error names the state',
  );
  expect(
    !stateError.message.includes('review/approve'),
    'the approve-state error does not point at the route',
  );
}

async function main(): Promise<void> {
  await testGenericTransitionCannotAssignApproval();
  await testRefusalNamesTheAuthorizedOperation();
  await testApprovableStatesAgreeWithTheStateMachine();
  await testApproveReachesApprovalFromEitherSource();
  await testApproveIsRefusedFromUnapprovableStates();
  await testApproveIsIdempotent();
  await testApproveIsRefusedForAnotherArtisan();
  await testApproveRefusesAMissingProduct();
  await testApproveRefusalIsActionable();
  await testDomainErrorsAreDistinct();

  console.log('CATALOG APPROVE TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
