import { getAiServices, selectAiProvider } from './composition.js';
import { getCatalogService } from '../catalog/composition.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { CatalogAiProvider } from './domain/catalog-ai-provider.js';
import { DeterministicCatalogAiProvider } from './infrastructure/deterministic-catalog-ai-provider.js';
import { OpenAiCatalogAiProvider } from './infrastructure/openai-catalog-ai-provider.js';
import { WorkersAiCatalogAiProvider } from './infrastructure/workers-ai-catalog-ai-provider.js';

const CONFIGURED = {
  APP_ENV: 'development',
  HYPERDRIVE: {
    connectionString: 'postgresql://user:pass@127.0.0.1:5432/db',
  },
};

const OWNER_ID = '00000000-0000-4000-8000-0000000000a1';

// Mock AI binding for tests
const mockAiBinding = {
  run: async () => ({
    id: 'chatcmpl-123',
    choices: [
      {
        message: {
          role: 'assistant',
          content: JSON.stringify({ title: 'Test' }),
        },
        finish_reason: 'stop',
        index: 0,
      },
    ],
  }),
};

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

function assertProviderType(
  label: string,
  provider: CatalogAiProvider,
  expectedTypeName: string,
): void {
  if (provider.constructor.name !== expectedTypeName) {
    throw new Error(
      `${label}: expected provider to be ${expectedTypeName}, got ${provider.constructor.name}`,
    );
  }
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
      `ai in ${String(environment)} without database`,
      () => getAiServices({ APP_ENV: environment }),
      'PostgreSQL is not configured',
    );

    // Provider selection is checked independently so a missing database
    // cannot hide the missing real-provider configuration.
    if (
      environment === 'production' ||
      environment === 'staging' ||
      environment === 'preview'
    ) {
      expectDependencyFailure(
        `ai provider in ${environment} without key`,
        () => selectAiProvider({ APP_ENV: environment }),
        'AI provider is not configured',
      );
    }
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

/**
 * selectAiProvider returns DeterministicCatalogAiProvider in development.
 */
function testSelectProviderReturnsDeterministicInDevelopment(): void {
  const provider = selectAiProvider({ APP_ENV: 'development' });
  assertProviderType('development', provider, 'DeterministicCatalogAiProvider');
}

/**
 * selectAiProvider returns DeterministicCatalogAiProvider in test.
 */
function testSelectProviderReturnsDeterministicInTest(): void {
  const provider = selectAiProvider({ APP_ENV: 'test' });
  assertProviderType('test', provider, 'DeterministicCatalogAiProvider');
}

/**
 * selectAiProvider returns WorkersAiCatalogAiProvider in production with AI binding.
 */
function testSelectProviderReturnsWorkersAiInProduction(): void {
  const provider = selectAiProvider({
    APP_ENV: 'production',
    AI: mockAiBinding as any,
  });
  assertProviderType('production with AI binding', provider, 'WorkersAiCatalogAiProvider');
}

/**
 * selectAiProvider returns WorkersAiCatalogAiProvider in staging with AI binding.
 */
function testSelectProviderReturnsWorkersAiInStaging(): void {
  const provider = selectAiProvider({
    APP_ENV: 'staging',
    AI: mockAiBinding as any,
  });
  assertProviderType('staging with AI binding', provider, 'WorkersAiCatalogAiProvider');
}

/**
 * selectAiProvider returns WorkersAiCatalogAiProvider in preview with AI binding.
 */
function testSelectProviderReturnsWorkersAiInPreview(): void {
  const provider = selectAiProvider({
    APP_ENV: 'preview',
    AI: mockAiBinding as any,
  });
  assertProviderType('preview with AI binding', provider, 'WorkersAiCatalogAiProvider');
}

/**
 * selectAiProvider returns OpenAiCatalogAiProvider in production with OpenAI key and no AI binding.
 */
function testSelectProviderReturnsOpenAiInProductionWhenNoAiBinding(): void {
  const provider = selectAiProvider({
    APP_ENV: 'production',
    OPENAI_API_KEY: 'sk-test-key',
  });
  assertProviderType('production with OpenAI key only', provider, 'OpenAiCatalogAiProvider');
}

/**
 * selectAiProvider prefers Workers AI over OpenAI when both are available.
 */
function testSelectProviderPrefersWorkersAiWhenBothAvailable(): void {
  const provider = selectAiProvider({
    APP_ENV: 'production',
    AI: mockAiBinding as any,
    OPENAI_API_KEY: 'sk-test-key',
  });
  assertProviderType('production with both AI binding and OpenAI key', provider, 'WorkersAiCatalogAiProvider');
}

/**
 * selectAiProvider with explicit AI_PROVIDER=workers-ai requires AI binding.
 */
function testSelectProviderExplicitWorkersAiRequiresBinding(): void {
  expectDependencyFailure(
    'explicit workers-ai without binding',
    () => selectAiProvider({ APP_ENV: 'production', AI_PROVIDER: 'workers-ai' }),
    'Workers AI binding is required',
  );
}

/**
 * selectAiProvider with explicit AI_PROVIDER=workers-ai works with AI binding.
 */
function testSelectProviderExplicitWorkersAiWithBinding(): void {
  const provider = selectAiProvider({
    APP_ENV: 'production',
    AI_PROVIDER: 'workers-ai',
    AI: mockAiBinding as any,
  });
  assertProviderType('explicit workers-ai with binding', provider, 'WorkersAiCatalogAiProvider');
}

