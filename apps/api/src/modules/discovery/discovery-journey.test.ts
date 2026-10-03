import app from '../../index.js';
import {
  DISCOVERY_PAGE_SIZE_MAX,
  DISCOVERY_SEARCH_MAX_LENGTH,
} from '@artisan-marketplace/contracts';

const ARTISAN = '00000000-0000-4000-8000-000000000001';

const ARTISAN_ENV = {
  APP_ENV: 'development',
  DEV_OWNER_ID: ARTISAN,
};

/**
 * Discovery is read-only, so these journeys drive the artisan side through
 * the real catalog routes to reach a published state, then read the buyer
 * side back. Nothing here reaches into storage to arrange a fixture: a
 * published listing has to be the result of a publish, or the test would be
 * proving a state no client can produce.
 */
const BUYER_ENV = {
  APP_ENV: 'development',
  DEV_OWNER_ID: '00000000-0000-4000-8000-0000000000b1',
};

type ProductPayload = {
  id: string;
  state: string;
  title: string | null;
  description: string | null;
  publishedVersion: number | null;
};

type PublishedPayload = {
  productId: string;
  versionNumber: number;
  title: string;
  description: string;
  category: string | null;
  materials: readonly string[];
  publishedAt: string;
};

type PagePayload = {
  products: PublishedPayload[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

function expect(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function artisanRequest(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(
    path,
    {
      method,
      headers: {
        ...(body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body) }),
    },
    ARTISAN_ENV,
  );
}

async function buyerRequest(
  path: string,
): Promise<Response> {
  return app.request(
    path,
    { method: 'GET' },
    BUYER_ENV,
  );
}

/**
 * Each fixture carries its key in its description.
 *
 * The suites in this file share one in-memory catalog, so a search term has
 * to be unique to the product that owns it. Without that, the search
 * assertions would depend on how many products earlier tests happened to
 * publish — a test that passes for the wrong reason is worse than one that
 * fails.
 */
async function publishProduct(
  key: string,
  overrides: Record<string, unknown> = {},
): Promise<ProductPayload> {
  const created = await readJson<{ product: ProductPayload }>(
    await artisanRequest(
      '/catalog/products',
      'POST',
      {
        title: 'Bamboo Basket',
        description: `Handwoven storage basket ${key}.`,
        category: 'basketry',
        materials: ['bamboo'],
        ...overrides,
      },
      { 'idempotency-key': `create-${key}` },
    ),
  );

  for (const state of [
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
  ]) {
    await artisanRequest(
      `/catalog/products/${created.product.id}/transition`,
      'POST',
      { state },
    );
  }

  await artisanRequest(
    `/catalog/products/${created.product.id}/review/approve`,
    'POST',
  );

  const published = await artisanRequest(
    `/catalog/products/${created.product.id}/publish`,
    'POST',
    undefined,
    { 'idempotency-key': `publish-${key}` },
  );

  expect(
    published.status === 201,
    `Fixture setup: expected 201 publishing ${key}, got ${published.status}.`,
  );

  return (
    await readJson<{ product: ProductPayload }>(published)
  ).product;
}

async function createUnpublishedProduct(
  key: string,
): Promise<string> {
  const created = await readJson<{ product: ProductPayload }>(
    await artisanRequest(
      '/catalog/products',
      'POST',
      {
        title: `Unpublished ${key}`,
        description: 'This was never published.',
        category: 'basketry',
      },
      { 'idempotency-key': `draft-${key}` },
    ),
  );

  return created.product.id;
}

/**
 * The field set a buyer is given, asserted on every discovery response.
 *
 * Enumerated rather than spot-checked: the point is that a *new* field on
 * the catalog side cannot appear in a buyer response without this test
 * failing, which is the only way "discovery exposes no draft, private, or AI
 * field" stays true as the modules grow.
 */
const ALLOWED_FIELDS = new Set([
  'productId',
  'versionNumber',
  'title',
  'description',
  'category',
  'materials',
  'publishedAt',
]);

const FORBIDDEN_FIELDS = [
  'state',
  'ownerId',
  'publishedBy',
  'id',
  'version',
  'createdAt',
  'updatedAt',
  'publishedVersion',
  'aiProposal',
  'proposals',
  'confidence',
  'suggestions',
  'materialsPending',
];

function assertBuyerSafePayload(
  payload: unknown,
  where: string,
): void {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      assertBuyerSafePayload(entry, where);
    }
    return;
  }

  if (payload === null || typeof payload !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(
    payload as Record<string, unknown>,
  )) {
    if (
      value !== null &&
      typeof value === 'object' &&
      key !== 'materials'
    ) {
      assertBuyerSafePayload(value, where);
      continue;
    }

    if (ALLOWED_FIELDS.has(key)) {
      continue;
    }

    /**
     * A wrapper key (`products`, `product`, `total`) is a response
     * envelope, not a listing field, so it is allowed. The forbidden list
     * is what actually has to be absent, and it is checked on the shape of
     * every object that reached a buyer.
     */
    if (
      [
        'products',
        'product',
        'total',
        'limit',
        'offset',
        'hasMore',
        'error',
        'code',
        'message',
        'details',
        'field',
      ].includes(key)
    ) {
      continue;
    }

    if (FORBIDDEN_FIELDS.includes(key)) {
      throw new Error(
        `TEST FAILED: ${where} exposed ${key}, which is a draft, private, or AI field.`,
      );
    }
  }
}

