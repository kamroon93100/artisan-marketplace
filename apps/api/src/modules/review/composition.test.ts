import assert from 'node:assert/strict';
import { AppError } from '../../shared/errors/app-error.js';
import { getCatalogService } from '../catalog/composition.js';
import { getAiRepository, selectAiProvider } from '../ai/composition.js';
import { CatalogService } from '../catalog/application/catalog-service.js';
import { InMemoryCatalogRepository } from '../catalog/infrastructure/in-memory-catalog-repository.js';
import { getReviewService } from './composition.js';
import type { ReviewBindingEnv } from './composition.js';
import { ReviewService } from './application/review-service.js';
import type { ReviewSuggestionsPort } from './application/review-port.js';
import { CatalogServiceReviewProductPort } from './infrastructure/catalog-review-port.js';
import { AiRepositoryReviewSuggestionsPort } from './infrastructure/ai-suggestions-port.js';

const ARTISAN = '00000000-0000-4000-8000-0000000000d1';

const CONFIGURED_DATABASE = {
  connectionString: 'postgresql://user:pass@127.0.0.1:5432/db',
};

/**
 * A deployed environment with a database and no AI provider.
 *
 * This is the real shape of the case, not a fixture shaped to reach it: the
 * Catalog composition resolves a PostgreSQL service from the connection
 * string, and the AI composition refuses the same environment because a
 * deployment requires a real provider. That is why the AI refusal reaches
 * the Review composition at all — the catalog half has already succeeded by
 * the time the suggestions half is resolved.
 */
const UNCONFIGURED_AI: ReviewBindingEnv = {
  APP_ENV: 'production',
  HYPERDRIVE: CONFIGURED_DATABASE,
};

function captureThrown(
  run: () => unknown,
): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error(
    'Expected something to be raised, but nothing was.',
  );
}

/**
 * The suggestions port a composed review service was actually wired with.
 *
 * The Review service's port is a TypeScript `private`, which is compile-time
 * only, and reading it is the only way to observe the wiring the composition
 * chose. The alternative would be to export the fallback class or to inject a
 * repository factory into production code purely so a test could see it,
 * which is a larger change to a module boundary than this assertion is worth.
 * A renamed field fails loudly here instead of passing quietly, because a
 * missing port is reported rather than treated as a fallback.
 */
function suggestionsPortOf(
  service: ReviewService,
): ReviewSuggestionsPort {
  const port = (
    service as unknown as {
      suggestions?: ReviewSuggestionsPort;
    }
  ).suggestions;

  if (!port) {
    throw new Error(
      'The composed review service does not expose the suggestions port it was wired with.',
    );
  }

  return port;
}

/**
 * An environment whose AI resolution raises a chosen error while its catalog
 * resolution still succeeds.
 *
 * `APP_ENV` is read by the AI composition on every call, and by the Catalog
 * composition only when no connection string is configured. An environment
 * that therefore carries a real connection string and a failing `APP_ENV`
 * read makes `getCatalogService` succeed and `getAiRepository` raise, which
 * is the seam this composition offers: it is handed an environment, and
 * every error it can see comes out of the two compositions it calls.
 */
function environmentWhereAiResolutionFailsWith(
  failure: unknown,
): ReviewBindingEnv {
  return {
    HYPERDRIVE: CONFIGURED_DATABASE,
    get APP_ENV(): string {
      throw failure;
    },
  };
}

async function syncedProduct(
  catalog: CatalogService,
): Promise<string> {
  const draft = (
    await catalog.createDraft({
      ownerId: ARTISAN,
      title: 'Basket',
      description: 'Handwoven storage basket.',
    })
  ).product;

  for (const state of [
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
  ] as const) {
    await catalog.transition(draft.id, state, ARTISAN);
  }

  return draft.id;
}

/**
 * The AI module's refusal to run without a provider is a refusal, not a
 * fault, and the review condition must not become a publication outage
 * because of it (ADR-002). The composition therefore resolves that one
 * refusal to "no outstanding suggestions", and approval keeps working for a
 * product whose artisan supplied every field themselves.
 *
 * Each half of that is asserted separately, because either can hold without
 * the other. The environment is shown to really refuse AI, so the
 * composition below is known to have met the refusal; and the composed
 * service is shown to carry the fallback rather than the AI adapter, so
 * approval is shown to run against a review surface that cannot see AI —
 * which is the only condition under which "AI is unavailable" and "the
 * product is clear to publish" are both true.
 */
