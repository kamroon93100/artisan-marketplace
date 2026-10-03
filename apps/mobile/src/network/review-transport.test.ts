import {
  HttpReviewTransport,
  defaultReviewTransport,
  resolveReviewTransport,
} from './review-transport';
import { ReviewTransportError } from './review-contract';
import type {
  ClientProposalDecisionInput,
  ClientProposalDecisionResult,
} from './review-contract';

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
 * A suggestion the server is documented to send.
 *
 * Built from a complete real response rather than a trimmed one: the client
 * validates every field, so a fixture that omitted any of them would let a
 * field the client never validates pass unnoticed.
 */
function aSuggestion(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    proposalId: 'proposal-1',
    jobId: 'job-1',
    attempt: 1,
    field: 'category',
    proposedValue: 'basketry',
    currentValue: null,
    confidence: 0.91,
    riskLevel: 'NONE',
    riskReasons: [],
    stale: false,
    provider: 'deterministic-local',
    model: 'deterministic-fixture',
    modelVersion: '1',
    promptVersion: 'p1',
    schemaVersion: 's1',
    pipelineVersion: 'v1',
    ...overrides,
  };
}

function aProduct(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'product-1',
    ownerId: 'artisan-1',
    title: 'Bamboo Basket',
    description: 'Handwoven storage basket.',
    category: null,
    materials: ['bamboo'],
    state: 'REVIEW_REQUIRED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    publishedVersion: null,
    ...overrides,
  };
}

/**
 * The product as the decision route reports it: fields only, because the
 * route answers with the product after a write rather than with the whole
 * catalog projection.
 */
function aDecidedProduct(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'product-1',
    ownerId: 'artisan-1',
    state: 'REVIEW_REQUIRED',
    title: 'Bamboo Basket',
    description: 'Handwoven storage basket.',
    category: 'basketry',
    materials: ['bamboo'],
    ...overrides,
  };
}

/**
 * A complete decision response, including the `proposals` the route also
 * sends. The client does not read it — the review surface is re-read after a
 * decision, and a half-read proposal would be a worse contract than none —
 * but it is present so the fixture is a real response rather than a convenient
 * one.
 */
function aDecisionResponse(
  overrides: Record<string, unknown> = {},
): Response {
  return jsonResponse({
    product: aDecidedProduct(),
    proposals: [
      {
        id: 'proposal-1',
        productId: 'product-1',
        jobId: 'job-1',
        field: 'category',
        value: 'basketry',
        confidence: 0.91,
        validationStatus: 'VALID',
        decision: 'PENDING',
        attempt: 1,
      },
    ],
    applied: [],
    staleFields: [],
    ...overrides,
  });
}

async function testGetReviewReadsTheSurface(): Promise<void> {
  let capturedUrl = '';

  mockFetch(async (input) => {
    capturedUrl = String(input);

    return jsonResponse({
      product: aProduct(),
      suggestions: [aSuggestion()],
      blocking: [
        {
          reason: 'UNDECIDED_PROPOSAL',
          field: 'category',
          message: 'A suggested category has not been decided yet.',
        },
      ],
      readyForApproval: false,
    });
  });

  const review = await new HttpReviewTransport().getReview('product-1');

  expect(
    capturedUrl ===
      'http://localhost:8787/catalog/products/product-1/review',
    `the review route is the one the API exposes (received: ${capturedUrl})`,
  );
  expect(
    review.product.title === 'Bamboo Basket',
    'the canonical value is read',
  );
  expect(
    review.suggestions.length === 1,
    'the suggestion is read',
  );
  expect(
    review.suggestions[0].proposedValue === 'basketry',
    'the proposed value is read',
  );
  expect(
    review.suggestions[0].currentValue === null,
    'an unset canonical value is reported as absent, not as an empty string',
  );
  expect(
    review.suggestions[0].confidence === 0.91,
    'confidence is surfaced rather than dropped',
  );
  expect(
    review.suggestions[0].stale === false,
    'staleness is surfaced',
  );
  expect(
    review.blocking.length === 1 &&
      review.blocking[0].reason === 'UNDECIDED_PROPOSAL' &&
      review.blocking[0].field === 'category',
    'the blocking reason names the field',
  );
  expect(
    review.readyForApproval === false,
    'the server answer is reported, not re-derived',
  );
}