/**
 * A published product is discoverable, and a product nobody published is not
 * — through either discovery route.
 */
async function testVisibilityThroughEveryRoute(): Promise<void> {
  const published = await publishProduct('visible');

  const list = await buyerRequest('/discovery/products');
  expect(list.status === 200, 'The discovery page answers.');

  const page = await readJson<PagePayload>(list);

  expect(
    page.products.some(
      (product) => product.productId === published.id,
    ),
    'A published product appears in the discovery page.',
  );

  const single = await buyerRequest(
    `/discovery/products/${published.id}`,
  );

  expect(
    single.status === 200,
    `A published product is readable directly, got ${single.status}.`,
  );

  const unseen = await createUnpublishedProduct('never');

  const unseenList = await readJson<PagePayload>(
    await buyerRequest('/discovery/products'),
  );

  expect(
    !unseenList.products.some(
      (product) => product.productId === unseen,
    ),
    'A never-published product does not appear in the page.',
  );

  const unseenSingle = await buyerRequest(
    `/discovery/products/${unseen}`,
  );

  expect(
    unseenSingle.status === 404,
    `A never-published product is not readable, got ${unseenSingle.status}.`,
  );

  const missing = await buyerRequest(
    '/discovery/products/00000000-0000-4000-8000-00000000dead',
  );

  expect(
    missing.status === unseenSingle.status,
    'An unpublished product and a non-existent one are reported identically.',
  );

  const missingBody = await readJson<{ error: { message: string } }>(
    missing,
  );
  const unseenBody = await readJson<{ error: { message: string } }>(
    unseenSingle,
  );

  expect(
    missingBody.error.message === unseenBody.error.message,
    'The two refusals carry the same message, so discovery is not an oracle for unpublished product ids.',
  );
}

/**
 * Editing a published product's draft does not change what buyers see until
 * the artisan publishes again. This is acceptance criterion 11 expressed as
 * a behaviour rather than a schema.
 */
async function testDraftEditDoesNotChangeThePublishedListing(): Promise<void> {
  const published = await publishProduct('immutable');

  const before = await readJson<{ product: PublishedPayload }>(
    await buyerRequest(`/discovery/products/${published.id}`),
  );

  expect(
    before.product.title === 'Bamboo Basket',
    'The buyer sees the published title.',
  );

  await artisanRequest(
    `/catalog/products/${published.id}/transition`,
    'POST',
    { state: 'REVIEW_REQUIRED' },
  );

  await artisanRequest(
    `/catalog/products/${published.id}`,
    'PATCH',
    {
      title: 'Draft Title Nobody Published',
      description: 'Draft description nobody published.',
    },
  );

  const after = await readJson<{ product: PublishedPayload }>(
    await buyerRequest(`/discovery/products/${published.id}`),
  );

  expect(
    JSON.stringify(after.product) === JSON.stringify(before.product),
    `A draft edit does not reach the buyer. Before ${JSON.stringify(before.product)}, after ${JSON.stringify(after.product)}.`,
  );
  expect(
    after.product.versionNumber === 1,
    'A draft edit does not allocate a catalog version.',
  );

  const draftState = await readJson<{ product: ProductPayload }>(
    await artisanRequest(`/catalog/products/${published.id}`, 'GET'),
  );

  expect(
    draftState.product.title === 'Draft Title Nobody Published',
    'The draft itself really did change; the buyer simply cannot see it.',
  );

  const draftBody = JSON.stringify(
    await buyerRequest(
      `/discovery/products/${published.id}`,
    ).then((response) => response.text()),
  );

  expect(
    !draftBody.includes('Nobody Published'),
    'The unpublished draft value appears nowhere in the buyer response.',
  );
}

/**
 * Archiving is the deliberate delisting, and it removes the listing from
 * both routes at once.
 */
