import type {
  AiFailureCode,
} from '@artisan-marketplace/contracts';
import { AiProviderError, isRetryableFailure, truncateDiagnostic } from '../domain/ai-error.js';
import type {
  CatalogAiAttribution,
  CatalogAiProvider,
  CatalogAiRequest,
  CatalogAiResult,
} from '../domain/catalog-ai-provider.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MODEL_VERSION = '2024-07-18';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 2_000;

interface OpenAiChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  response_format?: { type: 'json_object' };
  max_tokens?: number;
  temperature?: number;
}

interface OpenAiChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string;
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAiErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

function buildSystemPrompt(): string {
  return `You are an expert artisan marketplace assistant. Given a product's current state and optional transcription/media, propose values for the following fields: title, description, category, materials, and per-field confidence scores.

Return ONLY a JSON object with this exact structure:
{
  "title": "string (max 200 chars)",
  "description": "string (max 4000 chars)",
  "category": "string (max 80 chars)",
  "materials": ["string", ...] (max 20 entries, each max 80 chars),
  "fieldConfidence": {
    "title": 0.0-1.0,
    "description": 0.0-1.0,
    "category": 0.0-1.0,
    "materials": 0.0-1.0
  }
}

Rules:
- If a field cannot be determined, omit it from the response (do not include null or empty string).
- Materials should be specific and relevant to the product.
- Confidence scores must be numbers between 0 and 1.
- Do not include any fields outside the schema.
- The description should be detailed and distinct from the title.
- Category should be a single specific category term.`;
}

function buildUserPrompt(request: CatalogAiRequest): string {
  const { input, media, promptVersion, schemaVersion, pipelineVersion } = request;

  const lines: string[] = [
    `Product ID: ${input.productId}`,
    `Prompt Version: ${promptVersion}`,
    `Schema Version: ${schemaVersion}`,
    `Pipeline Version: ${pipelineVersion}`,
    '',
    'Current Product State:',
    `  Title: ${input.product.title ?? '(none)'}`,
    `  Description: ${input.product.description ?? '(none)'}`,
    `  Category: ${input.product.category ?? '(none)'}`,
    `  Materials: ${input.product.materials.length > 0 ? input.product.materials.join(', ') : '(none)'}`,
    '',
    `Transcription: ${input.transcription ?? '(none)'}`,
    `Media References: ${media.length > 0 ? media.map((m) => `${m.kind}:${m.mediaId}`).join(', ') : '(none)'}`,
  ];

  return lines.join('\n');
}

export class OpenAiCatalogAiProvider implements CatalogAiProvider {
  readonly attribution: CatalogAiAttribution;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly modelVersion: string;

  constructor(env: {
    OPENAI_API_KEY: string;
    AI_PROVIDER_MODEL?: string;
    AI_PROVIDER_VERSION?: string;
  }) {
    if (!env.OPENAI_API_KEY || !env.OPENAI_API_KEY.trim()) {
      throw new Error('OPENAI_API_KEY is required for OpenAiCatalogAiProvider');
    }

    this.apiKey = env.OPENAI_API_KEY.trim();
    this.model = env.AI_PROVIDER_MODEL?.trim() || DEFAULT_MODEL;
    this.modelVersion = env.AI_PROVIDER_VERSION?.trim() || DEFAULT_MODEL_VERSION;

    this.attribution = {
      provider: 'openai',
      model: this.model,
      modelVersion: this.modelVersion,
    };
  }

  async generateCatalogDraft(request: CatalogAiRequest): Promise<CatalogAiResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.callOpenAi(request, controller.signal);
      return this.parseResponse(response);
    } catch (error) {
      throw this.normalizeError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callOpenAi(
    request: CatalogAiRequest,
    signal: AbortSignal,
  ): Promise<OpenAiChatCompletionResponse> {
    const payload: OpenAiChatCompletionRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(request) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const errorBody = await this.safeJson<OpenAiErrorResponse>(response);
      throw new OpenAiHttpError(response.status, errorBody?.error?.message ?? response.statusText);
    }

    return this.safeJson<OpenAiChatCompletionResponse>(response) as Promise<OpenAiChatCompletionResponse>;
  }

  private parseResponse(response: OpenAiChatCompletionResponse): CatalogAiResult {
    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new AiProviderError(
        'PROVIDER_OUTPUT_EMPTY',
        'OpenAI response contained no content.',
        'choices[0].message.content was empty or missing',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(choice.message.content);
    } catch (error) {
      throw new AiProviderError(
        'PROVIDER_OUTPUT_NOT_AN_OBJECT',
        'OpenAI response content was not valid JSON.',
        error instanceof Error ? error.message : 'JSON parse failed',
      );
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new AiProviderError(
        'PROVIDER_OUTPUT_NOT_AN_OBJECT',
        'OpenAI response content was not a JSON object.',
        `Received: ${typeof parsed}`,
      );
    }

    return parsed;
  }

  private normalizeError(error: unknown): AiProviderError {
    if (error instanceof AiProviderError) {
      return error;
    }

    if (error instanceof OpenAiHttpError) {
      return this.mapHttpError(error);
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return new AiProviderError(
        'PROVIDER_TIMEOUT',
        'OpenAI request timed out after 30 seconds.',
        'Request aborted due to timeout',
      );
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return new AiProviderError(
        'PROVIDER_UNAVAILABLE',
        'OpenAI API could not be reached.',
        error.message,
      );
    }

    return new AiProviderError(
      'DEPENDENCY_FAILED',
      'OpenAI provider failed for an unknown reason.',
      error instanceof Error ? error.message : String(error),
    );
  }

  private mapHttpError(error: OpenAiHttpError): AiProviderError {
    const status = error.status;
    const diagnostic = truncateDiagnostic(error.message);

    switch (status) {
      case 401:
      case 403:
        return new AiProviderError(
          'PROVIDER_AUTHENTICATION',
          'OpenAI authentication failed.',
          diagnostic,
        );
      case 429:
        return new AiProviderError(
          'PROVIDER_RATE_LIMITED',
          'OpenAI rate limit exceeded.',
          diagnostic,
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new AiProviderError(
          'PROVIDER_UNAVAILABLE',
          `OpenAI service returned ${status}.`,
          diagnostic,
        );
      default:
        return new AiProviderError(
          'DEPENDENCY_FAILED',
          `OpenAI API returned ${status}.`,
          diagnostic,
        );
    }
  }

  private async safeJson<T>(response: Response): Promise<T | null> {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }
}

class OpenAiHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`OpenAI HTTP ${status}: ${message}`);
    this.name = 'OpenAiHttpError';
  }
}