/**
 * `readyForApproval` is treated as absent unless it is the boolean `true`.
 *
 * The screen derives the same fact from the blocking list, so a missing or
 * malformed flag must not be able to enable a button the server would refuse.
 * Trusting a non-boolean here would let a contract mismatch turn into an
 * approval attempt.
 */
async function testReadyForApprovalIsNotTrustedWhenMalformed(): Promise<void> {
  for (const flag of [undefined, null, 'true', 1]) {
    mockFetch(async () =>
      jsonResponse({
        product: aProduct(),
        suggestions: [],
        blocking: [],
        readyForApproval: flag,
      }),
    );

    const review = await new HttpReviewTransport().getReview(
      'product-1',
    );

    expect(
      review.readyForApproval === false,
      `a non-boolean readyForApproval (${String(flag)}) does not enable approval`,
    );
  }
}

/**
 * Fail closed on malformed data.
 *
 * A response the client cannot read is rejected rather than defaulted. The
 * dangerous direction is a value that defaults to a favourable one: a missing
 * `stale` flag read as `false` would tell an artisan a suggestion is current
 * when the server said nothing, and a missing `riskReasons` read as `[]` would
 * render as "no risks" against a suggestion the server flagged.
 */
async function testMalformedSuggestionsFailClosed(): Promise<void> {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['a missing staleness flag', aSuggestion({ stale: undefined })],
    ['a non-boolean staleness flag', aSuggestion({ stale: 'no' })],
    ['a missing risk level', aSuggestion({ riskLevel: undefined })],
    [
      'an unknown risk level',
      aSuggestion({ riskLevel: 'SEVERE' }),
    ],
    ['a non-list of risk reasons', aSuggestion({ riskReasons: 'LOW_CONFIDENCE' })],
    [
      'an unknown risk reason',
      aSuggestion({ riskReasons: ['CATASTROPHIC'] }),
    ],
    ['an unknown field', aSuggestion({ field: 'price' })],
    ['a missing proposal id', aSuggestion({ proposalId: undefined })],
    ['a non-numeric attempt', aSuggestion({ attempt: '1' })],
    ['a non-text proposed value', aSuggestion({ proposedValue: 7 })],
    ['a missing provider', aSuggestion({ provider: undefined })],
  ];

  for (const [label, suggestion] of cases) {
    mockFetch(async () =>
      jsonResponse({
        product: aProduct(),
        suggestions: [suggestion],
        blocking: [],
        readyForApproval: false,
      }),
    );

    await expectRejected(
      () => new HttpReviewTransport().getReview('product-1'),
      label,
    );
  }
}

/**
 * A malformed suggestion must not be dropped from the list.
 *
 * Filtering it out would produce a review surface with fewer suggestions than
 * the server sent, and the missing entry is precisely the one an artisan
 * should not be allowed to approve past. Failing the whole response is the
 * only outcome that cannot silently under-report.
 */
async function testMalformedProductFailsClosed(): Promise<void> {
  for (const [label, product] of [
    ['a non-object product', 'a basket'],
    ['a missing product state', aProduct({ state: undefined })],
    ['an unknown product state', aProduct({ state: 'DRAFT' })],
    ['non-list materials', aProduct({ materials: 'bamboo' })],
    [
      'a non-text material',
      aProduct({ materials: ['bamboo', 3] }),
    ],
  ] as Array<[string, unknown]>) {
    mockFetch(async () =>
      jsonResponse({
        product,
        suggestions: [],
        blocking: [],
        readyForApproval: false,
      }),
    );

    await expectRejected(
      () => new HttpReviewTransport().getReview('product-1'),
      label,
    );
  }
}

/**
 * The client fails closed on a response that is not shaped like the
 * contract at all, and the failure is not retryable.
 */
