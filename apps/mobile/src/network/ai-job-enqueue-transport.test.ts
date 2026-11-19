import {
  HttpAiJobEnqueueTransport,
  AiJobEnqueueTransportError,
} from './ai-job-enqueue-transport';

process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';

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
    throw new Error(`AI JOB ENQUEUE TRANSPORT TEST FAILED: ${message}`);
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

const validJobResponse = {
  job: {
    id: 'job-123',
    productId: 'product-456',
    ownerId: 'owner-789',
    jobType: 'CATALOG_FIELD_GENERATION',
    state: 'QUEUED',
    provider: 'test-provider',
    model: 'test-model',
    modelVersion: '1.0',
    promptVersion: 'catalog-field-generation/1',
    schemaVersion: 'catalog-proposal/1',
    pipelineVersion: 'catalog-field-generation/1',
    input: {
      productId: 'product-456',
      capturedAt: '2024-01-01T00:00:00.000Z',
      product: {
        title: 'Test Product',
        description: 'A test product',
        category: 'Jewelry',
        materials: ['Gold', 'Diamond'],
      },
      media: [
        { mediaId: 'media-1', kind: 'IMAGE' },
      ],
      transcription: 'This is a beautiful handmade necklace.',
    },
    inputHash: 'hash-123',
    attemptCount: 0,
    maxAttempts: 3,
    correlationId: 'corr-123',
    causationId: null,
    idempotencyKey: 'idem-key-123',
    failure: null,
    nextAttemptAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
  },
  deduplicated: false,
};

async function testEnqueuesAiJobSuccessfully(): Promise<void> {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  mockFetch(async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return jsonResponse(validJobResponse, 201);
  });

  const transport = new HttpAiJobEnqueueTransport();
  const result = await transport.enqueue('product-456', {
    media: [{ mediaId: 'media-1', kind: 'IMAGE' }],
    transcription: 'This is a beautiful handmade necklace.',
  }, 'idem-key-123');

  expect(result.job.id === 'job-123', 'returns job id');
  expect(result.deduplicated === false, 'deduplicated is false');

  expect(
    capturedUrl === 'https://api.example.com/products/product-456/ai-jobs',
    `calls correct URL (received: ${capturedUrl})`,
  );
  expect(capturedInit?.method === 'POST', 'uses POST method');
  expect(
    (capturedInit?.headers as Record<string, string>)['content-type'] === 'application/json',
    'sets content-type',
  );
  expect(
    (capturedInit?.headers as Record<string, string>)['idempotency-key'] === 'idem-key-123',
    'sets idempotency key',
  );

  const body = JSON.parse(String(capturedInit?.body));
  expect(body.media[0].mediaId === 'media-1', 'includes media in body');
  expect(body.transcription === 'This is a beautiful handmade necklace.', 'includes transcription in body');

  restoreFetch();
}

async function testReturnsDeduplicatedResponse(): Promise<void> {
  const deduplicatedResponse = { ...validJobResponse, deduplicated: true };

  mockFetch(async () => jsonResponse(deduplicatedResponse, 200));

  const transport = new HttpAiJobEnqueueTransport();
  const result = await transport.enqueue('product-456', {
    media: [],
    transcription: 'test',
  }, 'idem-key-123');

  expect(result.deduplicated === true, 'deduplicated is true');

  restoreFetch();
}

async function testThrowsNetworkErrorOnFetchFailure(): Promise<void> {
  mockFetch(async () => {
    throw new Error('Network error');
  });

  const transport = new HttpAiJobEnqueueTransport();
  let caught: unknown;

  try {
    await transport.enqueue('product-456', {}, 'idem-key-123');
  } catch (error) {
    caught = error;
  }

  expect(caught instanceof AiJobEnqueueTransportError, 'throws AiJobEnqueueTransportError');
  expect(
    caught instanceof AiJobEnqueueTransportError && caught.code === 'NETWORK_ERROR',
    'code is NETWORK_ERROR',
  );
  expect(
    caught instanceof AiJobEnqueueTransportError && caught.retryable === true,
    'retryable is true',
  );

  restoreFetch();
}

async function testThrowsInvalidServerResponseWhenMissingJob(): Promise<void> {
  mockFetch(async () => jsonResponse({ deduplicated: false }, 201));

  const transport = new HttpAiJobEnqueueTransport();
  let caught: unknown;

  try {
    await transport.enqueue('product-456', {}, 'idem-key-123');
  } catch (error) {
    caught = error;
  }

  expect(caught instanceof AiJobEnqueueTransportError, 'throws AiJobEnqueueTransportError');
  expect(
    caught instanceof AiJobEnqueueTransportError && caught.code === 'INVALID_SERVER_RESPONSE',
    'code is INVALID_SERVER_RESPONSE',
  );
  expect(
    caught instanceof AiJobEnqueueTransportError && caught.retryable === false,
    'retryable is false',
  );

  restoreFetch();
}

