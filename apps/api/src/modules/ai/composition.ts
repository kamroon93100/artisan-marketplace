import { getCatalogService } from '../catalog/composition.js';
import { getMediaService } from '../media/composition.js';
import type { DatabaseBindingEnv } from '../catalog/composition.js';
import { AppError } from '../../shared/errors/app-error.js';
import { AiPipelineService } from './application/ai-pipeline-service.js';
import { AiReviewService } from './application/ai-review-service.js';
import { InMemoryAiRepository } from './infrastructure/in-memory-ai-repository.js';
import { PostgresAiRepository } from './infrastructure/postgres-ai-repository.js';
import { DeterministicCatalogAiProvider } from './infrastructure/deterministic-catalog-ai-provider.js';
import { OpenAiCatalogAiProvider } from './infrastructure/openai-catalog-ai-provider.js';
import { WorkersAiCatalogAiProvider } from './infrastructure/workers-ai-catalog-ai-provider.js';
import { CatalogServiceCatalogProductPort } from './infrastructure/catalog-service-port.js';
import type { CatalogProductPort } from './application/catalog-product-port.js';
import type { AiRepository } from './application/ai-repository.js';
import type { CatalogAiProvider } from './domain/catalog-ai-provider.js';
import { PostgresDatabase } from '../../shared/persistence/postgres-database.js';
import { resolvePostgresConnectionString } from '../../shared/persistence/postgres-connection.js';
import type { Ai } from '@cloudflare/workers-types';
import type { Queue } from '../../shared/context/api-env.js';
import { createDispatcherRunner } from './application/outbox-dispatcher.js';

export type AiBindingEnv = DatabaseBindingEnv & {
  OPENAI_API_KEY?: string;
  AI_PROVIDER_MODEL?: string;
  AI_PROVIDER_VERSION?: string;
  AI_PROVIDER?: 'workers-ai' | 'openai';
  AI?: Ai;
  AI_JOB_QUEUE?: Queue;
};

