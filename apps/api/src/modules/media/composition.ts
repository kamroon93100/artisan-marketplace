import { MediaService } from './application/media-service.js';
import { InMemoryMediaRepository } from './infrastructure/in-memory-media-repository.js';
import { PostgresMediaRepository } from './infrastructure/postgres-media-repository.js';
import { PostgresDatabase } from '../../shared/persistence/postgres-database.js';
import { resolvePostgresConnectionString } from '../../shared/persistence/postgres-connection.js';
import {
  getObjectStorage,
  type ObjectStorageBindingEnv,
} from '../../shared/storage/composition.js';
import { getCatalogService } from '../catalog/composition.js';
import type { DatabaseBindingEnv } from '../catalog/composition.js';
import { AppError } from '../../shared/errors/app-error.js';

export type MediaBindingEnv = DatabaseBindingEnv &
  ObjectStorageBindingEnv;

const inMemoryRepository =
  new InMemoryMediaRepository();

/**
 * Media follows the catalog rule: in-memory storage is a development
 * and test convenience, never a silent production fallback. A media
 * record that cannot be persisted would break the catalog's durability
 * guarantee, so the deployment is refused instead.
 */
function allowsInMemoryRepository(
  environment: string | undefined,
): boolean {
  return (
    environment === 'development' ||
    environment === 'test'
  );
}

export function getMediaService(
  env: MediaBindingEnv,
): MediaService {
  const connectionString =
    resolvePostgresConnectionString(env);

  // The storage decision is made before the catalog is resolved, so a
  // missing database is reported as a media misconfiguration rather
  // than surfacing through the catalog's own guard.
  if (!connectionString &&
      !allowsInMemoryRepository(env.APP_ENV)) {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Media storage is not configured for this environment.',
    );
  }

  const catalogService =
    getCatalogService(env);

  if (connectionString) {
    const database = new PostgresDatabase(
      connectionString,
    );

    return new MediaService(
      new PostgresMediaRepository(database),
      catalogService,
      getObjectStorage(env),
    );
  }

  return new MediaService(
    inMemoryRepository,
    catalogService,
    getObjectStorage(env),
  );
}