async function testUnconfiguredAiFallsBackAndApprovalStillWorks(): Promise<void> {
  const refusal = captureThrown(() =>
    selectAiProvider(UNCONFIGURED_AI),
  );

  assert.ok(
    refusal instanceof AppError,
    'the AI composition refuses an unconfigured environment with an AppError',
  );
  assert.equal(
    refusal.code,
    'DEPENDENCY_FAILED',
    'the refusal is the documented DEPENDENCY_FAILED, which is the one error the review composition absorbs',
  );

  /**
   * The refusal above is proven on its own so it cannot be satisfied by a
   * different guard: the composition is only exercised meaningfully if the AI
   * half really was asked and really did refuse.
   */
  const composed = getReviewService(UNCONFIGURED_AI);

  const port = suggestionsPortOf(composed);

  assert.equal(
    port instanceof AiRepositoryReviewSuggestionsPort,
    false,
    'an unconfigured AI environment is not wired to the AI adapter, which could not have been built at all',
  );
  assert.equal(
    port.constructor.name,
    'NoSuggestionsPort',
    'the fallback is the module’s own no-suggestions port, not an arbitrary stand-in',
  );

  /**
   * The catalog half of the same composition is PostgreSQL in this
   * environment, and this suite runs with no database, so the port the
   * composition chose is paired here with a real in-memory catalog service.
   * That substitution is confined to the dependency under test: the
   * suggestions port is the one the composition just built, and the catalog
   * service and its port adapter are the real ones the composition uses.
   */
  const catalog = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const review = new ReviewService(
    new CatalogServiceReviewProductPort(catalog),
    port,
  );

  const productId = await syncedProduct(catalog);
  const surface = await review.getReview(productId, ARTISAN);

  assert.deepEqual(
    surface.suggestions,
    [],
    'an environment with no AI work has no outstanding suggestion, which is an honest answer rather than "cannot tell"',
  );
  assert.equal(
    surface.readyForApproval,
    true,
    'a fully described product with no AI work is approvable while AI is unavailable',
  );

  const approved = await review.approve(productId, ARTISAN);

  assert.equal(
    approved.product.state,
    'APPROVED',
    'approval still establishes APPROVED without a provider',
  );
  assert.equal(
    approved.deduplicated,
    false,
    'the approval is recorded as the one that established the state',
  );
  assert.equal(
    (await catalog.getById(productId)).state,
    'APPROVED',
    'the state reached without AI is durable in the catalog, not merely reported',
  );

  /**
   * The fallback has to be a consequence of the refusal rather than the
   * default wiring, or the assertion above would hold for a composition that
   * never consults AI at all.
   */
  assert.equal(
    suggestionsPortOf(
      getReviewService({ APP_ENV: 'development' }),
    ) instanceof AiRepositoryReviewSuggestionsPort,
    true,
    'an AI-configured environment is wired to the AI adapter, so the fallback is chosen because the refusal happened',
  );
}

/**
 * Everything except that one refusal must reach the caller.
 *
 * Swallowing a real fault would let approval proceed on a review surface that
 * cannot see AI at all, which is the silent corruption the AI contract
 * exists to prevent: the artisan would be told their product is clear while
 * an undecided suggestion was sitting in the queue. The guard is therefore
 * narrow by design — a different error code, and an error that is not an
 * `AppError` at all, both have to pass through untouched.
 */
function testOtherFailuresAreNotSwallowed(): void {
  const failures: {
    failure: unknown;
    why: string;
  }[] = [
    {
      failure: new AppError(
        'TRANSIENT_FAILURE',
        'The AI provider connection pool could not be created.',
      ),
      why: 'an AppError carrying a different code is a different fault, not the AI module’s documented refusal',
    },
    {
      failure: new TypeError(
        'connectionString.replace is not a function',
      ),
      why: 'an error that is not an AppError carries no contract at all and cannot be reasoned about from its code',
    },
  ];

  for (const { failure, why } of failures) {
    const env = environmentWhereAiResolutionFailsWith(
      failure,
    );

    /**
     * Proven so the failure cannot be attributed to the catalog half. If
     * `getCatalogService` refused this environment, the composition would
     * have propagated an error it never caught, and every assertion below
     * would hold without testing the guard at all.
     */
    assert.ok(
      getCatalogService(env),
      'the catalog half still resolves, so the failure belongs to the AI half',
    );

    const raised = captureThrown(() =>
      getReviewService(env),
    );

    assert.equal(
      raised,
      failure,
      `the exact failure reaches the caller, unreplaced and unswallowed: ${why}`,
    );
  }
}

async function main(): Promise<void> {
  await testUnconfiguredAiFallsBackAndApprovalStillWorks();
  testOtherFailuresAreNotSwallowed();

  console.log('REVIEW COMPOSITION TESTS PASSED');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