async function testMalformedEnvelopeFailsClosed(): Promise<void> {
  for (const [label, body] of [
    ['a non-object response', []],
    ['missing suggestions', { product: aProduct() }],
    [
      'non-list suggestions',
      { product: aProduct(), suggestions: 'none', blocking: [] },
    ],
    [
      'missing blocking reasons',
      { product: aProduct(), suggestions: [] },
    ],
  ] as Array<[string, unknown]>) {
    mockFetch(async () => jsonResponse(body));

    await expectRejected(
      () => new HttpReviewTransport().getReview('product-1'),
      label,
    );
  }
}

/**
 * A refusal is the server's considered answer and must not be retried.
 *
 * Retrying "the product is not ready" cannot make it become ready, and a
 * screen that retries it produces a spinner that never resolves into
 * anything useful.
 */
async function testRefusalIsNotRetryable(): Promise<void> {
  mockFetch(async () =>
    jsonResponse(
      {
        error: {
          code: 'CONFLICT',
          message: 'This product is not ready to be approved yet.',
          details: {
            productId: 'product-1',
            blocking: [
              {
                reason: 'UNDECIDED_PROPOSAL',
                field: 'category',
                message: 'A suggested category has not been decided yet.',
              },
            ],
          },
        },
      },
      409,
    ),
  );

  let raised: unknown = null;

  try {
    await new HttpReviewTransport().approve('product-1');
  } catch (error) {
    raised = error;
  }

  expect(
    raised instanceof ReviewTransportError,
    'a refusal is a classified transport error',
  );

  const error = raised as ReviewTransportError;

  expect(
    error.code === 'CONFLICT',
    'the server error code is preserved',
  );
  expect(
    !error.retryable,
    'a refusal cannot become true by retrying, so it is not retryable',
  );
  expect(
    error.blocking.length === 1 &&
      error.blocking[0].reason === 'UNDECIDED_PROPOSAL' &&
      error.blocking[0].field === 'category',
    'the blocking reasons are lifted out of the refusal so the artisan sees why',
  );
}

/**
 * Ownership and authentication refusals are likewise terminal answers.
 */
async function testAuthorizationRefusalsAreNotRetryable(): Promise<void> {
  for (const [status, code] of [
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
  ] as Array<[number, string]>) {
    mockFetch(async () =>
      jsonResponse(
        { error: { code, message: 'Refused.' } },
        status,
      ),
    );

    let raised: unknown = null;

    try {
      await new HttpReviewTransport().approve('product-1');
    } catch (error) {
      raised = error;
    }

    expect(
      raised instanceof ReviewTransportError &&
        raised.code === code,
      `a ${status} preserves its code (${code})`,
    );
    expect(
      (raised as ReviewTransportError).retryable === false,
      `a ${status} is not retryable`,
    );
  }
}

/**
 * A server fault is worth retrying; a transport fault is too.
 *
 * The distinction is the whole reason the error carries a retryable flag: an
 * artisan who loses connectivity mid-approval should be able to try again
 * without being told the server refused them.
 */
async function testServerAndNetworkFailuresAreRetryable(): Promise<void> {
  for (const status of [429, 500, 503]) {
    mockFetch(async () =>
      jsonResponse(
        { error: { code: 'TRANSIENT_FAILURE', message: 'Retry.' } },
        status,
      ),
    );

    let raised: unknown = null;

    try {
      await new HttpReviewTransport().approve('product-1');
    } catch (error) {
      raised = error;
    }

    expect(
      raised instanceof ReviewTransportError &&
        raised.retryable === true,
      `HTTP ${status} is retryable`,
    );
  }

  mockFetch(async () => {
    throw new Error('Network request failed.');
  });

  let raised: unknown = null;

  try {
    await new HttpReviewTransport().approve('product-1');
  } catch (error) {
    raised = error;
  }

  expect(
    raised instanceof ReviewTransportError &&
      raised.code === 'NETWORK_ERROR' &&
      raised.retryable === true,
    'a network fault is retryable',
  );
}

/**
 * Approval reports whether it was the call that established the state.
 *
 * The response is 200 either way, so `deduplicated` is the only thing a client
 * can use to tell a first approval from a retry after a dropped response.
 */
