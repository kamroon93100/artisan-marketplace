import {
  DISCOVERY_PAGE_SIZE_DEFAULT,
  DISCOVERY_PAGE_SIZE_MAX,
  DISCOVERY_SEARCH_MAX_LENGTH,
  DiscoveryTransportError,
  HttpDiscoveryTransport,
  defaultDiscoveryTransport,
  resolveDiscoveryTransport,
} from './discovery-transport';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8787';

const originalFetch = globalThis.fetch;

function mockFetch(
  implementation: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
): void {
  globalThis.fetch = implementation as typeof fetch;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A published listing the server is documented to send.
 *
 * Built from a complete real response rather than a trimmed one: the client
 * validates every field, so a fixture that omitted any of them would let a
 * field the client never validates pass unnoticed.
 */
function aPublishedProduct(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    productId: 'product-1',
    versionNumber: 2,
    title: 'Bamboo Basket',
    description: 'Handwoven storage basket.',
    category: 'basketry',
    materials: ['bamboo'],
    publishedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function aPage(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    products: [aPublishedProduct()],
    total: 1,
    limit: 20,
    offset: 0,
    hasMore: false,
    ...overrides,
  };
}

async function expectRejected(
  run: () => Promise<unknown>,
  label: string,
): Promise<DiscoveryTransportError> {
  let raised: unknown = null;

  try {
    await run();
  } catch (error) {
    raised = error;
  }

  if (raised === null) {
    throw new Error(
      `TEST FAILED: ${label}: expected the request to be rejected.`,
    );
  }

  if (!(raised instanceof DiscoveryTransportError)) {
    throw new Error(
      `TEST FAILED: ${label}: expected a DiscoveryTransportError, received ${String(raised)}.`,
    );
  }

  return raised;
}

/**
 * The page is read from the route the API exposes, as a GET, with no
 * credentials.
 *
 * Discovery takes no authorization header: a read over published snapshots
 * is not a permission decision, and the server's identity seam resolves a
 * development actor without one. Asserting the header is *absent* rather
 * than merely unused matters because a header added here later would silently
 * make buyer reads depend on a session the buyer does not have.
 */
async function testSearchProductsReadsThePage(): Promise<void> {
  let capturedUrl = '';
  let capturedMethod = '';
  let capturedHeaders: Headers | undefined;

  mockFetch(async (input, init) => {
    capturedUrl = String(input);
    capturedMethod = init?.method ?? '';
    capturedHeaders =
      init?.headers === undefined
        ? undefined
        : new Headers(init.headers as HeadersInit);

    return jsonResponse(aPage());
  });

  const page =
    await new HttpDiscoveryTransport().searchProducts({});

  expect(
    capturedUrl === 'http://localhost:8787/discovery/products',
    `the list route is the one the API exposes (received: ${capturedUrl})`,
  );
  expect(
    capturedMethod === 'GET',
    'discovery is a GET',
  );
  expect(
    capturedHeaders === undefined,
    'no request headers are sent — discovery sends no credentials',
  );
  expect(
    page.products.length === 1 &&
      page.products[0].productId === 'product-1',
    'the products are read',
  );
  expect(
    page.products[0].versionNumber === 2,
    'the published version number is read',
  );
  expect(
    page.products[0].category === 'basketry',
    'the category is read',
  );
  expect(
    page.products[0].materials.length === 1 &&
      page.products[0].materials[0] === 'bamboo',
    'the materials are read',
  );
  expect(
    page.products[0].publishedAt ===
      '2026-01-02T00:00:00.000Z',
    'the publish time is read',
  );
  expect(
    page.total === 1 &&
      page.limit === 20 &&
      page.offset === 0,
    'the page envelope is read',
  );
  expect(
    page.hasMore === false,
    'the has-more flag is read as the server reported it',
  );
}

/**
 * Only the parameters actually present are sent, and text is encoded.
 *
 * A present-but-empty pair would turn "no search" into a search for the
 * empty string at the URL level, and an unencoded `&` or `#` in a buyer's
 * search would silently become a different request than the one they typed.
 */
async function testSearchSendsOnlyPresentParameters(): Promise<void> {
  const cases: [
    string,
    Record<string, string | number>,
    string,
  ][] = [
    ['no parameters', {}, 'http://localhost:8787/discovery/products'],
    [
      'a search only',
      { search: 'cane & bamboo #2' },
      'http://localhost:8787/discovery/products?search=cane%20%26%20bamboo%20%232',
    ],
    [
      'a page only',
      { limit: 20, offset: 40 },
      'http://localhost:8787/discovery/products?limit=20&offset=40',
    ],
    [
      'all three',
      { search: 'stone ware', limit: 10, offset: 0 },
      'http://localhost:8787/discovery/products?search=stone%20ware&limit=10&offset=0',
    ],
  ];

  for (const [label, request, expectedUrl] of cases) {
    let capturedUrl = '';

    mockFetch(async (input) => {
      capturedUrl = String(input);
      return jsonResponse(aPage());
    });

    await new HttpDiscoveryTransport().searchProducts(request);

    expect(
      capturedUrl === expectedUrl,
      `${label} produce the documented URL (received: ${capturedUrl})`,
    );
  }
}

async function testGetProductReadsTheListing(): Promise<void> {
  let capturedUrl = '';
  let capturedHeaders: Headers | undefined;

  mockFetch(async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders =
      init?.headers === undefined
        ? undefined
        : new Headers(init.headers as HeadersInit);

    return jsonResponse({
      product: aPublishedProduct({ category: null }),
    });
  });

  const result =
    await new HttpDiscoveryTransport().getProduct('product-1');

  expect(
    capturedUrl ===
      'http://localhost:8787/discovery/products/product-1',
    `the item route is the one the API exposes (received: ${capturedUrl})`,
  );
  expect(
    capturedHeaders === undefined,
    'no request headers are sent',
  );
  expect(
    result.product.productId === 'product-1',
    'the product id is read',
  );
  expect(
    result.product.category === null,
    'an uncategorised product reports null rather than an empty string',
  );
}

