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

export class PostgresDatabase implements Database {
  constructor(
    private readonly connectionString: string,
    private readonly createClient: PostgresClientFactory =
      defaultClientFactory,
  ) {}

  async query<T>(
    sql: string,
    params?: SqlParams,
  ): Promise<readonly T[]> {
    const client = this.createClient(this.connectionString);

    try {
      await client.connect();

      const result = await client.query<T>(
        sql,
        params,
      );

      return result.rows;
    } finally {
      await client.end();
    }
  }

  async transaction<T>(
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const client = this.createClient(this.connectionString);

    try {
      await client.connect();
      await client.query('BEGIN');

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

      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction failure.
      }

      throw error;
    } finally {
      await client.end();
    }
  }
}
