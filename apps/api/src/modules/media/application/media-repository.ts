import type {
  MediaAttachment,
  MediaFailureCode,
  MediaKind,
  MediaState,
} from '@artisan-marketplace/contracts';

export type CreateMediaAttachmentInput = {
  productId: string;
  ownerId: string;
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
  idempotencyKey: string;
};

export type VerifiedObjectMetadata = {
  contentLength: number;
  contentType: string | null;
  etag: string | null;
};

export type StatePatch = {
  objectKey?: string;
  verifiedAt?: string;
  verifiedObject?: VerifiedObjectMetadata;
  failureCode?: MediaFailureCode | null;
  failureMessage?: string | null;
};

export interface MediaRepository {
  create(
    input: CreateMediaAttachmentInput,
  ): Promise<MediaAttachment>;

  findByIdempotencyKey(
    productId: string,
    idempotencyKey: string,
  ): Promise<MediaAttachment | null>;

  getById(
    id: string,
  ): Promise<MediaAttachment | null>;

  /**
   * Compare-and-set: applies `to` only when the stored state is a legal
   * source for it according to the canonical media state machine. The
   * caller never supplies its own list of acceptable states, so an
   * illegal edge cannot be written even by a caller that means to allow
   * it. Returns null when it was not applied, which lets the caller
   * re-read and converge instead of failing a retry.
   */
  transitionState(
    id: string,
    to: MediaState,
    patch?: StatePatch,
  ): Promise<MediaAttachment | null>;
}
