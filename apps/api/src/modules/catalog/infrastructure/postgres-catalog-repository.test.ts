import {
  PostgresCatalogRepository,
} from './postgres-catalog-repository.js';
import { CatalogPublishConflictError } from '../application/catalog-repository.js';
import type {
  Database,
  Transaction,
} from '../../../shared/persistence/database.js';

type QueryCall = {
  sql: string;
  params?: readonly unknown[];
};

class FakeDatabase implements Database {
  readonly calls: QueryCall[] = [];
  /**
   * Records that a transaction was opened, so a test can prove that a
   * multi-statement write shares one unit of work. Publication is only
   * correct if its two writes commit or roll back together.
   */
  transactions = 0;
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
    this.transactions += 1;

    return operation({
      query: (sql, params) => this.query(sql, params),
    });
  }
}

function catalogRow() {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    owner_id: '00000000-0000-0000-0000-000000000002',
    title: 'Bamboo Basket',
    description: 'Handmade basket',
    category: 'basket',
    materials: ['bamboo'],
    state: 'LOCAL_DRAFT' as const,
    created_at: '2026-09-26T00:00:00.000Z',
    updated_at: '2026-09-26T00:00:00.000Z',
    published_version: null,
  };
}

function publishedRow(versionNumber: number) {
  return {
    ...catalogRow(),
    state: 'PUBLISHED' as const,
    published_version: versionNumber,
  };
}

function versionRow(versionNumber: number) {
  return {
    id: '00000000-0000-0000-0000-00000000000a',
    product_id: catalogRow().id,
    version_number: versionNumber,
    title: 'Bamboo Basket',
    description: 'Handmade basket',
    category: 'basket',
    materials: ['bamboo'],
    published_at: '2026-09-28T00:00:00.000Z',
    published_by: catalogRow().owner_id,
  };
}

async function testCreateDraft(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([catalogRow()]);

  const repository =
    new PostgresCatalogRepository(database);

  const result = await repository.createDraft({
    ownerId: catalogRow().owner_id,
    title: 'Bamboo Basket',
    description: 'Handmade basket',
    category: 'basket',
    materials: ['bamboo'],
  });

  if (
    result.product.id !== catalogRow().id ||
    result.product.ownerId !== catalogRow().owner_id ||
    result.product.state !== 'LOCAL_DRAFT'
  ) {
    throw new Error(
      'Catalog draft was not mapped correctly.',
    );
  }

  if (
    !database.calls[0]?.sql.includes(
      "VALUES",
    ) ||
    !database.calls[0]?.sql.includes(
      "'LOCAL_DRAFT'",
    )
  ) {
    throw new Error(
      'Catalog create query is missing draft state.',
    );
  }
}

async function testGetById(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([catalogRow()]);

  const repository =
    new PostgresCatalogRepository(database);

  const result = await repository.getById(
    catalogRow().id,
  );

  if (
    !result ||
    result.id !== catalogRow().id ||
    result.materials[0] !== 'bamboo'
  ) {
    throw new Error(
      'Catalog lookup did not return the expected product.',
    );
  }

  if (
    !database.calls[0]?.sql.includes(
      'WHERE id = $1',
    )
  ) {
    throw new Error(
      'Catalog lookup must query by id.',
    );
  }
}

async function testMissingProduct(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([]);

  const repository =
    new PostgresCatalogRepository(database);

  const result = await repository.getById(
    catalogRow().id,
  );

  if (result !== null) {
    throw new Error(
      'Missing catalog product must return null.',
    );
  }
}

async function testTransition(): Promise<void> {
  const database = new FakeDatabase();

  database.queueRows([
    {
      ...catalogRow(),
      state: 'PENDING_SYNC',
    },
  ]);

  const repository =
    new PostgresCatalogRepository(database);

  const result = await repository.transitionState(
    catalogRow().id,
    'PENDING_SYNC',
    'LOCAL_DRAFT',
  );

  if (result.state !== 'PENDING_SYNC') {
    throw new Error(
      'Catalog transition did not return updated state.',
    );
  }

  if (
    !database.calls[0]?.sql.includes(
      'version = version + 1',
    )
  ) {
    throw new Error(
      'Catalog transition must increment the version.',
    );
  }

  if (
    !database.calls[0]?.sql.includes(
      'WHERE id = $3',
    ) ||
    !database.calls[0]?.sql.includes(
      'AND state = $4',
    )
  ) {
    throw new Error(
      'Catalog transition must compare-and-set on the expected state.',
    );
  }
}

