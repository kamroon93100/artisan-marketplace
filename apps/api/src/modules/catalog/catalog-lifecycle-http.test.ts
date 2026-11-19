import app from '../../index.js';
import { PRODUCT_STATES } from '@artisan-marketplace/contracts';

const OWNER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

// This file's HTTP fixtures cannot pass a build mode through `app.request`.
// The suite-scoped development build matches APP_ENV below; production call
// sites still omit the seam.
process.env.NODE_ENV = 'development';

const ENV = {
  APP_ENV: 'development',
  LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
  DEV_OWNER_ID: OWNER,
};

type ProductPayload = {
  id: string;
  state: string;
  title: string | null;
  description: string | null;
  publishedVersion: number | null;
};

type VersionPayload = {
  versionNumber: number;
  title: string;
  description: string;
  publishedBy: string;
};

function expect(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function readJson<T>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

/**
 * `app.request` is typed as possibly returning a promise, so the call is
 * awaited here. Every caller awaits this helper anyway; making the
 * helper itself async keeps the promise type honest instead of widening
 * it.
 */
async function json(
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
    ENV,
  );
}

async function createProduct(
  idempotencyKey: string,
  body: Record<string, unknown> = {},
): Promise<ProductPayload> {
  const response = await json(
    '/catalog/products',
    'POST',
    {
      title: 'Bamboo Basket',
      description: 'Handwoven storage basket.',
      category: 'basketry',
      materials: ['bamboo'],
      ...body,
    },
    { 'idempotency-key': idempotencyKey },
  );

  expect(
    response.status === 201,
    `Expected 201 creating a product, got ${response.status}.`,
  );

  const payload = await readJson<{ product: ProductPayload }>(
    response,
  );

  return payload.product;
}

/**
 * Advances a product through the operations a client actually uses.
 *
 * `APPROVED` is reached through the review-approval route rather than the
 * generic transition route, because the service no longer permits
 * `APPROVED` to be assigned: a test that assigned it would exercise a path
 * the API refuses. The route is called with the same helpers as every other
 * request here, so the approval it performs is the same one the review
 * surface performs.
 */
async function advance(
  productId: string,
  ...states: string[]
): Promise<ProductPayload> {
  let product: ProductPayload | null = null;

  for (const state of states) {
    if (state === 'APPROVED') {
      const response = await json(
        `/catalog/products/${productId}/review/approve`,
        'POST',
      );

      expect(
        response.status === 200,
        `Expected 200 approving, got ${response.status}.`,
      );

      product = (
        await readJson<{ product: ProductPayload }>(response)
      ).product;

      continue;
    }

    const response = await json(
      `/catalog/products/${productId}/transition`,
      'POST',
      { state },
    );

    expect(
      response.status === 200,
      `Expected 200 transitioning to ${state}, got ${response.status}.`,
    );

    product = (
      await readJson<{ product: ProductPayload }>(response)
    ).product;
  }

  return product!;
}

async function testPublishThroughTheApi(): Promise<void> {
  const created = await createProduct('m3-publish-1');
  const approved = await advance(
    created.id,
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
    'APPROVED',
  );

  const published = await json(
    `/catalog/products/${created.id}/publish`,
    'POST',
    undefined,
    { 'idempotency-key': 'm3-publish-key-1' },
  );

  expect(
    published.status === 201,
    `Expected 201 publishing, got ${published.status}.`,
  );

  const body = await readJson<{
    product: ProductPayload;
    version: VersionPayload;
    deduplicated: boolean;
  }>(published);

  expect(
    body.product.state === 'PUBLISHED',
    'A published product reports PUBLISHED.',
  );

  expect(
    body.product.publishedVersion === 1,
    'A published product reports its catalog version.',
  );

  expect(
    !body.deduplicated,
    'A first publish is not a deduplication.',
  );

  expect(
    body.version.versionNumber === 1,
    'The response carries the created version.',
  );

  expect(
    body.version.publishedBy === OWNER,
    'The version records the authenticated actor, not a client claim.',
  );

  // The publish history is readable and reports the same version.
  const history = await json(
    `/catalog/products/${created.id}/versions`,
    'GET',
  );

  expect(
    history.status === 200,
    `Expected 200 reading versions, got ${history.status}.`,
  );

  const historyBody = await readJson<{
    versions: VersionPayload[];
  }>(history);

  expect(
    historyBody.versions.length === 1 &&
      historyBody.versions[0]?.versionNumber === 1,
    'The publish history reports the published version.',
  );
}

