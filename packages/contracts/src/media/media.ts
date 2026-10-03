export const MEDIA_KINDS = [
  'IMAGE',
  'AUDIO',
] as const;

export type MediaKind = typeof MEDIA_KINDS[number];

export const MEDIA_STATES = [
  'REQUESTED',
  'UPLOAD_AUTHORIZED',
  'UPLOADING',
  'UPLOADED',
  'VERIFIED',
  'FAILED',
  'ACTION_REQUIRED',
  'DELETED',
] as const;

export type MediaState = typeof MEDIA_STATES[number];

export type MediaAttachment = {
  id: string;
  productId: string;
  ownerId: string;
  kind: MediaKind;
  objectKey: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  state: MediaState;
  createdAt: string;
  updatedAt: string;
};

/**
 * Short-lived, object-specific upload permission handed to the client.
 * The client never receives object-storage credentials: only a presigned
 * URL bound to one exact object key, one content type, and a bounded
 * expiry.
 */
export type MediaUploadDescriptor = {
  objectKey: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
};

export const MEDIA_FAILURE_CODES = [
  'OBJECT_NOT_FOUND',
  'OBJECT_SIZE_MISMATCH',
  'OBJECT_CONTENT_TYPE_MISMATCH',
] as const;

export type MediaFailureCode =
  (typeof MEDIA_FAILURE_CODES)[number];

export type MediaFailure = {
  code: MediaFailureCode;
  message: string;
};

export type MediaUploadVerification = {
  verified: boolean;
  /** Object metadata observed by the server during verification. */
  observedContentLength: number | null;
  observedContentType: string | null;
  observedEtag: string | null;
  failure: MediaFailure | null;
};