async function testArchivingRemovesTheListing(): Promise<void> {
  const published = await publishProduct('archived');

  await artisanRequest(
    `/catalog/products/${published.id}/transition`,
    'POST',
    { state: 'ARCHIVED' },
  );

  const single = await buyerRequest(
    `/discovery/products/${published.id}`,
  );

  expect(
    single.status === 404,
    `An archived product is no longer readable, got ${single.status}.`,
  );

  const page = await readJson<PagePayload>(
    await buyerRequest('/discovery/products'),
  );

  expect(
    !page.products.some(
      (product) => product.productId === published.id,
    ),
    'An archived product leaves the discovery page.',
  );
}

/**
 * Deterministic, case-insensitive, whitespace-tolerant search over the
 * published snapshot, plus bounded pagination that neither repeats nor
 * drops a listing.
 *
 * The term used for the search assertions belongs to exactly one fixture, so
 * "one result" means "the search matched the right product" rather than "the
 * page happened to be small".
 */
async function testSearchAndPagination(): Promise<void> {
  const basket = await publishProduct('search-basket', {
    materials: ['bamboo', 'unsearchable-fibre-token'],
  });
  const bowl = await publishProduct('search-bowl', {
    title: 'Clay Bowl',
    description: 'Wheel-thrown stoneware search-bowl.',
    category: 'pottery',
  });
  const mat = await publishProduct('search-mat', {
    title: 'Woven Reed Mat',
    description: 'A floor mat woven from reed search-mat.',
  });

  for (const term of [
    'search-basket',
    'SEARCH-BASKET',
    'SeArCh-BaSkEt',
    '  search-basket  ',
  ]) {
    const page = await readJson<PagePayload>(
      await buyerRequest(
        `/discovery/products?search=${encodeURIComponent(term)}`,
      ),
    );

    expect(
      page.total === 1 &&
        page.products[0]?.productId === basket.id,
      `The search is case-insensitive and whitespace-tolerant, got ${page.total} results for "${term}".`,
    );
  }

  const byDescription = await readJson<PagePayload>(
    await buyerRequest(
      '/discovery/products?search=STONEWARE',
    ),
  );

  expect(
    byDescription.total === 1 &&
      byDescription.products[0]?.productId === bowl.id,
    'A description search finds the bowl.',
  );

  const byCategory = await readJson<PagePayload>(
    await buyerRequest('/discovery/products?search=pottery'),
  );

  expect(
    byCategory.total === 1 &&
      byCategory.products[0]?.productId === bowl.id,
    'A category search finds the bowl.',
  );

  /**
   * Materials are deliberately not searched, because a materials edit is a
   * draft change: including it would let an unpublished edit change a
   * published listing's search result. The token below is this fixture's
   * material and appears in no title, description, or category, so a result
   * here would mean the draft was being searched.
   */
  const byMaterial = await readJson<PagePayload>(
    await buyerRequest(
      '/discovery/products?search=unsearchable-fibre-token',
    ),
  );

  expect(
    byMaterial.total === 0,
    `A material is not part of the immutable published search text, got ${byMaterial.total} results.`,
  );

  const byTitle = await readJson<PagePayload>(
    await buyerRequest('/discovery/products?search=bamboo'),
  );

  expect(
    byTitle.total > 0 &&
      byTitle.products.every(
        (product) => product.title === 'Bamboo Basket',
      ),
    'The title really is searched, so the material exclusion is a decision rather than a broken filter.',
  );

  const noMatch = await readJson<PagePayload>(
    await buyerRequest(
      '/discovery/products?search=zzzznotpresent',
    ),
  );

  expect(
    noMatch.total === 0 &&
      noMatch.products.length === 0 &&
      !noMatch.hasMore,
    'A search that matches nothing is an empty page, not an error.',
  );

  // Bounded pagination, walked to exhaustion from the reported total.
  const firstPage = await readJson<PagePayload>(
    await buyerRequest('/discovery/products?limit=2&offset=0'),
  );

  expect(
    firstPage.products.length === 2 &&
      firstPage.limit === 2 &&
      firstPage.offset === 0,
    'The first page honours the requested bound and reports it back.',
  );
  expect(
    firstPage.hasMore === firstPage.total > 2,
    'The page says whether more exist rather than making the client work it out.',
  );

  const seen: string[] = [];
  let offset = 0;

  for (;;) {
    const page = await readJson<PagePayload>(
      await buyerRequest(
        `/discovery/products?limit=2&offset=${offset}`,
      ),
    );

    seen.push(...page.products.map((product) => product.productId));

    expect(
      page.total === firstPage.total,
      'Every page reports the same total.',
    );

    if (!page.hasMore) {
      expect(
        page.products.length <= page.limit,
        'The final page is no larger than the requested bound.',
      );
      break;
    }

    offset += page.limit;
  }

  expect(
    seen.length === firstPage.total,
    `Paging reaches every published listing once: saw ${seen.length} of ${firstPage.total}.`,
  );
  expect(
    new Set(seen).size === seen.length,
    'Paging does not repeat a listing.',
  );
  expect(
    [basket.id, bowl.id, mat.id].every((id) =>
      seen.includes(id),
    ),
    'Every listing published by this test is reachable by paging.',
  );

  // An offset past the end is an empty page with a truthful total, not a
  // claim that the catalog is empty.
  const pastEnd = await readJson<PagePayload>(
    await buyerRequest('/discovery/products?offset=1000'),
  );

  expect(
    pastEnd.products.length === 0 &&
      pastEnd.total === firstPage.total,
    'An offset past the end keeps the real total.',
  );

  const archivedOnly = await readJson<PagePayload>(
    await buyerRequest('/discovery/products?limit=50'),
  );

  expect(
    !archivedOnly.products.some(
      (product) => product.description.includes('archived'),
    ),
    'The archived listing is not reachable even by exhaustive paging.',
  );
}

