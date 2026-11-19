import { Client } from 'pg';
import type {
  Database,
  SqlParams,
  Transaction,
} from './database.js';

export type PostgresClient = {
  connect(): Promise<unknown>;
  query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: readonly T[] }>;
  release?(): void;
  end(): Promise<void>;
};

export type PostgresClientFactory = (
  connectionString: string,
) => PostgresClient;

const defaultClientFactory: PostgresClientFactory = (
  connectionString,
) => new Client({ connectionString });

/**
 * Publishes the authenticated actor to PostgreSQL for one transaction.
 *
 * Row-level security policies read this value with
 * `app.current_actor_id()`. It is set from the session-resolved actor, never
 * from a request body.
 *
 * The third argument to `set_config` is `true`, which makes the setting
 * transaction-local. Every operation opens a transaction, sets the actor,
 * runs its statements, and commits or rolls back before the client is
 * closed. This matters for Hyperdrive's transaction-mode pooling: the next
 * statement may run on a different backend, and a session-scoped setting
 * written before `BEGIN` can be absent, stale, or visible to another
 * request. A transaction-local setting is discarded with the transaction.
 *
 * A missing value is intentionally not defaulted. The policies fail closed,
 * so a path that forgets to pass an actor sees no tenant-owned rows rather
 * than another account's.
 */
const SET_ACTOR_SQL =
  "select set_config('app.actor_id', $1, true)";

export class PostgresDatabase implements Database {
  constructor(
    private readonly connectionString: string,
    private readonly createClient: PostgresClientFactory =
      defaultClientFactory,
    private readonly actorId?: string,
  ) {
    if (
      actorId !== undefined &&
      actorId.trim().length === 0
    ) {
      throw new Error(
        'A PostgreSQL actor id must be a non-empty string.',
      );
    }
  }

  /**
   * A database handle whose connections carry the authenticated actor.
   *
   * Request-scoped composition uses this rather than the constructor so the
   * policy contract is named at the point that decides it.
   */
  static forActor(
    connectionString: string,
    actorId: string,
  ): PostgresDatabase {
    return new PostgresDatabase(
      connectionString,
      defaultClientFactory,
      actorId,
    );
  }

  private async setActor(
    client: PostgresClient,
  ): Promise<void> {
    if (this.actorId === undefined) {
      return;
    }

    await client.query(SET_ACTOR_SQL, [this.actorId]);
  }

  private async rollback(
    client: PostgresClient,
  ): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original operation failure.
    }
  }

  private async close(
    client: PostgresClient,
  ): Promise<void> {
    try {
      await client.end();
    } catch {
      // A cleanup failure must not mask the operation's real outcome.
    }
  }

  async query<T>(
    sql: string,
    params?: SqlParams,
  ): Promise<readonly T[]> {
    const client = this.createClient(this.connectionString);
    let transactionStarted = false;

    try {
      await client.connect();
      await client.query('BEGIN');
      transactionStarted = true;

      await this.setActor(client);

      const result = await client.query<T>(
        sql,
        params,
      );

      await client.query('COMMIT');
      transactionStarted = false;

      return result.rows;
    } catch (error) {
      if (transactionStarted) {
        await this.rollback(client);
      }

      throw error;
    } finally {
      await this.close(client);
    }
  }

  async transaction<T>(
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const client = this.createClient(this.connectionString);
    let transactionStarted = false;

    try {
      await client.connect();
      await client.query('BEGIN');
      transactionStarted = true;

      await this.setActor(client);

      const tx: Transaction = {
        query: async <R>(
          sql: string,
          params?: SqlParams,
        ): Promise<readonly R[]> => {
          const result = await client.query<R>(
            sql,
            params,
          );

          return result.rows;
        },
      };

      const result = await operation(tx);

      await client.query('COMMIT');
      transactionStarted = false;

      return result;
    } catch (error) {
      if (transactionStarted) {
        await this.rollback(client);
      }

      throw error;
    } finally {
      await this.close(client);
    }
  }
}
