import type {
  CreateMediaAttachmentRequest,
  CreateMediaAttachmentResponse,
  MediaCompletionResponse,
  MediaSyncTransport,
  MediaUploadDescriptor,
  UploadAuthorizationResponse,
} from '../sync/media-sync-contract';
import { getApiBaseUrl } from '../config/api';
import { authorizationHeaders } from './authorization';
import { MediaSyncTransportError } from '../sync/media-sync-contract';

type Json = Record<string, unknown>;

function asString(
  value: unknown,
): string | null {
  return typeof value === 'string' && value.trim()
    ? value
    : null;
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export class HttpMediaSyncTransport
  implements MediaSyncTransport
{
  /**
   * Performs a POST and returns the parsed body.
   *
   * Every server response is untrusted input, so an unusable success
   * body is reported as a non-retryable invalid response rather than
   * being allowed to surface later as a confusing failure.
   */
  private async postJson(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Json> {
    let response: Response;

    try {
      response = await fetch(
        `${getApiBaseUrl()}${path}`,
        {
          method: 'POST',
          headers: {
            ...(await authorizationHeaders()),
            ...(body === undefined
              ? {}
              : {
                  'content-type':
                    'application/json',
                }),
            ...headers,
          },
          body:
            body === undefined
              ? undefined
              : JSON.stringify(body),
        },
      );
    } catch (error) {
      throw new MediaSyncTransportError(
        error instanceof Error
          ? error.message
          : 'Network request failed.',
        'NETWORK_ERROR',
        true,
      );
    }

    let parsed: unknown = null;

    try {
      parsed = await response.json();
    } catch {
      // The status code remains authoritative when the body is invalid.
    }

    const payload = (parsed ?? {}) as Json;

    if (response.ok) {
      return payload;
    }

    const error = payload.error as
      | { code?: unknown; message?: unknown }
      | undefined;

    const code =
      asString(error?.code) ?? `HTTP_${response.status}`;

    const message =
      asString(error?.message) ??
      `Media sync failed with HTTP ${response.status}.`;

    throw new MediaSyncTransportError(
      message,
      code,
      isRetryableStatus(response.status),
    );
  }

  private requireId(
    payload: Json,
    context: string,
  ): string {
    const attachment = payload.attachment as
      | { id?: unknown }
      | undefined;

    const id = asString(attachment?.id);

    if (!id) {
      throw new MediaSyncTransportError(
        `The API returned a successful response without a media id (${context}).`,
        'INVALID_SERVER_RESPONSE',
        false,
      );
    }

    return id;
  }

  private requireDescriptor(
    payload: Json,
    context: string,
  ): {
    remoteState: string;
    objectKey: string;
    upload: MediaUploadDescriptor;
  } {
    const attachment = payload.attachment as
      | { state?: unknown }
      | undefined;
    const upload = payload.upload as
      | {
          objectKey?: unknown;
          url?: unknown;
          method?: unknown;
          headers?: unknown;
          expiresInSeconds?: unknown;
        }
      | undefined;

    const objectKey = asString(upload?.objectKey);
    const url = asString(upload?.url);
    const expiresInSeconds =
      typeof upload?.expiresInSeconds === 'number' &&
      Number.isFinite(upload.expiresInSeconds)
        ? upload.expiresInSeconds
        : null;

    // Only a PUT descriptor can be honoured. Accepting anything else
    // would risk writing the file with a method the authorization was
    // not issued for.
    if (
      !objectKey ||
      !url ||
      upload?.method !== 'PUT' ||
      expiresInSeconds === null
    ) {
      throw new MediaSyncTransportError(
        `The API returned an unusable upload descriptor (${context}).`,
        'INVALID_SERVER_RESPONSE',
        false,
      );
    }

    const rawHeaders =
      upload?.headers !== null &&
      typeof upload?.headers === 'object'
        ? (upload.headers as Json)
        : {};

    const headers: Record<string, string> = {};

    for (const [name, value] of Object.entries(
      rawHeaders,
    )) {
      const text = asString(value);

      if (text) {
        headers[name] = text;
      }
    }

    return {
      remoteState:
        asString(attachment?.state) ?? 'UNKNOWN',
      objectKey,
      upload: {
        objectKey,
        url,
        method: 'PUT',
        headers,
        expiresInSeconds,
      },
    };
  }

  async createMediaAttachment(
    request: CreateMediaAttachmentRequest,
  ): Promise<CreateMediaAttachmentResponse> {
    const payload = await this.postJson(
      `/catalog/products/${encodeURIComponent(request.productId)}/media`,
      {
        kind: request.kind,
        contentType: request.contentType,
        sizeBytes: request.sizeBytes,
      },
      {
        'idempotency-key': request.idempotencyKey,
      },
    );

    return {
      mediaId: this.requireId(payload, 'create'),
    };
  }

  async authorizeUpload(
    mediaId: string,
    expiresInSeconds?: number,
  ): Promise<UploadAuthorizationResponse> {
    return this.requestUploadAuthorization(
      mediaId,
      expiresInSeconds,
      'upload-authorization',
      'authorize',
    );
  }

  async startUpload(
    mediaId: string,
    expiresInSeconds?: number,
  ): Promise<UploadAuthorizationResponse> {
    return this.requestUploadAuthorization(
      mediaId,
      expiresInSeconds,
      'upload-start',
      'start',
    );
  }

  private async requestUploadAuthorization(
    mediaId: string,
    expiresInSeconds: number | undefined,
    pathSegment: string,
    context: string,
  ): Promise<UploadAuthorizationResponse> {
    const query =
      expiresInSeconds === undefined
        ? ''
        : `?expiresInSeconds=${encodeURIComponent(String(expiresInSeconds))}`;

    const payload = await this.postJson(
      `/catalog/media/${encodeURIComponent(mediaId)}/${pathSegment}${query}`,
    );

    return {
      mediaId: this.requireId(payload, context),
      ...this.requireDescriptor(payload, context),
    };
  }

  async completeUpload(
    mediaId: string,
  ): Promise<MediaCompletionResponse> {
    const payload = await this.postJson(
      `/catalog/media/${encodeURIComponent(mediaId)}/upload-completion`,
    );

    const id = this.requireId(payload, 'completion');
    const attachment = payload.attachment as
      | { state?: unknown }
      | undefined;
    const verification = payload.verification as
      | { verified?: unknown; failure?: unknown }
      | undefined;

    if (typeof verification?.verified !== 'boolean') {
      throw new MediaSyncTransportError(
        'The API returned a successful response without a verification result.',
        'INVALID_SERVER_RESPONSE',
        false,
      );
    }

    const failure = verification.failure as
      | { code?: unknown; message?: unknown }
      | null
      | undefined;

    return {
      mediaId: id,
      remoteState:
        asString(attachment?.state) ?? 'UNKNOWN',
      verified: verification.verified,
      failureCode: asString(failure?.code),
      failureMessage: asString(failure?.message),
    };
  }
}