async function testApproveReportsDeduplication(): Promise<void> {
  let capturedUrl = '';
  let capturedMethod = '';

  mockFetch(async (input, init) => {
    capturedUrl = String(input);
    capturedMethod = init?.method ?? '';

    return jsonResponse({
      product: aProduct({ state: 'APPROVED' }),
      deduplicated: true,
    });
  });

  const approval = await new HttpReviewTransport().approve('product-1');

  expect(
    capturedUrl ===
      'http://localhost:8787/catalog/products/product-1/review/approve',
    `the approval route is the one the API exposes (received: ${capturedUrl})`,
  );
  expect(
    capturedMethod === 'POST',
    'approval is a POST',
  );
  expect(
    approval.deduplicated === true,
    'a repeat approval is reported as deduplicated',
  );
  expect(
    approval.product.state === 'APPROVED',
    'the approved product is read back',
  );
}

/**
 * Publication carries the idempotency key as a header, because the key is
 * what makes a retry converge on one version instead of creating a second.
 */
async function testPublishSendsIdempotencyKey(): Promise<void> {
  let capturedHeaders: Headers | undefined;

  mockFetch(async (_input, init) => {
    capturedHeaders = new Headers(
      (init?.headers ?? {}) as HeadersInit,
    );

    return jsonResponse({
      product: aProduct({ state: 'PUBLISHED', publishedVersion: 1 }),
      version: {
        id: 'version-1',
        productId: 'product-1',
        versionNumber: 1,
        title: 'Bamboo Basket',
        description: 'Handwoven storage basket.',
        publishedBy: 'artisan-1',
        publishedAt: '2026-01-02T00:00:00.000Z',
      },
      deduplicated: false,
    });
  });

  const result = await new HttpReviewTransport().publish(
    'product-1',
    'publish-key-1',
  );

  expect(
    capturedHeaders?.get('idempotency-key') === 'publish-key-1',
    'the idempotency key is sent as a header, not in the body',
  );
  expect(
    result.versionNumber === 1,
    'the published version number is read',
  );
  expect(
    result.product.publishedVersion === 1,
    'the product reports the published version',
  );
}

async function testPublishRefusesAMalformedVersion(): Promise<void> {
  for (const [label, body] of [
    [
      'a missing version',
      { product: aProduct(), deduplicated: false },
    ],
    [
      'a non-object version',
      { product: aProduct(), version: 1, deduplicated: false },
    ],
    [
      'a non-numeric version number',
      {
        product: aProduct(),
        version: { versionNumber: '1' },
        deduplicated: false,
      },
    ],
  ] as Array<[string, unknown]>) {
    mockFetch(async () => jsonResponse(body));

    await expectRejected(
      () =>
        new HttpReviewTransport().publish('product-1', 'publish-key-1'),
      label,
    );
  }
}

/**
 * A malformed response is not a temporary fault.
 *
 * Retrying a response the client cannot parse hides a contract mismatch
 * behind a spinner that never resolves into anything useful, so the failure
 * is terminal and says what was wrong.
 */
async function testMalformedResponsesAreNotRetryable(): Promise<void> {
  mockFetch(async () =>
    jsonResponse({
      product: aProduct(),
      suggestions: [aSuggestion({ stale: undefined })],
      blocking: [],
      readyForApproval: false,
    }),
  );

  let raised: unknown = null;

  try {
    await new HttpReviewTransport().getReview('product-1');
  } catch (error) {
    raised = error;
  }

  expect(
    raised instanceof ReviewTransportError,
    'a malformed response is a classified transport error',
  );

  const error = raised as ReviewTransportError;

  expect(
    error.code === 'INVALID_SERVER_RESPONSE',
    'a malformed response is reported as such',
  );
  expect(
    !error.retryable,
    'a malformed response is not retryable',
  );
  expect(
    error.message.includes('staleness'),
    `the failure names what could not be read (received: ${error.message})`,
  );
}

/**
 * The default client is one object, not one per call.
 *
 * The review screen loads in an effect that depends on a callback, which
 * depends on the client. A client constructed during render is a new object
 * on every render, so the callback is new, so the effect re-runs, so it sets
 * state, so it renders again — a request loop that never settles and never
 * shows the artisan their product. Identity is the whole of that bug, so it
 * is asserted directly rather than inferred from a rendered screen.
 */
