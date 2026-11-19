import type {
  AiFailureCode,
} from '@artisan-marketplace/contracts';
import { OpenAiCatalogAiProvider } from './openai-catalog-ai-provider.js';
import type { CatalogAiRequest } from '../domain/catalog-ai-provider.js';
import { AiProviderError, isRetryableFailure } from '../domain/ai-error.js';

const MINIMAL_REQUEST: CatalogAiRequest = {
  requestId: 'req-1',
  correlationId: 'corr-1',
  jobId: 'job-1',
  jobType: 'CATALOG_FIELD_GENERATION',
  productId: 'prod-1',
  promptVersion: 'catalog-field-generation/1',
  schemaVersion: 'catalog-proposal/1',
  pipelineVersion: 'catalog-field-generation/1',
  input: {
    productId: 'prod-1',
    capturedAt: new Date().toISOString(),
    product: {
      title: 'Test Basket',
      description: 'A handmade basket',
      category: 'basketry',
      materials: ['bamboo'],
    },
    media: [],
    transcription: 'A woven basket',
  },
  media: [],
};

function makeProvider(
  overrides: Partial<{
    OPENAI_API_KEY: string;
    AI_PROVIDER_MODEL: string;
    AI_PROVIDER_VERSION: string;
  }> = {},
) {
  return new OpenAiCatalogAiProvider({
    OPENAI_API_KEY: overrides.OPENAI_API_KEY ?? 'sk-test-key',
    AI_PROVIDER_MODEL: overrides.AI_PROVIDER_MODEL,
    AI_PROVIDER_VERSION: overrides.AI_PROVIDER_VERSION,
  });
}

