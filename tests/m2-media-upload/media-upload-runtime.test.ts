/**
 * M2B media upload runtime test.
 *
 * Proves the media upload lifecycle against the real local stack:
 * a running API, real PostgreSQL, and real project-local object storage.
 * The bytes written here are actual bytes; verification is performed by
 * the server reading object metadata back from object storage, not by
 * anything this test asserts about itself.
 *
 * Required services:
 *   - API          : http://127.0.0.1:8787  (wrangler dev)
 *   - PostgreSQL   : 127.0.0.1:55432
 *   - Object store : http://127.0.0.1:9000  (RustFS)
 */

const API_BASE =
  process.env.MEDIA_E2E_API_URL ??
  'http://127.0.0.1:8787';

const OWNER_ID =
  '00000000-0000-4000-8000-00000000e2e1';

const IMAGE_CONTENT_TYPE = 'image/jpeg';

/** A real, non-empty payload. Its true size is what verification must observe. */
const IMAGE_BYTES = Buffer.from(
  Array.from({ length: 2048 }, (_, index) =>
    index % 251,
  ),
);

function assertEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertTrue(
  condition: boolean,
  label: string,
): void {
  if (!condition) {
    throw new Error(`${label}: expected true.`);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Response was not JSON (status ${response.status}): ${text.slice(0, 300)}`,
    );
  }
}

/**
 * The session credential this suite presents to the API.
 *
 * Media routes are authenticated, so the suite must act as a real
 * session rather than rely on the local development seam. The token is
 * supplied by the environment; the actor is the owner the suite
 * creates products for, so ownership assertions remain meaningful.
 */
const SESSION_TOKEN = process.env.MEDIA_E2E_SESSION_TOKEN;

const SESSION_ACTOR_ID = OWNER_ID;

function authHeaders(): Record<string, string> {
  if (!SESSION_TOKEN) {
    throw new Error(
      'MEDIA_E2E_SESSION_TOKEN is required: media routes are authenticated.',
    );
  }

  return {
    authorization: `Bearer ${SESSION_TOKEN}`,
  };
}

async function post<T>(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      ...(body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
      ...authHeaders(),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await readJson<T>(response),
  };
}

type ProductResponse = {
  product: { id: string; ownerId: string };
};

type MediaResponse = {
  attachment: {
    id: string;
    state: string;
    ownerId: string;
    productId: string;
  };
  deduplicated: boolean;
};

type UploadDescriptor = {
  objectKey: string;
  upload: {
    objectKey: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    expiresInSeconds: number;
  };
};

type CompletionResponse = {
  attachment: {
    id: string;
    state: string;
  };
  verified: boolean;
  verification: {
    verified: boolean;
    observedContentLength: number | null;
    observedContentType: string | null;
    observedEtag: string | null;
    failure: { code: string; message: string } | null;
  };
};

/**
 * Writes the real bytes to the presigned URL exactly as a client would,
 * honoring the descriptor's method and headers.
 */
async function putObject(
  descriptor: UploadDescriptor,
  bytes: Buffer,
): Promise<number> {
  const response = await fetch(descriptor.upload.url, {
    method: descriptor.upload.method,
    headers: descriptor.upload.headers,
    body: new Uint8Array(bytes),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Object upload failed with status ${response.status}: ${await response.text()}`,
    );
  }

  return response.status;
}

async function createProduct(
  title: string,
): Promise<string> {
  const { status, body } = await post<ProductResponse>(
    '/catalog/products',
    {
      ownerId: OWNER_ID,
      title,
      category: 'basket',
      materials: ['bamboo'],
    },
  );

  assertEqual(status, 201, 'create product status');

  return body.product.id;
}

async function createMedia(
  productId: string,
  idempotencyKey: string,
  sizeBytes: number,
): Promise<string> {
  const { status, body } = await post<MediaResponse>(
    `/catalog/products/${productId}/media`,
    {
      kind: 'IMAGE',
      contentType: IMAGE_CONTENT_TYPE,
      sizeBytes,
    },
    { 'idempotency-key': idempotencyKey },
  );

  assertEqual(status, 201, 'create media status');
  assertEqual(body.deduplicated, false, 'first media is not deduplicated');
  assertEqual(body.attachment.state, 'REQUESTED', 'media starts REQUESTED');
  assertEqual(
    body.attachment.productId,
    productId,
    'media is bound to its product',
  );
  assertEqual(
    body.attachment.ownerId,
    OWNER_ID,
    'media owner is derived from the catalog product',
  );

  return body.attachment.id;
}