async function testDefaultTransportIsOneStableInstance(): Promise<void> {
  const first = resolveReviewTransport();
  const second = resolveReviewTransport();

  expect(
    first === second,
    'resolving the default client twice returns the same instance',
  );
  expect(
    first === defaultReviewTransport,
    'the default client is the module-level instance',
  );
  expect(
    first instanceof HttpReviewTransport,
    'the default client is the real transport',
  );
  expect(
    resolveReviewTransport(first) === first,
    'a client that is already resolved is returned unchanged',
  );

  /**
   * The identity has to survive being resolved *again* after something else
   * was resolved, because that is the sequence a screen produces: a render
   * resolves the default, a test or a caller resolves an injected one, and the
   * next render resolves the default again. A resolver that cached the last
   * argument instead of the module's client would hand back the injected one
   * here, which is the shape of the bug the screen is protected from.
   */
  const afterAnInjectedResolution = resolveReviewTransport(first);

  expect(
    resolveReviewTransport() === first,
    'the default client keeps its identity after an injected resolution',
  );
  expect(
    afterAnInjectedResolution === first,
    'an injected client does not become the default',
  );
}

/**
 * A rejection carries no value.
 *
 * The server refuses a value beside anything that is not an `EDITED`
 * decision, and the absence is meaningful rather than merely tolerated:
 * rejecting means leaving the artisan's product exactly as it is, so there is
 * no second value to send alongside the instruction not to change it.
 */
async function testRejectSendsNoValue(): Promise<void> {
  let capturedUrl = '';
  let capturedMethod = '';
  let capturedBody: unknown = null;

  mockFetch(async (input, init) => {
    capturedUrl = String(input);
    capturedMethod = init?.method ?? '';
    capturedBody =
      typeof init?.body === 'string'
        ? JSON.parse(init.body)
        : null;

    return aDecisionResponse({ applied: [] });
  });

  const result = await new HttpReviewTransport().decideProposal(
    'job-1',
    { proposalId: 'proposal-1', decision: 'REJECTED' },
  );

  expect(
    capturedUrl ===
      'http://localhost:8787/catalog/ai-jobs/job-1/decisions',
    `the decision route is the existing AI one (received: ${capturedUrl})`,
  );
  expect(
    capturedMethod === 'POST',
    'a decision is a POST',
  );
  expect(
    JSON.stringify(capturedBody) ===
      JSON.stringify({
        decisions: [
          { proposalId: 'proposal-1', decision: 'REJECTED' },
        ],
      }),
    `a rejection sends the proposal id and nothing else (received: ${JSON.stringify(capturedBody)})`,
  );
  expect(
    result.applied.length === 0,
    'a rejection reports that it wrote nothing',
  );
}

/**
 * An acceptance carries no value either: accepting is taking the model's
 * normalized value, which the server already has.
 */
async function testAcceptSendsNoValue(): Promise<void> {
  let capturedBody: unknown = null;

  mockFetch(async (_input, init) => {
    capturedBody =
      typeof init?.body === 'string'
        ? JSON.parse(init.body)
        : null;

    return aDecisionResponse({ applied: ['category'] });
  });

  const result = await new HttpReviewTransport().decideProposal(
    'job-1',
    { proposalId: 'proposal-1', decision: 'ACCEPTED' },
  );

  expect(
    JSON.stringify(capturedBody) ===
      JSON.stringify({
        decisions: [
          { proposalId: 'proposal-1', decision: 'ACCEPTED' },
        ],
      }),
    `an acceptance sends the proposal id and nothing else (received: ${JSON.stringify(capturedBody)})`,
  );
  expect(
    result.applied.length === 1 &&
      result.applied[0] === 'category',
    'the written field is read back',
  );
}

/**
 * An edit sends the artisan's own value, and the client's contract makes
 * that the only value an `EDITED` decision can carry.
 *
 * This is the rule the whole review path exists for: a value a person typed
 * reaches their product, and the model's proposal is evidence rather than
 * input. A client that could send the proposal here would be able to let a
 * model write over a confirmed value with no human in the loop.
 */
