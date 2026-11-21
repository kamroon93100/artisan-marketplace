import { getApiBaseUrl } from '../config/api';
import { authorizationHeaders } from './authorization';
import type { EnqueueAiJobRequest, EnqueueAiJobResponse } from '@artisan-marketplace/contracts';

export class AiJobEnqueueTransportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiJobEnqueueTransportError';
  }
}

export type AiJobEnqueueTransport = {
  enqueue(
    productId: string,
    request: EnqueueAiJobRequest,
    idempotencyKey: string,
  ): Promise<EnqueueAiJobResponse>;
};

export class HttpAiJobEnqueueTransport implements AiJobEnqueueTransport {
  async enqueue(
    productId: string,
    request: EnqueueAiJobRequest,
    idempotencyKey: string,
  ): Promise<EnqueueAiJobResponse> {
    let response: Response;

    try {
      response = await fetch(
        `${getApiBaseUrl()}/catalog/products/${productId}/ai-jobs`,
        {
          method: 'POST',
          headers: {
            ...(await authorizationHeaders()),
            'content-type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify(request),
        },
      );
    } catch (error) {
      throw new AiJobEnqueueTransportError(
        error instanceof Error
          ? error.message
          : 'Network request failed.',
        'NETWORK_ERROR',
        true,
      );
    }

    let body: unknown = null;

    try {
      body = await response.json();
    } catch {
      // The status code remains authoritative when the server body is invalid.
    }

    if (response.ok) {
      const payload = body as {
        job?: unknown;
        deduplicated?: boolean;
      };

      if (!payload.job) {
        throw new AiJobEnqueueTransportError(
          'The API returned a successful response without a job.',
          'INVALID_SERVER_RESPONSE',
          false,
        );
      }

      return {
        job: payload.job as EnqueueAiJobResponse['job'],
        deduplicated: payload.deduplicated ?? false,
      };
    }

    const payload = body as {
      error?: {
        code?: string;
        message?: string;
      };
    };

    const code =
      payload.error?.code ?? `HTTP_${response.status}`;

    const message =
      payload.error?.message ??
      `AI job enqueue failed with HTTP ${response.status}.`;

    const retryable =
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500;

    throw new AiJobEnqueueTransportError(
      message,
      code,
      retryable,
    );
  }
}