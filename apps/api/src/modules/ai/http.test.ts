import app from '../../index.js';

// This file's HTTP fixtures cannot pass a build mode through `app.request`.
// The suite-scoped development build matches the local environment below;
// production call sites still omit the seam.
process.env.NODE_ENV = 'development';

type JsonObject = Record<string, unknown>;

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

async function readJson<T>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

function expect(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as {
    error?: { code?: string };
  };

  return body.error?.code;
}

/**
 * The AI routes must refuse to run without an identity, exactly like the
 * catalog routes. Execution spends provider budget and decisions mutate a
 * product, so an unauthenticated caller must never reach either.
 */
async function testAiRoutesRejectAnonymousCallers(): Promise<void> {
  const env = {
    APP_ENV: 'production',
    SESSION_TOKEN: 'session-token-value',
    SESSION_ACTOR_ID: 'artisan-1',
  };

  const noAuth = await app.request(
    '/catalog/products/00000000-0000-4000-8000-000000000001/ai-jobs',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'anon-ai-001',
      },
      body: JSON.stringify({}),
    },
    env,
  );

  if (noAuth.status !== 401) {
    throw new Error(
      `Expected 401 for anonymous AI enqueue, got ${noAuth.status}.`,
    );
  }

  const runAnonymous = await app.request(
    '/catalog/ai-jobs/00000000-0000-4000-8000-000000000001/run',
    { method: 'POST' },
    env,
  );

  if (runAnonymous.status !== 401) {
    throw new Error(
      `Expected 401 for anonymous AI run, got ${runAnonymous.status}.`,
    );
  }
}

/**
 * The full automation journey through the HTTP surface: create a product,
 * enqueue an AI job, replay the enqueue, execute it, read job and
 * proposals, then decide on the proposals and see only the accepted value
 * cross into the product.
 */