export type AiServices = {
  pipeline: AiPipelineService;
  review: AiReviewService;
  dispatcher?: ReturnType<typeof createDispatcherRunner>;
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
 * Environments in which a real AI provider is required.
 * These environments must have either an AI binding (Workers AI) or an OpenAI API key.
 */
function requiresRealProvider(environment: string | undefined): boolean {
  return (
    environment === 'production' ||
    environment === 'staging' ||
    environment === 'preview'
  );
}

/**
 * The deterministic local provider is shared so a local development
 * instance and the HTTP test suite answer consistently across requests.
 * Anything that needs a specific scripted outcome constructs its own
 * provider instance in the test.
 */
const inMemoryRepository = new InMemoryAiRepository();
const deterministicProvider = new DeterministicCatalogAiProvider();

/**
 * Selects the appropriate AI provider for the current environment.
 *
 * - development/test: Returns the deterministic fixture provider (no API key required).
 * - production/staging/preview:
 *   - If AI_PROVIDER is explicitly set to "workers-ai": requires AI binding, fails closed if missing.
 *   - If AI_PROVIDER is explicitly set to "openai": requires OPENAI_API_KEY, fails closed if missing.
 *   - If AI_PROVIDER is not set: prefers Workers AI binding if available, falls back to OpenAI if key available, fails closed otherwise.
 * - Unknown environments: Fail-closed, throws DEPENDENCY_FAILED.
 *
 * This is the single place where the provider selection logic lives.
 * The deterministic provider is never silently used in production.
 */
export function selectAiProvider(env: AiBindingEnv): CatalogAiProvider {
  const environment = env.APP_ENV;

  if (allowsInMemoryRepository(environment)) {
    // Keep deterministic behavior for tests and ordinary local development.
    // An explicit provider setting opts into a real model without changing
    // the fixtures used by the automated test suite.
    if (!env.AI_PROVIDER) {
      return deterministicProvider;
    }

    if (env.AI_PROVIDER === 'workers-ai') {
      if (!env.AI || typeof env.AI.run !== 'function') {
        throw new AppError(
          'DEPENDENCY_FAILED',
          'Workers AI was explicitly selected, but the AI binding is unavailable.',
        );
      }

      return new WorkersAiCatalogAiProvider({
        AI: env.AI,
        AI_PROVIDER_MODEL: env.AI_PROVIDER_MODEL,
        AI_PROVIDER_VERSION: env.AI_PROVIDER_VERSION,
      });
    }

    if (env.AI_PROVIDER === 'openai') {
      const apiKey = env.OPENAI_API_KEY;

      if (!apiKey || !apiKey.trim()) {
        throw new AppError(
          'DEPENDENCY_FAILED',
          'OpenAI was explicitly selected, but OPENAI_API_KEY is not configured.',
        );
      }

      return new OpenAiCatalogAiProvider({
        OPENAI_API_KEY: apiKey,
        AI_PROVIDER_MODEL: env.AI_PROVIDER_MODEL,
        AI_PROVIDER_VERSION: env.AI_PROVIDER_VERSION,
      });
    }

    throw new AppError(
      'DEPENDENCY_FAILED',
      'The configured development AI provider is not supported.',
    );
  }

  if (requiresRealProvider(environment)) {
    const explicitProvider = env.AI_PROVIDER;

    if (explicitProvider === 'workers-ai') {
      if (!env.AI || typeof env.AI.run !== 'function') {
        throw new AppError(
          'DEPENDENCY_FAILED',
          'AI provider is not configured for this environment. Workers AI binding is required when AI_PROVIDER=workers-ai.',
        );
      }
      return new WorkersAiCatalogAiProvider({
        AI: env.AI,
        AI_PROVIDER_MODEL: env.AI_PROVIDER_MODEL,
        AI_PROVIDER_VERSION: env.AI_PROVIDER_VERSION,
      });
    }

    if (explicitProvider === 'openai') {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey || !apiKey.trim()) {
        throw new AppError(
          'DEPENDENCY_FAILED',
          'AI provider is not configured for this environment. OpenAI API key is required when AI_PROVIDER=openai.',
        );
      }
      return new OpenAiCatalogAiProvider({
        OPENAI_API_KEY: apiKey,
        AI_PROVIDER_MODEL: env.AI_PROVIDER_MODEL,
        AI_PROVIDER_VERSION: env.AI_PROVIDER_VERSION,
      });
    }

    // No explicit provider: prefer Workers AI binding, then OpenAI key
    if (env.AI && typeof env.AI.run === 'function') {
      return new WorkersAiCatalogAiProvider({
        AI: env.AI,
        AI_PROVIDER_MODEL: env.AI_PROVIDER_MODEL,
        AI_PROVIDER_VERSION: env.AI_PROVIDER_VERSION,
      });
    }

    const apiKey = env.OPENAI_API_KEY;
    if (apiKey && apiKey.trim()) {
      return new OpenAiCatalogAiProvider({
        OPENAI_API_KEY: apiKey,
        AI_PROVIDER_MODEL: env.AI_PROVIDER_MODEL,
        AI_PROVIDER_VERSION: env.AI_PROVIDER_VERSION,
      });
    }

    throw new AppError(
      'DEPENDENCY_FAILED',
      'AI provider is not configured for this environment. Workers AI binding or OpenAI API key is required for production, staging, and preview environments.',
    );
  }

  throw new AppError(
    'DEPENDENCY_FAILED',
    `AI provider is not configured for environment "${String(environment)}". Deployment requires a real provider; the deterministic local provider is available only in development and test.`,
  );
}

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
  actorId?: string,
): AiRepository {
  const connectionString =
    resolvePostgresConnectionString(env);

  if (connectionString) {
    const database = actorId
      ? PostgresDatabase.forActor(
          connectionString,
          actorId,
        )
      : new PostgresDatabase(connectionString);

    return new PostgresAiRepository(database);
  }

  if (allowsInMemoryRepository(env.APP_ENV)) {
    return inMemoryRepository;
  }

  throw new AppError(
    'DEPENDENCY_FAILED',
    'PostgreSQL is not configured for this environment.',
  );
}

export function getAiServices(
  env: AiBindingEnv,
  actorId?: string,
): AiServices {
  const repository = getAiRepository(
    env,
    actorId,
  );

  const catalogPort: CatalogProductPort =
    new CatalogServiceCatalogProductPort(
      getCatalogService(env, actorId),
    );

  const provider = selectAiProvider(env);

  // Only the configured vision-capable model resolves private image bytes.
  // Deterministic fixtures and text-only providers retain their existing behavior.
  const resolveAiImage =
    provider.attribution.provider === 'workers-ai' &&
    provider.attribution.model === '@cf/qwen/qwen3.8-27b'
      ? async (mediaId: string, imageOwnerId: string, productId: string) => ({
          mediaId,
          ...await getMediaService(env, imageOwnerId).readVerifiedImage(
            mediaId,
            imageOwnerId,
            productId,
          ),
        })
      : undefined;

  const services: AiServices = {
    pipeline: new AiPipelineService(
      repository,
      provider,
      catalogPort,
      resolveAiImage,
    ),
    review: new AiReviewService(
      repository,
      catalogPort,
    ),
  };

  // Create dispatcher runner if queue binding is available
  // The dispatcher needs a database connection without a specific actor
  // because it operates on the outbox table which doesn't have RLS
  if (env.AI_JOB_QUEUE) {
    const connectionString = resolvePostgresConnectionString(env);
    if (connectionString) {
      // Use a database connection without actor context for the dispatcher
      // The outbox table doesn't have RLS, so it doesn't need actor_id
      const database = new PostgresDatabase(connectionString);
      services.dispatcher = createDispatcherRunner(database, env.AI_JOB_QUEUE);
    }
  }

  return services;
}