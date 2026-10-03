import {
  HttpProductSyncTransport,
} from './product-sync-transport';
import { ProductSyncTransportError } from './product-sync-contract';

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
        product: {
          id: 'product-uuid-123',
        },
        deduplicated: false,
      }),
      {
        status: 201,
        headers: {
          'content-type': 'application/json',
        },
      },
    );
  });

  const transport = new HttpProductSyncTransport();

  const result = await transport.createProduct({
    title: null,
    idempotencyKey: 'product:local-123',
  });

  if (result.remoteProductId !== 'product-uuid-123') {
    throw new Error(
      'Product transport did not return the remote product id.',
    );
  }

  if (capturedUrl !== 'http://localhost:8787/catalog/products') {
    throw new Error(
      'Product transport constructed the wrong API URL.',
    );
  }

  const headers = new Headers(capturedInit?.headers);

  if (
    capturedInit?.method !== 'POST' ||
    headers.get('idempotency-key') !== 'product:local-123'
  ) {
    throw new Error(
      'Product transport did not send the expected request.',
    );
  }
}

async function testRetryableFailure(): Promise<void> {
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

  const transport = new HttpProductSyncTransport();

  try {
    await transport.createProduct({
      title: null,
      idempotencyKey: 'product:retry',
    });

    throw new Error(
      'Expected product sync to fail.',
    );
  } catch (error) {
    if (!(error instanceof ProductSyncTransportError)) {
      throw new Error(
        'Expected ProductSyncTransportError.',
      );
    }

    if (!error.retryable) {
      throw new Error(
        'HTTP 503 must be retryable.',
      );
    }
  }
}

async function main(): Promise<void> {
  try {
    await testSuccess();
    await testRetryableFailure();

    console.log('PRODUCT TRANSPORT TESTS PASSED');
  } finally {
    restoreFetch();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
