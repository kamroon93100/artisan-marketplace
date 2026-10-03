import {
  PostgresMediaRepository,
} from './postgres-media-repository.js';
import type {
  Database,
} from '../../../shared/persistence/database.js';

type QueryCall = {
  sql: string;
  params?: readonly unknown[];
};

class FakeDatabase implements Database {
  readonly calls: QueryCall[] = [];
  private queuedRows: Array<readonly unknown[]> = [];

  queueRows(...rows: readonly unknown[][]): void {
    this.queuedRows = [...rows];
  }

  async query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly T[]> {
    this.calls.push({ sql, params });
    return (this.queuedRows.shift() ?? []) as readonly T[];
  }

  async transaction<T>(): Promise<T> {
    throw new Error(
      'transaction not used in this repository test',
    );
  }
}

function mediaRow() {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    product_id: '00000000-0000-0000-0000-000000000002',
    owner_id: '00000000-0000-0000-0000-000000000003',
    kind: 'IMAGE' as const,
    object_key: null,
    content_type: 'image/jpeg',
    size_bytes: 4096,
    state: 'REQUESTED' as const,
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
  };
}

async function testInsert(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([mediaRow()]);

  const repository =
    new PostgresMediaRepository(database);

  const result = await repository.create({
    productId: mediaRow().product_id,
    ownerId: mediaRow().owner_id,
    kind: 'IMAGE',
    contentType: 'image/jpeg',
    sizeBytes: 4096,
    idempotencyKey: 'idem-1',
  });

  if (
    result.id !== mediaRow().id ||
    result.productId !== mediaRow().product_id ||
    result.ownerId !== mediaRow().owner_id ||
    result.state !== 'REQUESTED'
  ) {
    throw new Error(
      'Postgres media repository did not map inserted data correctly.',
    );
  }

  if (!database.calls[0]?.sql.includes('ON CONFLICT')) {
    throw new Error(
      'Media insert must protect the idempotency boundary.',
    );
  }
}

async function testExistingIdempotencyRow(): Promise<void> {
  const database = new FakeDatabase();

  database.queueRows([], [mediaRow()]);

  const repository =
    new PostgresMediaRepository(database);

  const result = await repository.create({
    productId: mediaRow().product_id,
    ownerId: mediaRow().owner_id,
    kind: 'IMAGE',
    contentType: 'image/jpeg',
    sizeBytes: 4096,
    idempotencyKey: 'idem-existing',
  });

  if (result.id !== mediaRow().id) {
    throw new Error(
      'Existing idempotency row was not returned.',
    );
  }

  if (database.calls.length !== 2) {
    throw new Error(
      'Conflict path should perform insert attempt followed by lookup.',
    );
  }
}

async function testFind(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([mediaRow()]);

  const repository =
    new PostgresMediaRepository(database);

  const result =
    await repository.findByIdempotencyKey(
      mediaRow().product_id,
      'idem-find',
    );

  if (!result || result.id !== mediaRow().id) {
    throw new Error(
      'Media lookup did not return the expected attachment.',
    );
  }

  if (
    !database.calls[0]?.sql.includes(
      'WHERE product_id = $1',
    )
  ) {
    throw new Error(
      'Media lookup must scope idempotency by product.',
    );
  }
}

async function main(): Promise<void> {
  await testInsert();
  await testExistingIdempotencyRow();
  await testFind();

  console.log(
    'POSTGRES MEDIA REPOSITORY TESTS PASSED',
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