async function testHealth(): Promise<void> {
  const response = await fetch(`${API_BASE}/health`);
  const body = await readJson<{
    ok: boolean;
    service: string;
  }>(response);

  assertEqual(response.status, 200, 'health status');
  assertTrue(body.ok, 'health reports ok');
  assertEqual(
    body.service,
    'artisan-marketplace-api',
    'health reports the expected service',
  );
}

async function testVerifiedUpload(): Promise<void> {
  const productId = await createProduct(
    'Verified upload basket',
  );
  const mediaId = await createMedia(
    productId,
    'm2b-verified-1',
    IMAGE_BYTES.byteLength,
  );

  const authorized = await post<UploadDescriptor>(
    `/catalog/media/${mediaId}/upload-authorization`,
  );

  assertEqual(
    authorized.status,
    200,
    'upload authorization status',
  );
  assertEqual(
    authorized.body.upload.method,
    'PUT',
    'descriptor method is PUT',
  );
  assertTrue(
    authorized.body.upload.expiresInSeconds <= 900,
    'upload authorization is short-lived',
  );
  assertTrue(
    authorized.body.upload.objectKey.includes(mediaId),
    'object key is bound to this media record',
  );
  assertTrue(
    authorized.body.upload.objectKey.includes(productId),
    'object key is bound to this product',
  );
  assertTrue(
    authorized.body.upload.objectKey.includes(OWNER_ID),
    'object key is bound to the owner',
  );

  // Re-authorizing must not mint a second object or a second key.
  const reauthorized = await post<UploadDescriptor>(
    `/catalog/media/${mediaId}/upload-authorization`,
  );

  assertEqual(
    reauthorized.body.upload.objectKey,
    authorized.body.upload.objectKey,
    're-authorization keeps the same object key',
  );

  const started = await post<UploadDescriptor>(
    `/catalog/media/${mediaId}/upload-start`,
  );

  assertEqual(started.status, 200, 'upload start status');
  assertEqual(
    started.body.upload.objectKey,
    authorized.body.upload.objectKey,
    'upload start keeps the same object key',
  );

  const putStatus = await putObject(
    authorized.body,
    IMAGE_BYTES,
  );

  assertTrue(
    putStatus >= 200 && putStatus < 300,
    'presigned PUT accepted the real bytes',
  );

  const completed = await post<CompletionResponse>(
    `/catalog/media/${mediaId}/upload-completion`,
  );

  assertEqual(
    completed.status,
    200,
    'upload completion status',
  );
  assertTrue(
    completed.body.verified,
    'server verified the stored object',
  );
  assertEqual(
    completed.body.attachment.state,
    'VERIFIED',
    'verified media reaches VERIFIED',
  );

  // The verification must be based on what object storage reports, and
  // that observed length must equal the bytes actually written.
  assertEqual(
    completed.body.verification.observedContentLength,
    IMAGE_BYTES.byteLength,
    'observed length matches the bytes written',
  );
  assertTrue(
    typeof completed.body.verification.observedEtag === 'string' &&
      completed.body.verification.observedEtag.length > 0,
    'object storage reported an etag',
  );
  assertEqual(
    completed.body.verification.failure,
    null,
    'verified upload has no failure',
  );
}

async function testVerifiedStateIsDurable(): Promise<void> {
  const productId = await createProduct(
    'Durable state basket',
  );
  const mediaId = await createMedia(
    productId,
    'm2b-durable-1',
    IMAGE_BYTES.byteLength,
  );

  const authorized = await post<UploadDescriptor>(
    `/catalog/media/${mediaId}/upload-authorization`,
  );

  await post(
    `/catalog/media/${mediaId}/upload-start`,
  );
  await putObject(authorized.body, IMAGE_BYTES);
  await post(`/catalog/media/${mediaId}/upload-completion`);

  // The state must have been persisted, not held in memory: a second
  // completion, issued as a retry, reads it back from the database.
  const retried = await post<CompletionResponse>(
    `/catalog/media/${mediaId}/upload-completion`,
  );

  assertEqual(
    retried.body.attachment.state,
    'VERIFIED',
    'retried completion stays VERIFIED',
  );
  assertTrue(
    retried.body.verified,
    'retried completion re-verifies',
  );
  assertEqual(
    retried.body.verification.observedContentLength,
    IMAGE_BYTES.byteLength,
    'retried completion re-observes the object',
  );

  // A verified object must never be handed out for overwrite.
  const reauthorize = await post<{
    error?: { code?: string };
  }>(`/catalog/media/${mediaId}/upload-authorization`);

  assertEqual(
    reauthorize.status,
    409,
    'a verified object cannot be re-authorized',
  );
}

