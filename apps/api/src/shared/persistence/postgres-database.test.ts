import {
  PostgresDatabase,
  type PostgresClient,
} from './postgres-database.js';

const ACTOR_ID =
  '11111111-1111-4111-8111-111111111111';

const SET_ACTOR_SQL =
  "select set_config('app.actor_id', $1, true)";

type Call = {
  sql: string;
  params?: readonly unknown[];
};

function isControlStatement(sql: string): boolean {
  return sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK';
}

class FakePostgresClient implements PostgresClient {
  readonly calls: Call[] = [];

  actorWasSetInTransaction = false;

  actorWasSetOutsideTransaction = false;

  private readonly responses = new Map<
    string,
    readonly unknown[]
  >();

  private failAllOperations = false;

  private failingSql: string | undefined;

  private actorSettingShouldFail = false;

  private connectError: Error | undefined;

  private transactionActive = false;

  private actorSetting: string | undefined;

  get currentActorSetting(): string | undefined {
    return this.actorSetting;
  }

  setResponse(
    sql: string,
    rows: readonly unknown[],
  ): void {
    this.responses.set(sql, rows);
  }

  failTransactionOperation(): void {
    this.failAllOperations = true;
  }

  failQuery(sql: string): void {
    this.failingSql = sql;
  }

  failActorSetting(): void {
    this.actorSettingShouldFail = true;
  }

  failConnect(error: Error): void {
    this.connectError = error;
  }

  async connect(): Promise<void> {
    this.calls.push({ sql: 'CONNECT' });

    if (this.connectError) {
      throw this.connectError;
    }
  }

