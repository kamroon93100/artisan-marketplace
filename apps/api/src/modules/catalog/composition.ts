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

/**
 * Builds the catalog service for one authenticated request.
 *
 * `actorId` is the session-resolved actor. It is carried into every
 * PostgreSQL connection so row-level security can scope rows to the account
 * that asked. Omitting it is allowed only for composition-level tests and
 * for the in-memory development seam. Under the non-owner application login,
 * a configured deployment that omits it fails closed at the database because
 * no actor setting is present; the owner/superuser connection currently
 * bypasses RLS.
 */
export function getCatalogService(
  env: DatabaseBindingEnv,
  actorId?: string,
): CatalogService {
  const connectionString =
    resolvePostgresConnectionString(env);

  if (connectionString) {
    const database = actorId
      ? PostgresDatabase.forActor(
          connectionString,
          actorId,
        )
      : new PostgresDatabase(connectionString);

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
