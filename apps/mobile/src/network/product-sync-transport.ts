import { getApiBaseUrl } from '../config/api';
import { authorizationHeaders } from './authorization';
import {
  ProductSyncTransportError,
  type CreateProductSyncRequest,
  type CreateProductSyncResponse,
  type ProductSyncTransport,
  type SyncableProductState,
} from './product-sync-contract';

export class HttpProductSyncTransport
  implements ProductSyncTransport
{
  async createProduct(
    request: CreateProductSyncRequest,
  ): Promise<CreateProductSyncResponse> {
    let response: Response;

    try {
      response = await fetch(
        `${getApiBaseUrl()}/catalog/products`,
        {
          method: 'POST',
          headers: {
            ...(await authorizationHeaders()),
            'content-type': 'application/json',
            'idempotency-key': request.idempotencyKey,
          },
          body: JSON.stringify({
            ...(request.title !== null
              ? { title: request.title }
              : {}),
          }),
        },
      );
    } catch (error) {
      throw new ProductSyncTransportError(
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
        product?: {
          id?: string;
        };
      };

      if (!payload.product?.id) {
        throw new ProductSyncTransportError(
          'The API returned a successful response without a product id.',
          'INVALID_SERVER_RESPONSE',
          false,
        );
      }

      return {
        remoteProductId: payload.product.id,
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
      `Product sync failed with HTTP ${response.status}.`;

    const retryable =
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500;

    throw new ProductSyncTransportError(
      message,
      code,
      retryable,
    );
  }

  async transitionProduct(
    productId: string,
    state: SyncableProductState,
  ): Promise<void> {
    let response: Response;

    try {
      response = await fetch(
        `${getApiBaseUrl()}/catalog/products/${productId}/transition`,
        {
          method: 'POST',
          headers: {
            ...(await authorizationHeaders()),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ state }),
        },
      );
    } catch (error) {
      throw new ProductSyncTransportError(
        error instanceof Error
          ? error.message
          : 'Network request failed.',
        'NETWORK_ERROR',
        true,
      );
    }

    if (response.ok) {
      return;
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Status code remains authoritative when response body is invalid.
    }

    const payload = body as {
      error?: {
        code?: string;
        message?: string;
      };
    };

    const code =
      payload?.error?.code ?? `HTTP_${response.status}`;
    const message =
      payload?.error?.message ??
      `Product state transition failed with HTTP ${response.status}.`;
    const retryable =
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500;

    throw new ProductSyncTransportError(
      message,
      code,
      retryable,
    );
  }
}
