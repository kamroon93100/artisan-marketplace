import app from '../../index.js';

// This file's HTTP fixtures cannot pass a build mode through `app.request`.
// The suite-scoped development build matches the happy-path environment
// below; production call sites still omit the seam.
process.env.NODE_ENV = 'development';

/**
 * Catalog routes must refuse requests that cannot prove an identity.
 *
 * A production-shaped environment (session configured, no dev seam) must
 * reject anonymous callers and wrong tokens. An unconfigured deployment
 * must fail closed instead of fabricating an identity.
 */
async function testCatalogRoutesRejectAnonymousCallers(): Promise<void> {
  const env = {
    APP_ENV: 'production',
    SESSION_TOKEN: 'session-token-value',
    SESSION_ACTOR_ID: 'artisan-1',
  };

  // No auth header at all
  const noAuth = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'anon-001',
      },
      body: JSON.stringify({
        title: 'Anonymous Basket',
      }),
    },
    env,
  );

  if (noAuth.status !== 401) {
    throw new Error(
      `Expected 401 for anonymous product creation, got ${noAuth.status}.`,
    );
  }

  const noAuthBody = (await noAuth.json()) as {
    error?: { code?: string };
  };

  if (noAuthBody.error?.code !== 'UNAUTHENTICATED') {
    throw new Error(
      `Expected UNAUTHENTICATED for anonymous product creation, got ${JSON.stringify(noAuthBody)}.`,
    );
  }

  // Wrong session token
  const wrongToken = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'wrong-001',
        authorization: 'Bearer not-the-session-token',
      },
      body: JSON.stringify({
        title: 'Sneaky Basket',
      }),
    },
    env,
  );

  if (wrongToken.status !== 401) {
    throw new Error(
      `Expected 401 for a wrong session token, got ${wrongToken.status}.`,
    );
  }

  // Unconfigured deployment (no session provider, no dev seam)
  const unconfigured = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'unconfigured-001',
      },
      body: JSON.stringify({
        title: 'Unconfigured Basket',
      }),
    },
    { APP_ENV: 'production' },
  );

  if (unconfigured.status !== 503) {
    throw new Error(
      `Expected 503 when session verification is unconfigured, got ${unconfigured.status}.`,
    );
  }
}

async function main(): Promise<void> {
  // Verify auth gate before testing the happy path
  await testCatalogRoutesRejectAnonymousCallers();

  const env = {
    APP_ENV: 'development',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: '00000000-0000-4000-8000-000000000001',
  };

  const first = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'draft-local-001',
      },
      body: JSON.stringify({
        title: 'Test Basket',
        category: 'basket',
        materials: ['bamboo'],
      }),
    },
    env,
  );

  if (first.status !== 201) {
    throw new Error(`Expected first request 201, got ${first.status}.`);
  }

  const firstBody = (await first.json()) as {
    product: {
      id: string;
      ownerId: string;
      state: string;
      title: string | null;
    };
  };

  if (
    firstBody.product.ownerId !==
    env.DEV_OWNER_ID
  ) {
    throw new Error('Owner must be derived from the authenticated actor, not the request body.');
  }

  if (firstBody.product.state !== 'LOCAL_DRAFT') {
    throw new Error('New synced product must start LOCAL_DRAFT.');
  }

  const second = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'draft-local-001',
      },
      body: JSON.stringify({
        title: 'Changed Retry Payload',
        category: 'different-category',
      }),
    },
    env,
  );

  if (second.status !== 200) {
    throw new Error(`Expected retry request 200, got ${second.status}.`);
  }

  const secondBody = (await second.json()) as {
    product: {
      id: string;
      title: string | null;
    };
  };

  if (secondBody.product.id !== firstBody.product.id) {
    throw new Error('Retry created a duplicate product.');
  }

  if (secondBody.product.title !== firstBody.product.title) {
    throw new Error('Retry silently replaced the original product.');
  }

  console.log('CATALOG PRODUCT SYNC TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});