async function testTransitionLostRace(): Promise<void> {
  // When no row matches (expected state is stale), the repository must
  // detect the lost race and throw a transition error rather than
  // silently returning nothing.
  const database = new FakeDatabase();
  database.queueRows(
    [], // UPDATE returns no rows (lost race because expectedState differs)
    [catalogRow()], // Fallback read returns the current row
  );

  const repository =
    new PostgresCatalogRepository(database);

  let thrown = false;

  try {
    await repository.transitionState(
      catalogRow().id,
      'PENDING_SYNC',
      'SYNCED', // Wrong expected state: product is LOCAL_DRAFT
    );
  } catch {
    thrown = true;
  }

  if (!thrown) {
    throw new Error(
      'Expected a lost race to throw an error.',
    );
  }
}

async function testTransitionNotFound(): Promise<void> {
  // When the product does not exist at all, the repository must throw
  // a "not found" error, not a transition error.
  const database = new FakeDatabase();
  database.queueRows(
    [], // UPDATE returns no rows
    [], // Fallback read also returns nothing
  );

  const repository =
    new PostgresCatalogRepository(database);

  let thrown = false;

  try {
    await repository.transitionState(
      'does-not-exist',
      'PENDING_SYNC',
      'LOCAL_DRAFT',
    );
  } catch (error) {
    thrown = true;

    if (
      error instanceof Error &&
      !error.message.includes('not found')
    ) {
      throw new Error(
        'Expected a "not found" error for a missing product.',
      );
    }
  }

  if (!thrown) {
    throw new Error(
      'Expected an error for a missing product.',
    );
  }
}

/**
 * `published_version` is a published-history pointer on the product
 * record, and it must survive the round trip as a number while an
 * unpublished product keeps it absent rather than reporting version 0.
 */
async function testPublishedVersionIsMapped(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([publishedRow(3)]);

  const result =
    await new PostgresCatalogRepository(
      database,
    ).getById(catalogRow().id);

  if (result?.publishedVersion !== 3) {
    throw new Error(
      'A published product must report its catalog version number.',
    );
  }

  const unpublished = new FakeDatabase();
  unpublished.queueRows([catalogRow()]);

  const draft = await new PostgresCatalogRepository(
    unpublished,
  ).getById(catalogRow().id);

  if (draft?.publishedVersion !== null) {
    throw new Error(
      'An unpublished product must report no catalog version.',
    );
  }

  // Postgres may hand an integer column back as a string depending on
  // the driver, so the mapping must not assume the wire type.
  const asString = new FakeDatabase();
  asString.queueRows([
    { ...publishedRow(4), published_version: '4' },
  ]);

  const coerced = await new PostgresCatalogRepository(
    asString,
  ).getById(catalogRow().id);

  if (coerced?.publishedVersion !== 4) {
    throw new Error(
      'A catalog version number must be mapped to a number.',
    );
  }
}

/**
 * A partial edit must not write the fields it did not mention. Writing
 * them would let one request revert a field that a concurrent request
 * had already corrected.
 */
async function testUpdateFieldsWritesOnlySuppliedFields(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([
    { ...catalogRow(), title: 'Bamboo Basket, Large' },
  ]);

  const result =
    await new PostgresCatalogRepository(
      database,
    ).updateFields({
      id: catalogRow().id,
      title: 'Bamboo Basket, Large',
    });

  const sql = database.calls[0]?.sql ?? '';

  if (!sql.includes('title = $2')) {
    throw new Error(
      'The supplied field must be written.',
    );
  }

  for (const untouched of [
    'description = $',
    'category = $',
    'materials = $',
  ]) {
    if (sql.includes(untouched)) {
      throw new Error(
        `An edit must not write an unsupplied field: ${untouched}.`,
      );
    }
  }

  if (
    !sql.includes('version = version + 1') ||
    !sql.includes('updated_at = $1')
  ) {
    throw new Error(
      'An edit must advance the concurrency token and timestamp.',
    );
  }

  if (
    database.calls[0]?.params?.[1] !==
    'Bamboo Basket, Large'
  ) {
    throw new Error(
      'The edit must write the supplied value.',
    );
  }

  if (result.title !== 'Bamboo Basket, Large') {
    throw new Error(
      'The updated product must be returned.',
    );
  }
}