async function testPublishRetryIsIdempotent(): Promise<void> {
  const created = await createProduct('m3-publish-2');
  await advance(
    created.id,
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
    'APPROVED',
  );

  const first = await json(
    `/catalog/products/${created.id}/publish`,
    'POST',
    undefined,
    { 'idempotency-key': 'm3-publish-key-2' },
  );

  expect(first.status === 201, 'The first publish succeeds.');

  const retry = await json(
    `/catalog/products/${created.id}/publish`,
    'POST',
    undefined,
    { 'idempotency-key': 'm3-publish-key-2' },
  );

  expect(
    retry.status === 200,
    `A retried publish reports 200, got ${retry.status}.`,
  );

  const body = await readJson<{
    version: VersionPayload;
    deduplicated: boolean;
  }>(retry);

  expect(
    body.deduplicated,
    'A retried publish reports deduplication.',
  );

  const history = await readJson<{
    versions: VersionPayload[];
  }>(
    await json(
      `/catalog/products/${created.id}/versions`,
      'GET',
    ),
  );

  expect(
    history.versions.length === 1,
    'A retried publish does not create a second version.',
  );
}

/**
 * Publication is the only way to become buyer-visible, so the generic
 * transition route must not be able to reach PUBLISHED and skip the
 * preconditions and the version record.
 */
async function testTransitionCannotBypassPublication(): Promise<void> {
  const created = await createProduct('m3-guard-1');
  await advance(
    created.id,
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
    'APPROVED',
  );

  const response = await json(
    `/catalog/products/${created.id}/transition`,
    'POST',
    { state: 'PUBLISHED' },
  );

  expect(
    response.status === 409,
    `Expected 409 publishing via transition, got ${response.status}.`,
  );

  const body = await readJson<{
    error: { code: string; message: string };
  }>(response);

  expect(
    body.error.code === 'CONFLICT',
    `Expected CONFLICT, got ${body.error.code}.`,
  );

  expect(
    body.error.message.includes('/publish'),
    'The refusal names the operation that does publish.',
  );

  const still = await readJson<{ product: ProductPayload }>(
    await json(`/catalog/products/${created.id}`, 'GET'),
  );

  expect(
    still.product.state === 'APPROVED' &&
      still.product.publishedVersion === null,
    'A refused transition changes nothing.',
  );
}

/**
 * Boundary validation: an unknown state is invalid input, not a
 * transition conflict against a state the client invented.
 */
async function testUnknownStateIsRejectedAtTheBoundary(): Promise<void> {
  const created = await createProduct('m3-guard-2');

  for (const state of [
    'NOT_A_STATE',
    'published',
    '',
  ]) {
    const response = await json(
      `/catalog/products/${created.id}/transition`,
      'POST',
      { state },
    );

    expect(
      response.status === 400,
      `Expected 400 for state ${JSON.stringify(state)}, got ${response.status}.`,
    );
  }

  // Every real state remains a valid request at the boundary.
  for (const state of PRODUCT_STATES) {
    if (state === 'PUBLISHED') {
      continue;
    }

    const response = await json(
      `/catalog/products/${created.id}/transition`,
      'POST',
      { state },
    );

    expect(
      response.status !== 400,
      `Expected ${state} to pass boundary validation, got ${response.status}.`,
    );
  }
}