async function testThrowsErrorWithServerErrorCode(): Promise<void> {
  mockFetch(async () =>
    jsonResponse(
      {
        error: {
          code: 'CONFLICT',
          message: 'Product not in eligible state',
        },
      },
      409,
    ),
  );

  const transport = new HttpAiJobEnqueueTransport();
  let caught: unknown;

  try {
    await transport.enqueue('product-456', {}, 'idem-key-123');
  } catch (error) {
    caught = error;
  }

  expect(caught instanceof AiJobEnqueueTransportError, 'throws AiJobEnqueueTransportError');
  expect(
    caught instanceof AiJobEnqueueTransportError && caught.code === 'CONFLICT',
    'code is CONFLICT',
  );
  expect(
    caught instanceof AiJobEnqueueTransportError && caught.retryable === false,
    'retryable is false',
  );

  restoreFetch();
}

async function testMarks429AsRetryable(): Promise<void> {
  mockFetch(async () =>
    jsonResponse(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
        },
      },
      429,
    ),
  );

  const transport = new HttpAiJobEnqueueTransport();
  let caught: unknown;

  try {
    await transport.enqueue('product-456', {}, 'idem-key-123');
  } catch (error) {
    caught = error;
  }

  expect(
    caught instanceof AiJobEnqueueTransportError && caught.retryable === true,
    '429 is retryable',
  );

  restoreFetch();
}

async function testMarks5xxAsRetryable(): Promise<void> {
  mockFetch(async () =>
    jsonResponse(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Server error',
        },
      },
      500,
    ),
  );

  const transport = new HttpAiJobEnqueueTransport();
  let caught: unknown;

  try {
    await transport.enqueue('product-456', {}, 'idem-key-123');
  } catch (error) {
    caught = error;
  }

  expect(
    caught instanceof AiJobEnqueueTransportError && caught.retryable === true,
    '5xx is retryable',
  );

  restoreFetch();
}

async function testMarks408AsRetryable(): Promise<void> {
  mockFetch(async () =>
    jsonResponse(
      {
        error: {
          code: 'TIMEOUT',
          message: 'Request timeout',
        },
      },
      408,
    ),
  );

  const transport = new HttpAiJobEnqueueTransport();
  let caught: unknown;

  try {
    await transport.enqueue('product-456', {}, 'idem-key-123');
  } catch (error) {
    caught = error;
  }

  expect(
    caught instanceof AiJobEnqueueTransportError && caught.retryable === true,
    '408 is retryable',
  );

  restoreFetch();
}

async function testIncludesMediaAndTranscriptionInRequest(): Promise<void> {
  let capturedInit: RequestInit | undefined;

  mockFetch(async (_input, init) => {
    capturedInit = init;
    return jsonResponse(validJobResponse, 201);
  });

  const transport = new HttpAiJobEnqueueTransport();
  await transport.enqueue('product-456', {
    media: [
      { mediaId: 'media-1', kind: 'IMAGE' },
      { mediaId: 'media-2', kind: 'AUDIO' },
    ],
    transcription: 'Voice description here',
  }, 'idem-key-123');

  const body = JSON.parse(String(capturedInit?.body));
  expect(body.media.length === 2, 'includes two media items');
  expect(body.media[0].mediaId === 'media-1', 'first media id is correct');
  expect(body.media[0].kind === 'IMAGE', 'first media kind is IMAGE');
  expect(body.media[1].mediaId === 'media-2', 'second media id is correct');
  expect(body.media[1].kind === 'AUDIO', 'second media kind is AUDIO');
  expect(body.transcription === 'Voice description here', 'transcription is included');

  restoreFetch();
}

async function testOmitsMediaAndTranscriptionWhenNotProvided(): Promise<void> {
  let capturedInit: RequestInit | undefined;

  mockFetch(async (_input, init) => {
    capturedInit = init;
    return jsonResponse(validJobResponse, 201);
  });

  const transport = new HttpAiJobEnqueueTransport();
  await transport.enqueue('product-456', {}, 'idem-key-123');

  const body = JSON.parse(String(capturedInit?.body));
  expect(body.media === undefined, 'media is omitted');
  expect(body.transcription === undefined, 'transcription is omitted');

  restoreFetch();
}

async function main(): Promise<void> {
  try {
    await testEnqueuesAiJobSuccessfully();
    await testReturnsDeduplicatedResponse();
    await testThrowsNetworkErrorOnFetchFailure();
    await testThrowsInvalidServerResponseWhenMissingJob();
    await testThrowsErrorWithServerErrorCode();
    await testMarks429AsRetryable();
    await testMarks5xxAsRetryable();
    await testMarks408AsRetryable();
    await testIncludesMediaAndTranscriptionInRequest();
    await testOmitsMediaAndTranscriptionWhenNotProvided();
  } finally {
    restoreFetch();
  }

  console.log('AI JOB ENQUEUE TRANSPORT TESTS PASSED');
}

void main().catch((error) => {
  console.error('AI JOB ENQUEUE TRANSPORT TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});