async function testUpdateFieldsNotFound(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([]);

  let thrown = false;

  try {
    await new PostgresCatalogRepository(
      database,
    ).updateFields({
      id: 'does-not-exist',
      title: 'Nowhere',
    });
  } catch (error) {
    thrown = true;

    if (
      error instanceof Error &&
      !error.message.includes('not found')
    ) {
      throw new Error(
        'Expected a "not found" error for a missing product.',
      );
    }
  }

  if (!thrown) {
    throw new Error(
      'Expected an error when editing a missing product.',
    );
  }
}

/**
 * Publication performs two writes that must not be able to diverge: a
 * PUBLISHED product with no version behind it would be buyer-visible
 * with no published record, and a version row without the state change
 * would record something buyers were never shown. They therefore share
 * one transaction, and the version number is allocated by the same
 * update that moves the product to PUBLISHED.
 */
async function testPublishWritesStateAndVersionTogether(): Promise<void> {
  const database = new FakeDatabase();

  database.queueRows(
    [], // replay probe inside the transaction
    [publishedRow(1)], // compare-and-set update
    [versionRow(1)], // version insert
  );

  const result =
    await new PostgresCatalogRepository(
      database,
    ).publish({
      id: catalogRow().id,
      expectedState: 'APPROVED',
      publishedBy: catalogRow().owner_id,
      idempotencyKey: 'publish-key-1',
    });

  if (database.transactions !== 1) {
    throw new Error(
      'Publication must run inside a single transaction.',
    );
  }

  if (!result.created) {
    throw new Error(
      'A first publish must report that it created the version.',
    );
  }

  const update = database.calls[1];
  const insert = database.calls[2];

  if (
    !update?.sql.includes("state = 'PUBLISHED'") ||
    !update.sql.includes(
      'coalesce(published_version, 0) + 1',
    ) ||
    !update.sql.includes('AND state = $3')
  ) {
    throw new Error(
      'Publication must compare-and-set the state and allocate the next version.',
    );
  }

  if (
    !insert?.sql.includes('INSERT INTO catalog_versions') ||
    !insert.sql.includes('published_by') ||
    !insert.sql.includes('ON CONFLICT')
  ) {
    throw new Error(
      'Publication must record an attributed, retry-safe version.',
    );
  }

  // The version number written is the one the update allocated, so the
  // product pointer and the version it names cannot disagree.
  if (
    insert.params?.[1] !== 1 ||
    update.params?.[2] !== 'APPROVED'
  ) {
    throw new Error(
      'The version must be written with the number the update allocated.',
    );
  }

  if (result.version.versionNumber !== 1) {
    throw new Error(
      'The published version must be returned to the caller.',
    );
  }
}

/**
 * A retried publish converges on the version that already exists instead
 * of creating a second one.
 */
async function testPublishConvergesOnExistingVersion(): Promise<void> {
  const database = new FakeDatabase();

  database.queueRows(
    [versionRow(1)], // replay probe finds the existing version
    [publishedRow(1)], // current product row
  );

  const result =
    await new PostgresCatalogRepository(
      database,
    ).publish({
      id: catalogRow().id,
      expectedState: 'APPROVED',
      publishedBy: catalogRow().owner_id,
      idempotencyKey: 'publish-key-1',
    });

  if (result.created) {
    throw new Error(
      'A replayed publish must not report a new version.',
    );
  }

  if (result.version.versionNumber !== 1) {
    throw new Error(
      'A replayed publish must return the existing version.',
    );
  }

  const inserted = database.calls.some((call) =>
    call.sql.includes('INSERT INTO catalog_versions'),
  );

  if (inserted) {
    throw new Error(
      'A replayed publish must not attempt a second version insert.',
    );
  }
}

/**
 * Losing the compare-and-set is not a silent overwrite: the repository
 * reports it so the caller can converge on whatever the winner
 * established.
 */
async function testPublishLostRaceResolvesToWinner(): Promise<void> {
  const database = new FakeDatabase();

  database.queueRows(
    [], // replay probe inside the transaction
    [], // compare-and-set matched no row
    [versionRow(1)], // resolution finds the winning version
    [publishedRow(1)], // current product row
  );

  const result =
    await new PostgresCatalogRepository(
      database,
    ).publish({
      id: catalogRow().id,
      expectedState: 'APPROVED',
      publishedBy: catalogRow().owner_id,
      idempotencyKey: 'publish-key-1',
    });

  if (result.created) {
    throw new Error(
      'A lost publish must not claim to have created a version.',
    );
  }

  if (result.version.id !== versionRow(1).id) {
    throw new Error(
      'A lost publish must converge on the winning version.',
    );
  }
}