async function testTruncatedUploadIsRejected(): Promise<void> {
  const productId = await createProduct(
    'Truncated upload basket',
  );
  const declaredBytes = IMAGE_BYTES.byteLength;

  // The client declares one size but writes fewer bytes.
  const mediaId = await createMedia(
    productId,
    'm2b-truncated-1',
    declaredBytes,
  );

  const authorized = await post<UploadDescriptor>(
    `/catalog/media/${mediaId}/upload-authorization`,
  );

  await post(`/catalog/media/${mediaId}/upload-start`);
  await putObject(
    authorized.body,
    IMAGE_BYTES.subarray(0, 512),
  );

  const completed = await post<CompletionResponse>(
    `/catalog/media/${mediaId}/upload-completion`,
  );

  assertEqual(
    completed.body.verified,
    false,
    'a truncated object is never verified',
  );
  assertEqual(
    completed.body.attachment.state,
    'FAILED',
    'a truncated object becomes an explicit failure state',
  );
  assertEqual(
    completed.body.verification.failure?.code,
    'OBJECT_SIZE_MISMATCH',
    'truncated object reports a size mismatch',
  );
  assertEqual(
    completed.body.verification.observedContentLength,
    512,
    'truncated object reports what was actually stored',
  );

  // Recovery: the same record and object key can be repaired.
  const resumed = await post<UploadDescriptor>(
    `/catalog/media/${mediaId}/upload-start`,
  );

  assertEqual(
    resumed.status,
    200,
    'a failed upload can be resumed',
  );
  assertEqual(
    resumed.body.upload.objectKey,
    authorized.body.upload.objectKey,
    'resume reuses the same object key',
  );

  await putObject(resumed.body, IMAGE_BYTES);

  const repaired = await post<CompletionResponse>(
    `/catalog/media/${mediaId}/upload-completion`,
  );

  assertTrue(
    repaired.body.verified,
    'the corrected upload verifies the same record',
  );
  assertEqual(
    repaired.body.attachment.state,
    'VERIFIED',
    'repaired media reaches VERIFIED',
  );
}

async function testContentTypeIsEnforced(): Promise<void> {
  const productId = await createProduct(
    'Content type basket',
  );
  const mediaId = await createMedia(
    productId,
    'm2b-content-type-1',
    IMAGE_BYTES.byteLength,
  );

  const authorized = await post<UploadDescriptor>(
    `/catalog/media/${mediaId}/upload-authorization`,
  );

  await post(`/catalog/media/${mediaId}/upload-start`);

  // Upload the correct number of bytes, but labelled as a different
  // type than the one the media record declared. The signed content
  // type must bind, so object storage is expected to refuse this
  // before the bytes are ever stored.
  const relabelled = await fetch(
    authorized.body.upload.url,
    {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain',
      },
      body: new Uint8Array(IMAGE_BYTES),
    },
  );

  assertTrue(
    relabelled.status >= 400 && relabelled.status < 500,
    `object storage refuses a content type that differs from the signed one (received ${relabelled.status})`,
  );

  // Because the write was refused, nothing was stored, and the record
  // must not verify. It must surface an explicit reason rather than
  // appearing valid.
  const completed = await post<CompletionResponse>(
    `/catalog/media/${mediaId}/upload-completion`,
  );

  assertEqual(
    completed.body.verified,
    false,
    'a refused relabelled upload is never verified',
  );
  assertTrue(
    completed.body.attachment.state === 'FAILED' ||
      completed.body.attachment.state === 'ACTION_REQUIRED',
    `a refused relabelled upload becomes an explicit non-verified state (received ${completed.body.attachment.state})`,
  );
  assertTrue(
    completed.body.verification.failure !== null,
    'a refused relabelled upload reports a failure reason',
  );
}

async function testCompletionWithoutBytesIsRejected(): Promise<void> {
  const productId = await createProduct(
    'Never uploaded basket',
  );
  const mediaId = await createMedia(
    productId,
    'm2b-never-uploaded-1',
    IMAGE_BYTES.byteLength,
  );

  await post(`/catalog/media/${mediaId}/upload-authorization`);

  // The client claims completion without ever writing bytes.
  const completed = await post<CompletionResponse>(
    `/catalog/media/${mediaId}/upload-completion`,
  );

  assertEqual(
    completed.body.verified,
    false,
    'completion without bytes is not verified',
  );
  assertEqual(
    completed.body.attachment.state,
    'FAILED',
    'completion without bytes is an explicit failure state',
  );
  assertEqual(
    completed.body.verification.failure?.code,
    'OBJECT_NOT_FOUND',
    'completion without bytes reports a missing object',
  );
}