async function testEditSendsTheArtisansValue(): Promise<void> {
  /**
   * Both shapes, because the request carries no field and so cannot be checked
   * for the right one: forwarding a list untouched is the whole of the
   * transport's part in it, and the one place it could mangle a value.
   */
  const cases: [string | readonly string[], string][] = [
    ['Handwoven storage basket in natural cane.', 'a string'],
    [['cane', 'bamboo'], 'a list of strings'],
  ];

  for (const [value, label] of cases) {
    let capturedBody: unknown = null;

    mockFetch(async (_input, init) => {
      capturedBody =
        typeof init?.body === 'string'
          ? JSON.parse(init.body)
          : null;

      return aDecisionResponse({ applied: ['category'] });
    });

    await new HttpReviewTransport().decideProposal('job-1', {
      proposalId: 'proposal-1',
      decision: 'EDITED',
      value,
    });

    expect(
      JSON.stringify(capturedBody) ===
        JSON.stringify({
          decisions: [
            {
              proposalId: 'proposal-1',
              decision: 'EDITED',
              value,
            },
          ],
        }),
      `${label} is sent exactly as the artisan entered it (received: ${JSON.stringify(capturedBody)})`,
    );
  }
}

/**
 * The decision response is read strictly.
 *
 * The same reasoning as the review surface: a response the client cannot read
 * is rejected rather than defaulted, because every field here describes
 * something that happened to the artisan's product.
 */
async function testDecisionFailsClosedOnAMalformedResponse(): Promise<void> {
  const cases: [string, unknown][] = [
    ['a non-object response', []],
    ['a missing product', { applied: [], staleFields: [] }],
    [
      'a product with no state',
      {
        product: aDecidedProduct({ state: undefined }),
        applied: [],
        staleFields: [],
      },
    ],
    [
      'a product in an unknown state',
      {
        product: aDecidedProduct({ state: 'DRAFT' }),
        applied: [],
        staleFields: [],
      },
    ],
    [
      'non-list materials',
      {
        product: aDecidedProduct({ materials: 'bamboo' }),
        applied: [],
        staleFields: [],
      },
    ],
    [
      'a missing applied list',
      { product: aDecidedProduct(), staleFields: [] },
    ],
    [
      'a non-list applied list',
      {
        product: aDecidedProduct(),
        applied: 'category',
        staleFields: [],
      },
    ],
    [
      'an unknown applied field',
      {
        product: aDecidedProduct(),
        applied: ['price'],
        staleFields: [],
      },
    ],
    [
      'a missing stale list',
      { product: aDecidedProduct(), applied: [] },
    ],
    [
      'a non-list stale list',
      {
        product: aDecidedProduct(),
        applied: [],
        staleFields: 'category',
      },
    ],
  ];

  for (const [label, body] of cases) {
    mockFetch(async () => jsonResponse(body));

    await expectRejected(
      () =>
        new HttpReviewTransport().decideProposal('job-1', {
          proposalId: 'proposal-1',
          decision: 'REJECTED',
        }),
      label,
    );
  }
}

/**
 * The response has to agree with the decision that was made.
 *
 * A rejection the server answers with a write would mean the artisan's "leave
 * this alone" changed their product. That is the one outcome this screen
 * exists to make impossible, and it is read as a contract mismatch rather
 * than reported as a successful rejection.
 *
 * The same read covers an acceptance and an edit that changed nothing: both
 * promised a value, so a response claiming a write is where the client's
 * record of what it asked for and what the server did has come apart, and
 * taking either one at face value would be guessing which.
 */
async function testADecisionThatContradictsItselfFailsClosed(): Promise<void> {
  const cases: [
    ClientProposalDecisionInput,
    Partial<ClientProposalDecisionResult>,
    string,
  ][] = [
    [
      { proposalId: 'proposal-1', decision: 'REJECTED' },
      { applied: ['category'] },
      'a rejection answered with a write',
    ],
    [
      { proposalId: 'proposal-1', decision: 'ACCEPTED' },
      { applied: [] },
      'an acceptance answered with no write',
    ],
    [
      {
        proposalId: 'proposal-1',
        decision: 'EDITED',
        value: 'Cane basket',
      },
      { applied: [] },
      'an edit answered with no write',
    ],
  ];

  for (const [input, overrides, label] of cases) {
    mockFetch(async () =>
      aDecisionResponse(overrides),
    );

    await expectRejected(
      () =>
        new HttpReviewTransport().decideProposal(
          'job-1',
          input,
        ),
      label,
    );
  }
}

