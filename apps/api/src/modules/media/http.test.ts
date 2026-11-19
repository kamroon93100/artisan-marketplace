import app from '../../index.js';

// This file's HTTP fixtures cannot pass a build mode through `app.request`.
// The suite-scoped test build matches the local happy-path environment
// below; production call sites still omit the seam.
process.env.NODE_ENV = 'test';

const MEDIA_ROUTE_CASES = [
  {
    label: 'media request',
    method: 'POST',
    path: '/catalog/products/any-product/media',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': 'anonymous-001',
    },
    body: JSON.stringify({
      kind: 'IMAGE',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
    }),
  },
  {
    label: 'upload authorization',
    method: 'POST',
    path: '/catalog/products/any-product/media/any-media/authorize-upload',
    headers: {},
  },
  {
    label: 'upload start',
    method: 'POST',
    path: '/catalog/products/any-product/media/any-media/start-upload',
    headers: {},
  },
  {
    label: 'upload completion',
    method: 'POST',
    path: '/catalog/products/any-product/media/any-media/complete-upload',
    headers: {},
  },
] as const;

/**
 * A presigned upload authorization is a write credential, so an
 * unauthenticated caller must never reach a media handler. The
 * development seam is the only anonymous path, and it is verified
 * unreachable here by running without DEV_OWNER_ID.
 */
