export type CreateMediaAttachmentRequest = {
  productId: string;
  kind: 'IMAGE' | 'AUDIO';
  contentType: string;
  sizeBytes: number;
  idempotencyKey: string;
};

export type CreateMediaAttachmentResponse = {
  mediaId: string;
};

/**
 * A short-lived, single-object authorization to write one file.
 *
 * The URL is a temporary credential: it must never be logged, stored in
 * a durable error message, or shown to the artisan.
 */
export type MediaUploadDescriptor = {
  objectKey: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
};

export type UploadAuthorizationResponse = {
  mediaId: string;
  remoteState: string;
  objectKey: string;
  upload: MediaUploadDescriptor;
};

export type MediaCompletionResponse = {
  mediaId: string;
  remoteState: string;
  verified: boolean;
  failureCode: string | null;
  failureMessage: string | null;
};

export type MediaSyncTransport = {
  createMediaAttachment(
    request: CreateMediaAttachmentRequest,
  ): Promise<CreateMediaAttachmentResponse>;
  authorizeUpload(
    mediaId: string,
    expiresInSeconds?: number,
  ): Promise<UploadAuthorizationResponse>;
  startUpload(
    mediaId: string,
    expiresInSeconds?: number,
  ): Promise<UploadAuthorizationResponse>;
  completeUpload(
    mediaId: string,
  ): Promise<MediaCompletionResponse>;
};

export class MediaSyncTransportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MediaSyncTransportError';
  }
}