/**
 * The id is encoded, because the URL is built from it.
 *
 * A raw `/` or space in an id would address a different path than the one
 * the caller meant, and the answer that comes back would be about the wrong
 * resource while looking entirely legitimate.
 */
async function testProductIdIsEncoded(): Promise<void> {
  let capturedUrl = '';

  mockFetch(async (input) => {
    capturedUrl = String(input);
    return jsonResponse({ product: aPublishedProduct() });
  });

  await new HttpDiscoveryTransport().getProduct('a b/c');

  expect(
    capturedUrl ===
      'http://localhost:8787/discovery/products/a%20b%2Fc',
    `the product id is encoded (received: ${capturedUrl})`,
  );
}

/**
 * An empty id is refused before a request is made.
 *
 * Sending it would address the collection route instead of the item route,
 * and the 404 that comes back would answer a question nobody asked —
 * reported, correctly, as "no such product".
 */
async function testEmptyProductIdIsRefusedClientSide(): Promise<void> {
  let fetchCalls = 0;

  mockFetch(async () => {
    fetchCalls += 1;
    return jsonResponse({ product: aPublishedProduct() });
  });

  for (const id of ['', '   ']) {
    const raised = await expectRejected(
      () => new HttpDiscoveryTransport().getProduct(id),
      `a blank product id (${JSON.stringify(id)})`,
    );

    expect(
      raised.code === 'INVALID_REQUEST' && !raised.retryable,
      'a blank product id is a client-side refusal and is not retryable',
    );
  }

  expect(
    fetchCalls === 0,
    'no request is sent for a blank product id',
  );
}

/**
 * Fail closed on malformed pages.
 *
 * A field the client cannot read is rejected rather than defaulted, because
 * every defaulting direction is the reassuring one: a missing `total` read
 * as 0 would say "nothing matches" against a catalog that has listings, and
 * a missing `hasMore` read as `false` would stop the buyer paging.
 */
async function testMalformedPagesFailClosed(): Promise<void> {
  const cases: [string, unknown][] = [
    ['a non-object response', []],
    ['a missing product list', aPage({ products: undefined })],
    ['a non-list product list', aPage({ products: 'none' })],
    ['a missing total', aPage({ total: undefined })],
    ['a non-numeric total', aPage({ total: '1' })],
    ['a missing limit', aPage({ limit: undefined })],
    ['a missing offset', aPage({ offset: undefined })],
    ['a non-boolean has-more flag', aPage({ hasMore: 'false' })],
    ['a missing has-more flag', aPage({ hasMore: undefined })],
    ['a non-object product', aPage({ products: ['a basket'] })],
  ];

  for (const [label, body] of cases) {
    mockFetch(async () => jsonResponse(body));

    const raised = await expectRejected(
      () =>
        new HttpDiscoveryTransport().searchProducts({}),
      label,
    );

    expect(
      raised.code === 'INVALID_SERVER_RESPONSE' &&
        !raised.retryable,
      `${label} fails closed as a non-retryable contract mismatch`,
    );
  }
}

/**
 * Fail closed on malformed listings, one field at a time.
 *
 * A malformed entry is not skipped: a product dropped from the list would
 * render a page with fewer listings than the server sent, and the missing
 * one is precisely a listing the buyer should have been shown.
 */