async function testEditAndRepublish(): Promise<void> {
  const created = await createProduct('m3-edit-1');
  await advance(
    created.id,
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
    'APPROVED',
  );

  await json(
    `/catalog/products/${created.id}/publish`,
    'POST',
    undefined,
    { 'idempotency-key': 'm3-edit-key-v1' },
  );

  // A published product is buyer-visible, so it is frozen.
  const frozen = await json(
    `/catalog/products/${created.id}`,
    'PATCH',
    { title: 'Silently Rewritten' },
  );

  expect(
    frozen.status === 409,
    `Expected 409 editing a published product, got ${frozen.status}.`,
  );

  await advance(created.id, 'REVIEW_REQUIRED');

  const edited = await json(
    `/catalog/products/${created.id}`,
    'PATCH',
    { title: 'Bamboo Basket, Large' },
  );

  expect(
    edited.status === 200,
    `Expected 200 editing after review, got ${edited.status}.`,
  );

  const editedBody = await readJson<{ product: ProductPayload }>(
    edited,
  );

  expect(
    editedBody.product.title === 'Bamboo Basket, Large',
    'The edit is applied.',
  );

  expect(
    editedBody.product.description ===
      created.description,
    'An edit to one field leaves the others untouched.',
  );

  await advance(created.id, 'APPROVED');

  const republished = await json(
    `/catalog/products/${created.id}/publish`,
    'POST',
    undefined,
    { 'idempotency-key': 'm3-edit-key-v2' },
  );

  expect(
    republished.status === 201,
    `Expected 201 re-publishing, got ${republished.status}.`,
  );

  const republishedBody = await readJson<{
    product: ProductPayload;
    version: VersionPayload;
  }>(republished);

  expect(
    republishedBody.version.versionNumber === 2,
    'A re-publish allocates the next catalog version.',
  );

  const history = await readJson<{
    versions: VersionPayload[];
  }>(
    await json(
      `/catalog/products/${created.id}/versions`,
      'GET',
    ),
  );

  expect(
    history.versions.length === 2,
    'Both versions remain in the history.',
  );

  expect(
    history.versions[0]?.versionNumber === 2 &&
      history.versions[1]?.versionNumber === 1,
    'History is newest first.',
  );

  // The earlier published version is not rewritten by the later change.
  expect(
    history.versions[1]?.title === 'Bamboo Basket',
    'The earlier version still shows what buyers were shown.',
  );
}

/**
 * Ownership is the catalog module's own decision, taken from the stored
 * record rather than anything the request asserted.
 */
async function testOwnershipIsEnforcedAtTheBoundary(): Promise<void> {
  const created = await createProduct('m3-owner-1');
  await advance(
    created.id,
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
    'APPROVED',
  );

  const asOther = await app.request(
    `/catalog/products/${created.id}/publish`,
    {
      method: 'POST',
      headers: { 'idempotency-key': 'm3-owner-key' },
    },
    {
      APP_ENV: 'development',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      DEV_OWNER_ID: OTHER,
    },
  );

  expect(
    asOther.status === 403,
    `Expected 403 publishing another artisan's product, got ${asOther.status}.`,
  );

  const patched = await app.request(
    `/catalog/products/${created.id}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Hijacked' }),
    },
    {
      APP_ENV: 'development',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      DEV_OWNER_ID: OTHER,
    },
  );

  expect(
    patched.status === 403,
    `Expected 403 editing another artisan's product, got ${patched.status}.`,
  );

  const versions = await app.request(
    `/catalog/products/${created.id}/versions`,
    { method: 'GET' },
    {
      APP_ENV: 'development',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      DEV_OWNER_ID: OTHER,
    },
  );

  expect(
    versions.status === 403,
    `Expected 403 reading another artisan's history, got ${versions.status}.`,
  );

  /**
   * A draft is private until publication. The product read is authenticated
   * but must also be ownership-scoped: otherwise any signed-in actor could
   * read another artisan's unlisted work by supplying its id.
   */
  const otherRead = await app.request(
    `/catalog/products/${created.id}`,
    { method: 'GET' },
    {
      APP_ENV: 'development',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      DEV_OWNER_ID: OTHER,
    },
  );

  expect(
    otherRead.status === 403,
    `Expected 403 reading another artisan's draft, got ${otherRead.status}.`,
  );
  expect(
    created.title !== null &&
      !JSON.stringify(await readJson<unknown>(otherRead)).includes(
        created.title,
      ),
    'The refusal does not disclose the draft.',
  );

  const ownRead = await json(
    `/catalog/products/${created.id}`,
    'GET',
  );

  expect(
    ownRead.status === 200,
    `Expected 200 reading the owner's product, got ${ownRead.status}.`,
  );

  const untouched = await readJson<{ product: ProductPayload }>(
    ownRead,
  );

  expect(
    untouched.product.state === 'APPROVED' &&
      untouched.product.title === created.title &&
      untouched.product.publishedVersion === null,
    'A forbidden request changes nothing.',
  );
}

async function testPublishRequiresIdempotencyKey(): Promise<void> {
  const created = await createProduct('m3-key-1');
  await advance(
    created.id,
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
    'APPROVED',
  );

  const response = await json(
    `/catalog/products/${created.id}/publish`,
    'POST',
  );

  expect(
    response.status === 400,
    `Expected 400 publishing without an idempotency key, got ${response.status}.`,
  );

  const body = await readJson<{ error: { code: string } }>(
    response,
  );

  expect(
    body.error.code === 'VALIDATION_FAILED',
    `Expected VALIDATION_FAILED, got ${body.error.code}.`,
  );
}

