import type { ProductState } from '@artisan-marketplace/contracts';

const PRODUCT_STATES: readonly ProductState[] = [
  'LOCAL_DRAFT',
  'PENDING_SYNC',
  'SYNCED',
  'REVIEW_REQUIRED',
  'APPROVED',
  'PUBLISHED',
  'ARCHIVED',
  'CONFLICT',
  'ACTION_REQUIRED',
];
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

  async getOwnedProductState(
    productId: string,
  ): Promise<ProductState> {
    let response: Response;

    try {
      response = await fetch(
        `${getApiBaseUrl()}/catalog/products/${encodeURIComponent(productId)}`,
        {
          method: 'GET',
          headers: {
            ...(await authorizationHeaders()),
          },
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
      // The HTTP status remains authoritative.
    }

    const payload = (body ?? {}) as {
      product?: {
        state?: unknown;
      };
      error?: {
        code?: string;
        message?: string;
      };
    };

    if (!response.ok) {
      const code = payload.error?.code ?? `HTTP_${response.status}`;
      const message =
        payload.error?.message ??
        `Product state lookup failed with HTTP ${response.status}.`;

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

    const state = payload.product?.state;

    if (
      typeof state !== 'string' ||
      !PRODUCT_STATES.includes(state as ProductState)
    ) {
      throw new ProductSyncTransportError(
        'The API returned an invalid product state.',
        'INVALID_SERVER_RESPONSE',
        false,
      );
    }

    return state as ProductState;
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
