import type { GetProductReviewResponse } from '@artisan-marketplace/contracts';
import app from '../../index.js';

// This file's HTTP fixtures cannot pass a build mode through `app.request`.
// The suite-scoped development build matches `devEnv` below; production
// call sites still omit the seam.
process.env.NODE_ENV = 'development';

const OWNER = '00000000-0000-4000-8000-0000000000b1';
const STRANGER = '00000000-0000-4000-8000-0000000000c9';
const PRODUCT = '00000000-0000-4000-8000-0000000000b2';

function devEnv(actorId: string): Record<string, string> {
  return {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: actorId,
  };
}

function expect(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectStatus(
  response: Response,
  expected: number,
  what: string,
): void {
  expect(
    response.status === expected,
    `Expected ${expected} ${what}, got ${response.status}.`,
  );
}

function call(
  path: string,
  method: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    actorId?: string;
  } = {},
): Promise<Response> {
  return Promise.resolve(
    app.request(
      path,
      {
        method,
        headers: {
          ...(options.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
          ...options.headers,
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      },
      devEnv(options.actorId ?? OWNER),
    ),
  );
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorCode(response: Response): Promise<string | undefined> {
  return (
    await readJson<{ error?: { code?: string } }>(response)
  ).error?.code;
}

/**
 * Creates a product that has finished syncing, which is the state AI work may
 * be started from and the state approval may be reached from.
 *
 * The idempotency key is unique per call because product creation is
 * idempotent per key: reusing one would hand a later test the earlier test's
 * product, and the failure would look like a product-state problem rather
 * than a fixture collision.
 */
let productSequence = 0;

async function syncedProduct(
  actorId: string = OWNER,
): Promise<string> {
  productSequence += 1;

  const created = await call('/catalog/products', 'POST', {
    body: { title: 'Basket', description: '' },
    headers: {
      'idempotency-key': `review-http-create-${productSequence}`,
    },
    actorId,
  });

  expectStatus(created, 201, 'creating a product');

  const { product } = await readJson<{ product: { id: string } }>(
    created,
  );

  for (const state of [
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
  ]) {
    const moved = await call(
      `/catalog/products/${product.id}/transition`,
      'POST',
      { body: { state }, actorId },
    );

    expectStatus(moved, 200, `transitioning to ${state}`);
  }

  return product.id;
}

async function getReview(
  productId: string,
  actorId: string = OWNER,
): Promise<GetProductReviewResponse> {
  const response = await call(
    `/catalog/products/${productId}/review`,
    'GET',
    { actorId },
  );

  expectStatus(response, 200, 'reading a review surface');

  return readJson<GetProductReviewResponse>(response);
}

/**
 * The review routes must refuse to run without an identity, exactly like the
 * catalog and AI routes. The review surface discloses an artisan's unlisted
 * work and the suggestions that could replace it, and approval is a durable
 * state change, so an unauthenticated caller must reach neither.
 */
async function testReviewRoutesRejectAnonymousCallers(): Promise<void> {
  const env = {
    APP_ENV: 'production',
    SESSION_TOKEN: 'session-token-value',
    SESSION_ACTOR_ID: OWNER,
  };

  const read = await app.request(
    `/catalog/products/${PRODUCT}/review`,
    { method: 'GET' },
    env,
  );

  expectStatus(read, 401, 'an anonymous review read');

  const approve = await app.request(
    `/catalog/products/${PRODUCT}/review/approve`,
    { method: 'POST' },
    env,
  );

  expectStatus(approve, 401, 'an anonymous approval');
}

async function testMissingProductIsNotFound(): Promise<void> {
  const response = await call(
    `/catalog/products/${PRODUCT}/review`,
    'GET',
  );

  expectStatus(response, 404, 'an unknown product');
  expect(
    (await errorCode(response)) === 'NOT_FOUND',
    'an unknown product is reported as not found, not as forbidden',
  );
}

async function testAnotherArtisansProductIsForbidden(): Promise<void> {
  const productId = await syncedProduct(OWNER);

  const read = await call(
    `/catalog/products/${productId}/review`,
    'GET',
    { actorId: STRANGER },
  );

  expectStatus(read, 403, "reading another artisan's review");

  const approve = await call(
    `/catalog/products/${productId}/review/approve`,
    'POST',
    { actorId: STRANGER },
  );

  expectStatus(approve, 403, "approving another artisan's product");
}

async function testSuggestionsBlockApprovalOverHttp(): Promise<void> {
  const productId = await syncedProduct(OWNER);

  const enqueued = await call(
    `/catalog/products/${productId}/ai-jobs`,
    'POST',
    {
      body: {
        transcription:
          'A basket woven by hand from local bamboo.',
      },
      headers: { 'idempotency-key': 'review-http-key-1' },
    },
  );

  expectStatus(enqueued, 201, 'enqueuing AI work');

  const { job } = await readJson<{ job: { id: string } }>(
    enqueued,
  );

  const run = await call(
    `/catalog/ai-jobs/${job.id}/run`,
    'POST',
  );

  expectStatus(run, 200, 'running AI work');

  const { proposals } = await readJson<{
    proposals: { id: string }[];
  }>(run);

  expect(
    proposals.length > 0,
    'the journey reaches suggestions to decide',
  );

  const review = await getReview(productId);

  expect(
    review.suggestions.length === proposals.length,
    'every outstanding proposal reaches the review surface',
  );
  expect(
    review.readyForApproval === false,
    'an unreviewed product is not approvable',
  );
  expect(
    review.blocking.some(
      (entry) => entry.reason === 'UNDECIDED_PROPOSAL',
    ),
    'the outstanding suggestions are named as the blocker',
  );
  expect(
    review.blocking.some(
      (entry) => entry.reason === 'MISSING_PUBLISH_FIELD',
    ),
    'the empty description is named separately, because no decision fixes it',
  );

  const refused = await call(
    `/catalog/products/${productId}/review/approve`,
    'POST',
  );

  expectStatus(
    refused,
    409,
    'approving past an unreviewed suggestion',
  );
  expect(
    (await errorCode(refused)) === 'CONFLICT',
    'a refused approval is a conflict, not a validation error',
  );

  const decided = await call(
    `/catalog/ai-jobs/${job.id}/decisions`,
    'POST',
    {
      body: {
        decisions: proposals.map((proposal) => ({
          proposalId: proposal.id,
          decision: 'REJECTED',
        })),
      },
    },
  );

  expectStatus(decided, 200, 'recording decisions');

  const afterDecision = await getReview(productId);

  expect(
    afterDecision.suggestions.length === 0,
    'a decided suggestion is no longer outstanding',
  );
  expect(
    afterDecision.blocking.some(
      (entry) => entry.reason === 'UNDECIDED_PROPOSAL',
    ) === false,
    'nothing outstanding means nothing to decide',
  );
  expect(
    afterDecision.blocking.some(
      (entry) => entry.reason === 'MISSING_PUBLISH_FIELD',
    ),
    'rejecting suggestions does not supply the missing description',
  );
}

async function testApproveAndPublishOverHttp(): Promise<void> {
  const productId = await syncedProduct(OWNER);

  /**
   * The description is filled in by hand and there is no AI work at all, so
   * this also covers the rule that a product with no suggestions is
   * approvable and that AI availability is not a publication dependency.
   */
  const edited = await call(
    `/catalog/products/${productId}`,
    'PATCH',
    { body: { description: 'Handwoven storage basket.' } },
  );

  expectStatus(edited, 200, 'editing the product');

  const review = await getReview(productId);

  expect(
    review.readyForApproval === true,
    'a fully described product with no suggestions is approvable',
  );

  const approved = await call(
    `/catalog/products/${productId}/review/approve`,
    'POST',
  );

  expectStatus(approved, 200, 'approving');

  const approvedBody = await readJson<{
    product: { state: string };
    deduplicated: boolean;
  }>(approved);

  expect(
    approvedBody.product.state === 'APPROVED',
    'approval establishes APPROVED',
  );
  expect(
    approvedBody.deduplicated === false,
    'the first approval is not a deduplicated replay',
  );

  const retry = await call(
    `/catalog/products/${productId}/review/approve`,
    'POST',
  );

  expectStatus(retry, 200, 'a repeated approval');
  expect(
    (
      await readJson<{ deduplicated: boolean }>(retry)
    ).deduplicated === true,
    'a retry converges and says so, so a dropped response is safe',
  );

  const published = await call(
    `/catalog/products/${productId}/publish`,
    'POST',
    { headers: { 'idempotency-key': 'review-http-publish-1' } },
  );

  expectStatus(published, 201, 'publishing');

  const publishedBody = await readJson<{
    product: { state: string; publishedVersion: number | null };
    version: { versionNumber: number; publishedBy: string };
  }>(published);

  expect(
    publishedBody.product.state === 'PUBLISHED',
    'an approved product publishes',
  );
  expect(
    publishedBody.version.versionNumber === 1,
    'the first publish is version 1',
  );
  expect(
    publishedBody.version.publishedBy === OWNER,
    'the version records who authorized publication',
  );
  expect(
    publishedBody.product.publishedVersion === 1,
    'the product points at the version buyers are seeing',
  );
}

async function testGenericTransitionCannotReachApproval(): Promise<void> {
  const productId = await syncedProduct(OWNER);

  const toApproved = await call(
    `/catalog/products/${productId}/transition`,
    'POST',
    { body: { state: 'APPROVED' } },
  );

  expectStatus(toApproved, 409, 'assigning APPROVED directly');
  expect(
    (await errorCode(toApproved)) === 'CONFLICT',
    'a client cannot reach APPROVED by assignment',
  );

  const toPublished = await call(
    `/catalog/products/${productId}/transition`,
    'POST',
    { body: { state: 'PUBLISHED' } },
  );

  expectStatus(
    toPublished,
    409,
    'assigning PUBLISHED directly',
  );

  const product = await readJson<{ product: { state: string } }>(
    await call(`/catalog/products/${productId}`, 'GET'),
  );

  expect(
    product.product.state === 'REVIEW_REQUIRED',
    'neither shortcut advanced the product',
  );
}

async function testApprovalIsRefusedBeforeSyncFinishes(): Promise<void> {
  productSequence += 1;

  const created = await call('/catalog/products', 'POST', {
    body: { title: 'Basket', description: 'A basket.' },
    headers: {
      'idempotency-key': `review-http-create-${productSequence}`,
    },
  });

  expectStatus(created, 201, 'creating a product');

  const { product } = await readJson<{ product: { id: string } }>(
    created,
  );

  const response = await call(
    `/catalog/products/${product.id}/review/approve`,
    'POST',
  );

  expectStatus(
    response,
    409,
    'approving a product that has not finished syncing',
  );
}

async function main(): Promise<void> {
  await testReviewRoutesRejectAnonymousCallers();
  await testMissingProductIsNotFound();
  await testAnotherArtisansProductIsForbidden();
  await testSuggestionsBlockApprovalOverHttp();
  await testApproveAndPublishOverHttp();
  await testGenericTransitionCannotReachApproval();
  await testApprovalIsRefusedBeforeSyncFinishes();

  console.log('REVIEW HTTP TESTS PASSED');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