/**
 * Publication and the publish routes must require an authenticated
 * actor exactly like the rest of the catalog surface.
 */
async function testPublishRoutesRejectAnonymousCallers(): Promise<void> {
  const response = await app.request(
    '/catalog/products/00000000-0000-4000-8000-0000000000ff/publish',
    {
      method: 'POST',
      headers: { 'idempotency-key': 'm3-anon-1' },
    },
    { APP_ENV: 'production' },
  );

  expect(
    response.status === 401 || response.status === 503,
    `Expected an anonymous publish to be refused, got ${response.status}.`,
  );
}

interface RecordedDurableCheck {
  objectName: string;
  url: string;
  method: string | undefined;
  body: {
    limit: number;
    windowMs: number;
    now: number;
  };
}

/**
 * Creates a fake Durable Object namespace that enforces rate limits per objectName
 * (hashed subject). Each objectName gets its own counter; after the policy limit
 * is exceeded, it returns a denied response. This mimics the sliding-window
 * behavior for test purposes.
 *
 * @param scopeOverrides Optional map of operation scope -> custom limit.
 *   Use to relax limits for test setup operations (e.g., approval) while
 *   enforcing the real limit for the operation under test (e.g., publish).
 */
function createEnforcingDurableNamespace(): {
  namespace: DurableObjectNamespace;
  checks: RecordedDurableCheck[];
  subjectByObjectName: Map<string, string>;
} {
  const checks: RecordedDurableCheck[] = [];
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
          const body = JSON.parse(String(init?.body)) as RecordedDurableCheck['body'];
          const count = (callCounts.get(objectName) || 0) + 1;
          callCounts.set(objectName, count);

          const check: RecordedDurableCheck = {
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

/**
 * Regression test: the catalog.product.publish rate limit is shared across
 * different product IDs for the same actor. Uses the production resolver
 * with a fake Durable Object that enforces the limit.
 *
 * Eleven different products are created and published by the same actor.
 * The budget is 10 requests per 60 seconds. Requests 1-10 must succeed
 * (not rate-limited). Request 11 must be rejected with HTTP 429.
 */
async function testPublishRateLimitSharedAcrossProductIds(): Promise<void> {
  const { namespace } = createEnforcingDurableNamespace();

  const sessionToken = 'test-session-token';
  const sessionActorId = 'actor-publish-rate-limit';

  // Development environment for test setup (in-memory repo + in-memory auth).
  // Uses a dedicated actor so its rate-limit buckets don't interfere with
  // other tests in this suite.
  const setupEnv = {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: sessionActorId,
  };

  // Production-like environment for the rate-limit test:
  // - APP_ENV: development (so catalog service uses in-memory repo)
  // - NO LOCAL_IN_MEMORY_AUTH_ENABLED (so rate limiter uses Durable Object)
  // - Static session via SESSION_TOKEN + SESSION_ACTOR_ID
  // - Fake Durable Object namespace that enforces limits
  const rateLimitEnv = {
    APP_ENV: 'development',
    SESSION_TOKEN: sessionToken,
    SESSION_ACTOR_ID: sessionActorId,
    AUTH_RATE_LIMITER: namespace,
  };

  // Helper to make requests with the rate limit env
  async function jsonWithRateLimit(
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
          authorization: `Bearer ${sessionToken}`,
          ...headers,
        },
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body) }),
      },
      rateLimitEnv,
    );
  }

  // Create 2 products for the same actor using the setup environment
  // (only 2 approvals needed, well under the 10/60s limit)
  const productA = await createProductWithEnv('m3-rl-product-a', setupEnv);
  const productB = await createProductWithEnv('m3-rl-product-b', setupEnv);

  // Advance both products to APPROVED (ready for publication) using setup env
  await advanceWithEnv(productA.id, setupEnv,
    'PENDING_SYNC', 'SYNCED', 'REVIEW_REQUIRED', 'APPROVED');
  await advanceWithEnv(productB.id, setupEnv,
    'PENDING_SYNC', 'SYNCED', 'REVIEW_REQUIRED', 'APPROVED');

  // Now publish the two products alternately to exhaust the shared budget (10)
  // publish limit is 10 per 60s per actor
  let allowedCount = 0;
  let deniedCount = 0;

  for (let i = 0; i < 11; i++) {
    const productId = i % 2 === 0 ? productA.id : productB.id;
    const idempotencyKey = `m3-rl-publish-${i}`;

    const response = await jsonWithRateLimit(
      `/catalog/products/${productId}/publish`,
      'POST',
      undefined,
      { 'idempotency-key': idempotencyKey },
    );

    if (response.status === 429) {
      deniedCount++;
      // Verify rate limit error envelope
      const body = await readJson<{ error: { code: string; details?: { resetAt?: number } } }>(response);
      expect(
        body.error.code === 'RATE_LIMITED',
        `Expected RATE_LIMITED error code, got ${body.error.code}`,
      );
      expect(
        response.headers.get('x-ratelimit-remaining') === '0',
        'Rate limited response must have x-ratelimit-remaining: 0',
      );
      expect(
        response.headers.get('retry-after') !== null,
        'Rate limited response must have retry-after header',
      );
    } else if (response.status === 201 || response.status === 200 || response.status === 409) {
      allowedCount++;
      // 409 (CONFLICT) means the rate limiter allowed the request but the service
      // rejected it because the product was already published. This is expected
      // for duplicate publishes with different idempotency keys. The rate limit
      // budget is still consumed.
      // Verify rate limit headers on allowed responses
      expect(
        response.headers.get('x-ratelimit-remaining') !== null,
        'Allowed response must have x-ratelimit-remaining header',
      );
      expect(
        response.headers.get('x-ratelimit-reset') !== null,
        'Allowed response must have x-ratelimit-reset header',
      );
    } else {
      throw new Error(`Unexpected status ${response.status} on request ${i + 1}`);
    }
  }

  expect(
    allowedCount === 10,
    `Expected 10 allowed requests, got ${allowedCount}`,
  );
  expect(
    deniedCount === 1,
    `Expected 1 denied request, got ${deniedCount}`,
  );
}

