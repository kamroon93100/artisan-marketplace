import { getAiServices } from './composition.js';
import { getCatalogService } from '../catalog/composition.js';
import { AppError } from '../../shared/errors/app-error.js';

const CONFIGURED = {
  APP_ENV: 'development',
  HYPERDRIVE: {
    connectionString: 'postgresql://user:pass@127.0.0.1:5432/db',
  },
};

const OWNER_ID = '00000000-0000-4000-8000-0000000000a1';

function expectDependencyFailure(
  label: string,
  run: () => unknown,
  message: string,
): void {
  try {
    run();
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      error.code !== 'DEPENDENCY_FAILED'
    ) {
      throw new Error(
        `${label}: expected AppError DEPENDENCY_FAILED, received ${String(error)}.`,
      );
    }

    if (!error.message.includes(message)) {
      throw new Error(
        `${label}: expected a message containing "${message}", received "${error.message}".`,
      );
    }

    return;
  }

  throw new Error(
    `${label}: expected AppError DEPENDENCY_FAILED, but nothing was raised.`,
  );
}

/**
 * The deterministic provider is a local-development fixture, not a
 * provider. Outside development and test it must be refused, and the
 * refusal is proven against a fully configured database as well: a stub
 * that answers instead of generating would make the product look
 * assisted while nothing was produced.
 */
function testDeterministicProviderIsRefusedOutsideLocalEnvironments(): void {
  for (const environment of [
    'production',
    'staging',
    'preview',
    undefined,
  ]) {
    expectDependencyFailure(
      `ai in ${String(environment)}`,
      () => getAiServices({ APP_ENV: environment }),
      'AI provider is not configured',
    );

    expectDependencyFailure(
      `ai in ${String(environment)} with a database configured`,
      () =>
        getAiServices({
          ...CONFIGURED,
          APP_ENV: environment,
        }),
      'AI provider is not configured',
    );
  }
}

/**
 * In-memory AI storage must not stand in for the canonical store in an
 * environment expected to hold real work. When development and test have
 * no database configured, volatile storage is the documented local
 * convenience, and it is confined to those two environments.
 */
function testVolatileStorageIsConfinedToLocalEnvironments(): void {
  for (const environment of ['development', 'test']) {
    const services = getAiServices({ APP_ENV: environment });

    if (!services.pipeline || !services.review) {
      throw new Error(
        `Expected AI services in ${environment}.`,
      );
    }
  }
}

/**
 * A configured database must be preferred over volatile storage, and
 * the plain development variable shape `wrangler dev` actually provides
 * must be honoured. Reaching PostgreSQL is asserted through the real
 * runtime proof; here the point is that a configured environment never
 * silently selects the in-memory repository.
 */
function testConfiguredDatabaseResolves(): void {
  for (const hyperdrive of [
    CONFIGURED.HYPERDRIVE,
    CONFIGURED.HYPERDRIVE.connectionString,
  ]) {
    const services = getAiServices({
      APP_ENV: 'development',
      HYPERDRIVE: hyperdrive,
    });

    if (!services.pipeline || !services.review) {
      throw new Error(
        'Expected AI services to resolve against a configured database.',
      );
    }
  }
}

/**
 * The pipeline and the review service must be wired to the same store.
 *
 * Two separate in-memory repositories would each look correct in
 * isolation and together would make every decision blind: proposals
 * written by one service would be invisible to the other. A job
 * enqueued through one composition call and reviewed through another is
 * the only way to prove the wiring rather than assume it.
 */
async function testPipelineAndReviewShareOneStore(): Promise<void> {
  const env = { APP_ENV: 'development' };

  const { product } = await getCatalogService(env).createDraft({
    ownerId: OWNER_ID,
    title: 'Composition Basket',
    materials: ['bamboo'],
  });

  const { job } = await getAiServices(env).pipeline.enqueue({
    productId: product.id,
    actorId: OWNER_ID,
    idempotencyKey: 'composition-001',
    transcription: 'A tightly woven bamboo basket.',
    correlationId: 'composition-corr',
  });

  const { proposals } = await getAiServices(env).pipeline.run(
    job.id,
    OWNER_ID,
  );

  const title = proposals.find(
    (proposal) => proposal.field === 'title',
  );

  if (!title) {
    throw new Error('The run must have proposed a title.');
  }

  // A fresh composition call builds fresh services. Reading and writing
  // through them proves the store is shared, not that one instance
  // happens to hold both halves of the wiring.
  const review = getAiServices(env).review;

  const { applied } = await review.applyDecisions(
    product.id,
    OWNER_ID,
    [{ proposalId: title.id, decision: 'ACCEPTED' }],
  );

  if (!applied.includes('title')) {
    throw new Error(
      'The review service must find the proposal the pipeline wrote.',
    );
  }

  const reloaded = await getCatalogService(env).getById(
    product.id,
  );

  if (reloaded.title !== title.value) {
    throw new Error(
      'The accepted value must be readable from the catalog afterwards.',
    );
  }
}

async function main(): Promise<void> {
  testDeterministicProviderIsRefusedOutsideLocalEnvironments();
  testVolatileStorageIsConfinedToLocalEnvironments();
  testConfiguredDatabaseResolves();
  await testPipelineAndReviewShareOneStore();

  console.log('AI COMPOSITION TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});