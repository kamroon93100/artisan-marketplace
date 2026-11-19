import { getCatalogService } from '../catalog/composition.js';
import type { DatabaseBindingEnv } from '../catalog/composition.js';
import { AppError } from '../../shared/errors/app-error.js';
import { InquiryService } from './application/inquiry-service.js';
import { InMemoryInquiryRepository } from './infrastructure/in-memory-inquiry-repository.js';
import { PostgresInquiryRepository } from './infrastructure/postgres-inquiry-repository.js';
import { CatalogServicePublishedProductPort } from './infrastructure/catalog-published-port.js';
import { PostgresDatabase } from '../../shared/persistence/postgres-database.js';
import { resolvePostgresConnectionString } from '../../shared/persistence/postgres-connection.js';

export type InquiryBindingEnv = DatabaseBindingEnv;

/**
 * One in-memory store for the whole process, matching how the catalog
 * module keeps its own.
 *
 * Shared rather than per-request so a retry inside a single process sees the
 * inquiry the first attempt created. A per-request store would make every
 * retry look like a first attempt, which is the exact failure the
 * `Idempotency-Key` requirement exists to prevent.
 */
const inMemoryInquiryRepository =
  new InMemoryInquiryRepository();

/**
 * Builds the inquiry service over whatever storage this environment has.
 *
 * The catalog is reached through the same `getCatalogService` every other
 * module uses, so the inquiries a local environment creates are checked
 * against the same published catalog that environment serves. Inquiry
 * storage is chosen the same way and for the same reason: PostgreSQL when it
 * is configured, and a shared in-memory store only in development or test.
 *
 * When neither is available the request is refused rather than answered from
 * volatile storage. A buyer who was told an inquiry was recorded, and then
 * found it gone, is worse off than one who was told the request could not be
 * accepted.
 */
export function getInquiryService(
  env: InquiryBindingEnv,
  actorId?: string,
): InquiryService {
  const catalog = getCatalogService(env, actorId);
  const connectionString = resolvePostgresConnectionString(env);

  if (connectionString) {
    const database = actorId
      ? PostgresDatabase.forActor(
          connectionString,
          actorId,
        )
      : new PostgresDatabase(connectionString);

    return new InquiryService(
      new PostgresInquiryRepository(database),
      new CatalogServicePublishedProductPort(catalog),
    );
  }

  if (
    env.APP_ENV === 'development' ||
    env.APP_ENV === 'test'
  ) {
    return new InquiryService(
      inMemoryInquiryRepository,
      new CatalogServicePublishedProductPort(catalog),
    );
  }

  throw new AppError(
    'DEPENDENCY_FAILED',
    'PostgreSQL is not configured for this environment.',
  );
}
