import app from '../../index.js';
import {
  INQUIRY_MESSAGE_MAX_LENGTH,
  INQUIRY_PAGE_SIZE_MAX,
} from '@artisan-marketplace/contracts';

// This file's HTTP fixtures cannot pass a build mode through `app.request`.
// The suite-scoped development build matches `actorEnv` below; production
// call sites still omit the seam.
process.env.NODE_ENV = 'development';

/**
 * One actor per journey.
 *
 * `ARTISAN` publishes. Every buyer-facing journey gets its own buyer id
 * because creation is budgeted per actor and per path, and the journeys here
 * deliberately make more creation requests than the budget allows — that is
 * what makes them exhaustive. Sharing one buyer would mean the order of the
 * assertions decided which of them passed, so the suite would test its own
 * execution order rather than the behavior. `BURSTY_BUYER` is the actor whose
 * budget is meant to run out; `UNBURSTED_BUYER` proves that a buyer the
 * burst did not touch is unaffected.
 */
const ARTISAN = '00000000-0000-4000-8000-000000000001';
const BUYER = '00000000-0000-4000-8000-0000000000b1';
const OTHER_BUYER = '00000000-0000-4000-8000-0000000000b2';
const RETRY_BUYER = '00000000-0000-4000-8000-0000000000c1';
const RETRY_ARCHIVE_BUYER =
  '00000000-0000-4000-8000-0000000000c2';
const NOKEY_BUYER = '00000000-0000-4000-8000-0000000000c3';
const UNPUBLISHED_BUYER =
  '00000000-0000-4000-8000-0000000000c4';
const VALIDATION_BUYER =
  '00000000-0000-4000-8000-0000000000c5';
const LIST_BUYER = '00000000-0000-4000-8000-0000000000c6';
const BURSTY_BUYER = '00000000-0000-4000-8000-0000000000c7';
const UNBURSTED_BUYER =
  '00000000-0000-4000-8000-0000000000c8';

/** The configured inquiry-creation budget, per actor per path. */
const INQUIRY_CREATE_BUDGET = 10;

type ProductPayload = {
  id: string;
  state: string;
};