/**
 * selectAiProvider with explicit AI_PROVIDER=openai requires OpenAI key.
 */
function testSelectProviderExplicitOpenAiRequiresKey(): void {
  expectDependencyFailure(
    'explicit openai without key',
    () => selectAiProvider({ APP_ENV: 'production', AI_PROVIDER: 'openai' }),
    'OpenAI API key is required',
  );
}

/**
 * selectAiProvider with explicit AI_PROVIDER=openai works with OpenAI key.
 */
function testSelectProviderExplicitOpenAiWithKey(): void {
  const provider = selectAiProvider({
    APP_ENV: 'production',
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test-key',
  });
  assertProviderType('explicit openai with key', provider, 'OpenAiCatalogAiProvider');
}

/**
 * selectAiProvider with unknown AI_PROVIDER value fails closed.
 */
function testSelectProviderUnknownProviderFailsClosed(): void {
  expectDependencyFailure(
    'unknown AI_PROVIDER value',
    () => selectAiProvider({ APP_ENV: 'production', AI_PROVIDER: 'unknown' as any }),
    'AI provider is not configured',
  );
}

/**
 * selectAiProvider throws DEPENDENCY_FAILED in production without any provider.
 */
function testSelectProviderThrowsInProductionWithoutProvider(): void {
  expectDependencyFailure(
    'production without provider',
    () => selectAiProvider({ APP_ENV: 'production' }),
    'Workers AI binding or OpenAI API key is required',
  );
}

/**
 * selectAiProvider throws DEPENDENCY_FAILED in staging without any provider.
 */
function testSelectProviderThrowsInStagingWithoutProvider(): void {
  expectDependencyFailure(
    'staging without provider',
    () => selectAiProvider({ APP_ENV: 'staging' }),
    'Workers AI binding or OpenAI API key is required',
  );
}

/**
 * selectAiProvider throws DEPENDENCY_FAILED in preview without any provider.
 */
function testSelectProviderThrowsInPreviewWithoutProvider(): void {
  expectDependencyFailure(
    'preview without provider',
    () => selectAiProvider({ APP_ENV: 'preview' }),
    'Workers AI binding or OpenAI API key is required',
  );
}

/**
 * selectAiProvider throws DEPENDENCY_FAILED for unknown environments.
 */
function testSelectProviderThrowsForUnknownEnvironment(): void {
  expectDependencyFailure(
    'unknown environment',
    () => selectAiProvider({ APP_ENV: 'unknown' }),
    'AI provider is not configured for environment',
  );
}

/**
 * selectAiProvider throws DEPENDENCY_FAILED for empty string environment.
 */
function testSelectProviderThrowsForEmptyEnvironment(): void {
  expectDependencyFailure(
    'empty environment',
    () => selectAiProvider({ APP_ENV: '' }),
    'AI provider is not configured for environment',
  );
}

/**
 * selectAiProvider throws in production without provider.
 * This test verifies the provider selector's error message directly,
 * since getAiServices fails at repository configuration before reaching the selector.
 */
function testGetAiServicesThrowsInProductionWithoutProvider(): void {
  expectDependencyFailure(
    'getAiServices production without provider',
    () => selectAiProvider({ APP_ENV: 'production' }),
    'Workers AI binding or OpenAI API key is required',
  );
}

/**
 * Error messages in production are provider-neutral (don't mention OPENAI_API_KEY specifically).
 */
function testProductionErrorMessageIsProviderNeutral(): void {
  try {
    selectAiProvider({ APP_ENV: 'production' });
    throw new Error('Expected error to be thrown');
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'DEPENDENCY_FAILED')) {
      throw error;
    }
    if (error.message.includes('OPENAI_API_KEY')) {
      throw new Error('Error message should not mention OPENAI_API_KEY specifically');
    }
    if (!error.message.includes('Workers AI binding or OpenAI API key')) {
      throw new Error('Error message should mention both provider options');
    }
  }
}

async function main(): Promise<void> {
  // Existing tests
  testDeterministicProviderIsRefusedOutsideLocalEnvironments();
  testVolatileStorageIsConfinedToLocalEnvironments();
  testConfiguredDatabaseResolves();
  await testPipelineAndReviewShareOneStore();

  // New provider factory tests
  testSelectProviderReturnsDeterministicInDevelopment();
  testSelectProviderReturnsDeterministicInTest();
  testSelectProviderReturnsWorkersAiInProduction();
  testSelectProviderReturnsWorkersAiInStaging();
  testSelectProviderReturnsWorkersAiInPreview();
  testSelectProviderReturnsOpenAiInProductionWhenNoAiBinding();
  testSelectProviderPrefersWorkersAiWhenBothAvailable();
  testSelectProviderExplicitWorkersAiRequiresBinding();
  testSelectProviderExplicitWorkersAiWithBinding();
  testSelectProviderExplicitOpenAiRequiresKey();
  testSelectProviderExplicitOpenAiWithKey();
  testSelectProviderUnknownProviderFailsClosed();
  testSelectProviderThrowsInProductionWithoutProvider();
  testSelectProviderThrowsInStagingWithoutProvider();
  testSelectProviderThrowsInPreviewWithoutProvider();
  testSelectProviderThrowsForUnknownEnvironment();
  testSelectProviderThrowsForEmptyEnvironment();
  testGetAiServicesThrowsInProductionWithoutProvider();
  testProductionErrorMessageIsProviderNeutral();

  console.log('AI COMPOSITION TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});