/**
 * Losing the race without a version to converge on means the publish
 * genuinely did not happen, and must be reported as the conflict it is
 * rather than as a success or an infrastructure fault.
 */
async function testPublishLostRaceWithoutWinnerIsAConflict(): Promise<void> {
  const database = new FakeDatabase();

  database.queueRows(
    [], // replay probe inside the transaction
    [], // compare-and-set matched no row
    [], // no version carries this key
    [
      {
        ...catalogRow(),
        state: 'REVIEW_REQUIRED' as const,
      },
    ], // the product moved on without publishing
  );

  let thrown = false;

  try {
    await new PostgresCatalogRepository(
      database,
    ).publish({
      id: catalogRow().id,
      expectedState: 'APPROVED',
      publishedBy: catalogRow().owner_id,
      idempotencyKey: 'publish-key-1',
    });
  } catch (error) {
    thrown = true;

    if (
      error instanceof Error &&
      !error.message.includes(
        'Invalid catalog state transition',
      )
    ) {
      throw new Error(
        `Expected a transition conflict, received: ${error.message}`,
      );
    }
  }

  if (!thrown) {
    throw new Error(
      'A lost publish with no winner must be reported as a conflict.',
    );
  }
}

/**
 * The repository distinguishes a lost race from an infrastructure
 * failure. Collapsing the two would tell a client to retry a publish the
 * server never evaluated.
 */
async function testPublishConflictIsDistinguishable(): Promise<void> {
  const error = new CatalogPublishConflictError(
    'product-1',
  );

  if (
    !(error instanceof Error) ||
    error.productId !== 'product-1'
  ) {
    throw new Error(
      'A lost publish must be signalled as a publish conflict.',
    );
  }
}

async function testListVersionsOrdersNewestFirst(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([versionRow(2), versionRow(1)]);

  const versions =
    await new PostgresCatalogRepository(
      database,
    ).listVersions(catalogRow().id);

  if (
    versions.length !== 2 ||
    versions[0]?.versionNumber !== 2
  ) {
    throw new Error(
      'Publish history must be returned newest version first.',
    );
  }

  if (
    !database.calls[0]?.sql.includes(
      'ORDER BY version_number DESC',
    )
  ) {
    throw new Error(
      'Publish history must be ordered by version number.',
    );
  }
}

/**
 * The buyer-visible read must be impossible to satisfy with a draft.
 *
 * The two properties are structural and are asserted on the SQL, because
 * that is where they are true. The join pins the version to the product's
 * currently published version, so the query is unsatisfiable while
 * `published_version` is null — invisibility before publication is a
 * property of the join rather than a filter that could be left out, and no
 * `catalog_products` listing column is selected at all.
 *
 * The product side of the join is the narrow published-visibility view, not
 * the table. That is what lets row-level security deny a buyer the working
 * row — including unpublished edits to a published product — without
 * breaking discovery.
 */
async function testPublishedSnapshotReadsTheVersionNotTheDraft(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([publishedRow(1)]);

  const product =
    await new PostgresCatalogRepository(
      database,
    ).getPublishedSnapshot(catalogRow().id);

  const sql = (database.calls[0]?.sql ?? '').toLowerCase();

  if (!sql.includes('from catalog_versions v')) {
    throw new Error(
      'The published read must select from catalog_versions.',
    );
  }

  if (
    !sql.includes(
      'join app.published_catalog_products p',
    )
  ) {
    throw new Error(
      'The published read must join the published-visibility view, not the catalog_products table.',
    );
  }

  if (sql.includes('join catalog_products p')) {
    throw new Error(
      'The published read must not join the working product row directly.',
    );
  }

  if (!sql.includes('v.version_number = p.published_version')) {
    throw new Error(
      'The published read must pin the version to the product\'s current published version.',
    );
  }

  if (!sql.includes("p.state <> 'archived'")) {
    throw new Error(
      'The published read must exclude archived products.',
    );
  }

  if (!sql.includes('p.published_version is not null')) {
    throw new Error(
      'The published read must state the published-version requirement.',
    );
  }

  if (sql.includes('p.title') || sql.includes('p.description')) {
    throw new Error(
      'The published read must not select a listing value from the working draft.',
    );
  }

  if (product?.title !== publishedRow(1).title) {
    throw new Error(
      'The published read reports the version\'s values.',
    );
  }
}

