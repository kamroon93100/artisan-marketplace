import {
  PostgresInquiryRepository,
} from './postgres-inquiry-repository.js';
import { InquiryCreateConflictError } from '../application/inquiry-repository.js';
import type {
  Database,
  Transaction,
} from '../../../shared/persistence/database.js';

type QueryCall = {
  sql: string;
  params?: readonly unknown[];
};

/**
 * A database that records what was asked and answers with queued rows.
 *
 * These tests assert on the SQL and on the answer the repository gives for
 * each shape of database response. That is the only part of a Postgres
 * repository that can be checked without a live server, and it is where the
 * properties worth protecting live: what the buyer is scoped by, how the
 * bounds are passed, and what happens when the write is refused.
 */
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
    this.calls.push({
      sql,
      params,
    });

    return (this.queuedRows.shift() ?? []) as readonly T[];
  }

  async transaction<T>(
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    return operation({
      query: (sql, params) => this.query(sql, params),
    });
  }
}

const BUYER = '00000000-0000-4000-8000-0000000000b1';
const PRODUCT = '00000000-0000-4000-8000-0000000000p1';

function inquiryRow() {
  return {
    id: '00000000-0000-4000-8000-0000000000a1',
    buyer_id: BUYER,
    product_id: PRODUCT,
    catalog_version: '2',
    message: 'Is this still available?',
    status: 'NEW' as const,
    created_at: '2026-09-28T10:00:00.000Z',
    updated_at: '2026-09-28T10:00:00.000Z',
  };
}