function createMockResponse(
  status: number,
  body: unknown,
  statusText?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: statusText || (status >= 400 ? 'Error' : 'OK'),
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(
  responder: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = responder as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function main(): Promise<void> {
  // Test 1: Constructor validates required OPENAI_API_KEY
  await runTest('Constructor throws when OPENAI_API_KEY is missing', async () => {
    try {
      new OpenAiCatalogAiProvider({ OPENAI_API_KEY: '' });
      throw new Error('Expected constructor to throw');
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('OPENAI_API_KEY is required'))) {
        throw error;
      }
    }
  });

  // Test 2: Constructor throws when OPENAI_API_KEY is whitespace only
  await runTest('Constructor throws when OPENAI_API_KEY is whitespace', async () => {
    try {
      new OpenAiCatalogAiProvider({ OPENAI_API_KEY: '   ' });
      throw new Error('Expected constructor to throw');
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('OPENAI_API_KEY is required'))) {
        throw error;
      }
    }
  });

  // Test 3: Attribution is correct with defaults
  await runTest('Attribution uses defaults when not specified', async () => {
    const provider = makeProvider();
    if (provider.attribution.provider !== 'openai') {
      throw new Error(`Expected provider 'openai', got '${provider.attribution.provider}'`);
    }
    if (provider.attribution.model !== 'gpt-4o-mini') {
      throw new Error(`Expected model 'gpt-4o-mini', got '${provider.attribution.model}'`);
    }
    if (provider.attribution.modelVersion !== '2024-07-18') {
      throw new Error(`Expected modelVersion '2024-07-18', got '${provider.attribution.modelVersion}'`);
    }
  });

  // Test 4: Attribution uses custom model and version
  await runTest('Attribution uses custom model and version', async () => {
    const provider = makeProvider({
      AI_PROVIDER_MODEL: 'gpt-4o',
      AI_PROVIDER_VERSION: '2024-11-20',
    });
    if (provider.attribution.model !== 'gpt-4o') {
      throw new Error(`Expected model 'gpt-4o', got '${provider.attribution.model}'`);
    }
    if (provider.attribution.modelVersion !== '2024-11-20') {
      throw new Error(`Expected modelVersion '2024-11-20', got '${provider.attribution.modelVersion}'`);
    }
  });

  // Test 5: Successful request returns parsed JSON
  await runTest('Successful request returns parsed JSON', async () => {
    const expectedResult = {
      title: 'Handwoven Basket',
      description: 'A beautiful handwoven basket for storage.',
      category: 'basketry',
      materials: ['bamboo', 'rattan'],
      fieldConfidence: {
        title: 0.95,
        description: 0.9,
        category: 0.85,
        materials: 0.8,
      },
    };

    const restore = mockFetch(async () => createMockResponse(200, {
      id: 'chatcmpl-123',
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify(expectedResult),
          },
          finish_reason: 'stop',
          index: 0,
        },
      ],
    }));

    try {
      const provider = makeProvider();
      const result = await provider.generateCatalogDraft(MINIMAL_REQUEST);
      if (JSON.stringify(result) !== JSON.stringify(expectedResult)) {
        throw new Error(`Result mismatch: ${JSON.stringify(result)}`);
      }
    } finally {
      restore();
    }
  });

  // Test 6: Non-JSON response throws PROVIDER_OUTPUT_NOT_AN_OBJECT
  await runTest('Non-JSON response throws PROVIDER_OUTPUT_NOT_AN_OBJECT', async () => {
    const restore = mockFetch(async () => createMockResponse(200, {
      id: 'chatcmpl-123',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'not json',
          },
          finish_reason: 'stop',
          index: 0,
        },
      ],
    }));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_OUTPUT_NOT_AN_OBJECT')) {
        throw error;
      }
    } finally {
      restore();
    }
  });

  // Test 7: Empty response throws PROVIDER_OUTPUT_EMPTY
  await runTest('Empty response throws PROVIDER_OUTPUT_EMPTY', async () => {
    const restore = mockFetch(async () => createMockResponse(200, {
      id: 'chatcmpl-123',
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
          },
          finish_reason: 'stop',
          index: 0,
        },
      ],
    }));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_OUTPUT_EMPTY')) {
        throw error;
      }
    } finally {
      restore();
    }
  });

  // Test 8: Missing choices throws PROVIDER_OUTPUT_EMPTY
  await runTest('Missing choices throws PROVIDER_OUTPUT_EMPTY', async () => {
    const restore = mockFetch(async () => createMockResponse(200, {
      id: 'chatcmpl-123',
      choices: [],
    }));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_OUTPUT_EMPTY')) {
        throw error;
      }
    } finally {
      restore();
    }
  });

  // Test 9: 401 maps to PROVIDER_AUTHENTICATION (non-retryable)
  await runTest('401 maps to PROVIDER_AUTHENTICATION', async () => {
    const restore = mockFetch(async () => createMockResponse(401, {
      error: { message: 'Invalid API key', type: 'authentication_error' },
    }, 'Unauthorized'));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_AUTHENTICATION')) {
        throw error;
      }
      if (isRetryableFailure(error.code)) {
        throw new Error('PROVIDER_AUTHENTICATION should not be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 10: 403 maps to PROVIDER_AUTHENTICATION (non-retryable)
  await runTest('403 maps to PROVIDER_AUTHENTICATION', async () => {
    const restore = mockFetch(async () => createMockResponse(403, {
      error: { message: 'Access denied', type: 'permission_error' },
    }, 'Forbidden'));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_AUTHENTICATION')) {
        throw error;
      }
      if (isRetryableFailure(error.code)) {
        throw new Error('PROVIDER_AUTHENTICATION should not be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 11: 429 maps to PROVIDER_RATE_LIMITED (retryable)
  await runTest('429 maps to PROVIDER_RATE_LIMITED (retryable)', async () => {
    const restore = mockFetch(async () => createMockResponse(429, {
      error: { message: 'Rate limit exceeded', type: 'rate_limit_error' },
    }, 'Too Many Requests'));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_RATE_LIMITED')) {
        throw error;
      }
      if (!isRetryableFailure(error.code)) {
        throw new Error('PROVIDER_RATE_LIMITED should be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 12: 500 maps to PROVIDER_UNAVAILABLE (retryable)
  await runTest('500 maps to PROVIDER_UNAVAILABLE (retryable)', async () => {
    const restore = mockFetch(async () => createMockResponse(500, {
      error: { message: 'Internal error', type: 'server_error' },
    }, 'Internal Server Error'));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_UNAVAILABLE')) {
        throw error;
      }
      if (!isRetryableFailure(error.code)) {
        throw new Error('PROVIDER_UNAVAILABLE should be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 13: 502 maps to PROVIDER_UNAVAILABLE (retryable)
  await runTest('502 maps to PROVIDER_UNAVAILABLE (retryable)', async () => {
    const restore = mockFetch(async () => createMockResponse(502, {
      error: { message: 'Bad gateway', type: 'server_error' },
    }, 'Bad Gateway'));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_UNAVAILABLE')) {
        throw error;
      }
      if (!isRetryableFailure(error.code)) {
        throw new Error('PROVIDER_UNAVAILABLE should be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 14: 503 maps to PROVIDER_UNAVAILABLE (retryable)
  await runTest('503 maps to PROVIDER_UNAVAILABLE (retryable)', async () => {
    const restore = mockFetch(async () => createMockResponse(503, {
      error: { message: 'Service unavailable', type: 'server_error' },
    }, 'Service Unavailable'));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_UNAVAILABLE')) {
        throw error;
      }
      if (!isRetryableFailure(error.code)) {
        throw new Error('PROVIDER_UNAVAILABLE should be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 15: 504 maps to PROVIDER_UNAVAILABLE (retryable)
  await runTest('504 maps to PROVIDER_UNAVAILABLE (retryable)', async () => {
    const restore = mockFetch(async () => createMockResponse(504, {
      error: { message: 'Gateway timeout', type: 'server_error' },
    }, 'Gateway Timeout'));

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_UNAVAILABLE')) {
        throw error;
      }
      if (!isRetryableFailure(error.code)) {
        throw new Error('PROVIDER_UNAVAILABLE should be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 16: Network error maps to PROVIDER_UNAVAILABLE (retryable)
  await runTest('Network error maps to PROVIDER_UNAVAILABLE (retryable)', async () => {
    const restore = mockFetch(async () => {
      throw new TypeError('fetch failed');
    });

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_UNAVAILABLE')) {
        throw error;
      }
      if (!isRetryableFailure(error.code)) {
        throw new Error('PROVIDER_UNAVAILABLE should be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 17: Timeout maps to PROVIDER_TIMEOUT (retryable)
  await runTest('Timeout maps to PROVIDER_TIMEOUT (retryable)', async () => {
    const restore = mockFetch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new DOMException('Aborted', 'AbortError');
    });

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'PROVIDER_TIMEOUT')) {
        throw error;
      }
      if (!isRetryableFailure(error.code)) {
        throw new Error('PROVIDER_TIMEOUT should be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 18: Unknown error maps to DEPENDENCY_FAILED (non-retryable)
  await runTest('Unknown error maps to DEPENDENCY_FAILED', async () => {
    const restore = mockFetch(async () => {
      throw new Error('Some unknown error');
    });

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      throw new Error('Expected error to be thrown');
    } catch (error) {
      if (!(error instanceof AiProviderError && error.code === 'DEPENDENCY_FAILED')) {
        throw error;
      }
      if (isRetryableFailure(error.code)) {
        throw new Error('DEPENDENCY_FAILED should not be retryable');
      }
    } finally {
      restore();
    }
  });

  // Test 19: Request uses correct model from env
  await runTest('Request uses correct model from env', async () => {
    let capturedModel: string | null = null;

    const restore = mockFetch(async (input, init) => {
      const body = JSON.parse(init?.body as string);
      capturedModel = body.model;
      return createMockResponse(200, {
        id: 'chatcmpl-123',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ title: 'Test' }),
            },
            finish_reason: 'stop',
            index: 0,
          },
        ],
      });
    });

    try {
      const provider = makeProvider({ AI_PROVIDER_MODEL: 'gpt-4o' });
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      if (capturedModel !== 'gpt-4o') {
        throw new Error(`Expected model 'gpt-4o', got '${capturedModel}'`);
      }
    } finally {
      restore();
    }
  });

  // Test 20: Request includes system and user prompts
  await runTest('Request includes system and user prompts', async () => {
    const capturedMessages = { value: null as Array<{ role: string; content: string }> | null };

    const restore = mockFetch(async (input, init) => {
      const body = JSON.parse(init?.body as string);
      const messages = body.messages as Array<{ role: string; content: string }>;
      capturedMessages.value = messages;
      return createMockResponse(200, {
        id: 'chatcmpl-123',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ title: 'Test' }),
            },
            finish_reason: 'stop',
            index: 0,
          },
        ],
      });
    });

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      if (!capturedMessages.value || capturedMessages.value.length !== 2) {
        throw new Error(`Expected 2 messages, got ${capturedMessages.value?.length ?? 0}`);
      }
      if (capturedMessages.value[0].role !== 'system') {
        throw new Error(`First message should be system, got ${capturedMessages.value[0].role}`);
      }
      if (capturedMessages.value[1].role !== 'user') {
        throw new Error(`Second message should be user, got ${capturedMessages.value[1].role}`);
      }
      if (!capturedMessages.value[0].content.includes('expert artisan marketplace assistant')) {
        throw new Error('System prompt missing expected content');
      }
      if (!capturedMessages.value[1].content.includes('Test Basket')) {
        throw new Error('User prompt missing product info');
      }
    } finally {
      restore();
    }
  });

  // Test 21: Request includes response_format json_object
  await runTest('Request includes response_format json_object', async () => {
    let capturedFormat: unknown = null;

    const restore = mockFetch(async (input, init) => {
      const body = JSON.parse(init?.body as string);
      capturedFormat = body.response_format;
      return createMockResponse(200, {
        id: 'chatcmpl-123',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ title: 'Test' }),
            },
            finish_reason: 'stop',
            index: 0,
          },
        ],
      });
    });

    try {
      const provider = makeProvider();
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      if (capturedFormat !== undefined && typeof capturedFormat === 'object' && capturedFormat !== null) {
        const format = capturedFormat as { type?: string };
        if (format.type !== 'json_object') {
          throw new Error(`Expected response_format.type 'json_object', got '${format.type}'`);
        }
      } else {
        throw new Error('response_format not found in request');
      }
    } finally {
      restore();
    }
  });

  // Test 22: Request includes Authorization header with Bearer token
  await runTest('Request includes Authorization header with Bearer token', async () => {
    let capturedAuth: string | null = null;

    const restore = mockFetch(async (input, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      capturedAuth = headers?.authorization ?? headers?.Authorization ?? null;
      return createMockResponse(200, {
        id: 'chatcmpl-123',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ title: 'Test' }),
            },
            finish_reason: 'stop',
            index: 0,
          },
        ],
      });
    });

    try {
      const provider = makeProvider({ OPENAI_API_KEY: 'sk-test-key-123' });
      await provider.generateCatalogDraft(MINIMAL_REQUEST);
      if (capturedAuth !== 'Bearer sk-test-key-123') {
        throw new Error(`Expected 'Bearer sk-test-key-123', got '${capturedAuth}'`);
      }
    } finally {
      restore();
    }
  });

  console.log('\n✅ All OpenAI Catalog AI Provider tests passed!');
}

void main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exitCode = 1;
});