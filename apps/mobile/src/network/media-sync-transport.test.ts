import {
  HttpMediaSyncTransport,
} from './media-sync-transport';
import { MediaSyncTransportError } from '../sync/media-sync-contract';

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

async function testSuccess(): Promise<void> {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  mockFetch(async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;

    return new Response(
      JSON.stringify({
        attachment: {
          id: 'media-123',
        },
      }),
      {
        status: 201,
        headers: {
          'content-type': 'application/json',
        },
      },
    );
  });

  const transport = new HttpMediaSyncTransport();

  const result = await transport.createMediaAttachment({
    productId: 'product-1',
    kind: 'IMAGE',
    contentType: 'image/jpeg',
    sizeBytes: 2048,
    idempotencyKey: 'idem-123',
  });

  if (result.mediaId !== 'media-123') {
    throw new Error('Success response did not return media id.');
  }

  if (
    capturedUrl !==
    'http://localhost:8787/catalog/products/product-1/media'
  ) {
    throw new Error('Transport constructed the wrong API URL.');
  }

  if (
    capturedInit?.method !== 'POST' ||
    capturedInit?.headers instanceof Headers &&
      capturedInit.headers.get('idempotency-key') !== 'idem-123'
  ) {
    throw new Error('Transport did not send the expected request headers.');
  }
}

async function testRetryableServerFailure(): Promise<void> {
  mockFetch(async () =>
    new Response(
      JSON.stringify({
        error: {
          code: 'TEMPORARY_FAILURE',
          message: 'Temporary outage.',
        },
      }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json',
        },
      },
    ),
  );

  const transport = new HttpMediaSyncTransport();

  let failed = false;

  try {
    await transport.createMediaAttachment({
      productId: 'product-2',
      kind: 'AUDIO',
      contentType: 'audio/mpeg',
      sizeBytes: 4096,
      idempotencyKey: 'idem-456',
    });
  } catch (error) {
    failed = true;

    if (!(error instanceof MediaSyncTransportError)) {
      throw new Error('Expected MediaSyncTransportError.');
    }

    if (!error.retryable) {
      throw new Error('HTTP 503 must be retryable.');
    }

    if (error.code !== 'TEMPORARY_FAILURE') {
      throw new Error('Server error code was not preserved.');
    }
  }

  if (!failed) {
    throw new Error('Expected the 503 request to fail.');
  }
}

async function testPermanentClientFailure(): Promise<void> {
  mockFetch(async () =>
    new Response(
      JSON.stringify({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid content type.',
        },
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      },
    ),
  );

  const transport = new HttpMediaSyncTransport();

  try {
    await transport.createMediaAttachment({
      productId: 'product-3',
      kind: 'IMAGE',
      contentType: 'audio/mpeg',
      sizeBytes: 4096,
      idempotencyKey: 'idem-789',
    });

    throw new Error('Expected the 400 request to fail.');
  } catch (error) {
    if (!(error instanceof MediaSyncTransportError)) {
      throw new Error('Expected MediaSyncTransportError.');
    }

    if (error.retryable) {
      throw new Error('HTTP 400 must not be retried automatically.');
    }

    if (error.code !== 'VALIDATION_FAILED') {
      throw new Error('Validation error code was not preserved.');
    }
  }
}

async function testNetworkFailure(): Promise<void> {
  mockFetch(async () => {
    throw new Error('Network unavailable.');
  });

  const transport = new HttpMediaSyncTransport();

  try {
    await transport.createMediaAttachment({
      productId: 'product-4',
      kind: 'IMAGE',
      contentType: 'image/png',
      sizeBytes: 1024,
      idempotencyKey: 'idem-network',
    });

    throw new Error('Expected the network request to fail.');
  } catch (error) {
    if (!(error instanceof MediaSyncTransportError)) {
      throw new Error('Expected MediaSyncTransportError.');
    }

    if (!error.retryable) {
      throw new Error('Network failure must be retryable.');
    }

    if (error.code !== 'NETWORK_ERROR') {
      throw new Error('Network error code was not normalized.');
    }
  }
}

