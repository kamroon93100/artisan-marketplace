import {
  HttpInquiryTransport,
  INQUIRY_MESSAGE_MAX_LENGTH,
  INQUIRY_PAGE_SIZE_DEFAULT,
  InquiryTransportError,
  parseInquiry,
  validateInquiryMessage,
} from './inquiry-transport';

process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:8787';

const originalFetch = globalThis.fetch;

function restore(): void {
  globalThis.fetch = originalFetch;
}

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`INQUIRY TRANSPORT TEST FAILED: ${message}`);
  }
}

/** Awaits a rejection and reports whether the error matched the predicate. */
async function expectRejection(
  attempt: () => Promise<unknown>,
  matches: (error: unknown) => boolean,
  message: string,
): Promise<void> {
  let thrown: unknown = null;

  try {
    await attempt();
  } catch (error) {
    thrown = error;
  }

  expect(thrown !== null && matches(thrown), message);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function inquiryBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    buyerId: '22222222-2222-4222-8222-222222222222',
    productId: '44444444-4444-4444-8444-444444444444',
    catalogVersion: 2,
    message: 'Is this available in reed as well?',
    status: 'NEW',
    createdAt: '2026-10-10T12:00:00.000Z',
    updatedAt: '2026-10-10T12:00:00.000Z',
    ...overrides,
  };
}

type Captured = {
  url: string;
  method: string;
  authorization: string | null;
  idempotencyKey: string | null;
  body: Record<string, unknown> | null;
};

function capture(
  implementation: (request: Captured) => Response,
): Captured[] {
  const seen: Captured[] = [];

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const text = typeof init?.body === 'string' ? init.body : null;
    const request: Captured = {
      url: String(input),
      method: init?.method ?? 'GET',
      authorization: headers.get('authorization'),
      idempotencyKey: headers.get('idempotency-key'),
      body: text === null ? null : JSON.parse(text),
    };

    seen.push(request);
    return implementation(request);
  }) as typeof fetch;

  return seen;
}

const REQUEST = {
  productId: '44444444-4444-4444-8444-444444444444',
  message: 'Is this available in reed as well?',
  idempotencyKey: 'a'.repeat(32),
};

/**
 * The body carries only the product and the message. The buyer is derived
 * from the authenticated actor, so a client-supplied identity would be
 * either ignored or refused — this client does not send one.
 */
async function testCreateSendsOnlyProductAndMessage(): Promise<void> {
  const transport = new HttpInquiryTransport();
  const seen = capture(() => jsonResponse({ inquiry: inquiryBody() }, 201));

  await transport.create(REQUEST);

  expect(seen.length === 1, 'one request per send');
  expect(
    Object.keys(seen[0]?.body ?? {}).sort().join(',') === 'message,productId',
    'the request body must not name a buyer, a role, or a status',
  );

  restore();
}

async function testCreateRequiresAnIdempotencyKey(): Promise<void> {
  const transport = new HttpInquiryTransport();
  const seen = capture(() => jsonResponse({ inquiry: inquiryBody() }, 201));

  await expectRejection(
    () => transport.create({ ...REQUEST, idempotencyKey: '  ' }),
    (error) =>
      error instanceof InquiryTransportError &&
      error.code === 'MISSING_IDEMPOTENCY_KEY',
    'a send without a retry key is refused before the network',
  );

  expect(seen.length === 0, 'a missing retry key never reaches the server');

  restore();
}

async function testCreateSendsTheSameRetryKeyOnEveryAttempt(): Promise<void> {
  const transport = new HttpInquiryTransport();
  const seen = capture(() =>
    jsonResponse({ error: { code: 'DEPENDENCY_FAILED' } }, 503),
  );

  await transport.create(REQUEST).catch(() => {});
  await transport.create(REQUEST).catch(() => {});

  expect(seen.length === 2, 'both attempts were sent');
  expect(
    seen[0]?.idempotencyKey === REQUEST.idempotencyKey &&
      seen[1]?.idempotencyKey === REQUEST.idempotencyKey,
    'the retry key is stable across attempts, so a retry converges on the same inquiry',
  );

  restore();
}

async function testCreateDetectsADeduplicatedRetry(): Promise<void> {
  const transport = new HttpInquiryTransport();
  capture(() => jsonResponse({ inquiry: inquiryBody() }, 200));

  const result = await transport.create(REQUEST);

  expect(result.deduplicated === true, 'a 200 is reported as a deduplicated retry');
  expect(result.inquiry.id.length > 0, 'the existing inquiry is returned');

  restore();
}

async function testCreateReportsAFreshInquiry(): Promise<void> {
  const transport = new HttpInquiryTransport();
  capture(() => jsonResponse({ inquiry: inquiryBody() }, 201));

  const result = await transport.create(REQUEST);

  expect(result.deduplicated === false, 'a 201 is a fresh inquiry, not a retry');

  restore();
}

async function testValidationHappensBeforeTheRequest(): Promise<void> {
  const transport = new HttpInquiryTransport();
  let requests = 0;

  capture(() => {
    requests += 1;
    return jsonResponse({ inquiry: inquiryBody() }, 201);
  });

  await expectRejection(
    () => transport.create({ ...REQUEST, message: '   ' }),
    (error) =>
      error instanceof InquiryTransportError && error.code === 'INVALID_MESSAGE',
    'an empty message is refused client-side',
  );

  await expectRejection(
    () =>
      transport.create({ ...REQUEST, message: 'x'.repeat(INQUIRY_MESSAGE_MAX_LENGTH + 1) }),
    (error) =>
      error instanceof InquiryTransportError && error.code === 'INVALID_MESSAGE',
    'an over-long message is refused client-side',
  );

  expect(requests === 0, 'invalid input never reaches the network');

  restore();
}