async function testMediaRoutesRejectAnonymousCallers(): Promise<void> {
  // A deployed-shaped environment: a real session provider, and no
  // local development seam to fall back on.
  const env = {
    APP_ENV: 'production',
    SESSION_TOKEN: 'session-token-value',
    SESSION_ACTOR_ID: 'artisan-1',
  };

  for (const route of MEDIA_ROUTE_CASES) {
    const response = await app.request(
      route.path,
      {
        method: route.method,
        headers: {
          ...route.headers,
        },
        ...('body' in route ? { body: route.body } : {}),
      },
      env,
    );

    if (response.status !== 401) {
      throw new Error(
        `Expected 401 for anonymous ${route.label}, got ${response.status}.`,
      );
    }

    const body = (await response.json()) as {
      error?: { code?: string };
    };

    if (body.error?.code !== 'UNAUTHENTICATED') {
      throw new Error(
        `Expected UNAUTHENTICATED for anonymous ${route.label}, got ${JSON.stringify(body)}.`,
      );
    }
  }

  // A wrong token must be indistinguishable from a missing one.
  const wrongToken = await app.request(
    MEDIA_ROUTE_CASES[0].path,
    {
      method: 'POST',
      headers: {
        ...MEDIA_ROUTE_CASES[0].headers,
        authorization: 'Bearer not-the-session-token',
      },
      body: MEDIA_ROUTE_CASES[0].body,
    },
    env,
  );

  if (wrongToken.status !== 401) {
    throw new Error(
      `Expected 401 for a wrong session token, got ${wrongToken.status}.`,
    );
  }

  // An unconfigured deployment must refuse rather than serve media
  // anonymously.
  const unconfigured = await app.request(
    MEDIA_ROUTE_CASES[0].path,
    {
      method: 'POST',
      headers: {
        ...MEDIA_ROUTE_CASES[0].headers,
      },
      body: MEDIA_ROUTE_CASES[0].body,
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
  const env = {
    APP_ENV: 'test',
    LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
    DEV_OWNER_ID: 'artisan-media-test',
  };

  await testMediaRoutesRejectAnonymousCallers();

const productResponse = await app.request(
    '/catalog/products',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test Basket',
        category: 'basket',
        materials: ['bamboo'],
      }),
    },
    env,
  );

  if (productResponse.status !== 201) {
    throw new Error(
      `Expected product creation 201, got ${productResponse.status}.`,
    );
  }

  const productBody = (await productResponse.json()) as {
    product: {
      id: string;
      ownerId: string;
    };
  };

  const productId = productBody.product.id;

  const firstResponse = await app.request(
    `/catalog/products/${productId}/media`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'media-test-001',
      },
      body: JSON.stringify({
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    },
    env,
  );

  if (firstResponse.status !== 201) {
    throw new Error(
      `Expected first media request 201, got ${firstResponse.status}.`,
    );
  }

  const firstBody = (await firstResponse.json()) as {
    attachment: {
      id: string;
      productId: string;
      ownerId: string;
      state: string;
    };
    deduplicated: boolean;
  };

  if (firstBody.deduplicated) {
    throw new Error('First media request must not be deduplicated.');
  }

  if (firstBody.attachment.productId !== productId) {
    throw new Error('Media attachment productId is incorrect.');
  }

  if (firstBody.attachment.ownerId !== 'artisan-media-test') {
    throw new Error('Media ownerId must come from the catalog product.');
  }

  if (firstBody.attachment.state !== 'REQUESTED') {
    throw new Error('New media attachments must start in REQUESTED state.');
  }

  const secondResponse = await app.request(
    `/catalog/products/${productId}/media`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'media-test-001',
      },
      body: JSON.stringify({
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    },
    env,
  );

  if (secondResponse.status !== 200) {
    throw new Error(
      `Expected duplicate media request 200, got ${secondResponse.status}.`,
    );
  }

  const secondBody = (await secondResponse.json()) as {
    attachment: {
      id: string;
    };
    deduplicated: boolean;
  };

  if (!secondBody.deduplicated) {
    throw new Error('Duplicate media request must be deduplicated.');
  }

  if (secondBody.attachment.id !== firstBody.attachment.id) {
    throw new Error(
      'Duplicate media request returned a different attachment.',
    );
  }

  // Reusing the key with different immutable metadata is a conflict, not
  // a retry, and must be reported as one over HTTP rather than
  // deduplicated into the original record.
  for (const mismatch of [
    { field: 'sizeBytes', sizeBytes: 2048 },
    { field: 'contentType', contentType: 'image/png' },
  ]) {
    const conflictResponse = await app.request(
      `/catalog/products/${productId}/media`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'media-test-001',
        },
        body: JSON.stringify({
          kind: 'IMAGE',
          contentType: 'image/jpeg',
          sizeBytes: 1024,
          ...mismatch,
        }),
      },
      env,
    );

    if (conflictResponse.status !== 409) {
      throw new Error(
        `Expected 409 for an idempotency key reused with a different ${mismatch.field}, got ${conflictResponse.status}.`,
      );
    }

    const conflictBody = (await conflictResponse.json()) as {
      error?: { code?: string };
    };

    if (conflictBody.error?.code !== 'CONFLICT') {
      throw new Error(
        `Expected CONFLICT for an idempotency key reused with a different ${mismatch.field}, got ${JSON.stringify(conflictBody)}.`,
      );
    }
  }

  // The rejected replays must not have disturbed the original record.
  const afterConflict = await app.request(
    `/catalog/products/${productId}/media`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'media-test-001',
      },
      body: JSON.stringify({
        kind: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    },
    env,
  );

  if (afterConflict.status !== 200) {
    throw new Error(
      `Expected the original key to still deduplicate after a conflict, got ${afterConflict.status}.`,
    );
  }

  const afterConflictBody = (await afterConflict.json()) as {
    attachment: { id: string };
  };

  if (afterConflictBody.attachment.id !== firstBody.attachment.id) {
    throw new Error(
      'A rejected replay must not change which record the key resolves to.',
    );
  }


  const invalidResponse = await app.request(
    `/catalog/products/${productId}/media`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'media-test-002',
      },
      body: JSON.stringify({
        kind: 'IMAGE',
        contentType: 'audio/mpeg',
        sizeBytes: 1024,
      }),
    },
    env,
  );

  if (invalidResponse.status !== 400) {
    throw new Error(
      `Expected invalid media type 400, got ${invalidResponse.status}.`,
    );
  }

  const missingProductResponse = await app.request(
    '/catalog/products/does-not-exist/media',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'media-test-003',
      },
      body: JSON.stringify({
        kind: 'AUDIO',
        contentType: 'audio/mpeg',
        sizeBytes: 2048,
      }),
    },
    env,
  );

  if (missingProductResponse.status !== 404) {
    throw new Error(
      `Expected missing product 404, got ${missingProductResponse.status}.`,
    );
  }

  // ---------------------------------------------------------------------
  // Upload lifecycle routes.
  //
  // The happy path is proven at the service layer and against real
  // object storage by the end-to-end run. These assertions cover the
  // HTTP contract itself: status mapping, guard rails, and the rule
  // that missing object storage fails closed instead of fabricating an
  // upload.
  // ---------------------------------------------------------------------

  // Starting an upload before an upload authorization exists must be
  // refused, because no object key has been allocated yet.
  const startBeforeAuthorization =
    await app.request(
      `/catalog/media/${firstBody.attachment.id}/upload-start`,
      { method: 'POST' },
      env,
    );

  if (startBeforeAuthorization.status !== 409) {
    throw new Error(
      `Expected start before authorization 409, got ${startBeforeAuthorization.status}.`,
    );
  }

  // The same guard applies to completion.
  const completeBeforeAuthorization =
    await app.request(
      `/catalog/media/${firstBody.attachment.id}/upload-completion`,
      { method: 'POST' },
      env,
    );

  if (completeBeforeAuthorization.status !== 409) {
    throw new Error(
      `Expected completion before authorization 409, got ${completeBeforeAuthorization.status}.`,
    );
  }

  // Unknown media must not leak a fabricated authorization.
  for (const path of [
    'upload-authorization',
    'upload-start',
    'upload-completion',
  ]) {
    const response = await app.request(
      `/catalog/media/does-not-exist/${path}`,
      { method: 'POST' },
      env,
    );

    if (response.status !== 404) {
      throw new Error(
        `Expected unknown media ${path} 404, got ${response.status}.`,
      );
    }
  }

  // With object storage unconfigured, upload authorization must fail
  // closed with a retryable dependency error rather than handing the
  // client a URL that cannot work or crashing with a 500.
  const unconfiguredStorage =
    await app.request(
      `/catalog/media/${firstBody.attachment.id}/upload-authorization`,
      { method: 'POST' },
      env,
    );

  if (unconfiguredStorage.status !== 503) {
    throw new Error(
      `Expected unconfigured object storage 503, got ${unconfiguredStorage.status}.`,
    );
  }

  const unconfiguredBody =
    (await unconfiguredStorage.json()) as {
      error?: { code?: string };
    };

  if (unconfiguredBody.error?.code !== 'DEPENDENCY_FAILED') {
    throw new Error(
      `Expected DEPENDENCY_FAILED, got ${JSON.stringify(unconfiguredBody)}.`,
    );
  }

  console.log('MEDIA HTTP TESTS PASSED');
}

await main();
