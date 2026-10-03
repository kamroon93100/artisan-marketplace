import { CatalogService } from './application/catalog-service.js';
import { InMemoryCatalogRepository } from './infrastructure/in-memory-catalog-repository.js';
import { DiscoveryService } from '../discovery/application/discovery-service.js';
import { CatalogServicePublishedCatalogReadPort } from '../discovery/infrastructure/catalog-published-port.js';
import {
  comparePublishedProducts,
  isPublishedReadVisible,
  publishedSearchText,
  toPublishedProduct,
} from './domain/catalog-published.js';

const OWNER = '00000000-0000-4000-8000-000000000001';

function expect(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

function expectVisible(
  visible: boolean,
  message: string,
): void {
  expect(visible, message);
}

function expectInvisible(
  visible: boolean,
  message: string,
): void {
  expect(!visible, message);
}

/**
 * The visibility rule, stated once in the domain and checked on its own.
 *
 * This is the assertion that keeps "published" from quietly becoming
 * "whatever state the product happens to be in": a product under review is
 * still showing the version buyers were shown, and a product that was never
 * published is invisible no matter what state it is in.
 */
function testVisibilityRule(): void {
  expectVisible(
    isPublishedReadVisible({
      publishedVersion: 1,
      state: 'PUBLISHED',
    }),
    'A published product is buyer-visible.',
  );

  expectVisible(
    isPublishedReadVisible({
      publishedVersion: 1,
      state: 'REVIEW_REQUIRED',
    }),
    'A published product under re-review is still buyer-visible: its published version is the listing.',
  );

  expectInvisible(
    isPublishedReadVisible({
      publishedVersion: null,
      state: 'APPROVED',
    }),
    'An approved but never published product is not buyer-visible.',
  );

  expectInvisible(
    isPublishedReadVisible({
      publishedVersion: null,
      state: 'PUBLISHED',
    }),
    'A state alone does not make a product visible without a version.',
  );

  expectInvisible(
    isPublishedReadVisible({
      publishedVersion: 2,
      state: 'ARCHIVED',
    }),
    'Archiving is the explicit delisting operation and hides a published product.',
  );
}

/**
 * The searched text, and the exclusion of materials from it.
 *
 * Materials are excluded because joining an array cannot be indexed, so
 * including them would mean an unindexed search. That is a bounded
 * limitation, and it is only honest while it is written down.
 */
function testSearchText(): void {
  const product = {
    productId: 'p-1',
    versionNumber: 1,
    title: 'Bamboo Basket',
    description: 'Handwoven storage basket.',
    category: 'Basketry',
    materials: ['Bamboo', 'Reed'],
    publishedAt: '2026-09-28T00:00:00.000Z',
  };

  const text = publishedSearchText(product);

  expect(
    text.includes('bamboo basket'),
    'The title is part of the searched text.',
  );
  expect(
    text.includes('basketry'),
    'The category is part of the searched text.',
  );
  expect(
    !text.includes('reed'),
    `Materials are outside the M6 search surface, got "${text}".`,
  );
}

/**
 * The ordering has to be total, or offset pagination silently drops and
 * repeats listings.
 */
function testOrderingIsTotal(): void {
  const publishedAt = '2026-09-28T00:00:00.000Z';

  const first = {
    productId: 'a',
    versionNumber: 1,
    title: 'A',
    description: 'A',
    category: null,
    materials: [],
    publishedAt,
  };
  const second = { ...first, productId: 'b' };
  const later = { ...first, publishedAt: '2026-09-29T00:00:00.000Z' };

  expect(
    comparePublishedProducts(later, first) < 0,
    'A newer publication sorts first.',
  );
  expect(
    comparePublishedProducts(first, second) < 0,
    'Equal timestamps are broken by product id, so the order is total.',
  );
  expect(
    comparePublishedProducts(second, first) > 0,
    'The tie-breaker is not symmetric.',
  );
  expect(
    comparePublishedProducts(first, first) === 0,
    'A listing equals itself.',
  );
}

function buildService(): {
  catalog: CatalogService;
  repository: InMemoryCatalogRepository;
} {
  const repository = new InMemoryCatalogRepository();

  return {
    catalog: new CatalogService(repository),
    repository,
  };
}

/**
 * Walks a product to publication using only the operations the API offers,
 * so the fixture cannot reach a state a client could not.
 */
async function publishProduct(
  catalog: CatalogService,
  title: string,
  description: string,
  category: string,
): Promise<string> {
  const draft = await catalog.createDraft({
    ownerId: OWNER,
    title,
    description,
    category,
    materials: ['bamboo'],
  });

  for (const state of [
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
  ] as const) {
    await catalog.transition(
      draft.product.id,
      state,
      OWNER,
    );
  }

  await catalog.approve(draft.product.id, OWNER);

  const published = await catalog.publish(
    draft.product.id,
    OWNER,
    `publish-key-${draft.product.id}`,
  );

  return published.product.id;
}

/**
 * The published read never reports a working draft.
 *
 * This is the property the whole buyer journey rests on, so it is asserted
 * on the values rather than on the shape: after a product is published and
 * then edited without being republished, the read must still report what was
 * published.
 */
async function testPublishedReadIgnoresTheWorkingDraft(): Promise<void> {
  const { catalog } = buildService();

  const productId = await publishProduct(
    catalog,
    'Bamboo Basket',
    'Handwoven storage basket.',
    'basketry',
  );

  const before = await catalog.getPublishedProduct(productId);

  expect(
    before?.title === 'Bamboo Basket',
    'The published read reports the published title.',
  );

  // The artisan decides to change it: back to review, then edit.
  await catalog.transition(productId, 'REVIEW_REQUIRED', OWNER);
  await catalog.update(productId, OWNER, {
    title: 'Draft Title Nobody Published',
    description: 'Draft description nobody published.',
  });

  const after = await catalog.getPublishedProduct(productId);

  expect(
    after?.title === 'Bamboo Basket' &&
      after?.description === 'Handwoven storage basket.',
    `The published snapshot is unchanged by a draft edit, got ${JSON.stringify(after)}.`,
  );
  expect(
    after?.versionNumber === 1,
    'A draft edit does not allocate a version.',
  );
}

/**
 * A product nobody published is invisible through the published read.
 */
async function testUnpublishedProductsAreInvisible(): Promise<void> {
  const { catalog } = buildService();

  const draft = await catalog.createDraft({
    ownerId: OWNER,
    title: 'Secret Draft',
    description: 'Never published.',
  });

  const none = await catalog.getPublishedProduct(
    draft.product.id,
  );

  expect(
    none === null,
    'A never-published product is not buyer-visible.',
  );

  const approved = await catalog.createDraft({
    ownerId: OWNER,
    title: 'Approved Only',
    description: 'Never published either.',
  });

  for (const state of [
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
  ] as const) {
    await catalog.transition(approved.product.id, state, OWNER);
  }

  await catalog.approve(approved.product.id, OWNER);

  expect(
    (await catalog.getPublishedProduct(approved.product.id)) ===
      null,
    'An APPROVED product is still not buyer-visible: approval is not publication.',
  );

  const page = await catalog.searchPublishedProducts({
    limit: 50,
    offset: 0,
  });

  expect(
    page.total === 0,
    `No unpublished product appears in the published page, got ${page.total}.`,
  );
}

/**
 * Archiving is the deliberate delisting operation, and it is the only thing
 * that removes a listing a buyer can already see.
 */
async function testArchivingHidesAPublishedProduct(): Promise<void> {
  const { catalog } = buildService();

  const productId = await publishProduct(
    catalog,
    'Bamboo Basket',
    'Handwoven storage basket.',
    'basketry',
  );

  expect(
    (await catalog.getPublishedProduct(productId)) !== null,
    'A published product is visible before it is archived.',
  );

  await catalog.transition(productId, 'ARCHIVED', OWNER);

  expect(
    (await catalog.getPublishedProduct(productId)) === null,
    'An archived product is no longer buyer-visible.',
  );

  const page = await catalog.searchPublishedProducts({
    limit: 50,
    offset: 0,
  });

  expect(
    page.total === 0,
    'An archived product does not remain in the published page.',
  );
}

/**
 * The buyer-facing projection carries no field a draft, an AI proposal, or a
 * second artisan session could change — and no audit field either.
 */
function testPublishedProjectionCarriesNoDraftOrAuditFields(): void {
  const allowed = new Set([
    'productId',
    'versionNumber',
    'title',
    'description',
    'category',
    'materials',
    'publishedAt',
  ]);

  /**
   * Built from a real `CatalogVersion`, so this checks the projection the
   * module actually uses rather than a restatement of it. If a field were
   * added to a version row and the projection spread the row instead of
   * naming fields, it would appear here.
   */
  const published = toPublishedProduct({
    id: 'version-uuid-1',
    productId: 'product-1',
    versionNumber: 1,
    title: 'Bamboo Basket',
    description: 'Handwoven storage basket.',
    category: 'basketry',
    materials: ['bamboo'],
    publishedAt: '2026-09-28T00:00:00.000Z',
    publishedBy: OWNER,
  });

  for (const field of Object.keys(published)) {
    expect(
      allowed.has(field),
      `The published projection must not carry ${field}.`,
    );
  }

  expect(
    !('id' in published),
    'The published projection carries no version identity.',
  );
  expect(
    !('publishedBy' in published),
    'The published projection carries no publishing actor; that is an audit fact.',
  );
  expect(
    !('state' in published),
    'The published projection carries no product state.',
  );
  expect(
    !('ownerId' in published),
    'The published projection carries no owner identity.',
  );
}

/**
 * Search is deterministic: the same query against the same catalog returns
 * the same listings in the same order, and the order is total.
 */
async function testSearchIsDeterministicAndBounded(): Promise<void> {
  const { catalog } = buildService();
  const discovery = new DiscoveryService(
    new CatalogServicePublishedCatalogReadPort(catalog),
  );

  const basket = await publishProduct(
    catalog,
    'Bamboo Basket',
    'Handwoven storage basket.',
    'basketry',
  );
  const bowl = await publishProduct(
    catalog,
    'Clay Bowl',
    'Wheel-thrown stoneware bowl.',
    'pottery',
  );
  const mat = await publishProduct(
    catalog,
    'Woven Reed Mat',
    'A floor mat woven from reed.',
    'basketry',
  );

  const everyQuery = {
    limit: 2,
    offset: 0,
  };

  const first = await discovery.search(everyQuery);
  const second = await discovery.search(everyQuery);

  expect(
    JSON.stringify(first) === JSON.stringify(second),
    'Repeating a query returns the same page in the same order.',
  );
  expect(
    first.total === 3,
    `The total counts every visible listing, got ${first.total}.`,
  );
  expect(
    first.products.length === 2 && first.hasMore,
    'The page is bounded and reports that more exist.',
  );

  const next = await discovery.search({ limit: 2, offset: 2 });

  expect(
    next.products.length === 1 && !next.hasMore,
    'The last page reports that nothing follows it.',
  );

  const firstIds = first.products.map((p) => p.productId);
  const nextIds = next.products.map((p) => p.productId);

  expect(
    new Set([...firstIds, ...nextIds]).size === 3,
    'Paging through the catalog neither repeats nor drops a listing.',
  );

  // Case-insensitive substring search over published text.
  const byTitle = await discovery.search({
    search: 'BAMBOO',
    limit: 50,
    offset: 0,
  });

  expect(
    byTitle.total === 1 &&
      byTitle.products[0]?.productId === basket,
    'A case-insensitive title search finds exactly the published basket.',
  );

  const byDescription = await discovery.search({
    search: 'stoneware',
    limit: 50,
    offset: 0,
  });

  expect(
    byDescription.total === 1 &&
      byDescription.products[0]?.productId === bowl,
    'A description search finds the bowl.',
  );

  const byCategory = await discovery.search({
    search: 'BASKETRY',
    limit: 50,
    offset: 0,
  });

  expect(
    byCategory.total === 2,
    `A category search finds both basketry listings, got ${byCategory.total}.`,
  );

  const noMatch = await discovery.search({
    search: 'no such thing',
    limit: 50,
    offset: 0,
  });

  expect(
    noMatch.total === 0 && noMatch.products.length === 0,
    'A search that matches nothing is an empty page, not an error.',
  );

  expect(
    mat !== basket && mat !== bowl,
    'All three products are distinct.',
  );
}

/**
 * A search term containing a `LIKE` wildcard matches literally.
 *
 * In the database, `%` would turn "50% wool" into a match-everything
 * pattern. The in-memory path has to agree, and this is the assertion that
 * keeps the two implementations of the same rule from drifting.
 */
async function testSearchWildcardsAreLiteral(): Promise<void> {
  const { catalog } = buildService();
  const discovery = new DiscoveryService(
    new CatalogServicePublishedCatalogReadPort(catalog),
  );

  await publishProduct(
    catalog,
    'Bamboo Basket',
    'Handwoven storage basket.',
    'basketry',
  );
  await publishProduct(
    catalog,
    'Clay Bowl',
    'Wheel-thrown stoneware bowl.',
    'pottery',
  );

  const wildcard = await discovery.search({
    search: '%',
    limit: 50,
    offset: 0,
  });

  expect(
    wildcard.total === 0,
    `A literal percent matches nothing rather than everything, got ${wildcard.total}.`,
  );

  const underscore = await discovery.search({
    search: '_',
    limit: 50,
    offset: 0,
  });

  expect(
    underscore.total === 0,
    'A literal underscore matches nothing rather than any single character.',
  );
}

async function main(): Promise<void> {
  testVisibilityRule();
  testSearchText();
  testOrderingIsTotal();
  testPublishedProjectionCarriesNoDraftOrAuditFields();
  await testPublishedReadIgnoresTheWorkingDraft();
  await testUnpublishedProductsAreInvisible();
  await testArchivingHidesAPublishedProduct();
  await testSearchIsDeterministicAndBounded();
  await testSearchWildcardsAreLiteral();

  console.log('CATALOG PUBLISHED READ TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