async function testUploadAuthorization(): Promise<void> {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  mockFetch(async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;

    return new Response(
      JSON.stringify({
        attachment: {
          id: 'media-123',
          state: 'UPLOAD_AUTHORIZED',
        },
        objectKey: 'media/owner/product/media-123',
        upload: {
          objectKey: 'media/owner/product/media-123',
          url: 'https://storage.test/object?signature=x',
          method: 'PUT',
          headers: {
            'content-type': 'image/jpeg',
          },
          expiresInSeconds: 300,
        },
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      },
    );
  });

  const transport = new HttpMediaSyncTransport();

  const result = await transport.authorizeUpload(
    'media-123',
  );

  if (result.mediaId !== 'media-123') {
    throw new Error('Authorization did not return the media id.');
  }

  if (result.remoteState !== 'UPLOAD_AUTHORIZED') {
    throw new Error(
      `Expected remote state UPLOAD_AUTHORIZED, received ${result.remoteState}.`,
    );
  }

  if (result.upload.method !== 'PUT') {
    throw new Error('Descriptor method must be PUT.');
  }

  if (result.upload.expiresInSeconds !== 300) {
    throw new Error('Descriptor expiry was not preserved.');
  }

  if (
    result.upload.headers['content-type'] !==
    'image/jpeg'
  ) {
    throw new Error(
      'The signed content type must be forwarded to the uploader.',
    );
  }

  if (capturedInit?.method !== 'POST') {
    throw new Error('Authorization must use POST.');
  }

  if (
    !capturedUrl.includes('/media/media-123/upload-authorization')
  ) {
    throw new Error(
      `Unexpected authorization path: ${capturedUrl}`,
    );
  }

  // A requested expiry must be forwarded, encoded.
  await transport.authorizeUpload('media-123', 60);

  if (!capturedUrl.includes('expiresInSeconds=60')) {
    throw new Error(
      `Requested expiry was not forwarded: ${capturedUrl}`,
    );
  }
}

async function testUploadStart(): Promise<void> {
  let capturedUrl = '';

  mockFetch(async (input) => {
    capturedUrl = String(input);

    return new Response(
      JSON.stringify({
        attachment: {
          id: 'media-123',
          state: 'UPLOADING',
        },
        upload: {
          objectKey: 'media/owner/product/media-123',
          url: 'https://storage.test/object?signature=x',
          method: 'PUT',
          headers: {},
          expiresInSeconds: 300,
        },
      }),
      { status: 200 },
    );
  });

  const transport = new HttpMediaSyncTransport();
  const result = await transport.startUpload('media-123');

  if (result.remoteState !== 'UPLOADING') {
    throw new Error(
      `Expected remote state UPLOADING, received ${result.remoteState}.`,
    );
  }

  if (
    !capturedUrl.includes('/upload-start')
  ) {
    throw new Error(
      `Unexpected start path: ${capturedUrl}`,
    );
  }
}

/**
 * The server response is untrusted. A descriptor that cannot be used to
 * write exactly one object with a PUT must be rejected outright, never
 * handed to the byte uploader.
 */
async function testUnusableDescriptorsAreRejected(): Promise<
  void
> {
  const unusable: Array<[string, unknown]> = [
    [
      'missing url',
      {
        objectKey: 'k',
        method: 'PUT',
        headers: {},
        expiresInSeconds: 300,
      },
    ],
    [
      'missing object key',
      {
        url: 'https://storage.test/o',
        method: 'PUT',
        headers: {},
        expiresInSeconds: 300,
      },
    ],
    [
      'non-PUT method',
      {
        objectKey: 'k',
        url: 'https://storage.test/o',
        method: 'POST',
        headers: {},
        expiresInSeconds: 300,
      },
    ],
    [
      'missing expiry',
      {
        objectKey: 'k',
        url: 'https://storage.test/o',
        method: 'PUT',
        headers: {},
      },
    ],
    [
      'unusable expiry',
      {
        objectKey: 'k',
        url: 'https://storage.test/o',
        method: 'PUT',
        headers: {},
        expiresInSeconds: 'soon',
      },
    ],
  ];

  for (const [label, upload] of unusable) {
    mockFetch(async () =>
      new Response(
        JSON.stringify({
          attachment: {
            id: 'media-123',
            state: 'UPLOAD_AUTHORIZED',
          },
          upload,
        }),
        { status: 200 },
      ),
    );

    try {
      await new HttpMediaSyncTransport().authorizeUpload(
        'media-123',
      );
    } catch (error) {
      if (
        !(error instanceof MediaSyncTransportError) ||
        error.code !== 'INVALID_SERVER_RESPONSE'
      ) {
        throw new Error(
          `${label}: expected INVALID_SERVER_RESPONSE, received ${String(error)}.`,
        );
      }

      if (error.retryable) {
        throw new Error(
          `${label}: an unusable descriptor is not retryable.`,
        );
      }

      continue;
    }

    throw new Error(
      `${label}: an unusable descriptor was accepted.`,
    );
  }
}