async function testMalformedProductsFailClosed(): Promise<void> {
  const cases: [string, unknown][] = [
    ['a missing product id', aPublishedProduct({ productId: undefined })],
    ['a non-text product id', aPublishedProduct({ productId: 7 })],
    [
      'a non-numeric version number',
      aPublishedProduct({ versionNumber: '2' }),
    ],
    ['a missing title', aPublishedProduct({ title: undefined })],
    ['a non-text title', aPublishedProduct({ title: 12 })],
    [
      'a missing description',
      aPublishedProduct({ description: undefined }),
    ],
    [
      'a category that is neither text nor null',
      aPublishedProduct({ category: 3 }),
    ],
    [
      'a non-list of materials',
      aPublishedProduct({ materials: 'bamboo' }),
    ],
    [
      'a non-text material',
      aPublishedProduct({ materials: ['bamboo', 4] }),
    ],
    [
      'a missing publish time',
      aPublishedProduct({ publishedAt: undefined }),
    ],
  ];

  for (const [label, product] of cases) {
    mockFetch(async () => jsonResponse(aPage({ products: [product] })));

    const raised = await expectRejected(
      () =>
        new HttpDiscoveryTransport().searchProducts({}),
      label,
    );

    expect(
      raised.code === 'INVALID_SERVER_RESPONSE' &&
        !raised.retryable,
      `${label} fails closed as a non-retryable contract mismatch`,
    );
    expect(
      raised.message.includes('cannot read'),
      `${label} says what could not be read (received: ${raised.message})`,
    );
  }
}

/**
 * The detail route is read through the same strictness, including its
 * envelope: a response with no `product` is not a product.
 */
async function testMalformedDetailFailsClosed(): Promise<void> {
  const cases: [string, unknown][] = [
    ['a non-object response', ['product-1']],
    ['a missing product', {}],
    ['a non-object product', { product: 'a basket' }],
    [
      'a product with no title',
      { product: aPublishedProduct({ title: undefined }) },
    ],
    [
      'a product with a malformed category',
      { product: aPublishedProduct({ category: [] }) },
    ],
  ];

  for (const [label, body] of cases) {
    mockFetch(async () => jsonResponse(body));

    const raised = await expectRejected(
      () =>
        new HttpDiscoveryTransport().getProduct('product-1'),
      label,
    );

    expect(
      raised.code === 'INVALID_SERVER_RESPONSE' &&
        !raised.retryable,
      `${label} fails closed as a non-retryable contract mismatch`,
    );
  }
}

/**
 * A 200 whose body cannot be parsed is a contract mismatch, not a page.
 *
 * The status alone is not the answer: an unreadable body on a success
 * status would otherwise be returned as "no results" or "no product", which
 * is a confident answer the server never gave.
 */
async function testUnreadableSuccessBodyFailsClosed(): Promise<void> {
  mockFetch(async () =>
    new Response('<!doctype html>', { status: 200 }),
  );

  const raised = await expectRejected(
    () => new HttpDiscoveryTransport().searchProducts({}),
    'a 200 with an unreadable body',
  );

  expect(
    raised.code === 'INVALID_SERVER_RESPONSE' &&
      !raised.retryable,
    'an unreadable success body is a non-retryable contract mismatch',
  );
}

/**
 * A refusal is the server's considered answer and must not be retried.
 *
 * Retrying "this product is not published" cannot publish it, and a screen
 * that retries it produces a spinner that never resolves into anything
 * useful. The server's code and message survive so the screen can say why.
 */
async function testRefusalsAreNotRetryable(): Promise<void> {
  for (const [status, code, message] of [
    [400, 'VALIDATION_FAILED', 'limit must be at most 50.'],
    [404, 'NOT_FOUND', 'No such published product.'],
    [401, 'UNAUTHENTICATED', 'Refused.'],
    [403, 'FORBIDDEN', 'Refused.'],
  ] as [number, string, string][]) {
    mockFetch(async () =>
      jsonResponse({ error: { code, message } }, status),
    );

    const raised = await expectRejected(
      () =>
        new HttpDiscoveryTransport().searchProducts({
          limit: DISCOVERY_PAGE_SIZE_MAX + 1,
        }),
      `a ${status} refusal`,
    );

    expect(
      raised.code === code && !raised.retryable,
      `a ${status} preserves its code (${code}) and is not retryable`,
    );
    expect(
      raised.message === message,
      'the server reason is preserved verbatim',
    );
  }
}

/**
 * A server fault is worth retrying; a transport fault is too.
 *
 * The distinction is the whole reason the error carries a retryable flag: a
 * buyer on a flaky connection should be able to try again without being
 * told the server refused them.
 */