/**
 * Creates a product using a custom environment (for rate limit testing).
 */
async function createProductWithEnv(
  idempotencyKey: string,
  env: Record<string, unknown>,
  body: Record<string, unknown> = {},
): Promise<ProductPayload> {
  const sessionToken = typeof env.SESSION_TOKEN === 'string' ? env.SESSION_TOKEN : undefined;
  const response = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({
        title: 'Bamboo Basket',
        description: 'Handwoven storage basket.',
        category: 'basketry',
        materials: ['bamboo'],
        ...body,
      }),
    },
    env,
  );

  expect(
    response.status === 201,
    `Expected 201 creating a product, got ${response.status}.`,
  );

  const payload = await readJson<{ product: ProductPayload }>(response);
  return payload.product;
}

/**
 * Advances a product through states using a custom environment.
 */
async function advanceWithEnv(
  productId: string,
  env: Record<string, unknown>,
  ...states: string[]
): Promise<ProductPayload> {
  let product: ProductPayload | null = null;
  const sessionToken = typeof env.SESSION_TOKEN === 'string' ? env.SESSION_TOKEN : undefined;

  for (const state of states) {
    if (state === 'APPROVED') {
      const response = await app.request(
        `/catalog/products/${productId}/review/approve`,
        {
          method: 'POST',
          headers: {
            ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
          },
        },
        env,
      );

      expect(
        response.status === 200,
        `Expected 200 approving, got ${response.status}.`,
      );

      product = (await readJson<{ product: ProductPayload }>(response)).product;
      continue;
    }

    const response = await app.request(
      `/catalog/products/${productId}/transition`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({ state }),
      },
      env,
    );

    expect(
      response.status === 200,
      `Expected 200 transitioning to ${state}, got ${response.status}.`,
    );

    product = (await readJson<{ product: ProductPayload }>(response)).product;
  }

  return product!;
}

async function main(): Promise<void> {
  await testPublishThroughTheApi();
  await testPublishRetryIsIdempotent();
  await testTransitionCannotBypassPublication();
  await testUnknownStateIsRejectedAtTheBoundary();
  await testEditAndRepublish();
  await testOwnershipIsEnforcedAtTheBoundary();
  await testPublishRequiresIdempotencyKey();
  await testPublishRoutesRejectAnonymousCallers();
  await testPublishRateLimitSharedAcrossProductIds();

  console.log('CATALOG LIFECYCLE HTTP TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