async function testCompletion(): Promise<void> {
  mockFetch(async () =>
    new Response(
      JSON.stringify({
        attachment: {
          id: 'media-123',
          state: 'VERIFIED',
        },
        verified: true,
        verification: {
          verified: true,
          observedContentLength: 2048,
          observedContentType: 'image/jpeg',
          observedEtag: '"e1"',
          failure: null,
        },
      }),
      { status: 200 },
    ),
  );

  const transport = new HttpMediaSyncTransport();
  const result = await transport.completeUpload(
    'media-123',
  );

  if (!result.verified) {
    throw new Error('Completion did not report success.');
  }

  if (result.remoteState !== 'VERIFIED') {
    throw new Error(
      `Expected remote state VERIFIED, received ${result.remoteState}.`,
    );
  }

  if (result.failureCode !== null) {
    throw new Error(
      'A verified completion must not report a failure code.',
    );
  }
}

/**
 * A failed verification must surface the reason, so the pipeline can keep
 * the media recoverable and the artisan can be told what happened.
 */
async function testFailedCompletion(): Promise<void> {
  mockFetch(async () =>
    new Response(
      JSON.stringify({
        attachment: {
          id: 'media-123',
          state: 'FAILED',
        },
        verified: false,
        verification: {
          verified: false,
          observedContentLength: 512,
          observedContentType: 'image/jpeg',
          observedEtag: '"e1"',
          failure: {
            code: 'OBJECT_SIZE_MISMATCH',
            message:
              'Stored object size does not match the declared size.',
          },
        },
      }),
      { status: 200 },
    ),
  );

  const result =
    await new HttpMediaSyncTransport().completeUpload(
      'media-123',
    );

  if (result.verified) {
    throw new Error('A failed verification must not report success.');
  }

  if (result.remoteState !== 'FAILED') {
    throw new Error(
      `Expected remote state FAILED, received ${result.remoteState}.`,
    );
  }

  if (result.failureCode !== 'OBJECT_SIZE_MISMATCH') {
    throw new Error(
      `Expected the failure code to be preserved, received ${String(result.failureCode)}.`,
    );
  }

  if (!result.failureMessage) {
    throw new Error('A failure message must be preserved.');
  }
}

async function testCompletionRequiresVerification(): Promise<
  void
> {
  mockFetch(async () =>
    new Response(
      JSON.stringify({
        attachment: {
          id: 'media-123',
          state: 'VERIFIED',
        },
        verified: true,
      }),
      { status: 200 },
    ),
  );

  try {
    await new HttpMediaSyncTransport().completeUpload(
      'media-123',
    );
  } catch (error) {
    if (
      !(error instanceof MediaSyncTransportError) ||
      error.code !== 'INVALID_SERVER_RESPONSE'
    ) {
      throw new Error(
        `Expected INVALID_SERVER_RESPONSE, received ${String(error)}.`,
      );
    }

    return;
  }

  throw new Error(
    'A completion without a verification result was accepted.',
  );
}

/**
 * The media id is placed in the path, so it must be encoded rather than
 * concatenated.
 */
async function testMediaIdIsEncoded(): Promise<void> {
  let capturedUrl = '';

  mockFetch(async (input) => {
    capturedUrl = String(input);

    return new Response(
      JSON.stringify({
        attachment: { id: 'a/b', state: 'UPLOADING' },
        upload: {
          objectKey: 'k',
          url: 'https://storage.test/o',
          method: 'PUT',
          headers: {},
          expiresInSeconds: 300,
        },
      }),
      { status: 200 },
    );
  });

  await new HttpMediaSyncTransport().startUpload(
    'a/b?x=1',
  );

  if (
    !capturedUrl.includes(
      '/media/a%2Fb%3Fx%3D1/upload-start',
    )
  ) {
    throw new Error(
      `The media id was not encoded in the path: ${capturedUrl}`,
    );
  }
}

async function main(): Promise<void> {
  try {
    await testSuccess();
    await testRetryableServerFailure();
    await testPermanentClientFailure();
    await testNetworkFailure();
    await testUploadAuthorization();
    await testUploadStart();
    await testUnusableDescriptorsAreRejected();
    await testCompletion();
    await testFailedCompletion();
    await testCompletionRequiresVerification();
    await testMediaIdIsEncoded();

    console.log('MEDIA TRANSPORT TESTS PASSED');
  } finally {
    restoreFetch();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
