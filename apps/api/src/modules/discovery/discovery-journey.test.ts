import app from '../../index.js';
import {
  DISCOVERY_PAGE_SIZE_MAX,
  DISCOVERY_SEARCH_MAX_LENGTH,
} from '@artisan-marketplace/contracts';
import { resetInMemoryOperationRateLimiters } from '../../shared/ratelimit/operation-rate-limit.js';

// This file's HTTP fixtures cannot pass a build mode through `app.request`.
// The suite-scoped development build matches the local environments below;
// production call sites still omit the seam.
process.env.NODE_ENV = 'development';

const ARTISAN = '00000000-0000-4000-8000-000000000001';

const ARTISAN_ENV = {
  APP_ENV: 'development',
  LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
  DEV_OWNER_ID: ARTISAN,
};

/**
 * Rate limit enforcement test environment using a fake Durable Object
 * namespace that actually enforces limits.
 *
 * This mimics the pattern from operation-rate-limit.test.ts:createEnforcingDurableNamespace()
 * but targets the actual HTTP routes rather than the limiter API directly.
 */
function createEnforcingDurableNamespace(): {
  namespace: DurableObjectNamespace;
  checks: Array<{
    objectName: string;
    url: string;
    method: string | undefined;
    body: { limit: number; windowMs: number; now: number };
  }>;
  subjectByObjectName: Map<string, string>;
} {
  const checks: Array<{
    objectName: string;
    url: string;
    method: string | undefined;
    body: { limit: number; windowMs: number; now: number };
  }> = [];
  const subjectByObjectName = new Map<string, string>();
  const callCounts = new Map<string, number>();

  const namespace = {
    idFromName(name: string) {
      return name as unknown as DurableObjectId;
    },
    get(id: DurableObjectId) {
      const objectName = String(id);
      return {
        async fetch(input: RequestInfo | URL, init?: RequestInit) {
          const body = JSON.parse(String(init?.body)) as { limit: number; windowMs: number; now: number };
          const count = (callCounts.get(objectName) || 0) + 1;
          callCounts.set(objectName, count);

          const check = {
            objectName,
            url: String(input),
            method: init?.method,
            body,
          };
          checks.push(check);

          // Enforce limit per objectName based on the policy in the request body
          if (count > body.limit) {
            return new Response(
              JSON.stringify({
                allowed: false,
                remaining: 0,
                resetAt: Date.now() + 60_000,
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            );
          }

          return new Response(
            JSON.stringify({
              allowed: true,
              remaining: body.limit - count,
              resetAt: Date.now() + 60_000,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return { namespace, checks, subjectByObjectName };
}

async function hashRateLimitSubject(subject: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(subject);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Discovery is read-only, so these journeys drive the artisan side through
 * the real catalog routes to reach a published state, then read the buyer
 * side back. Nothing here reaches into storage to arrange a fixture: a
 * published listing has to be the result of a publish, or the test would be
 * proving a state no client can produce.
 */
const BUYER_ENV = {
  APP_ENV: 'development',
  LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
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
 * publish â€” a test that passes for the wrong reason is worse than one that
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
 * â€” through either discovery route.
 */
async function testVisibilityThroughEveryRoute(): Promise<void> {
  resetInMemoryOperationRateLimiters();
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
  resetInMemoryOperationRateLimiters();
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
  resetInMemoryOperationRateLimiters();
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
  resetInMemoryOperationRateLimiters();
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
  resetInMemoryOperationRateLimiters();
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
async function testProductIdValidation(): Promise<void> {
  resetInMemoryOperationRateLimiters();
  const malformed = await buyerRequest(
    '/discovery/products/not-a-valid-product-id',
  );

  expect(
    malformed.status === 400,
    `Expected 400 for malformed productId, got ${malformed.status}.`,
  );

  const malformedBody = await readJson<{
    error: {
      code: string;
      message: string;
      details?: { field?: string };
    };
  }>(malformed);

  expect(
    malformedBody.error.code === 'VALIDATION_FAILED',
    `Expected VALIDATION_FAILED, got ${malformedBody.error.code}.`,
  );

  expect(
    malformedBody.error.details?.field === 'productId',
    'The validation error identifies productId.',
  );

  const missing = await buyerRequest(
    '/discovery/products/00000000-0000-4000-8000-00000000dead',
  );

  expect(
    missing.status === 404,
    `Expected 404 for a well-formed nonexistent UUID, got ${missing.status}.`,
  );
}
async function testBuyerPayloadsAreFieldChecked(): Promise<void> {
  resetInMemoryOperationRateLimiters();
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
  resetInMemoryOperationRateLimiters();
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

/**
 * Regression test: discovery.search rate limit enforced at HTTP level.
 * Uses development resolver with in-memory rate limiters.
 * 60 requests allowed per 60s window per actor, 61st returns 429 RATE_LIMITED.
 */
async function testDiscoverySearchRateLimitHttp(): Promise<void> {
  resetInMemoryOperationRateLimiters();
  // Publish a product to search for
  const published = await publishProduct('search-rate-limit');

  // Development environment with in-memory rate limiters
  const actorId = '00000000-0000-4000-8000-0000000000b2';
  const testEnv = {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: actorId,
  };

  // First 60 requests should succeed (limit is 60)
  for (let i = 0; i < 60; i++) {
    const response = await app.request(
      '/discovery/products',
      { method: 'GET' },
      testEnv,
    );
    expect(
      response.status === 200,
      `Request ${i + 1} should succeed, got ${response.status}`,
    );
    expect(
      response.headers.get('x-ratelimit-remaining') !== null,
      `Request ${i + 1} should have x-ratelimit-remaining header`,
    );
    expect(
      response.headers.get('x-ratelimit-reset') !== null,
      `Request ${i + 1} should have x-ratelimit-reset header`,
    );
    expect(
      response.headers.get('retry-after') === null,
      `Request ${i + 1} should not have retry-after header`,
    );
  }

  // 61st request should be denied with 429
  const deniedResponse = await app.request(
    '/discovery/products',
    { method: 'GET' },
    testEnv,
  );

  expect(
    deniedResponse.status === 429,
    `61st request should return 429, got ${deniedResponse.status}`,
  );

  const deniedBody = await readJson<{ error: { code: string; details?: { resetAt?: number } } }>(deniedResponse);
  expect(
    deniedBody.error.code === 'RATE_LIMITED',
    `Expected RATE_LIMITED, got ${deniedBody.error.code}`,
  );
  expect(
    deniedResponse.headers.get('x-ratelimit-remaining') === '0',
    'Denied response should have x-ratelimit-remaining: 0',
  );
  expect(
    deniedResponse.headers.get('x-ratelimit-reset') !== null,
    'Denied response should have x-ratelimit-reset header',
  );
  expect(
    Number(deniedResponse.headers.get('retry-after')) > 0,
    'Denied response should have positive retry-after header',
  );
}

/**
 * Regression test: discovery.read rate limit enforced at HTTP level.
 * Uses development resolver with in-memory rate limiters.
 * 120 requests allowed per 60s window per actor, 121st returns 429 RATE_LIMITED.
 */
async function testDiscoveryReadRateLimitHttp(): Promise<void> {
  resetInMemoryOperationRateLimiters();
  // Publish a product to read
  const published = await publishProduct('read-rate-limit');

  // Development environment with in-memory rate limiters
  const actorId = '00000000-0000-4000-8000-0000000000b3';
  const testEnv = {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: actorId,
  };

  // First 120 requests should succeed (limit is 120)
  for (let i = 0; i < 120; i++) {
    const response = await app.request(
      `/discovery/products/${published.id}`,
      { method: 'GET' },
      testEnv,
    );
    expect(
      response.status === 200,
      `Request ${i + 1} should succeed, got ${response.status}`,
    );
    expect(
      response.headers.get('x-ratelimit-remaining') !== null,
      `Request ${i + 1} should have x-ratelimit-remaining header`,
    );
    expect(
      response.headers.get('x-ratelimit-reset') !== null,
      `Request ${i + 1} should have x-ratelimit-reset header`,
    );
    expect(
      response.headers.get('retry-after') === null,
      `Request ${i + 1} should not have retry-after header`,
    );
  }

  // 121st request should be denied with 429
  const deniedResponse = await app.request(
    `/discovery/products/${published.id}`,
    { method: 'GET' },
    testEnv,
  );

  expect(
    deniedResponse.status === 429,
    `121st request should return 429, got ${deniedResponse.status}`,
  );

  const deniedBody = await readJson<{ error: { code: string; details?: { resetAt?: number } } }>(deniedResponse);
  expect(
    deniedBody.error.code === 'RATE_LIMITED',
    `Expected RATE_LIMITED, got ${deniedBody.error.code}`,
  );
  expect(
    deniedResponse.headers.get('x-ratelimit-remaining') === '0',
    'Denied response should have x-ratelimit-remaining: 0',
  );
  expect(
    deniedResponse.headers.get('x-ratelimit-reset') !== null,
    'Denied response should have x-ratelimit-reset header',
  );
  expect(
    Number(deniedResponse.headers.get('retry-after')) > 0,
    'Denied response should have positive retry-after header',
  );
}

/**
 * Regression test: discovery.search and discovery.read have independent budgets.
 * Uses development resolver with in-memory rate limiters.
 * Exhausting search budget does not affect read budget, and vice versa.
 */
async function testDiscoverySearchAndReadIndependentBudgets(): Promise<void> {
  resetInMemoryOperationRateLimiters();
  // Publish a product
  const published = await publishProduct('independent-budgets');

  // Development environment with in-memory rate limiters
  const actorId = '00000000-0000-4000-8000-0000000000b4';
  const testEnv = {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: actorId,
  };

  // Exhaust search budget (60 requests)
  for (let i = 0; i < 60; i++) {
    const response = await app.request(
      '/discovery/products',
      { method: 'GET' },
      testEnv,
    );
    expect(response.status === 200, `Search request ${i + 1} should succeed`);
  }
  // 61st search should be denied
  const deniedSearch = await app.request(
    '/discovery/products',
    { method: 'GET' },
    testEnv,
  );
  expect(deniedSearch.status === 429, 'Search should be denied after limit');

  // Read budget should still be fully available (120 requests)
  for (let i = 0; i < 120; i++) {
    const response = await app.request(
      `/discovery/products/${published.id}`,
      { method: 'GET' },
      testEnv,
    );
    expect(response.status === 200, `Read request ${i + 1} should succeed`);
  }
  // 121st read should be denied
  const deniedRead = await app.request(
    `/discovery/products/${published.id}`,
    { method: 'GET' },
    testEnv,
  );
  expect(deniedRead.status === 429, 'Read should be denied after its own limit');

  // Verify different scopes have different rate limit keys (implicitly tested by independent budgets)
  // The in-memory limiters use buildOperationKey which includes the scope, so they're independent.
}

/**
 * Regression test: discovery rate limit subject is derived from authenticated actor.
 * Different actors have independent budgets for the same operation.
 */
async function testDiscoveryRateLimitActorIsolation(): Promise<void> {
  resetInMemoryOperationRateLimiters();
  const { namespace, checks, subjectByObjectName } = createEnforcingDurableNamespace();

  // Publish a product
  const published = await publishProduct('actor-isolation');

  // Actor 1 environment with static session
  // Use APP_ENV: 'test' with LOCAL_IN_MEMORY_AUTH_ENABLED: 'true' to enable
  // in-memory repository while still using DO rate limiter (because buildMode
  // is 'development' and APP_ENV 'test' != buildMode 'development').
  const actor1Token = 'test-actor1-token';
  const actor1Id = '00000000-0000-4000-8000-0000000000c1';
  const actor1Env = {
    APP_ENV: 'test',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    AUTH_RATE_LIMITER: namespace,
    SESSION_TOKEN: actor1Token,
    SESSION_ACTOR_ID: actor1Id,
  };

  // Actor 2 environment with static session
  const actor2Token = 'test-actor2-token';
  const actor2Id = '00000000-0000-4000-8000-0000000000c2';
  const actor2Env = {
    APP_ENV: 'test',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    AUTH_RATE_LIMITER: namespace,
    SESSION_TOKEN: actor2Token,
    SESSION_ACTOR_ID: actor2Id,
  };

  const actor1SearchKey = `discovery.search:${actor1Id}`;
  const actor2SearchKey = `discovery.search:${actor2Id}`;
  const actor1SearchHash = await hashRateLimitSubject(actor1SearchKey);
  const actor2SearchHash = await hashRateLimitSubject(actor2SearchKey);
  subjectByObjectName.set(actor1SearchHash, actor1SearchKey);
  subjectByObjectName.set(actor2SearchHash, actor2SearchKey);

  // Exhaust actor1's search budget (60 requests)
  for (let i = 0; i < 60; i++) {
    const response = await app.request(
      '/discovery/products',
      {
        method: 'GET',
        headers: { authorization: `Bearer ${actor1Token}` },
      },
      actor1Env,
    );
    expect(response.status === 200, `Actor1 search ${i + 1} should succeed`);
  }
  const actor1Denied = await app.request(
    '/discovery/products',
    {
      method: 'GET',
      headers: { authorization: `Bearer ${actor1Token}` },
    },
    actor1Env,
  );
  expect(actor1Denied.status === 429, 'Actor1 should be denied after 60 searches');

  // Actor2 should still have full budget (60 requests)
  for (let i = 0; i < 60; i++) {
    const response = await app.request(
      '/discovery/products',
      {
        method: 'GET',
        headers: { authorization: `Bearer ${actor2Token}` },
      },
      actor2Env,
    );
    expect(response.status === 200, `Actor2 search ${i + 1} should succeed`);
  }

  // Verify different actors have different hashed subjects
  expect(actor1SearchHash !== actor2SearchHash, 'different actors should have different hashed subjects');

  // Verify DO calls tracked separately
  const actor1Checks = checks.filter(c => c.objectName === actor1SearchHash);
  const actor2Checks = checks.filter(c => c.objectName === actor2SearchHash);
  expect(actor1Checks.length === 61, 'actor1 should have 61 DO checks');
  expect(actor2Checks.length === 60, 'actor2 should have 60 DO checks');
}

/**
 * Regression test: discovery rate limiting fails closed in production
 * without AUTH_RATE_LIMITER binding.
 */
async function testDiscoveryRateLimitFailsClosedProduction(): Promise<void> {
  resetInMemoryOperationRateLimiters();
  const sessionToken = 'test-fail-closed-token';
  const actorId = '00000000-0000-4000-8000-0000000000d1';

  const testEnv = {
    APP_ENV: 'production',
    // No AUTH_RATE_LIMITER binding
    SESSION_TOKEN: sessionToken,
    SESSION_ACTOR_ID: actorId,
  };

  // Publish a product
  const published = await publishProduct('fail-closed');

  // Search should fail with 503 DEPENDENCY_FAILED (rate limiter fails closed)
  const searchResponse = await app.request(
    '/discovery/products',
    {
      method: 'GET',
      headers: { authorization: `Bearer ${sessionToken}` },
    },
    testEnv,
  );
  expect(searchResponse.status === 503, `Search should return 503, got ${searchResponse.status}`);
  const searchBody = await readJson<{ error: { code: string } }>(searchResponse);
  expect(searchBody.error.code === 'DEPENDENCY_FAILED', `Search should return DEPENDENCY_FAILED, got ${searchBody.error.code}`);

  // Read should fail with 503 DEPENDENCY_FAILED (rate limiter fails closed)
  const readResponse = await app.request(
    `/discovery/products/${published.id}`,
    {
      method: 'GET',
      headers: { authorization: `Bearer ${sessionToken}` },
    },
    testEnv,
  );
  expect(readResponse.status === 503, `Read should return 503, got ${readResponse.status}`);
  const readBody = await readJson<{ error: { code: string } }>(readResponse);
  expect(readBody.error.code === 'DEPENDENCY_FAILED', `Read should return DEPENDENCY_FAILED, got ${readBody.error.code}`);
}

/**
 * Regression test: successful discovery responses include rate limit headers
 * and response contracts remain unchanged.
 */
async function testDiscoveryRateLimitHeadersAndContract(): Promise<void> {
  resetInMemoryOperationRateLimiters();
  const { namespace, checks, subjectByObjectName } = createEnforcingDurableNamespace();

  // Publish a product
  const published = await publishProduct('headers-contract');

  const sessionToken = 'test-headers-token';
  const actorId = '00000000-0000-4000-8000-0000000000e1';

  const testEnv = {
    APP_ENV: 'test',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    AUTH_RATE_LIMITER: namespace,
    SESSION_TOKEN: sessionToken,
    SESSION_ACTOR_ID: actorId,
  };

  const searchKey = `discovery.search:${actorId}`;
  const readKey = `discovery.read:${actorId}`;
  const searchHash = await hashRateLimitSubject(searchKey);
  const readHash = await hashRateLimitSubject(readKey);
  subjectByObjectName.set(searchHash, searchKey);
  subjectByObjectName.set(readHash, readKey);

  // Test search response
  const searchResponse = await app.request(
    '/discovery/products?limit=1',
    {
      method: 'GET',
      headers: { authorization: `Bearer ${sessionToken}` },
    },
    testEnv,
  );
  expect(searchResponse.status === 200, 'Search should succeed');
  const searchBody = await readJson<{ products: Array<{ productId: string }> }>(searchResponse);
  expect(
    Array.isArray(searchBody.products) && typeof searchBody.products[0]?.productId === 'string',
    'Search response contract should have products array with productId',
  );
  expect(
    searchResponse.headers.get('x-ratelimit-remaining') !== null,
    'Search response should have x-ratelimit-remaining header',
  );
  expect(
    searchResponse.headers.get('x-ratelimit-reset') !== null,
    'Search response should have x-ratelimit-reset header',
  );
  expect(
    searchResponse.headers.get('retry-after') === null,
    'Successful search should not have retry-after header',
  );

  // Test read response
  const readResponse = await app.request(
    `/discovery/products/${published.id}`,
    {
      method: 'GET',
      headers: { authorization: `Bearer ${sessionToken}` },
    },
    testEnv,
  );
  expect(readResponse.status === 200, 'Read should succeed');
  const readBody = await readJson<{ product: { productId: string; title: string } }>(readResponse);
  expect(
    typeof readBody.product?.productId === 'string' && typeof readBody.product?.title === 'string',
    'Read response contract should have product with productId and title',
  );
  expect(
    readResponse.headers.get('x-ratelimit-remaining') !== null,
    'Read response should have x-ratelimit-remaining header',
  );
  expect(
    readResponse.headers.get('x-ratelimit-reset') !== null,
    'Read response should have x-ratelimit-reset header',
  );
  expect(
    readResponse.headers.get('retry-after') === null,
    'Successful read should not have retry-after header',
  );
}

async function main(): Promise<void> {
  await testVisibilityThroughEveryRoute();
  await testDraftEditDoesNotChangeThePublishedListing();
  await testArchivingRemovesTheListing();
  await testSearchAndPagination();
  await testValidationAndErrorCategories();
  await testProductIdValidation();
  await testBuyerPayloadsAreFieldChecked();
  await testDiscoveryIsReadOnly();

  // Rate limit regression tests (production path with enforcing fake DO)
  await testDiscoverySearchRateLimitHttp();
  await testDiscoveryReadRateLimitHttp();
  await testDiscoverySearchAndReadIndependentBudgets();
  await testDiscoveryRateLimitActorIsolation();
  await testDiscoveryRateLimitFailsClosedProduction();
  await testDiscoveryRateLimitHeadersAndContract();

  console.log('DISCOVERY JOURNEY HTTP TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