function expect(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

/**
 * SQL as one lowercase line.
 *
 * The checks below are about which clauses a statement has, not about how it
 * is indented, so the text is normalized first. An assertion that depended
 * on the layout would fail on a reformat and pass on a semantically wrong
 * query that happened to be formatted the same way.
 */
function normalize(sql: string | undefined): string {
  return (sql ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const CREATE_INPUT = {
  buyerId: BUYER,
  productId: PRODUCT,
  catalogVersion: 2,
  message: 'Is this still available?',
  idempotencyKey: 'retry-key-1',
};

/**
 * The row is mapped, and the version is a number rather than the string
 * Postgres returns for a numeric column — a client comparing it would
 * otherwise get a wrong answer from a correct query.
 */
async function testRowIsMapped(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([inquiryRow()]);

  const result =
    await new PostgresInquiryRepository(database).create(
      CREATE_INPUT,
    );

  expect(
    result.created,
    'A row returned by the insert is a creation.',
  );
  expect(
    typeof result.inquiry.catalogVersion === 'number' &&
      result.inquiry.catalogVersion === 2,
    `The catalog version is a number, got ${typeof result.inquiry.catalogVersion}.`,
  );
  expect(
    result.inquiry.status === 'NEW' &&
      result.inquiry.buyerId === BUYER,
    'The inquiry carries its buyer and its initial status.',
  );
}

/**
 * Uniqueness is enforced by the database rather than by a read-then-write,
 * and the conflict is resolved by reading the winner.
 *
 * Two concurrent retries of one offline request would both pass a
 * "does it exist yet" check, so that check cannot be what makes creation
 * idempotent.
 */
async function testCreateConvergesOnTheExistingKey(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([], [inquiryRow()]);

  const result =
    await new PostgresInquiryRepository(database).create(
      CREATE_INPUT,
    );

  const insert = database.calls[0];

  expect(
    normalize(insert?.sql).includes(
      'on conflict (buyer_id, idempotency_key)',
    ),
    'The insert declares the unique key as its conflict target, so the database decides.',
  );
  expect(
    normalize(insert?.sql).includes('do nothing'),
    'The conflict is resolved by doing nothing rather than by overwriting.',
  );
  expect(
    !result.created,
    'A refused insert reports that nothing was created.',
  );
  expect(
    result.inquiry.id === inquiryRow().id,
    'A refused insert returns the inquiry the winner created.',
  );

  const lookup = database.calls[1];

  expect(
    normalize(lookup?.sql).includes('idempotency_key = $2'),
    'The winner is found by the buyer and the key.',
  );
  expect(
    JSON.stringify(lookup?.params) ===
      JSON.stringify([BUYER, CREATE_INPUT.idempotencyKey]),
    `The winner lookup is scoped to the buyer and the key, got ${JSON.stringify(lookup?.params)}.`,
  );
}

/**
 * The write is refused, the key is not there, and nothing is known.
 *
 * Reporting that as a lost race would tell a buyer their inquiry was a
 * duplicate when in fact the database gave no answer at all.
 */
async function testUnrefusedWriteWithNoWinnerIsAFault(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([], []);

  let raised: unknown;

  try {
    await new PostgresInquiryRepository(database).create(
      CREATE_INPUT,
    );
  } catch (error) {
    raised = error;
  }

  expect(
    raised instanceof InquiryCreateConflictError,
    `An insert that returned no row and no winner is an infrastructure fault, got ${String(raised)}.`,
  );
}

/**
 * The buyer is part of the `WHERE` clause rather than a filter applied
 * afterwards, so the read cannot express someone else's inquiry.
 */
async function testOwnershipIsInTheQuery(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([inquiryRow()]);

  const inquiry =
    await new PostgresInquiryRepository(
      database,
    ).findOwnedById(inquiryRow().id, BUYER);

  const sql = normalize(database.calls[0]?.sql);

  expect(
    sql.includes('where id = $1 and buyer_id = $2'),
    `Ownership is a conjunct in the query, not a post-filter, got ${database.calls[0]?.sql}.`,
  );
  expect(
    inquiry?.id === inquiryRow().id,
    'A row the query did return is mapped.',
  );
}

/**
 * The same check for the retry lookup, so a replay cannot converge on another
 * buyer's inquiry.
 */
async function testRetryLookupIsScopedToTheBuyer(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([]);

  await new PostgresInquiryRepository(
    database,
  ).findByIdempotencyKey(BUYER, 'retry-key-1');

  const call = database.calls[0];

  expect(
    normalize(call?.sql).includes(
      'where buyer_id = $1 and idempotency_key = $2',
    ),
    `The retry lookup is scoped to the buyer, got ${call?.sql}.`,
  );
  expect(
    JSON.stringify(call?.params) ===
      JSON.stringify([BUYER, 'retry-key-1']),
    `The retry lookup passes the buyer and the key as parameters, got ${JSON.stringify(call?.params)}.`,
  );
}

/**
 * A bounded, totally ordered page, with the total counted separately.
 *
 * A window count would return nothing for an offset past the end, and a
 * buyer with inquiries would then be told they had none. Without the `id`
 * tie-breaker, two inquiries created in the same millisecond could swap
 * places between two requests and one would be skipped or repeated.
 */
async function testListIsBoundedScopedAndTotallyOrdered(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([{ total: '7' }], [inquiryRow()]);

  const page =
    await new PostgresInquiryRepository(
      database,
    ).listOwnedByBuyer(BUYER, {
      limit: 2,
      offset: 4,
    });

  const [count, rows] = database.calls;

  expect(
    normalize(count?.sql).includes('count(*) as total') &&
      normalize(count?.sql).includes('where buyer_id = $1'),
    "The total counts the buyer's inquiries and nobody else's.",
  );
  expect(
    normalize(count?.sql).includes('limit') === false,
    'The total is a count, not a page, so it is right past the end.',
  );
  expect(
    normalize(rows?.sql).includes(
      'order by created_at desc, id asc',
    ),
    'The page is ordered newest first with a stable tie-breaker.',
  );
  expect(
    normalize(rows?.sql).includes('limit $2 offset $3'),
    'The bounds are bound parameters, not interpolated values.',
  );
  expect(
    JSON.stringify(rows?.params) ===
      JSON.stringify([BUYER, 2, 4]),
    `The buyer and the bounds are the page parameters, got ${JSON.stringify(rows?.params)}.`,
  );
  expect(
    page.total === 7,
    `The count is reported as a number, got ${page.total}.`,
  );
  expect(
    page.inquiries.length === 1,
    'The page maps the rows it was given.',
  );
}

/**
 * Nothing here interpolates a caller-supplied value into SQL. Every buyer
 * value, message, and key reaches the database as a parameter.
 */
async function testValuesAreAlwaysParameters(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows(
    [inquiryRow()],
    [inquiryRow()],
    [{ total: '1' }],
    [inquiryRow()],
  );

  const repository = new PostgresInquiryRepository(database);

  await repository.create({
    buyerId: BUYER,
    productId: PRODUCT,
    catalogVersion: 2,
    message: "Robert'); DROP TABLE inquiries;--",
    idempotencyKey: "key'); DELETE FROM inquiries;--",
  });
  await repository.findOwnedById(inquiryRow().id, BUYER);
  await repository.listOwnedByBuyer(BUYER, {
    limit: 5,
    offset: 0,
  });
  await repository.findByIdempotencyKey(
    BUYER,
    "key'); DELETE FROM inquiries;--",
  );

  for (const call of database.calls) {
    expect(
      !normalize(call.sql).includes('drop table') &&
        !normalize(call.sql).includes('delete from'),
      `No caller value reaches the SQL text, got ${call.sql}.`,
    );
  }

  const insert = database.calls[0];

  expect(
    JSON.stringify(insert?.params) ===
      JSON.stringify([
        BUYER,
        PRODUCT,
        2,
        "Robert'); DROP TABLE inquiries;--",
        "key'); DELETE FROM inquiries;--",
        insert?.params?.[5],
      ]),
    'The message and the key are passed as parameters, in order.',
  );
}

async function main(): Promise<void> {
  await testRowIsMapped();
  await testCreateConvergesOnTheExistingKey();
  await testUnrefusedWriteWithNoWinnerIsAFault();
  await testOwnershipIsInTheQuery();
  await testRetryLookupIsScopedToTheBuyer();
  await testListIsBoundedScopedAndTotallyOrdered();
  await testValuesAreAlwaysParameters();

  console.log('POSTGRES INQUIRY REPOSITORY TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