type InquiryPayload = {
  id: string;
  buyerId: string;
  productId: string;
  catalogVersion: number;
  message: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type CreateResult = {
  inquiry: InquiryPayload;
  deduplicated: boolean;
};

type ListResult = {
  inquiries: InquiryPayload[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: { field?: string };
  };
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

function actorEnv(actorId: string): Record<string, string> {
  return {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: actorId,
  };
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
    actorEnv(ARTISAN),
  );
}

type InquiryRequest = {
  buyerId: string;
  body?: unknown;
  idempotencyKey?: string;
  method?: string;
  path?: string;
};

async function inquiryRequest(
  request: InquiryRequest,
): Promise<Response> {
  const hasBody = request.body !== undefined;

  return app.request(
    request.path ?? '/inquiries',
    {
      method: request.method ?? 'POST',
      headers: {
        ...(hasBody
          ? { 'content-type': 'application/json' }
          : {}),
        ...(request.idempotencyKey === undefined
          ? {}
          : { 'idempotency-key': request.idempotencyKey }),
      },
      ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
    },
    actorEnv(request.buyerId),
  );
}

/**
 * Drives a product to PUBLISHED through the real routes.
 *
 * Published state is produced by the publish operation rather than
 * written into storage, so a fixture that the product code cannot produce
 * cannot quietly make an inquiry journey pass.
 */
async function publishProduct(key: string): Promise<string> {
  const created = await readJson<{ product: ProductPayload }>(
    await artisanRequest(
      '/catalog/products',
      'POST',
      {
        title: `Listing ${key}`,
        description: `A listing published for ${key}.`,
        category: 'basketry',
        materials: ['bamboo'],
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

  return created.product.id;
}

async function draftProduct(key: string): Promise<string> {
  const created = await readJson<{ product: ProductPayload }>(
    await artisanRequest(
      '/catalog/products',
      'POST',
      {
        title: `Draft ${key}`,
        description: 'This listing is never published.',
      },
      { 'idempotency-key': `draft-${key}` },
    ),
  );

  return created.product.id;
}

async function expectValidationFailure(
  response: Response,
  field: string,
  where: string,
): Promise<void> {
  expect(
    response.status === 400,
    `${where}: expected 400, got ${response.status}.`,
  );

  const body = await readJson<ErrorBody>(response);

  expect(
    body.error.code === 'VALIDATION_FAILED',
    `${where}: expected VALIDATION_FAILED, got ${body.error.code}.`,
  );
  expect(
    body.error.details?.field === field,
    `${where}: expected the refusal to name ${field}, got ${String(body.error.details?.field)}.`,
  );
}

/**
 * A buyer inquires about a published product, and the inquiry records the
 * published version it was made against — not a draft, and not a lookup that
 * would drift later.
 */
async function testBuyerInquiresAboutAPublishedProduct(): Promise<void> {
  const productId = await publishProduct('inquire');

  const response = await inquiryRequest({
    buyerId: BUYER,
    idempotencyKey: 'inquiry-happy-1',
    body: {
      productId,
      message: '  Is this still available?  ',
    },
  });

  expect(
    response.status === 201,
    `Expected 201 creating an inquiry, got ${response.status}.`,
  );

  const created = await readJson<CreateResult>(response);

  expect(
    !created.deduplicated,
    'A first attempt reports that it created the inquiry.',
  );
  expect(
    created.inquiry.buyerId === BUYER,
    'The inquiry is attributed to the authenticated actor, not to a body field.',
  );
  expect(
    created.inquiry.status === 'NEW',
    `A new inquiry is NEW, got ${created.inquiry.status}.`,
  );
  expect(
    created.inquiry.catalogVersion === 1,
    `The inquiry records the published version it referenced, got ${created.inquiry.catalogVersion}.`,
  );
  expect(
    created.inquiry.message === 'Is this still available?',
    'The stored message is the trimmed value that was validated, not a variant of it.',
  );

  const read = await inquiryRequest({
    buyerId: BUYER,
    method: 'GET',
    path: `/inquiries/${created.inquiry.id}`,
  });

  expect(
    read.status === 200,
    `Expected 200 reading the buyer's own inquiry, got ${read.status}.`,
  );

  expect(
    !(await read.text()).includes(ARTISAN),
    'An inquiry read by a buyer does not disclose the artisan identity.',
  );
}

/**
 * The retry path. The key identifies the intention, not the payload, so a
 * retry whose response was lost resolves to the original record even when it
 * carries a different body.
 */
async function testRetriesAreIdempotent(): Promise<void> {
  const productId = await publishProduct('retry');
  const otherProductId = await publishProduct('retry-other');

  const first = await readJson<CreateResult>(
    await inquiryRequest({
      buyerId: RETRY_BUYER,
      idempotencyKey: 'inquiry-retry-1',
      body: {
        productId,
        message: 'Original message.',
      },
    }),
  );

  expect(
    !first.deduplicated,
    'The first attempt created the inquiry.',
  );

  const replay = await inquiryRequest({
    buyerId: RETRY_BUYER,
    idempotencyKey: 'inquiry-retry-1',
    body: {
      productId: otherProductId,
      message: 'A different message entirely.',
    },
  });

  expect(
    replay.status === 200,
    `A replay is not a new creation, got ${replay.status}.`,
  );

  const replayed = await readJson<CreateResult>(replay);

  expect(
    replayed.deduplicated,
    'A replay reports that it deduplicated.',
  );
  expect(
    replayed.inquiry.id === first.inquiry.id,
    'A replay returns the original inquiry id.',
  );
  expect(
    replayed.inquiry.productId === productId &&
      replayed.inquiry.message === 'Original message.' &&
      replayed.inquiry.createdAt === first.inquiry.createdAt,
    'A replay returns the original inquiry unchanged, not the replayed payload.',
  );

  const list = await readJson<ListResult>(
    await inquiryRequest({
      buyerId: RETRY_BUYER,
      method: 'GET',
      path: '/inquiries?limit=50',
    }),
  );

  expect(
    list.inquiries.filter(
      (inquiry) => inquiry.id === first.inquiry.id,
    ).length === 1,
    'Repeated attempts with one key left exactly one inquiry.',
  );

  const otherBuyerReplay = await readJson<CreateResult>(
    await inquiryRequest({
      buyerId: OTHER_BUYER,
      idempotencyKey: 'inquiry-retry-1',
      body: {
        productId,
        message: 'Original message.',
      },
    }),
  );

  expect(
    !otherBuyerReplay.deduplicated &&
      otherBuyerReplay.inquiry.id !== first.inquiry.id,
    'The same key from a different buyer is a different intention, so it creates a different inquiry.',
  );
}

/**
 * A retry resolves before the publication check.
 *
 * A retry arrives after the first attempt already created the inquiry. If
 * the artisan archived the product in between, an ordering that checked
 * publication first would turn a request that genuinely succeeded into a
 * refusal, and the buyer would have no way to learn the truth of it.
 */
async function testRetrySurvivesAnUnpublishingInBetween(): Promise<void> {
  const productId = await publishProduct('retry-archive');

  const created = await readJson<CreateResult>(
    await inquiryRequest({
      buyerId: RETRY_ARCHIVE_BUYER,
      idempotencyKey: 'inquiry-retry-archive',
      body: {
        productId,
        message: 'Asked before the listing came down.',
      },
    }),
  );

  await artisanRequest(
    `/catalog/products/${productId}/transition`,
    'POST',
    { state: 'ARCHIVED' },
  );

  const replay = await inquiryRequest({
    buyerId: RETRY_ARCHIVE_BUYER,
    idempotencyKey: 'inquiry-retry-archive',
    body: {
      productId,
      message: 'Asked before the listing came down.',
    },
  });

  expect(
    replay.status === 200,
    `A retry of a succeeded inquiry is not refused after the product is archived, got ${replay.status}.`,
  );

  const replayed = await readJson<CreateResult>(replay);

  expect(
    replayed.inquiry.id === created.inquiry.id,
    'The retry returns the inquiry that already existed.',
  );
}

/**
 * A creation without a retry key is refused: a buyer whose first response is
 * lost could not otherwise tell whether their inquiry exists.
 */
async function testIdempotencyKeyIsRequired(): Promise<void> {
  const productId = await publishProduct('no-key');

  await expectValidationFailure(
    await inquiryRequest({
      buyerId: NOKEY_BUYER,
      body: {
        productId,
        message: 'No key supplied.',
      },
    }),
    'Idempotency-Key',
    'Creating an inquiry without a retry key',
  );

  await expectValidationFailure(
    await inquiryRequest({
      buyerId: NOKEY_BUYER,
      idempotencyKey: '   ',
      body: {
        productId,
        message: 'Blank key supplied.',
      },
    }),
    'Idempotency-Key',
    'Creating an inquiry with a blank retry key',
  );
}

/**
 * Only a published product can be inquired about, and the three ways of
 * failing to be published are reported identically — otherwise this endpoint
 * becomes a way to probe for an artisan's unpublished work.
 */
async function testOnlyPublishedProductsCanBeInquiredAbout(): Promise<void> {
  const unpublished = await draftProduct('inquiry-draft');
  const archived = await publishProduct('inquiry-archived');

  await artisanRequest(
    `/catalog/products/${archived}/transition`,
    'POST',
    { state: 'ARCHIVED' },
  );

  const missing = '00000000-0000-4000-8000-00000000dead';

  const refusals: {
    label: string;
    productId: string;
  }[] = [
    { label: 'a never-published draft', productId: unpublished },
    { label: 'an archived listing', productId: archived },
    { label: 'an id that does not exist', productId: missing },
  ];

  let reference = '';

  for (const [index, refusal] of refusals.entries()) {
    const response = await inquiryRequest({
      buyerId: UNPUBLISHED_BUYER,
      idempotencyKey: `inquiry-unpublished-${index}`,
      body: {
        productId: refusal.productId,
        message: 'Is this available?',
      },
    });

    expect(
      response.status === 404,
      `${refusal.label}: expected 404, got ${response.status}.`,
    );

    const body = await readJson<ErrorBody>(response);

    expect(
      body.error.code === 'NOT_FOUND',
      `${refusal.label}: expected NOT_FOUND, got ${body.error.code}.`,
    );
    expect(
      body.error.message.includes('published'),
      `${refusal.label}: the refusal tells the buyer what is allowed instead, got ${body.error.message}.`,
    );

    if (index === 0) {
      reference = body.error.message;
    } else {
      expect(
        body.error.message === reference,
        `${refusal.label} is refused identically to an unpublished draft, got ${body.error.message} against ${reference}.`,
      );
    }
  }

  const list = await readJson<ListResult>(
    await inquiryRequest({
      buyerId: UNPUBLISHED_BUYER,
      method: 'GET',
      path: '/inquiries?limit=50',
    }),
  );

  expect(
    !list.inquiries.some(
      (inquiry) =>
        inquiry.productId === unpublished ||
        inquiry.productId === archived,
    ),
    'A refused inquiry leaves nothing behind.',
  );
}

/**
 * Every field of the request is untrusted and is bounded before anything is
 * written.
 */
async function testValidationIsBoundedAndNamed(): Promise<void> {
  const productId = await publishProduct('validate');

  await expectValidationFailure(
    await inquiryRequest({
      buyerId: VALIDATION_BUYER,
      idempotencyKey: 'inquiry-no-product',
      body: { message: 'Which product?' },
    }),
    'productId',
    'An inquiry with no product',
  );

  await expectValidationFailure(
    await inquiryRequest({
      buyerId: VALIDATION_BUYER,
      idempotencyKey: 'inquiry-blank-product',
      body: {
        productId: '   ',
        message: 'Which product?',
      },
    }),
    'productId',
    'An inquiry with a blank product',
  );

  await expectValidationFailure(
    await inquiryRequest({
      buyerId: VALIDATION_BUYER,
      idempotencyKey: 'inquiry-no-message',
      body: { productId },
    }),
    'message',
    'An inquiry with no message',
  );

  await expectValidationFailure(
    await inquiryRequest({
      buyerId: VALIDATION_BUYER,
      idempotencyKey: 'inquiry-blank-message',
      body: {
        productId,
        message: '     ',
      },
    }),
    'message',
    'An inquiry with a blank message',
  );

  await expectValidationFailure(
    await inquiryRequest({
      buyerId: VALIDATION_BUYER,
      idempotencyKey: 'inquiry-long-message',
      body: {
        productId,
        message: 'x'.repeat(
          INQUIRY_MESSAGE_MAX_LENGTH + 1,
        ),
      },
    }),
    'message',
    'An inquiry with an oversized message',
  );

  await expectValidationFailure(
    await inquiryRequest({
      buyerId: VALIDATION_BUYER,
      idempotencyKey: 'inquiry-wrong-type',
      body: {
        productId,
        message: { nested: 'object' },
      },
    }),
    'message',
    'An inquiry whose message is not text',
  );

  // A message exactly at the bound is accepted, so the bound is a ceiling
  // rather than an off-by-one.
  const atBound = await inquiryRequest({
    buyerId: VALIDATION_BUYER,
    idempotencyKey: 'inquiry-bound-message',
    body: {
      productId,
      message: 'y'.repeat(INQUIRY_MESSAGE_MAX_LENGTH),
    },
  });

  expect(
    atBound.status === 201,
    `A message exactly at the bound is accepted, got ${atBound.status}.`,
  );

  for (const query of [
    'limit=0',
    `limit=${INQUIRY_PAGE_SIZE_MAX + 1}`,
    'limit=2.5',
    'offset=-1',
  ]) {
    await expectValidationFailure(
      await inquiryRequest({
        buyerId: VALIDATION_BUYER,
        method: 'GET',
        path: `/inquiries?${query}`,
      }),
      query.startsWith('offset') ? 'offset' : 'limit',
      `Listing inquiries with "${query}"`,
    );
  }
}

/**
 * An inquiry is visible only to the buyer who made it.
 *
 * Another buyer must not be able to learn that the id exists: the refusal
 * for someone else's inquiry is identical to the refusal for an id that does
 * not exist.
 */
async function testInquiriesAreOwnerScoped(): Promise<void> {
  const productId = await publishProduct('ownership');

  const created = await readJson<CreateResult>(
    await inquiryRequest({
      buyerId: BUYER,
      idempotencyKey: 'inquiry-ownership',
      body: {
        productId,
        message: 'How much for twenty of these?',
      },
    }),
  );

  const foreign = await inquiryRequest({
    buyerId: OTHER_BUYER,
    method: 'GET',
    path: `/inquiries/${created.inquiry.id}`,
  });

  expect(
    foreign.status === 404,
    `Another buyer cannot read the inquiry, got ${foreign.status}.`,
  );

  const missing = await inquiryRequest({
    buyerId: OTHER_BUYER,
    method: 'GET',
    path: '/inquiries/00000000-0000-4000-8000-00000000dead',
  });

  const foreignBody = await readJson<ErrorBody>(foreign);
  const missingBody = await readJson<ErrorBody>(missing);

  expect(
    foreignBody.error.code === missingBody.error.code &&
      foreignBody.error.message === missingBody.error.message,
    `Someone else's inquiry and a nonexistent id are refused identically, got ${JSON.stringify(foreignBody.error)} against ${JSON.stringify(missingBody.error)}.`,
  );

  const foreignList = await readJson<ListResult>(
    await inquiryRequest({
      buyerId: OTHER_BUYER,
      method: 'GET',
      path: '/inquiries?limit=50',
    }),
  );

  expect(
    !foreignList.inquiries.some(
      (inquiry) => inquiry.id === created.inquiry.id,
    ),
    "Another buyer's list does not contain the inquiry.",
  );

  const ownList = await readJson<ListResult>(
    await inquiryRequest({
      buyerId: BUYER,
      method: 'GET',
      path: '/inquiries?limit=50',
    }),
  );

  expect(
    ownList.inquiries.some(
      (inquiry) => inquiry.id === created.inquiry.id,
    ),
    "The buyer's own list does contain the inquiry.",
  );
}

/**
 * The list is bounded, ordered newest first, and reports the bounds it
 * applied.
 */
async function testListIsBoundedAndOrdered(): Promise<void> {
  const productId = await publishProduct('listing');

  const created: InquiryPayload[] = [];

  for (let index = 0; index < 3; index += 1) {
    created.push(
      (
        await readJson<CreateResult>(
          await inquiryRequest({
            buyerId: LIST_BUYER,
            idempotencyKey: `inquiry-list-${index}`,
            body: {
              productId,
              message: `Question number ${index}.`,
            },
          }),
        )
      ).inquiry,
    );
  }

  const firstPage = await readJson<ListResult>(
    await inquiryRequest({
      buyerId: LIST_BUYER,
      method: 'GET',
      path: '/inquiries?limit=2&offset=0',
    }),
  );

  expect(
    firstPage.inquiries.length === 2 &&
      firstPage.limit === 2 &&
      firstPage.offset === 0,
    'The list honours the requested bound and reports it back.',
  );
  expect(
    firstPage.total >= 3,
    `The list reports a total that includes rows beyond the page, got ${firstPage.total}.`,
  );
  expect(
    firstPage.hasMore,
    'The list says whether more exist.',
  );

  const timestamps = firstPage.inquiries.map(
    (inquiry) => inquiry.createdAt,
  );

  expect(
    timestamps.length === 2 &&
      timestamps[0]! >= timestamps[1]!,
    `The list is newest first, got ${JSON.stringify(timestamps)}.`,
  );

  const seen: string[] = [];
  let offset = 0;

  for (;;) {
    const page = await readJson<ListResult>(
      await inquiryRequest({
        buyerId: LIST_BUYER,
        method: 'GET',
        path: `/inquiries?limit=2&offset=${offset}`,
      }),
    );

    seen.push(...page.inquiries.map((inquiry) => inquiry.id));

    if (!page.hasMore) {
      break;
    }

    offset += page.limit;
  }

  expect(
    new Set(seen).size === seen.length,
    'Paging does not repeat an inquiry.',
  );
  expect(
    created.every((inquiry) => seen.includes(inquiry.id)),
    'Every inquiry this test created is reachable by paging.',
  );
}

/**
 * Only the authenticated buyer reaches the surface at all.
 */
async function testAnonymousIsRefused(): Promise<void> {
  for (const method of ['GET', 'POST']) {
    const response = await app.request(
      '/inquiries',
      { method },
      { APP_ENV: 'production' },
    );

    expect(
      response.status === 503,
      `${method} /inquiries is refused when no session can be verified, got ${response.status}.`,
    );
  }
}

/**
 * The creation budget is bounded, and it is bounded on writes only.
 *
 * The burst actor exhausts its own budget and is then refused, while its
 * reads still answer — reading one's own inquiry history is what a buyer
 * does while deciding, and a budget on it would fail in a way the buyer
 * cannot act on.
 */
async function testCreationIsRateLimitedAndReadsAreNot(): Promise<void> {
  const productId = await publishProduct('burst');

  let refused = 0;

  for (
    let index = 0;
    index < INQUIRY_CREATE_BUDGET + 5;
    index += 1
  ) {
    const response = await inquiryRequest({
      buyerId: BURSTY_BUYER,
      idempotencyKey: `inquiry-burst-${index}`,
      body: {
        productId,
        message: `Burst ${index}.`,
      },
    });

    if (response.status === 429) {
      refused += 1;

      const body = await readJson<ErrorBody>(response);

      expect(
        body.error.code === 'RATE_LIMITED',
        `The refusal is a rate limit, got ${body.error.code}.`,
      );
      expect(
        Number(response.headers.get('retry-after')) > 0,
        'The refusal tells the client when to try again.',
      );

      continue;
    }

    expect(
      response.status === 201,
      `A burst creation within the budget is a 201, got ${response.status} on attempt ${index}.`,
    );
  }

  expect(
    refused === 5,
    `The budget of ${INQUIRY_CREATE_BUDGET} holds and the remaining 5 attempts are refused, got ${refused} refusals.`,
  );

  const read = await inquiryRequest({
    buyerId: BURSTY_BUYER,
    method: 'GET',
    path: '/inquiries?limit=1',
  });

  expect(
    read.status === 200,
    `Reads still answer once the write budget is exhausted, got ${read.status}.`,
  );

  const page = await readJson<ListResult>(read);

  expect(
    page.total === INQUIRY_CREATE_BUDGET,
    `Exactly the budgeted number of inquiries were stored, got ${page.total}.`,
  );

  // Another buyer is unaffected by the exhausted budget.
  const other = await inquiryRequest({
    buyerId: UNBURSTED_BUYER,
    idempotencyKey: 'inquiry-after-burst',
    body: {
      productId,
      message: "Unaffected by another buyer's burst.",
    },
  });

  expect(
    other.status === 201,
    `One buyer's exhausted budget does not refuse another, got ${other.status}.`,
  );
}

async function main(): Promise<void> {
  await testBuyerInquiresAboutAPublishedProduct();
  await testRetriesAreIdempotent();
  await testRetrySurvivesAnUnpublishingInBetween();
  await testIdempotencyKeyIsRequired();
  await testOnlyPublishedProductsCanBeInquiredAbout();
  await testValidationIsBoundedAndNamed();
  await testInquiriesAreOwnerScoped();
  await testListIsBoundedAndOrdered();
  await testAnonymousIsRefused();
  await testCreationIsRateLimitedAndReadsAreNot();

  console.log('INQUIRY JOURNEY HTTP TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