async function main(): Promise<void> {
  await testAiRoutesRejectAnonymousCallers();
  await testAiRunRateLimitSharedAcrossJobIds();

  const env = {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: '00000000-0000-4000-8000-000000000001',
  };

  // 1. A product exists before AI work can target it.
  const created = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'ai-http-product',
      },
      body: JSON.stringify({
        title: 'Test Basket',
        category: 'basket',
        materials: ['bamboo'],
      }),
    },
    env,
  );

  if (created.status !== 201) {
    throw new Error(`Expected product create 201, got ${created.status}.`);
  }

  const product = ((await created.json()) as JsonObject)
    .product as { id: string };

  // 2. Enqueue a job for that product.
  const enqueued = await app.request(
    `/catalog/products/${product.id}/ai-jobs`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'ai-http-sync-001',
        'x-correlation-id': 'http-corr-1',
      },
      body: JSON.stringify({
        transcription:
          'A hand-woven basket for storing bread.',
        media: [{ mediaId: 'media-1', kind: 'IMAGE' }],
      }),
    },
    env,
  );

  if (enqueued.status !== 201) {
    throw new Error(`Expected AI enqueue 201, got ${enqueued.status}.`);
  }

  const enqueueBody = (await enqueued.json()) as {
    job: { id: string; state: string };
    deduplicated: boolean;
  };

  const jobId = enqueueBody.job.id;

  if (enqueueBody.job.state !== 'QUEUED' || enqueueBody.deduplicated) {
    throw new Error('A fresh AI job must enqueue as QUEUED.');
  }

  // 3. Replaying the same idempotency key must not create a second job.
  const replayed = await app.request(
    `/catalog/products/${product.id}/ai-jobs`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'ai-http-sync-001',
      },
      body: JSON.stringify({}),
    },
    env,
  );

  if (replayed.status !== 200) {
    throw new Error(`Expected idempotent replay 200, got ${replayed.status}.`);
  }

  const replayBody = (await replayed.json()) as {
    job: { id: string };
    deduplicated: boolean;
  };

  if (replayBody.job.id !== jobId || !replayBody.deduplicated) {
    throw new Error('An idempotent replay must return the original job.');
  }

  // 4. Missing idempotency key is refused at the boundary.
  const noKey = await app.request(
    `/catalog/products/${product.id}/ai-jobs`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    },
    env,
  );

  if (noKey.status !== 400 || (await errorCode(noKey)) !== 'VALIDATION_FAILED') {
    throw new Error('Enqueue without an idempotency key must be refused.');
  }

  // 5. A malformed media reference is refused at the boundary.
  const badMedia = await app.request(
    `/catalog/products/${product.id}/ai-jobs`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'ai-http-bad-media',
      },
      body: JSON.stringify({
        media: [{ mediaId: 'media-1', kind: 'not-a-kind' }],
      }),
    },
    env,
  );

  if (badMedia.status !== 400) {
    throw new Error('A malformed media reference must be refused.');
  }

  // 6. The job is visible in the product's job list.
  const listed = await app.request(
    `/catalog/products/${product.id}/ai-jobs`,
    {},
    env,
  );

  if (listed.status !== 200) {
    throw new Error(`Expected job list 200, got ${listed.status}.`);
  }

  const listBody = (await listed.json()) as {
    jobs: Array<{ id: string }>;
  };

  if (!listBody.jobs.some((job) => job.id === jobId)) {
    throw new Error('The enqueued job must appear in the product list.');
  }

  // 7. Executing the job produces proposals.
  const ran = await app.request(
    `/catalog/ai-jobs/${jobId}/run`,
    { method: 'POST' },
    env,
  );

  if (ran.status !== 200) {
    throw new Error(`Expected AI run 200, got ${ran.status}.`);
  }

  const runBody = (await ran.json()) as {
    job: { state: string };
    proposals: Array<{
      id: string;
      field: string;
      decision: string;
    }>;
  };

  if (runBody.job.state !== 'SUCCEEDED') {
    throw new Error('A successful run must leave the job SUCCEEDED.');
  }

  const titleProposal = runBody.proposals.find(
    (proposal) => proposal.field === 'title',
  );

  if (!titleProposal) {
    throw new Error('The run must propose a title.');
  }

  if (
    runBody.proposals.some(
      (proposal) => proposal.decision !== 'PENDING',
    )
  ) {
    throw new Error('Fresh proposals must all be PENDING.');
  }

  // 8. Re-running a terminal job is a conflict, not a second execution.
  const rerun = await app.request(
    `/catalog/ai-jobs/${jobId}/run`,
    { method: 'POST' },
    env,
  );

  if (rerun.status !== 409 || (await errorCode(rerun)) !== 'CONFLICT') {
    throw new Error('Re-running a SUCCEEDED job must conflict.');
  }

  // 9. Job and history reads return the proposals.
  const detail = await app.request(`/catalog/ai-jobs/${jobId}`, {}, env);

  const detailBody = (await detail.json()) as {
    proposals: unknown[];
  };

  if (detailBody.proposals.length === 0) {
    throw new Error('Job detail must include proposals.');
  }

  const history = await app.request(
    `/catalog/ai-jobs/${jobId}/history`,
    {},
    env,
  );

  if (history.status !== 200) {
    throw new Error(`Expected history 200, got ${history.status}.`);
  }

  // 10. Decisions cross only the accepted value into the product.
  const decided = await app.request(
    `/catalog/ai-jobs/${jobId}/decisions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decisions: [
          { proposalId: titleProposal.id, decision: 'ACCEPTED' },
          ...runBody.proposals
            .filter((proposal) => proposal.field !== 'title')
            .map((proposal) => ({
              proposalId: proposal.id,
              decision: 'REJECTED',
            })),
        ],
      }),
    },
    env,
  );

  if (decided.status !== 200) {
    throw new Error(`Expected decisions 200, got ${decided.status}.`);
  }

  const decisionBody = (await decided.json()) as {
    applied: string[];
    product: { title: string | null };
  };

  if (!decisionBody.applied.includes('title')) {
    throw new Error('An accepted proposal must be applied to the product.');
  }

  if (decisionBody.product.title !== titleProposalValue(runBody)) {
    throw new Error(
      'The product title must become exactly the accepted proposal value.',
    );
  }

  // 11. A value beside an ACCEPTED decision is refused at the boundary.
  const badValue = await app.request(
    `/catalog/ai-jobs/${jobId}/decisions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decisions: [
          {
            proposalId: titleProposal.id,
            decision: 'REJECTED',
            value: 'must not travel beside a rejection',
          },
        ],
      }),
    },
    env,
  );

  if (badValue.status !== 400) {
    throw new Error('A value beside a non-EDITED decision must be refused.');
  }

  // 12. A caller who does not own the job cannot decide on it.
  const stranger = await app.request(
    `/catalog/ai-jobs/${jobId}/decisions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decisions: [{ proposalId: titleProposal.id, decision: 'ACCEPTED' }],
      }),
    },
    {
      APP_ENV: 'development',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      DEV_OWNER_ID: '00000000-0000-4000-8000-000000000099',
    },
  );

  if (stranger.status !== 403) {
    throw new Error(
      `A stranger deciding on a job must be refused, got ${stranger.status}.`,
    );
  }

  console.log('AI HTTP PIPELINE TESTS PASSED');
}

/**
 * Regression test: the ai.job.run rate limit is shared across
 * different job IDs for the same actor. Uses the production resolver
 * with a fake Durable Object that enforces the limit.
 *
 * Two different AI jobs are enqueued and run alternately by the same actor.
 * The budget is 10 requests per 60 seconds. Requests 1-10 must succeed
 * (not rate-limited). Request 11 must be rejected with HTTP 429.
 */
async function testAiRunRateLimitSharedAcrossJobIds(): Promise<void> {
  const { namespace } = createEnforcingDurableNamespace();

  const sessionToken = 'test-session-token';
  const sessionActorId = 'actor-ai-run-rate-limit';

  // Development environment for test setup (in-memory repo + in-memory auth + deterministic AI provider).
  // Uses a dedicated actor so its rate-limit buckets don't interfere with
  // other tests in this suite.
  const setupEnv = {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: sessionActorId,
  };

  // Production-like environment for the rate-limit test:
  // - APP_ENV: development (so AI service uses in-memory repo + deterministic provider)
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

  // Create a product using the setup environment
  const created = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'ai-rl-product',
      },
      body: JSON.stringify({
        title: 'Test Basket',
        category: 'basket',
        materials: ['bamboo'],
      }),
    },
    setupEnv,
  );

  expect(created.status === 201, `Expected product create 201, got ${created.status}.`);
  const product = ((await created.json()) as JsonObject).product as { id: string };

  // Enqueue two AI jobs for that product using setup env
  const enqueuedA = await app.request(
    `/catalog/products/${product.id}/ai-jobs`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'ai-rl-job-a',
        'x-correlation-id': 'ai-rl-corr-a',
      },
      body: JSON.stringify({
        transcription: 'A hand-woven basket for storing bread.',
        media: [{ mediaId: 'media-1', kind: 'IMAGE' }],
      }),
    },
    setupEnv,
  );

  expect(enqueuedA.status === 201, `Expected AI enqueue 201, got ${enqueuedA.status}.`);
  const enqueueBodyA = (await enqueuedA.json()) as { job: { id: string; state: string } };
  const jobIdA = enqueueBodyA.job.id;

  const enqueuedB = await app.request(
    `/catalog/products/${product.id}/ai-jobs`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'ai-rl-job-b',
        'x-correlation-id': 'ai-rl-corr-b',
      },
      body: JSON.stringify({
        transcription: 'Another basket for testing.',
        media: [{ mediaId: 'media-2', kind: 'IMAGE' }],
      }),
    },
    setupEnv,
  );

  expect(enqueuedB.status === 201, `Expected AI enqueue 201, got ${enqueuedB.status}.`);
  const enqueueBodyB = (await enqueuedB.json()) as { job: { id: string; state: string } };
  const jobIdB = enqueueBodyB.job.id;

  // Now run the two jobs alternately to exhaust the shared budget (10)
  // ai.job.run limit is 10 per 60s per actor
  let allowedCount = 0;
  let deniedCount = 0;

  for (let i = 0; i < 11; i++) {
    const jobId = i % 2 === 0 ? jobIdA : jobIdB;
    const idempotencyKey = `ai-rl-run-${i}`;

    const response = await jsonWithRateLimit(
      `/catalog/ai-jobs/${jobId}/run`,
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
    } else if (response.status === 200 || response.status === 409) {
      allowedCount++;
      // 409 (CONFLICT) means the rate limiter allowed the request but the service
      // rejected it because the job was already run. This is expected when
      // re-running the same job. The rate limit budget is still consumed.
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

function titleProposalValue(
  runBody: {
    proposals: Array<{ field: string; value?: string | string[] }>;
  },
): string {
  const proposal = runBody.proposals.find(
    (entry) => entry.field === 'title',
  );

  if (typeof proposal?.value !== 'string') {
    throw new Error('The accepted title proposal must carry a string value.');
  }

  return proposal.value;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});