  async query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: readonly T[] }> {
    this.calls.push({ sql, params });

    if (sql === 'BEGIN') {
      this.transactionActive = true;
      this.actorSetting = undefined;

      return { rows: [] };
    }

    if (sql === SET_ACTOR_SQL) {
      if (this.actorSettingShouldFail) {
        throw new Error(
          'simulated actor setting failure',
        );
      }

      if (this.transactionActive) {
        this.actorWasSetInTransaction = true;
      } else {
        this.actorWasSetOutsideTransaction = true;
      }

      this.actorSetting = String(params?.[0] ?? '');

      return { rows: [] };
    }

    if (sql === 'COMMIT' || sql === 'ROLLBACK') {
      this.transactionActive = false;
      this.actorSetting = undefined;

      return { rows: [] };
    }

    if (sql.includes("current_setting('app.actor_id'")) {
      return {
        rows: [
          { actor: this.actorSetting ?? null },
        ] as unknown as readonly T[],
      };
    }

    if (
      (this.failAllOperations ||
        this.failingSql === sql) &&
      !isControlStatement(sql)
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

function createActorTestDatabase(
  client: FakePostgresClient,
  actorId: string = ACTOR_ID,
): PostgresDatabase {
  return new PostgresDatabase(
    'postgres://test',
    () => client,
    actorId,
  );
}

function actorCalls(
  client: FakePostgresClient,
): Call[] {
  return client.calls.filter(
    (call) => call.sql === SET_ACTOR_SQL,
  );
}

function requireOrdered(
  client: FakePostgresClient,
  labels: ReadonlyArray<
    readonly [label: string, predicate: (call: Call) => boolean]
  >,
): void {
  let cursor = 0;

  for (const [label, predicate] of labels) {
    const index = client.calls.findIndex(
      (call, callIndex) =>
        callIndex >= cursor && predicate(call),
    );

    if (index === -1) {
      throw new Error(`Expected ${label} to be called.`);
    }

    cursor = index + 1;
  }
}

/**
 * The authenticated actor must reach PostgreSQL inside the same transaction
 * as the protected statement. Hyperdrive can hand the next statement to a
 * different backend, so a session-scoped setting written before BEGIN is not
 * a safe tenant boundary. The fake clears the setting on COMMIT/ROLLBACK and
 * records where it was written, which is the transaction-mode pooling
 * assumption these tests enforce.
 */
async function testActorIsPublishedInsideQueryTransaction(): Promise<void> {
  const client = new FakePostgresClient();

  client.setResponse(
    'SELECT id FROM catalog_products',
    [{ id: 'product-1' }],
  );

  const database = createActorTestDatabase(client);

  const rows = await database.query<{ id: string }>(
    'SELECT id FROM catalog_products',
  );

  if (rows.length !== 1 || rows[0]?.id !== 'product-1') {
    throw new Error(
      'Actor-scoped query result was not returned correctly.',
    );
  }

  const setActor = actorCalls(client);

  if (setActor.length !== 1) {
    throw new Error(
      'Actor-scoped query must set the actor exactly once.',
    );
  }

  if (setActor[0]?.params?.[0] !== ACTOR_ID) {
    throw new Error(
      'Actor-scoped query published the wrong actor.',
    );
  }

  requireOrdered(client, [
    ['CONNECT', (call) => call.sql === 'CONNECT'],
    ['BEGIN', (call) => call.sql === 'BEGIN'],
    ['SET_ACTOR', (call) => call.sql === SET_ACTOR_SQL],
    [
      'operation query',
      (call) => call.sql === 'SELECT id FROM catalog_products',
    ],
    ['COMMIT', (call) => call.sql === 'COMMIT'],
    ['END', (call) => call.sql === 'END'],
  ]);

  if (!client.actorWasSetInTransaction) {
    throw new Error(
      'The actor was not set inside the query transaction.',
    );
  }

  if (client.actorWasSetOutsideTransaction) {
    throw new Error(
      'The actor must not be set outside a transaction.',
    );
  }

  if (client.currentActorSetting !== undefined) {
    throw new Error(
      'The actor setting must be cleared when the transaction ends.',
    );
  }
}

async function testActorIsPublishedInsideExplicitTransaction(): Promise<void> {
  const client = new FakePostgresClient();
  const database = createActorTestDatabase(client);

  await database.transaction(async (tx) => {
    await tx.query('SELECT 1');
  });

  const setActor = actorCalls(client);

  if (setActor.length !== 1) {
    throw new Error(
      'Actor-scoped transaction must set the actor exactly once.',
    );
  }

  if (setActor[0]?.params?.[0] !== ACTOR_ID) {
    throw new Error(
      'Actor-scoped transaction published the wrong actor.',
    );
  }

  requireOrdered(client, [
    ['CONNECT', (call) => call.sql === 'CONNECT'],
    ['BEGIN', (call) => call.sql === 'BEGIN'],
    ['SET_ACTOR', (call) => call.sql === SET_ACTOR_SQL],
    ['operation query', (call) => call.sql === 'SELECT 1'],
    ['COMMIT', (call) => call.sql === 'COMMIT'],
    ['END', (call) => call.sql === 'END'],
  ]);

  if (!client.actorWasSetInTransaction) {
    throw new Error(
      'The actor was not set inside the explicit transaction.',
    );
  }

  if (client.actorWasSetOutsideTransaction) {
    throw new Error(
      'The actor must not be set outside a transaction.',
    );
  }

  if (client.currentActorSetting !== undefined) {
    throw new Error(
      'The actor setting must be cleared when the transaction ends.',
    );
  }
}

async function testQueryRollsBackAndClosesOnFailure(): Promise<void> {
  const client = new FakePostgresClient();
  const database = createActorTestDatabase(client);

  client.failQuery('INSERT INTO catalog_products VALUES (1)');

  let failed = false;

  try {
    await database.query(
      'INSERT INTO catalog_products VALUES (1)',
    );
  } catch (error) {
    failed = true;

    if (
      !(error instanceof Error) ||
      error.message !== 'simulated query failure'
    ) {
      throw new Error(
        'Original query failure was not preserved.',
      );
    }
  }

  if (!failed) {
    throw new Error('Expected query to fail.');
  }

  requireOrdered(client, [
    ['CONNECT', (call) => call.sql === 'CONNECT'],
    ['BEGIN', (call) => call.sql === 'BEGIN'],
    ['SET_ACTOR', (call) => call.sql === SET_ACTOR_SQL],
    [
      'operation query',
      (call) =>
        call.sql ===
        'INSERT INTO catalog_products VALUES (1)',
    ],
    ['ROLLBACK', (call) => call.sql === 'ROLLBACK'],
    ['END', (call) => call.sql === 'END'],
  ]);

  if (
    client.calls.some((call) => call.sql === 'COMMIT')
  ) {
    throw new Error(
      'Failed query must not COMMIT.',
    );
  }

  if (client.currentActorSetting !== undefined) {
    throw new Error(
      'The actor setting must be cleared on rollback.',
    );
  }
}

async function testActorTransactionRollsBackOnFailure(): Promise<void> {
  const client = new FakePostgresClient();
  const database = createActorTestDatabase(client);

  client.failTransactionOperation();

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

  requireOrdered(client, [
    ['CONNECT', (call) => call.sql === 'CONNECT'],
    ['BEGIN', (call) => call.sql === 'BEGIN'],
    ['SET_ACTOR', (call) => call.sql === SET_ACTOR_SQL],
    [
      'operation query',
      (call) => call.sql === 'INSERT INTO test VALUES (1)',
    ],
    ['ROLLBACK', (call) => call.sql === 'ROLLBACK'],
    ['END', (call) => call.sql === 'END'],
  ]);

  if (
    client.calls.some((call) => call.sql === 'COMMIT')
  ) {
    throw new Error(
      'Failed actor transaction must not COMMIT.',
    );
  }

  if (client.currentActorSetting !== undefined) {
    throw new Error(
      'The actor setting must be cleared on transaction rollback.',
    );
  }
}

async function testQueryRollsBackWhenActorSettingFails(): Promise<void> {
  const client = new FakePostgresClient();
  const database = createActorTestDatabase(client);

  client.failActorSetting();

  let failed = false;

  try {
    await database.query('SELECT 1');
  } catch (error) {
    failed = true;

    if (
      !(error instanceof Error) ||
      error.message !== 'simulated actor setting failure'
    ) {
      throw new Error(
        'Actor setting failure was not preserved.',
      );
    }
  }

  if (!failed) {
    throw new Error(
      'Expected actor setting failure to abort the query.',
    );
  }

  requireOrdered(client, [
    ['CONNECT', (call) => call.sql === 'CONNECT'],
    ['BEGIN', (call) => call.sql === 'BEGIN'],
    ['SET_ACTOR', (call) => call.sql === SET_ACTOR_SQL],
    ['ROLLBACK', (call) => call.sql === 'ROLLBACK'],
    ['END', (call) => call.sql === 'END'],
  ]);

  if (
    client.calls.some(
      (call) => call.sql === 'SELECT 1',
    )
  ) {
    throw new Error(
      'The protected query must not run when the actor cannot be set.',
    );
  }
}

async function testConnectFailureStillEndsClient(): Promise<void> {
  const client = new FakePostgresClient();
  const database = createActorTestDatabase(client);

  client.failConnect(new Error('simulated connect failure'));

  let failed = false;

  try {
    await database.query('SELECT 1');
  } catch (error) {
    failed = true;

    if (
      !(error instanceof Error) ||
      error.message !== 'simulated connect failure'
    ) {
      throw new Error(
        'Original connection failure was not preserved.',
      );
    }
  }

  if (!failed) {
    throw new Error('Expected connection to fail.');
  }

  requireOrdered(client, [
    ['CONNECT', (call) => call.sql === 'CONNECT'],
    ['END', (call) => call.sql === 'END'],
  ]);
}

async function testMissingActorDoesNotSetTheSetting(): Promise<void> {
  const client = new FakePostgresClient();
  const database = createTestDatabase(client);

  await database.query('SELECT 1');

  await database.transaction(async (tx) => {
    await tx.query('SELECT 2');
  });

  if (actorCalls(client).length !== 0) {
    throw new Error(
      'A database without an actor must not publish an actor setting.',
    );
  }

  requireOrdered(client, [
    ['first BEGIN', (call) => call.sql === 'BEGIN'],
    ['first COMMIT', (call) => call.sql === 'COMMIT'],
    ['second BEGIN', (call) => call.sql === 'BEGIN'],
    ['second COMMIT', (call) => call.sql === 'COMMIT'],
    ['END', (call) => call.sql === 'END'],
  ]);
}

function testEmptyActorIsRefused(): void {
  for (const actorId of ['', '   ']) {
    let refused = false;

    try {
      createActorTestDatabase(
        new FakePostgresClient(),
        actorId,
      );
    } catch (error) {
      refused = true;

      if (
        !(error instanceof Error) ||
        !error.message.includes(
          'must be a non-empty string',
        )
      ) {
        throw new Error(
          'Empty actor was refused with an unexpected error.',
        );
      }
    }

    if (!refused) {
      throw new Error(
        'An empty actor id must be refused.',
      );
    }
  }
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

  if (!sql.includes('END')) {
    throw new Error('Successful transaction did not close the client.');
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

  if (!sql.includes('END')) {
    throw new Error('Failed transaction did not close the client.');
  }
}

async function main(): Promise<void> {
  await testQuery();
  await testCommit();
  await testRollback();
  await testActorIsPublishedInsideQueryTransaction();
  await testActorIsPublishedInsideExplicitTransaction();
  await testQueryRollsBackAndClosesOnFailure();
  await testActorTransactionRollsBackOnFailure();
  await testQueryRollsBackWhenActorSettingFails();
  await testConnectFailureStillEndsClient();
  await testMissingActorDoesNotSetTheSetting();
  testEmptyActorIsRefused();

  console.log('POSTGRES ADAPTER TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
