import { CatalogService } from './application/catalog-service.js';
import { InMemoryCatalogRepository } from './infrastructure/in-memory-catalog-repository.js';
import { PostgresCatalogRepository } from './infrastructure/postgres-catalog-repository.js';
import { PostgresDatabase } from '../../shared/persistence/postgres-database.js';
import { resolvePostgresConnectionString } from '../../shared/persistence/postgres-connection.js';
import type { PostgresConnectionEnv } from '../../shared/persistence/postgres-connection.js';
import { AppError } from '../../shared/errors/app-error.js';

export type DatabaseBindingEnv = PostgresConnectionEnv & {
  APP_ENV?: string;
};

const inMemoryRepository =
  new InMemoryCatalogRepository();

const inMemoryService =
  new CatalogService(inMemoryRepository);

/**
 * Environments in which a non-persistent repository is acceptable.
 *
 * In-memory storage is a convenience for local development and tests
 * only. It is not a fallback: an environment that is expected to hold
 * real data must be configured, and silently substituting volatile
 * storage would serve a deployment that appears healthy while losing
 * every write.
 */
function allowsInMemoryRepository(
  environment: string | undefined,
): boolean {
  return (
    environment === 'development' ||
    environment === 'test'
  );
}

export function getCatalogService(
  env: DatabaseBindingEnv,
): CatalogService {
  const connectionString =
    resolvePostgresConnectionString(env);

  if (connectionString) {
    const database = new PostgresDatabase(
      connectionString,
    );

    return new CatalogService(
      new PostgresCatalogRepository(database),
    );
  }

  if (allowsInMemoryRepository(env.APP_ENV)) {
    return inMemoryService;
  }

  throw new AppError(
    'DEPENDENCY_FAILED',
    'PostgreSQL is not configured for this environment.',
  );
}