async function testServerValidationIsCarriedThrough(): Promise<void> {
  const transport = new HttpInquiryTransport();
  capture(() =>
    jsonResponse(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'A question may only be sent against a published product.',
          details: { field: 'productId' },
        },
      },
      400,
    ),
  );

  await expectRejection(
    () => transport.create(REQUEST),
    (error) =>
      error instanceof InquiryTransportError &&
      error.code === 'INVALID_MESSAGE' &&
      error.message === 'A question may only be sent against a published product.',
    "the server's own wording is what the buyer reads",
  );

  restore();
}

async function testRetryableFailuresAreMarked(): Promise<void> {
  const transport = new HttpInquiryTransport();

  for (const status of [408, 425, 429, 500, 503]) {
    capture(() => jsonResponse({ error: { code: 'UNAVAILABLE' } }, status));

    await expectRejection(
      () => transport.create(REQUEST),
      (error) =>
        error instanceof InquiryTransportError && error.retryable === true,
      `${status} is offered as retryable`,
    );
  }

  restore();
}

async function testListOwnReadsTheBuyersOwnInquiries(): Promise<void> {
  const transport = new HttpInquiryTransport();
  const seen = capture(() =>
    jsonResponse(
      {
        inquiries: [inquiryBody()],
        total: 1,
        limit: INQUIRY_PAGE_SIZE_DEFAULT,
        offset: 0,
        hasMore: false,
      },
      200,
    ),
  );

  const page = await transport.listOwn();

  expect(page.inquiries.length === 1, 'the page is parsed');
  expect(page.total === 1, 'the total is carried');
  expect(page.hasMore === false, 'the hasMore claim is carried');
  expect(
    seen[0]?.url === `http://127.0.0.1:8787/inquiries?limit=${INQUIRY_PAGE_SIZE_DEFAULT}`,
    'the list is requested with a bounded size',
  );
  expect(
    seen[0]?.authorization === null,
    'the session seam supplies the credential, so the request itself names no buyer',
  );

  restore();
}

async function testListOwnPassesTheOffsetForPaging(): Promise<void> {
  const transport = new HttpInquiryTransport();
  const seen = capture(() =>
    jsonResponse({ inquiries: [], total: 0, hasMore: false }, 200),
  );

  await transport.listOwn({ limit: 10, offset: 20 });

  expect(
    seen[0]?.url === 'http://127.0.0.1:8787/inquiries?limit=10&offset=20',
    'the offset is forwarded for the next page',
  );

  restore();
}

async function testAnUnknownInquiryIsReportedAsNotFound(): Promise<void> {
  const transport = new HttpInquiryTransport();
  capture(() => jsonResponse({ error: { code: 'NOT_FOUND' } }, 404));

  await expectRejection(
    () => transport.getOwn('33333333-3333-4333-8333-333333333333'),
    (error) =>
      error instanceof InquiryTransportError &&
      error.code === 'INQUIRY_UNKNOWN' &&
      error.retryable === false,
    "another buyer's inquiry is indistinguishable from one that does not exist",
  );

  restore();
}

async function testAnUnreadableStatusFailsClosed(): Promise<void> {
  expect(
    (() => {
      try {
        parseInquiry(inquiryBody({ status: 'ANSWERED' }));
        return false;
      } catch (error) {
        return error instanceof InquiryTransportError;
      }
    })(),
    'an inquiry status this client does not know is refused rather than guessed at',
  );
}

async function testIncompleteInquiryIsRejected(): Promise<void> {
  const incomplete = inquiryBody({ message: undefined });
  let rejected = false;

  try {
    parseInquiry(incomplete);
  } catch (error) {
    rejected = error instanceof InquiryTransportError;
  }

  expect(rejected, 'an inquiry without its message is not storable');
}

async function testMessageValidationMatchesTheContract(): Promise<void> {
  expect(
    validateInquiryMessage('Is this available in reed?') === null,
    'a valid message passes',
  );
  expect(
    validateInquiryMessage('   ') !== null,
    'a blank message is refused',
  );
  expect(
    validateInquiryMessage('x'.repeat(INQUIRY_MESSAGE_MAX_LENGTH + 1)) !== null,
    'an over-long message is refused',
  );
  expect(
    validateInquiryMessage('x'.repeat(INQUIRY_MESSAGE_MAX_LENGTH)) === null,
    'a message at the limit is accepted',
  );
}

async function main(): Promise<void> {
  await testCreateSendsOnlyProductAndMessage();
  await testCreateRequiresAnIdempotencyKey();
  await testCreateSendsTheSameRetryKeyOnEveryAttempt();
  await testCreateDetectsADeduplicatedRetry();
  await testCreateReportsAFreshInquiry();
  await testValidationHappensBeforeTheRequest();
  await testServerValidationIsCarriedThrough();
  await testRetryableFailuresAreMarked();
  await testListOwnReadsTheBuyersOwnInquiries();
  await testListOwnPassesTheOffsetForPaging();
  await testAnUnknownInquiryIsReportedAsNotFound();
  await testAnUnreadableStatusFailsClosed();
  await testIncompleteInquiryIsRejected();
  await testMessageValidationMatchesTheContract();

  console.log('INQUIRY TRANSPORT TESTS PASSED');
  restore();
}

void main().catch((error) => {
  console.error('INQUIRY TRANSPORT TESTS FAILED');
  console.error(error);
  restore();
  process.exitCode = 1;
});
