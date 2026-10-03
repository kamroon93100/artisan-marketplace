import { IdentityService } from './application/identity-service.js';
import { InMemorySessionStore } from './infrastructure/in-memory-session-store.js';
import { PostgresSessionStore, createCredentialHasherSync } from './infrastructure/postgres-session-store.js';
import type { Pool } from 'pg';

export type IdentityEnv = {
  APP_ENV?: string;
  /** Database connection pool for durable session storage (Phase 1B) */
  DB_POOL?: Pool;
};

/**
 * The session store the request path resolves against.
 *
 * Exported from this file only and deliberately not re-exported by
 * `index.ts`, so session storage is not part of this module's public
 * interface. Tests inside the module use it to place sessions with
 * controlled lifetimes into the same store `requireActor` reads.
 */
export const identitySessionStore = new InMemorySessionStore();

const inMemoryIdentityService = new IdentityService(
  identitySessionStore,
);

/**
 * Creates a PostgreSQL-backed session store for durable storage.
 * Returns null if no database pool is provided.
 */
export function createPostgresSessionStore(
  pool: Pool | undefined,
): PostgresSessionStore | null {
  if (!pool) return null;

  const hashFn = createCredentialHasherSync();
  return new PostgresSessionStore(pool, hashFn);
}

/**
 * Creates an IdentityService with the appropriate store for the environment.
 * For development/test: uses in-memory store.
 * For other environments with DB_POOL: uses PostgreSQL store.
 * For other environments without DB_POOL: returns null (closed failure).
 */
export function createIdentityService(
  env: IdentityEnv,
): IdentityService | null {
  // Development/test: use in-memory store
  if (allowsInMemorySessionStore(env.APP_ENV)) {
    return inMemoryIdentityService;
  }

  // Production/staging with database: use PostgreSQL store
  if (env.DB_POOL) {
    const pgStore = createPostgresSessionStore(env.DB_POOL);
    if (pgStore) {
      return new IdentityService(pgStore);
    }
  }

  // No store configured
  return null;
}

/**
 * Environments in which the non-persistent session store is acceptable.
 *
 * Phase 1A has no durable session storage, so the only store that exists
 * is volatile. Volatile session state in a deployed environment would
 * present working authentication that silently resets per isolate and per
 * restart, which is worse than having none: the identity resolution is
 * therefore available only in development and test, and every other
 * environment keeps the exact behavior it has today (configured static
 * session, development/test seam, or a closed failure).
 *
 * Durable storage is Phase 1B and needs its own migration approval; when
 * it lands, this is the one function that changes.
 */
export function allowsInMemorySessionStore(
  environment: string | undefined,
): boolean {
  return (
    environment === 'development' ||
    environment === 'test'
  );
}

/**
 * The Identity session resolver for an environment, or `null` when this
 * environment has no session store configured.
 *
 * `null` is not an error: it means "Identity has nothing to verify a
 * credential against here", which `requireActor` reports through its
 * existing failure semantics rather than inventing a new one.
 *
 * @deprecated Use createIdentityService instead for explicit control.
 */
export function getIdentityService(
  env: IdentityEnv,
): IdentityService | null {
  return createIdentityService(env);
}