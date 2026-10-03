import { getCatalogService } from '../catalog/composition.js';
import type { DatabaseBindingEnv } from '../catalog/composition.js';
import { AppError } from '../../shared/errors/app-error.js';
import { AiPipelineService } from './application/ai-pipeline-service.js';
import { AiReviewService } from './application/ai-review-service.js';
import { InMemoryAiRepository } from './infrastructure/in-memory-ai-repository.js';
import { PostgresAiRepository } from './infrastructure/postgres-ai-repository.js';
import { DeterministicCatalogAiProvider } from './infrastructure/deterministic-catalog-ai-provider.js';
import { CatalogServiceCatalogProductPort } from './infrastructure/catalog-service-port.js';
import type { CatalogProductPort } from './application/catalog-product-port.js';
import type { AiRepository } from './application/ai-repository.js';
import { PostgresDatabase } from '../../shared/persistence/postgres-database.js';
import { resolvePostgresConnectionString } from '../../shared/persistence/postgres-connection.js';

export type AiBindingEnv = DatabaseBindingEnv;

export type AiServices = {
  pipeline: AiPipelineService;
  review: AiReviewService;
};

/**
 * Environments in which in-memory AI storage and the deterministic
 * provider are acceptable.
 *
 * Both are local-development conveniences and both are refused outside
 * development and test. The in-memory repository must never be a silent
 * production fallback for the same reason the Catalog module refuses one:
 * a deployment that loses every job looks healthy until the work vanishes.
 * The deterministic provider is refused in production because a stub that
 * answers instead of calling a real provider would make the product look
 * assisted while nothing was being generated.
 */
function allowsInMemoryRepository(
  environment: string | undefined,
): boolean {
  return (
    environment === 'development' ||
    environment === 'test'
  );
}

/**
 * The deterministic local provider is shared so a local development
 * instance and the HTTP test suite answer consistently across requests.
 * Anything that needs a specific scripted outcome constructs its own
 * provider instance in the test.
 */
const inMemoryRepository = new InMemoryAiRepository();
const deterministicProvider =
  new DeterministicCatalogAiProvider();

/**
 * The AI repository for this environment.
 *
 * Exposed to other modules so the choice between volatile and durable AI
 * storage is made in exactly one place. The Review module needs to read
 * outstanding proposals and must reach them through the AI repository
 * rather than through a table, and letting it construct its own repository
 * would be how two copies of the same state quietly appear.
 *
 * Throws `DEPENDENCY_FAILED` in an environment where AI is not configured.
 * That refusal is deliberate and a caller may legitimately have a reason to
 * proceed without AI; see the Review module, where the consequence of AI
 * being unavailable is that there are no suggestions, not that the artisan
 * cannot publish.
 */
export function getAiRepository(
  env: AiBindingEnv,
): AiRepository {
  if (!allowsInMemoryRepository(env.APP_ENV)) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'AI provider is not configured for this environment. Deployment requires a real provider; the deterministic local provider is available only in development and test.',
    );
  }

  const connectionString =
    resolvePostgresConnectionString(env);

  if (connectionString) {
    return new PostgresAiRepository(
      new PostgresDatabase(connectionString),
    );
  }

  return inMemoryRepository;
}

export function getAiServices(
  env: AiBindingEnv,
): AiServices {
  const repository = getAiRepository(env);

  const catalogPort: CatalogProductPort =
    new CatalogServiceCatalogProductPort(
      getCatalogService(env),
    );

  return {
    pipeline: new AiPipelineService(
      repository,
      deterministicProvider,
      catalogPort,
    ),
    review: new AiReviewService(
      repository,
      catalogPort,
    ),
  };
}