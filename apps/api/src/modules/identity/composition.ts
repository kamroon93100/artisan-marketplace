import { Client } from 'pg';
import { IdentityService } from './application/identity-service.js';
import { InMemorySessionStore } from './infrastructure/in-memory-session-store.js';
import {
  PostgresSessionStore,
  createCredentialHasherSync,
  type SessionStoreConnection,
} from './infrastructure/postgres-session-store.js';
import {
  resolvePostgresConnectionString,
} from '../../shared/persistence/postgres-connection.js';
import type {
  PostgresConnectionEnv,
} from '../../shared/persistence/postgres-connection.js';
import {
  allowsLocalInMemoryAuthState,
  type LocalAuthStatePolicyEnv,
} from '../../shared/context/auth-state-policy.js';

export type IdentityEnv = LocalAuthStatePolicyEnv & {
  APP_ENV?: string;
  /**
   * Injectable connection seam for tests and proofs. A deployed Worker never
   * receives it: the request environment carries `HYPERDRIVE`, which
   * `resolveIdentityConnection` turns into the connection below.
   */
  DB_POOL?: SessionStoreConnection;
} & PostgresConnectionEnv;

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
 * Returns null if no database connection is provided.
 */
export function createPostgresSessionStore(
  pool: SessionStoreConnection | null | undefined,
): PostgresSessionStore | null {
  if (!pool) return null;

  const hashFn = createCredentialHasherSync();
  return new PostgresSessionStore(pool, hashFn);
}

/**
 * A connection that opens a socket per operation and closes it when the
 * operation ends.
 *
 * This is the Workers-correct connection model, and it is the same model
 * the PostgreSQL repositories already use (`PostgresDatabase` opens a
 * `Client` per query). A Worker isolate lives across requests but must not
 * keep a PostgreSQL client idle between them: measured against the guarded
 * local database through `wrangler dev`, a client left idle in a pool is
 * dead by the next request, and the query that reuses it never settles
 * until the runtime cancels the request — so every request that reused a
 * pooled connection hung while requests that opened a fresh one succeeded.
 * One connection per operation cannot hand a stale socket to the next
 * request because there is no next request sharing it.
 *
 * `connect()` checks out a client for a transaction; `release()` closes it,
 * which is what the store's transaction blocks already expect.
 */
export function createSessionStoreConnection(
  connectionString: string,
): SessionStoreConnection {
  return {
    async query(sql, params) {
      const client = new Client({ connectionString });
      await client.connect();
      try {
        // The store passes its parameters positionally; `any[]` is the
        // driver's own parameter shape, and the call site already
        // validated them.
        return await client.query(sql, params as any[] | undefined);
      } finally {
        await client.end();
      }
    },

    async connect() {
      const client = new Client({ connectionString });
      await client.connect();
      return {
        query: (sql, params) => client.query(sql, params as any[] | undefined),
        release: () => {
          // Not awaited on purpose: the store releases in a `finally`
          // after COMMIT or ROLLBACK, and closing must not mask the
          // original failure. A close error is a closed socket either way.
          void client.end().catch(() => undefined);
        },
      };
    },

    async end() {
      // Nothing is held open: every operation already closed its own
      // connection, so there is nothing for a caller to clean up.
    },
  };
}

/**
 * The session-store connection for an environment, or `null` when the
 * environment configures no database.
 *
 * `DB_POOL` — the injectable seam — always wins, so every existing test
 * and proof keeps the exact connection it passed in. Otherwise the
 * connection is derived from the `HYPERDRIVE` binding, which is what a
 * deployed Worker actually receives, using the same
 * `resolvePostgresConnectionString` the PostgreSQL repositories use, so
 * the Hyperdrive binding stays the single database mechanism.
 *
 * No connection is cached: the binding-derived connection is created per
 * resolution, i.e. per request, and holds no socket between operations.
 *
 * An absent or unusable binding resolves to `null` rather than to a best
 * guess: the caller's fail-closed guard must stay in charge of a
 * deployment that would otherwise silently lose every session write.
 */
export function resolveIdentityConnection(
  env: IdentityEnv,
): SessionStoreConnection | null {
  if (env.DB_POOL) {
    return env.DB_POOL;
  }

  const connectionString = resolvePostgresConnectionString(env);

  if (connectionString === undefined) {
    return null;
  }

  return createSessionStoreConnection(connectionString);
}

/**
 * Whether a deployment is able to verify a session at all.
 *
 * This is a configuration check only — it never constructs a pool — so
 * the authentication boundary can distinguish "the credential was
 * refused" (401) from "there is nothing to verify a credential against"
 * (the fail-closed `DEPENDENCY_FAILED`) without opening a connection to
 * answer an anonymous request.
 */
export function hasSessionStoreConfigured(env: IdentityEnv): boolean {
  return (
    Boolean(env.DB_POOL) ||
    resolvePostgresConnectionString(env) !== undefined
  );
}

/**
 * Creates an IdentityService with the appropriate store for the environment.
 *
 * The in-memory store is available only when the shared policy permits
 * process-local authentication state: an explicit local/test environment,
 * the local-only opt-in, and an explicitly matching non-production build
 * mode. Any environment with a database (the `DB_POOL` seam, or the
 * `HYPERDRIVE` binding a deployed Worker receives) uses the PostgreSQL
 * store. Without either store, the result is null (closed failure).
 *
 * `buildMode` is a test seam only. Production call sites omit it, so the
 * statically replaced `process.env.NODE_ENV` decides.
 */
export function createIdentityService(
  env: IdentityEnv,
  buildMode: string | undefined = process.env.NODE_ENV,
): IdentityService | null {
  if (allowsInMemorySessionStore(env, buildMode)) {
    return inMemoryIdentityService;
  }

  const store = createPostgresSessionStore(resolveIdentityConnection(env));

  if (store) {
    return new IdentityService(store);
  }

  return null;
}

/**
 * Whether the non-persistent session store is acceptable for this
 * environment.
 *
 * The shared policy is the single source of this decision. A mistaken
 * `APP_ENV` or a copied local opt-in cannot enable process-local sessions in
 * a production build, and a missing or unknown build mode fails closed.
 */
export function allowsInMemorySessionStore(
  env: LocalAuthStatePolicyEnv,
  buildMode: string | undefined = process.env.NODE_ENV,
): boolean {
  return allowsLocalInMemoryAuthState(env, buildMode);
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
  buildMode: string | undefined = process.env.NODE_ENV,
): IdentityService | null {
  return createIdentityService(env, buildMode);
}