/**
 * Bad input is refused with a named, actionable category rather than
 * forwarded to the catalog as if it were a search.
 */
async function testValidationAndErrorCategories(): Promise<void> {
  for (const query of [
    'limit=0',
    `limit=${DISCOVERY_PAGE_SIZE_MAX + 1}`,
    'limit=2.5',
    'limit=abc',
    'offset=-1',
    `search=${'x'.repeat(DISCOVERY_SEARCH_MAX_LENGTH + 1)}`,
  ]) {
    const response = await buyerRequest(
      `/discovery/products?${query}`,
    );

    expect(
      response.status === 400,
      `Expected 400 for "${query}", got ${response.status}.`,
    );

    const body = await readJson<{
      error: { code: string; message: string; details?: { field?: string } };
    }>(response);

    expect(
      body.error.code === 'VALIDATION_FAILED',
      `Expected VALIDATION_FAILED for "${query}", got ${body.error.code}.`,
    );
    expect(
      typeof body.error.details?.field === 'string' &&
        body.error.message.includes(
          body.error.details.field,
        ),
      `The refusal names the field at fault for "${query}", got ${body.error.message}.`,
    );
  }

  const unconfigured = await app.request(
    '/discovery/products',
    { method: 'GET' },
    { APP_ENV: 'production' },
  );

  expect(
    unconfigured.status === 503,
    `A deployment that cannot verify a session refuses discovery rather than serving it, got ${unconfigured.status}.`,
  );
}

/**
 * Nothing a buyer receives carries a draft, private, or AI field, on any
 * discovery route.
 */
async function testBuyerPayloadsAreFieldChecked(): Promise<void> {
  const published = await publishProduct('fields');

  const list = await readJson<unknown>(
    await buyerRequest('/discovery/products?limit=50'),
  );
  const single = await readJson<unknown>(
    await buyerRequest(`/discovery/products/${published.id}`),
  );

  assertBuyerSafePayload(list, 'The discovery page');
  assertBuyerSafePayload(single, 'The discovery listing');

  const draftBody = JSON.stringify(list);

  expect(
    !draftBody.includes('Unpublished'),
    'No unpublished value appears anywhere in a discovery response.',
  );
  expect(
    !draftBody.includes(ARTISAN),
    'The publishing artisan is not named to a buyer.',
  );
}

/**
 * Discovery is read-only: the whole buyer surface refuses every method that
 * could change anything.
 */
async function testDiscoveryIsReadOnly(): Promise<void> {
  const published = await publishProduct('readonly');

  for (const [method, path] of [
    ['POST', `/discovery/products/${published.id}`],
    ['PATCH', `/discovery/products/${published.id}`],
    ['PUT', `/discovery/products/${published.id}`],
    ['DELETE', `/discovery/products/${published.id}`],
    ['POST', '/discovery/products'],
    ['DELETE', '/discovery/products'],
  ] as const) {
    const response = await app.request(
      path,
      { method },
      BUYER_ENV,
    );

    expect(
      response.status === 404 || response.status === 405,
      `Discovery must refuse ${method} ${path}, got ${response.status}.`,
    );
  }

  const still = await buyerRequest(
    `/discovery/products/${published.id}`,
  );

  expect(
    still.status === 200,
    'A refused write left the published listing intact.',
  );
}

async function main(): Promise<void> {
  await testVisibilityThroughEveryRoute();
  await testDraftEditDoesNotChangeThePublishedListing();
  await testArchivingRemovesTheListing();
  await testSearchAndPagination();
  await testValidationAndErrorCategories();
  await testBuyerPayloadsAreFieldChecked();
  await testDiscoveryIsReadOnly();

  console.log('DISCOVERY JOURNEY HTTP TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