async function testUploadAuthorizationIsNotReusable(): Promise<void> {
  const productId = await createProduct(
    'Expired authorization basket',
  );
  const mediaId = await createMedia(
    productId,
    'm2b-expired-1',
    IMAGE_BYTES.byteLength,
  );

  // A one-second authorization is expired by the time it is used.
  const authorized = await post<UploadDescriptor>(
    `/catalog/media/${mediaId}/upload-authorization?expiresInSeconds=1`,
  );

  assertEqual(
    authorized.body.upload.expiresInSeconds,
    1,
    'the requested short expiry is honored',
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 1500),
  );

  const response = await fetch(
    authorized.body.upload.url,
    {
      method: 'PUT',
      headers: authorized.body.upload.headers,
      body: new Uint8Array(IMAGE_BYTES),
    },
  );

  assertEqual(
    response.status,
    403,
    'an expired upload authorization is refused by object storage',
  );

  // The media record must remain recoverable rather than stranded.
  const completion = await post<CompletionResponse>(
    `/catalog/media/${mediaId}/upload-completion`,
  );

  assertTrue(
    completion.body.verified === false,
    'an expired authorization never verifies',
  );
}

async function testAuthorizationCannotWriteAnotherObject(): Promise<void> {
  const firstProduct = await createProduct(
    'Cross object basket A',
  );
  const secondProduct = await createProduct(
    'Cross object basket B',
  );

  const firstMedia = await createMedia(
    firstProduct,
    'm2b-cross-1',
    IMAGE_BYTES.byteLength,
  );
  const secondMedia = await createMedia(
    secondProduct,
    'm2b-cross-2',
    IMAGE_BYTES.byteLength,
  );

  const first = await post<UploadDescriptor>(
    `/catalog/media/${firstMedia}/upload-authorization`,
  );
  const second = await post<UploadDescriptor>(
    `/catalog/media/${secondMedia}/upload-authorization`,
  );

  if (first.body.upload.objectKey === second.body.upload.objectKey) {
    throw new Error(
      'Distinct media records must not share an object key.',
    );
  }

  // Reusing the first authorization against the second object's key must
  // be refused: the signature covers the object it was issued for.
  const crossed = await fetch(
    second.body.upload.url.replace(
      second.body.upload.objectKey,
      first.body.upload.objectKey,
    ),
    {
      method: 'PUT',
      headers: first.body.upload.headers,
      body: new Uint8Array(IMAGE_BYTES),
    },
  );

  assertEqual(
    crossed.status,
    403,
    'an upload authorization cannot write a different object',
  );
}

/**
 * The real stack must not serve media to an anonymous caller. This is
 * proven against the deployed-shaped API, not only in-process.
 */
async function testAnonymousMediaRequestsAreRejected(): Promise<void> {
  const anonymous = await fetch(
    `${API_BASE}/catalog/products/any-product/media`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'anonymous-runtime-001',
      },
      body: JSON.stringify({
        kind: 'IMAGE',
        contentType: IMAGE_CONTENT_TYPE,
        sizeBytes: IMAGE_BYTES.byteLength,
      }),
    },
  );

  assertEqual(
    anonymous.status,
    401,
    'anonymous media request status',
  );

  const body = await readJson<{
    error: { code: string };
  }>(anonymous);

  assertEqual(
    body.error.code,
    'UNAUTHENTICATED',
    'anonymous media request error code',
  );

  // A wrong credential must be refused identically.
  const wrong = await fetch(
    `${API_BASE}/catalog/products/any-product/media`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'anonymous-runtime-002',
        authorization: 'Bearer not-the-session-token',
      },
      body: JSON.stringify({
        kind: 'IMAGE',
        contentType: IMAGE_CONTENT_TYPE,
        sizeBytes: IMAGE_BYTES.byteLength,
      }),
    },
  );

  assertEqual(wrong.status, 401, 'wrong-token media request status');
}

async function main(): Promise<void> {
  await testHealth();
  await testAnonymousMediaRequestsAreRejected();
  await testVerifiedUpload();
  await testVerifiedStateIsDurable();
  await testTruncatedUploadIsRejected();
  await testContentTypeIsEnforced();
  await testCompletionWithoutBytesIsRejected();
  await testUploadAuthorizationIsNotReusable();
  await testAuthorizationCannotWriteAnotherObject();

  console.log(
    'M2B MEDIA UPLOAD RUNTIME TESTS PASSED',
  );
}

void main().catch((error) => {
  console.error(
    'M2B MEDIA UPLOAD RUNTIME TESTS FAILED',
  );
  console.error(error);
  process.exitCode = 1;
});
