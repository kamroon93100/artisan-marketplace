import app from './index.js';
import { getIdentityService } from './modules/identity/index.js';

// This file's HTTP fixtures cannot pass a build mode through `app.request`.
// The suite-scoped test build keeps those fixtures on the same policy path
// as the focused unit tests; production call sites still omit the seam.
process.env.NODE_ENV = 'test';

async function expectStatus(
  response: Response,
  expected: number,
  label: string,
): Promise<void> {
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(
      `${label}: expected ${expected}, received ${response.status}: ${body}`,
    );
  }
}

type UnauthenticatedBody = {
  error?: {
    code?: string;
    message?: string;
    details?: { reason?: string };
  };
};

/**
 * Observes the M8 error contract (Option A) at the HTTP boundary: a
 * protected route refuses a credential with 401 / `UNAUTHENTICATED`,
 * carries `details.reason` for a deliberate session refusal state,
 * carries no `details` at all for a generic missing/unknown credential,
 * and never serializes a credential value. The expired refusal is
 * asserted through `requireActor` in the identity suite; it produces the
 * same `AppError` shape as the revoked refusal observed here.
 */
async function expectUnauthenticatedWire(
  env: {
    APP_ENV: string;
    LOCAL_IN_MEMORY_AUTH_ENABLED?: string;
    SESSION_TOKEN?: string;
    SESSION_ACTOR_ID?: string;
  },
  options: {
    label: string;
    authorization?: string;
    reason?: string;
    secrets: readonly string[];
  },
): Promise<void> {
  const response = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `m8-error-contract-${options.label.replace(/\s+/g, '-')}`,
        ...(options.authorization === undefined
          ? {}
          : { authorization: options.authorization }),
      },
      body: JSON.stringify({
        title: 'Session Contract Basket',
      }),
    },
    env,
  );

  if (response.status !== 401) {
    const body = await response.text();
    throw new Error(
      `${options.label}: expected 401, received ${response.status}: ${body}`,
    );
  }

  const text = await response.text();
  const body = JSON.parse(text) as UnauthenticatedBody;

  if (body.error?.code !== 'UNAUTHENTICATED') {
    throw new Error(
      `${options.label}: expected UNAUTHENTICATED, received ${text}`,
    );
  }

  if (options.reason === undefined) {
    if (body.error.details !== undefined) {
      throw new Error(
        `${options.label}: expected no details.reason, received ${text}`,
      );
    }
  } else if (body.error.details?.reason !== options.reason) {
    throw new Error(
      `${options.label}: expected details.reason ${options.reason}, received ${text}`,
    );
  }

  for (const secret of options.secrets) {
    if (text.includes(secret)) {
      throw new Error(
        `${options.label}: the error response contains a credential value.`,
      );
    }
  }
}

/**
 * A revoked session is refused with 401 / `UNAUTHENTICATED` and the
 * `SESSION_REVOKED` reason on the wire, a generic missing or unknown
 * credential is refused with no `details.reason` at all, and no
 * presented credential ever reaches the response body.
 */
async function testUnauthenticatedErrorContractOverHttp(): Promise<void> {
  const identity = getIdentityService(
    {
      APP_ENV: 'test',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    },
    'test',
  );

  if (identity === null) {
    throw new Error(
      'Identity is not composed for the test environment.',
    );
  }

  const revoked = identity.establish({
    actorId: 'actor-http-contract',
    roles: ['BUYER'],
  });

  if (!identity.revokeSession(revoked.sessionId)) {
    throw new Error('revoking the session must succeed.');
  }

  await expectUnauthenticatedWire(
    {
      APP_ENV: 'test',
      LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    },
    {
      label: 'a revoked session',
      authorization: `Bearer ${revoked.accessToken}`,
      reason: 'SESSION_REVOKED',
      secrets: [revoked.accessToken, revoked.refreshToken],
    },
  );

  const staticSessionEnv = {
    APP_ENV: 'test',
    SESSION_TOKEN: 'static-token-value',
    SESSION_ACTOR_ID: 'static-actor',
  };

  await expectUnauthenticatedWire(staticSessionEnv, {
    label: 'a request with no credential',
    secrets: ['static-token-value'],
  });

  await expectUnauthenticatedWire(staticSessionEnv, {
    label: 'an unknown credential',
    authorization: 'Bearer not-a-real-credential',
    secrets: ['not-a-real-credential', 'static-token-value'],
  });
}

async function main(): Promise<void> {
  await testUnauthenticatedErrorContractOverHttp();

  const env = {
    APP_ENV: 'test',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: 'artisan-test-1',
  };

  const health = await app.request(
    new Request('http://localhost/health'),
    {},
    env,
  );

  await expectStatus(health, 200, 'health');

  const healthBody = (await health.json()) as {
    ok: boolean;
    service: string;
  };

  if (!healthBody.ok || healthBody.service !== 'artisan-marketplace-api') {
    throw new Error('Health response contract failed.');
  }

  const create = await app.request(
    new Request('http://localhost/catalog/products', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Handwoven Basket',
        category: 'basketry',
        materials: ['bamboo'],
      }),
    }),
    {},
    env,
  );

  await expectStatus(create, 201, 'create product');

  const createdBody = (await create.json()) as {
    product: {
      id: string;
      state: string;
      title: string | null;
    };
  };

  if (
    !createdBody.product.id ||
    createdBody.product.state !== 'LOCAL_DRAFT' ||
    createdBody.product.title !== 'Handwoven Basket'
  ) {
    throw new Error('Create product contract failed.');
  }

  const productId = createdBody.product.id;

  const get = await app.request(
    new Request(`http://localhost/catalog/products/${productId}`),
    {},
    env,
  );

  await expectStatus(get, 200, 'get product');

  const transition = await app.request(
    new Request(
      `http://localhost/catalog/products/${productId}/transition`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          state: 'PENDING_SYNC',
        }),
      },
    ),
    {},
    env,
  );

  await expectStatus(transition, 200, 'valid transition');

  const invalidTransition = await app.request(
    new Request(
      `http://localhost/catalog/products/${productId}/transition`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          state: 'PUBLISHED',
        }),
      },
    ),
    {},
    env,
  );

  await expectStatus(invalidTransition, 409, 'invalid transition');

  console.log('API HTTP CONTRACT TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