async function testServerAndNetworkFailuresAreRetryable(): Promise<void> {
  for (const status of [408, 425, 429, 500, 503]) {
    mockFetch(async () =>
      jsonResponse(
        { error: { code: 'TRANSIENT_FAILURE', message: 'Retry.' } },
        status,
      ),
    );

    const raised = await expectRejected(
      () => new HttpDiscoveryTransport().searchProducts({}),
      `HTTP ${status}`,
    );

    expect(
      raised.retryable === true,
      `HTTP ${status} is retryable`,
    );
  }

  mockFetch(async () => {
    throw new Error('Network request failed.');
  });

  const raised = await expectRejected(
    () => new HttpDiscoveryTransport().getProduct('product-1'),
    'a network fault',
  );

  expect(
    raised.code === 'NETWORK_ERROR' && raised.retryable === true,
    'a network fault is retryable',
  );
}

/**
 * An error body the client cannot read still classifies by status.
 *
 * The status code remains authoritative when the body is missing or
 * malformed, because retryability is a property of what happened, not of
 * how well the failure was documented.
 */
async function testUnreadableErrorBodyClassifiesByStatus(): Promise<void> {
  for (const [status, retryable] of [
    [404, false],
    [503, true],
  ] as [number, boolean][]) {
    mockFetch(async () =>
      new Response('gateway nope', { status }),
    );

    const raised = await expectRejected(
      () => new HttpDiscoveryTransport().searchProducts({}),
      `a ${status} with an unreadable body`,
    );

    expect(
      raised.code === `HTTP_${status}` &&
        raised.retryable === retryable,
      `a ${status} with an unreadable body classifies as HTTP_${status} (retryable: ${retryable})`,
    );
  }
}

/**
 * The default client is one object, not one per call.
 *
 * The discovery screen loads in an effect that depends on a callback, which
 * depends on the client. A client constructed during render is a new object
 * on every render, so the callback is new, so the effect re-runs, so it sets
 * state, so it renders again — a request loop that never settles and never
 * shows the buyer the catalog. Identity is the whole of that bug, so it is
 * asserted directly rather than inferred from a rendered screen.
 */
async function testDefaultTransportIsOneStableInstance(): Promise<void> {
  const first = resolveDiscoveryTransport();
  const second = resolveDiscoveryTransport();

  expect(
    first === second,
    'resolving the default client twice returns the same instance',
  );
  expect(
    first === defaultDiscoveryTransport,
    'the default client is the module-level instance',
  );
  expect(
    first instanceof HttpDiscoveryTransport,
    'the default client is the real transport',
  );
  expect(
    resolveDiscoveryTransport(first) === first,
    'a client that is already resolved is returned unchanged',
  );

  /**
   * The identity has to survive being resolved *again* after something else
   * was resolved, because that is the sequence a screen produces: a render
   * resolves the default, a test or a caller resolves an injected one, and
   * the next render resolves the default again. A resolver that cached the
   * last argument instead of the module's client would hand back the
   * injected one here.
   */
  const afterAnInjectedResolution = resolveDiscoveryTransport(first);

  expect(
    resolveDiscoveryTransport() === first,
    'the default client keeps its identity after an injected resolution',
  );
  expect(
    afterAnInjectedResolution === first,
    'an injected client does not become the default',
  );
}

/**
 * The bounded constants are the server's bounds, not guesses.
 *
 * The server refuses rather than clamps, so a client that drifts above the
 * ceiling is guaranteed a 400 instead of a shorter page. The screens cap
 * their input against the search bound so the buyer is not the one who
 * discovers the limit as an error.
 */
async function testBoundedConstantsMatchTheContract(): Promise<void> {
  expect(
    DISCOVERY_PAGE_SIZE_MAX === 50,
    'the page ceiling is the contract ceiling',
  );
  expect(
    DISCOVERY_PAGE_SIZE_DEFAULT === 20,
    'the default page size is the contract default',
  );
  expect(
    DISCOVERY_PAGE_SIZE_DEFAULT <= DISCOVERY_PAGE_SIZE_MAX,
    'the default page fits under the ceiling',
  );
  expect(
    DISCOVERY_SEARCH_MAX_LENGTH === 120,
    'the search bound is the contract bound',
  );
}

async function main(): Promise<void> {
  try {
    await testSearchProductsReadsThePage();
    await testSearchSendsOnlyPresentParameters();
    await testGetProductReadsTheListing();
    await testProductIdIsEncoded();
    await testEmptyProductIdIsRefusedClientSide();
    await testMalformedPagesFailClosed();
    await testMalformedProductsFailClosed();
    await testMalformedDetailFailsClosed();
    await testUnreadableSuccessBodyFailsClosed();
    await testRefusalsAreNotRetryable();
    await testServerAndNetworkFailuresAreRetryable();
    await testUnreadableErrorBodyClassifiesByStatus();
    await testDefaultTransportIsOneStableInstance();
    await testBoundedConstantsMatchTheContract();
  } finally {
    restoreFetch();
  }

  console.log('DISCOVERY TRANSPORT TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