/**
 * A stale field is reported so the screen can say why a suggestion rested on
 * input the artisan has since changed. It is read rather than dropped because
 * it is the only warning the client gets; a missing list would be read as "no
 * suggestion was stale", which is the reassuring direction.
 */
async function testStalenessIsReadRatherThanAssumed(): Promise<void> {
  mockFetch(async () =>
    aDecisionResponse({
      applied: ['title'],
      staleFields: ['title'],
    }),
  );

  const result = await new HttpReviewTransport().decideProposal(
    'job-1',
    {
      proposalId: 'proposal-1',
      decision: 'EDITED',
      value: 'Cane storage basket',
    },
  );

  expect(
    result.staleFields.length === 1 &&
      result.staleFields[0] === 'title',
    'a decision against stale input is reported',
  );
}

/**
 * A refusal of a decision is the server's considered answer.
 *
 * A proposal that is no longer pending, or a job with nothing to decide, is
 * not going to become decidable by being asked again, so retrying it would
 * spin rather than resolve.
 */
async function testDecisionRefusalIsNotRetryable(): Promise<void> {
  mockFetch(async () =>
    jsonResponse(
      {
        error: {
          code: 'CONFLICT',
          message:
            'Proposal proposal-1 was already ACCEPTED.',
        },
      },
      409,
    ),
  );

  let raised: unknown = null;

  try {
    await new HttpReviewTransport().decideProposal('job-1', {
      proposalId: 'proposal-1',
      decision: 'REJECTED',
    });
  } catch (error) {
    raised = error;
  }

  expect(
    raised instanceof ReviewTransportError &&
      raised.code === 'CONFLICT' &&
      !raised.retryable,
    'a decision that cannot be made is reported once and is not retryable',
  );
  expect(
    (raised as ReviewTransportError).message.includes(
      'already ACCEPTED',
    ),
    'the server is asked to re-apply, so its reason is preserved verbatim',
  );
}

async function expectRejected(
  run: () => Promise<unknown>,
  label: string,
): Promise<void> {
  let raised: unknown = null;

  try {
    await run();
  } catch (error) {
    raised = error;
  }

  if (raised === null) {
    throw new Error(
      `TEST FAILED: ${label}: expected the malformed response to be rejected.`,
    );
  }

  if (!(raised instanceof ReviewTransportError)) {
    throw new Error(
      `TEST FAILED: ${label}: expected a ReviewTransportError, received ${String(raised)}.`,
    );
  }

  if (raised.retryable) {
    throw new Error(
      `TEST FAILED: ${label}: a malformed response must not be retryable.`,
    );
  }
}

async function main(): Promise<void> {
  try {
    await testGetReviewReadsTheSurface();
    await testReadyForApprovalIsNotTrustedWhenMalformed();
    await testMalformedSuggestionsFailClosed();
    await testMalformedProductFailsClosed();
    await testMalformedEnvelopeFailsClosed();
    await testRefusalIsNotRetryable();
    await testAuthorizationRefusalsAreNotRetryable();
    await testServerAndNetworkFailuresAreRetryable();
    await testApproveReportsDeduplication();
    await testPublishSendsIdempotencyKey();
    await testPublishRefusesAMalformedVersion();
    await testMalformedResponsesAreNotRetryable();
    await testDefaultTransportIsOneStableInstance();
    await testRejectSendsNoValue();
    await testAcceptSendsNoValue();
    await testEditSendsTheArtisansValue();
    await testDecisionFailsClosedOnAMalformedResponse();
    await testADecisionThatContradictsItselfFailsClosed();
    await testStalenessIsReadRatherThanAssumed();
    await testDecisionRefusalIsNotRetryable();
  } finally {
    restoreFetch();
  }

  console.log('REVIEW TRANSPORT TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
