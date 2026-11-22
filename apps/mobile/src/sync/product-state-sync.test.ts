import type { ProductState } from '@artisan-marketplace/contracts';
import { ProductSyncTransportError } from '../network/product-sync-contract';
import { ensureProductSynced } from './product-state-sync';

type NextState = 'PENDING_SYNC' | 'SYNCED';

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeTransport(initialState: ProductState) {
  let currentState = initialState;
  const transitions: NextState[] = [];

  return {
    transitions,
    get state(): ProductState {
      return currentState;
    },
    transport: {
      getOwnedProductState: async (): Promise<ProductState> =>
        currentState,

      transitionProduct: async (
        _productId: string,
        nextState: NextState,
      ): Promise<void> => {
        const valid =
          (currentState === 'LOCAL_DRAFT' &&
            nextState === 'PENDING_SYNC') ||
          (currentState === 'PENDING_SYNC' &&
            nextState === 'SYNCED');

        if (!valid) {
          throw new ProductSyncTransportError(
            `Invalid transition ${currentState} -> ${nextState}`,
            'CONFLICT',
            false,
          );
        }

        transitions.push(nextState);
        currentState = nextState;
      },
    },
  };
}

async function testFreshDraft(): Promise<void> {
  const fake = makeTransport('LOCAL_DRAFT');

  await ensureProductSynced('product-test', fake.transport);

  assert(fake.state === 'SYNCED', 'Fresh product did not reach SYNCED.');
  assert(
    fake.transitions.join(',') === 'PENDING_SYNC,SYNCED',
    'Fresh product used the wrong transition sequence.',
  );
}

async function testResumeFromPendingSync(): Promise<void> {
  const fake = makeTransport('PENDING_SYNC');

  await ensureProductSynced('product-test', fake.transport);

  assert(fake.state === 'SYNCED', 'Pending product did not reach SYNCED.');
  assert(
    fake.transitions.join(',') === 'SYNCED',
    'Retry repeated the PENDING_SYNC transition.',
  );
}

async function testAlreadySynced(): Promise<void> {
  const fake = makeTransport('SYNCED');

  await ensureProductSynced('product-test', fake.transport);

  assert(
    fake.transitions.length === 0,
    'Already-synced product was transitioned again.',
  );
}

async function testLaterWorkflowStates(): Promise<void> {
  const states: ProductState[] = [
    'REVIEW_REQUIRED',
    'APPROVED',
    'PUBLISHED',
    'ARCHIVED',
  ];

  for (const state of states) {
    const fake = makeTransport(state);

    await ensureProductSynced('product-test', fake.transport);

    assert(
      fake.state === state && fake.transitions.length === 0,
      `The helper changed later workflow state ${state}.`,
    );
  }
}

async function testConcurrentTransition(): Promise<void> {
  let currentState: ProductState = 'LOCAL_DRAFT';
  let firstTransition = true;
  const readCurrentState = (): ProductState => currentState;

  const transport = {
    getOwnedProductState: async (): Promise<ProductState> =>
      currentState,

    transitionProduct: async (
      _productId: string,
      _nextState: NextState,
    ): Promise<void> => {
      if (firstTransition) {
        firstTransition = false;
        currentState = 'SYNCED';

        throw new ProductSyncTransportError(
          'Another request completed the transition.',
          'CONFLICT',
          false,
        );
      }
    },
  };

  await ensureProductSynced('product-test', transport);

  assert(
    readCurrentState() === 'SYNCED',
    'Concurrent transition was not recognized.',
  );
}

async function testActionRequiredIsNotAccepted(): Promise<void> {
  const fake = makeTransport('ACTION_REQUIRED');
  let rejected = false;

  try {
    await ensureProductSynced('product-test', fake.transport);
  } catch (error) {
    rejected =
      error instanceof ProductSyncTransportError &&
      error.code === 'PRODUCT_ACTION_REQUIRED';
  }

  assert(rejected, 'ACTION_REQUIRED was silently accepted.');
}

async function main(): Promise<void> {
  await testFreshDraft();
  await testResumeFromPendingSync();
  await testAlreadySynced();
  await testLaterWorkflowStates();
  await testConcurrentTransition();
  await testActionRequiredIsNotAccepted();

  console.log('PRODUCT STATE SYNC TESTS PASSED (6 scenarios)');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});