import {
  PostgresDatabase,
  type PostgresClient,
} from './postgres-database.js';

type Call = {
  sql: string;
  params?: readonly unknown[];
};

class FakePostgresClient implements PostgresClient {
  readonly calls: Call[] = [];

  private readonly responses = new Map<
    string,
    readonly unknown[]
  >();

  private shouldFailOperation = false;

  setResponse(
    sql: string,
    rows: readonly unknown[],
  ): void {
    this.responses.set(sql, rows);
  }

  failTransactionOperation(): void {
    this.shouldFailOperation = true;
  }

  async connect(): Promise<void> {
    this.calls.push({ sql: 'CONNECT' });
  }

  async query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: readonly T[] }> {
    this.calls.push({ sql, params });

    if (
      this.shouldFailOperation &&
      sql !== 'BEGIN' &&
      sql !== 'ROLLBACK'
    ) {
      throw new Error('simulated query failure');
    }

    return {
      rows:
        (this.responses.get(sql) as readonly T[] | undefined) ??
        [],
    };
  }

  async end(): Promise<void> {
    this.calls.push({ sql: 'END' });
  }
}

function createTestDatabase(
  client: FakePostgresClient,
): PostgresDatabase {
  return new PostgresDatabase(
    'postgres://test',
    () => client,
  );
}

async function testQuery(): Promise<void> {
  const client = new FakePostgresClient();

  client.setResponse(
    'SELECT id FROM media_attachments',
    [{ id: 'media-1' }],
  );

  const database = createTestDatabase(client);

  const rows = await database.query<{ id: string }>(
    'SELECT id FROM media_attachments',
  );

  if (rows.length !== 1 || rows[0]?.id !== 'media-1') {
    throw new Error('Postgres query result was not returned correctly.');
  }

  if (!client.calls.some((call) => call.sql === 'CONNECT')) {
    throw new Error('Database query did not connect.');
  }

  if (!client.calls.some((call) => call.sql === 'END')) {
    throw new Error('Database query did not close the client.');
  }
}

async function testCommit(): Promise<void> {
  const client = new FakePostgresClient();
  const database = createTestDatabase(client);

  const result = await database.transaction(async (tx) => {
    const rows = await tx.query<{ value: number }>(
      'SELECT 1',
    );

    return rows.length;
  });

  if (result !== 0) {
    throw new Error('Transaction returned an unexpected result.');
  }

  const sql = client.calls.map((call) => call.sql);

  if (!sql.includes('BEGIN')) {
    throw new Error('Transaction did not BEGIN.');
  }

  if (!sql.includes('COMMIT')) {
    throw new Error('Successful transaction did not COMMIT.');
  }

  if (sql.includes('ROLLBACK')) {
    throw new Error('Successful transaction unexpectedly ROLLBACKed.');
  }
}

async function testRollback(): Promise<void> {
  const client = new FakePostgresClient();
  client.failTransactionOperation();

  const database = createTestDatabase(client);

  let failed = false;

  try {
    await database.transaction(async (tx) => {
      await tx.query('INSERT INTO test VALUES (1)');
    });
  } catch (error) {
    failed = true;

    if (
      !(error instanceof Error) ||
      error.message !== 'simulated query failure'
    ) {
      throw new Error(
        'Original transaction failure was not preserved.',
      );
    }
  }

  if (!failed) {
    throw new Error('Expected transaction to fail.');
  }

  const sql = client.calls.map((call) => call.sql);

  if (!sql.includes('BEGIN')) {
    throw new Error('Failed transaction did not BEGIN.');
  }

  if (!sql.includes('ROLLBACK')) {
    throw new Error('Failed transaction did not ROLLBACK.');
  }

  if (sql.includes('COMMIT')) {
    throw new Error('Failed transaction must not COMMIT.');
  }
}

async function main(): Promise<void> {
  await testQuery();
  await testCommit();
  await testRollback();

  console.log('POSTGRES ADAPTER TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