async function testPublishedSnapshotExposesNoAuditFields(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([publishedRow(1)]);

  const product =
    await new PostgresCatalogRepository(
      database,
    ).getPublishedSnapshot(catalogRow().id);

  const fields = Object.keys(product ?? {});

  for (const forbidden of [
    'publishedBy',
    'id',
    'ownerId',
    'state',
  ]) {
    if (fields.includes(forbidden)) {
      throw new Error(
        `The buyer-visible projection must not carry ${forbidden}.`,
      );
    }
  }
}

/**
 * The search query has to be deterministic and total-ordered, or offset
 * pagination silently drops and repeats listings.
 */
async function testSearchOrdersTotallyAndBindsThePage(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([{ total: 7 }], [publishedRow(1)]);

  const result =
    await new PostgresCatalogRepository(
      database,
    ).searchPublishedSnapshots({
      search: 'bamboo',
      limit: 2,
      offset: 4,
    });

  const pageSql = database.calls[1]?.sql ?? '';

  if (
    !pageSql.includes(
      'ORDER BY v.published_at desc, v.product_id asc',
    )
  ) {
    throw new Error(
      'The published search must order by publication time with a product-id tie-breaker.',
    );
  }

  if (!pageSql.includes('LIMIT $2 OFFSET $3')) {
    throw new Error(
      'The page bounds must be bound parameters, not interpolated values.',
    );
  }

  if (JSON.stringify(database.calls[1]?.params) !==
    JSON.stringify(['%bamboo%', 2, 4])) {
    throw new Error(
      `The search term is lower-cased, wrapped as a substring, and the bounds are passed as parameters, got ${JSON.stringify(database.calls[1]?.params)}.`,
    );
  }

  if (result.total !== 7) {
    throw new Error(
      'The total is counted separately so it is right even when the page is empty.',
    );
  }

  if (result.items.length !== 1) {
    throw new Error(
      'The page maps the rows it was given.',
    );
  }
}

/**
 * A `LIKE` wildcard in a search term is matched literally.
 *
 * A buyer searching for "50% wool" would otherwise get a pattern matching
 * almost the whole catalog, which is both wrong and a cheap way to make the
 * endpoint expensive.
 */
async function testSearchEscapesLikeWildcards(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([{ total: 0 }], []);

  await new PostgresCatalogRepository(
    database,
  ).searchPublishedSnapshots({
    search: '50% wool_b\\x',
    limit: 10,
    offset: 0,
  });

  const pattern = database.calls[1]?.params?.[0];

  if (pattern !== '%50\\% wool\\_b\\\\x%') {
    throw new Error(
      `LIKE metacharacters in a search term must be escaped, got ${String(pattern)}.`,
    );
  }
}

/**
 * An absent search binds null rather than a pattern that matches everything,
 * so the no-search path and the search path cannot be confused.
 */
async function testAbsentSearchBindsNull(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([{ total: 0 }], []);

  await new PostgresCatalogRepository(
    database,
  ).searchPublishedSnapshots({
    limit: 10,
    offset: 0,
  });

  if (database.calls[1]?.params?.[0] !== null) {
    throw new Error(
      'An absent search must bind null, not an empty pattern.',
    );
  }
}

async function main(): Promise<void> {
  await testCreateDraft();
  await testGetById();
  await testMissingProduct();
  await testTransition();
  await testTransitionLostRace();
  await testTransitionNotFound();
  await testPublishedVersionIsMapped();
  await testUpdateFieldsWritesOnlySuppliedFields();
  await testUpdateFieldsNotFound();
  await testPublishWritesStateAndVersionTogether();
  await testPublishConvergesOnExistingVersion();
  await testPublishLostRaceResolvesToWinner();
  await testPublishLostRaceWithoutWinnerIsAConflict();
  await testListVersionsOrdersNewestFirst();
  await testPublishConflictIsDistinguishable();
  await testPublishedSnapshotReadsTheVersionNotTheDraft();
  await testPublishedSnapshotExposesNoAuditFields();
  await testSearchOrdersTotallyAndBindsThePage();
  await testSearchEscapesLikeWildcards();
  await testAbsentSearchBindsNull();

  console.log(
    'POSTGRES CATALOG REPOSITORY TESTS PASSED',
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});




