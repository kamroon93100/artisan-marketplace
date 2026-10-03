import type {
  MediaAttachment,
  MediaKind,
  MediaState,
  MediaUploadDescriptor,
  MediaUploadVerification,
} from '@artisan-marketplace/contracts';
import { AppError } from '../../../shared/errors/app-error.js';
import type { ObjectStorage } from '../../../shared/storage/object-storage.js';
import type { CatalogService } from '../../catalog/application/catalog-service.js';
import { buildMediaObjectKey } from '../domain/media-object-key.js';
import {
  canIssueUploadAuthorization,
  canRecordUploaded,
  canStartUpload,
  canTransition,
} from '../domain/media-state.js';
import { verifyStoredObject } from '../domain/media-verification.js';
import type {
  CreateMediaAttachmentInput,
  MediaRepository,
} from './media-repository.js';

export type CreateMediaAttachmentResult = {
  attachment: MediaAttachment;
  created: boolean;
};

export type UploadAuthorizationResult = {
  attachment: MediaAttachment;
  upload: MediaUploadDescriptor;
};

export type CompleteUploadResult = {
  attachment: MediaAttachment;
  verification: MediaUploadVerification;
};

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

/**
 * Upload authorizations are deliberately short-lived. A captured URL
 * grants exactly one write to exactly one object for a few minutes, and
 * grants no read, list, or delete access to anything else.
 */
const UPLOAD_AUTHORIZATION_TTL_SECONDS = 300;
const MAX_UPLOAD_AUTHORIZATION_TTL_SECONDS = 900;

function assertSupportedMedia(
  kind: MediaKind,
  contentType: string,
  sizeBytes: number,
): void {
  if (!contentType.trim()) {
    throw new AppError(
      'VALIDATION_FAILED',
      'contentType is required.',
    );
  }

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      'sizeBytes must be a positive integer.',
    );
  }

  if (kind === 'IMAGE') {
    if (!contentType.startsWith('image/')) {
      throw new AppError(
        'VALIDATION_FAILED',
        'IMAGE attachments require an image content type.',
      );
    }

    if (sizeBytes > MAX_IMAGE_BYTES) {
      throw new AppError(
        'VALIDATION_FAILED',
        'IMAGE attachments exceed the maximum allowed size.',
      );
    }

    return;
  }

  if (!contentType.startsWith('audio/')) {
    throw new AppError(
      'VALIDATION_FAILED',
      'AUDIO attachments require an audio content type.',
    );
  }

  if (sizeBytes > MAX_AUDIO_BYTES) {
    throw new AppError(
      'VALIDATION_FAILED',
      'AUDIO attachments exceed the maximum allowed size.',
    );
  }
}

/**
 * The immutable metadata that identifies one logical upload request.
 *
 * An idempotency key names one logical request, so a replay of that key
 * has to describe the same object. These three fields are established
 * when the record is created and are never rewritten afterwards, so
 * comparing them is what distinguishes a genuine retry of the same
 * request from a different request that happens to reuse the key.
 */
function conflictingMetadataFields(
  existing: MediaAttachment,
  input: {
    kind: MediaKind;
    contentType: string;
    sizeBytes: number;
  },
): string[] {
  const conflicts: string[] = [];

  if (existing.kind !== input.kind) {
    conflicts.push('kind');
  }

  if (existing.contentType !== input.contentType) {
    conflicts.push('contentType');
  }

  if (existing.sizeBytes !== input.sizeBytes) {
    conflicts.push('sizeBytes');
  }

  return conflicts;
}

function clampTtl(seconds: number | undefined): number {
  if (seconds === undefined) {
    return UPLOAD_AUTHORIZATION_TTL_SECONDS;
  }

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      'expiresInSeconds must be a positive number.',
    );
  }

  return Math.min(
    Math.floor(seconds),
    MAX_UPLOAD_AUTHORIZATION_TTL_SECONDS,
  );
}

export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly catalogService: CatalogService,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async requestAttachment(
    input: Omit<CreateMediaAttachmentInput, 'ownerId'> & {
      actorId: string;
    },
  ): Promise<CreateMediaAttachmentResult> {
    if (!input.idempotencyKey.trim()) {
      throw new AppError(
        'VALIDATION_FAILED',
        'idempotencyKey is required.',
      );
    }

    assertSupportedMedia(
      input.kind,
      input.contentType,
      input.sizeBytes,
    );

    const product =
      await this.catalogService.getById(
        input.productId,
      );

    // Ownership is decided from the catalog record, never from anything
    // the client asserted, so a client cannot attach media to a product
    // that belongs to another artisan.
    if (product.ownerId !== input.actorId) {
      throw new AppError(
        'FORBIDDEN',
        'The product belongs to another artisan.',
        { productId: input.productId },
      );
    }

    const existing =
      await this.repository.findByIdempotencyKey(
        input.productId,
        input.idempotencyKey,
      );

    if (existing) {
      this.assertReplayableMetadata(
        existing,
        input,
      );

      return {
        attachment: existing,
        created: false,
      };
    }

    const attachment =
      await this.repository.create({
        productId: input.productId,
        ownerId: product.ownerId,
        kind: input.kind,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        idempotencyKey: input.idempotencyKey,
      });

    /**
     * Creating is not an exclusive claim on the key. Two concurrent
     * first-time requests can both find nothing and both insert; the
     * loser is handed the winner's row instead of a new one. Comparing
     * the record that actually came back closes that window, so a
     * request that disagrees about immutable metadata is reported as
     * the conflict it is rather than answered with someone else's
     * object. On the ordinary path the record was built from this
     * request, so the comparison always agrees.
     */
    this.assertReplayableMetadata(
      attachment,
      input,
    );

    return {
      attachment,
      created: true,
    };
  }

  /**
   * Deduplicating on the key alone would let a request that declares
   * different bytes, type, or kind be answered with the original
   * record as though it had been accepted. The client would then upload
   * against a record whose declared metadata does not describe its
   * object, and verification would either fail later or accept a
   * substitute. A key replay that disagrees about immutable metadata is
   * a conflict, not a retry, and is reported as one instead of being
   * silently absorbed.
   */
  private assertReplayableMetadata(
    attachment: MediaAttachment,
    input: {
      productId: string;
      kind: MediaKind;
      contentType: string;
      sizeBytes: number;
    },
  ): void {
    const conflicts = conflictingMetadataFields(
      attachment,
      input,
    );

    if (conflicts.length === 0) {
      return;
    }

    throw new AppError(
      'CONFLICT',
      'This Idempotency-Key is already in use for different media details.',
      {
        mediaId: attachment.id,
        productId: input.productId,
        conflictingFields: conflicts,
      },
    );
  }

  /**
   * Loads a media record and refuses it unless the authenticated actor
   * owns it.
   *
   * Authentication has already happened at the boundary; this is the
   * media module's own authorization decision, and it is applied to
   * every operation that can move a media record or hand out a write
   * credential for its object.
   */
  private async requireOwnedAttachment(
    mediaId: string,
    actorId: string,
  ): Promise<MediaAttachment> {
    const attachment =
      await this.repository.getById(mediaId);

    if (!attachment) {
      throw new AppError(
        'NOT_FOUND',
        'Media attachment was not found.',
        { mediaId },
      );
    }

    if (attachment.ownerId !== actorId) {
      throw new AppError(
        'FORBIDDEN',
        'The media attachment belongs to another artisan.',
        { mediaId },
      );
    }

    return attachment;
  }

  private async issueUploadDescriptor(
    attachment: MediaAttachment,
    objectKey: string,
    expiresInSeconds: number | undefined,
  ): Promise<MediaUploadDescriptor> {
    if (!attachment.contentType) {
      throw new AppError(
        'CONFLICT',
        'Media attachment has no declared content type.',
        { mediaId: attachment.id },
      );
    }

    const presigned =
      await this.objectStorage.createPresignedPutUrl({
        objectKey,
        contentType: attachment.contentType,
        expiresInSeconds: clampTtl(expiresInSeconds),
      });

    return {
      objectKey,
      url: presigned.url,
      method: 'PUT',
      headers: {
        ...presigned.headers,
        'content-type': attachment.contentType,
      },
      expiresInSeconds: presigned.expiresInSeconds,
    };
  }

  /**
   * Idempotent by design: a client that lost its upload URL, or never
   * received the completion response, gets the same object key and a
   * fresh short-lived URL rather than a second media record or a
   * conflict.
   */
  async authorizeUpload(
    mediaId: string,
    actorId: string,
    expiresInSeconds?: number,
  ): Promise<UploadAuthorizationResult> {
    let attachment =
      await this.requireOwnedAttachment(
        mediaId,
        actorId,
      );

    if (!canIssueUploadAuthorization(attachment.state)) {
      throw new AppError(
        'CONFLICT',
        `Media attachment cannot be authorized from state ${attachment.state}.`,
        { mediaId, state: attachment.state },
      );
    }

    const objectKey =
      attachment.objectKey ??
      buildMediaObjectKey(
        attachment.ownerId,
        attachment.productId,
        attachment.id,
      );

    /**
     * A fresh authorization always leaves the record in
     * UPLOAD_AUTHORIZED, whether or not the object key was allocated
     * before.
     *
     * A record that was re-armed after a failure or an action state
     * must return to REQUESTED first: UPLOAD_AUTHORIZED is not a legal
     * target from those states, and skipping the step would either
     * bypass the state machine or leave a record that authorizes an
     * upload it can never accept the arrival of.
     */
    if (
      attachment.state !== 'REQUESTED' &&
      attachment.state !== 'UPLOAD_AUTHORIZED' &&
      canTransition(attachment.state, 'REQUESTED')
    ) {
      const rearmed =
        await this.repository.transitionState(
          attachment.id,
          'REQUESTED',
        );

      if (rearmed) {
        attachment = rearmed;
      }
    }

    if (attachment.state !== 'UPLOAD_AUTHORIZED') {
      const authorized =
        await this.repository.transitionState(
          attachment.id,
          'UPLOAD_AUTHORIZED',
          { objectKey },
        );

      attachment = authorized
        ? authorized
        : // Lost a race with a concurrent authorization. Re-read and
          // converge on whatever the winning request established.
          await this.requireOwnedAttachment(
            mediaId,
            actorId,
          );

      if (
        attachment.state !== 'UPLOAD_AUTHORIZED' ||
        !attachment.objectKey
      ) {
        throw new AppError(
          'CONFLICT',
          'Media attachment upload authorization is no longer available.',
          {
            mediaId,
            state: attachment.state,
          },
        );
      }
    }

    if (!attachment.objectKey) {
      throw new AppError(
        'CONFLICT',
        'Media attachment has no object to upload to.',
        { mediaId, state: attachment.state },
      );
    }

    return {
      attachment,
      upload: await this.issueUploadDescriptor(
        attachment,
        attachment.objectKey,
        expiresInSeconds,
      ),
    };
  }

  async startUpload(
    mediaId: string,
    actorId: string,
    expiresInSeconds?: number,
  ): Promise<UploadAuthorizationResult> {
    const attachment =
      await this.requireOwnedAttachment(
        mediaId,
        actorId,
      );

    if (!attachment.objectKey) {
      throw new AppError(
        'CONFLICT',
        'Media attachment must be authorized before upload can start.',
        { mediaId, state: attachment.state },
      );
    }

    if (!canStartUpload(attachment.state)) {
      throw new AppError(
        'CONFLICT',
        `Media attachment cannot start uploading from state ${attachment.state}.`,
        { mediaId, state: attachment.state },
      );
    }

    // Re-entering UPLOADING from UPLOADING is a resume, not a
    // transition, so it must not be rejected as an invalid edge.
    const updated =
      attachment.state === 'UPLOADING'
        ? attachment
        : await this.repository.transitionState(
            attachment.id,
            'UPLOADING',
          );

    if (!updated) {
      throw new AppError(
        'CONFLICT',
        'Media attachment could not start uploading.',
        { mediaId, state: attachment.state },
      );
    }

    return {
      attachment: updated,
      upload: await this.issueUploadDescriptor(
        updated,
        attachment.objectKey,
        expiresInSeconds,
      ),
    };
  }

  /**
   * Records the client's completion claim, then verifies the object
   * independently against object-storage metadata.
   *
   * Completion is idempotent and re-reconciles: a repeated call after an
   * ambiguous network failure re-reads the object instead of assuming
   * the earlier outcome. A media record only reaches VERIFIED when the
   * stored object itself agrees with the canonical metadata record, and
   * a record that stops matching becomes an explicit failure or action
   * state rather than silently appearing valid.
   */
  async completeUpload(
    mediaId: string,
    actorId: string,
  ): Promise<CompleteUploadResult> {
    const attachment =
      await this.requireOwnedAttachment(
        mediaId,
        actorId,
      );

    if (
      !attachment.objectKey ||
      !attachment.contentType ||
      !attachment.sizeBytes
    ) {
      throw new AppError(
        'CONFLICT',
        `Media attachment cannot be completed from state ${attachment.state}.`,
        { mediaId, state: attachment.state },
      );
    }

    const alreadyVerified =
      attachment.state === 'VERIFIED';

    if (
      !alreadyVerified &&
      !canRecordUploaded(attachment.state)
    ) {
      throw new AppError(
        'CONFLICT',
        `Media attachment cannot be completed from state ${attachment.state}.`,
        { mediaId, state: attachment.state },
      );
    }

    // Record the client-reported arrival before verifying, so a failed
    // verification is an explicit diagnosable state instead of a record
    // that still claims to be uploading.
    const recording =
      alreadyVerified
        ? attachment
        : ((await this.repository.transitionState(
            attachment.id,
            'UPLOADED',
          )) ??
          (await this.requireOwnedAttachment(
            mediaId,
            actorId,
          )));

    /**
     * The compare-and-set above is lost when a concurrent caller
     * completed this upload first and already verified the record. That
     * is not a conflict: the work succeeded, and the loser of the race
     * must converge on the verified outcome and re-reconcile it against
     * object storage rather than telling the client its own successful
     * upload failed.
     */
    const verifiedByAnotherCaller =
      !alreadyVerified &&
      recording.state === 'VERIFIED';

    const settled =
      alreadyVerified || verifiedByAnotherCaller;

    if (
      recording.state !== 'UPLOADED' &&
      !settled
    ) {
      throw new AppError(
        'CONFLICT',
        'Media attachment could not be recorded as uploaded.',
        { mediaId, state: recording.state },
      );
    }

    const observed =
      await this.objectStorage.headObject(
        recording.objectKey!,
      );

    const verification = verifyStoredObject(
      {
        sizeBytes: recording.sizeBytes!,
        contentType: recording.contentType!,
      },
      observed,
    );

    if (verification.verified) {
      if (settled) {
        return { attachment: recording, verification };
      }

      const verified =
        await this.repository.transitionState(
          recording.id,
          'VERIFIED',
          {
            verifiedAt: new Date().toISOString(),
            verifiedObject: {
              contentLength:
                verification.observedContentLength!,
              contentType:
                verification.observedContentType,
              etag: verification.observedEtag,
            },
          },
        );

      if (!verified) {
        // A concurrent caller verified the record between the
        // verification read and this write. Converge on its outcome.
        const current =
          await this.requireOwnedAttachment(
            mediaId,
            actorId,
          );

        if (current.state === 'VERIFIED') {
          return {
            attachment: current,
            verification,
          };
        }

        throw new AppError(
          'CONFLICT',
          'Media attachment verification result could not be recorded.',
          { mediaId, state: current.state },
        );
      }

      return { attachment: verified, verification };
    }

    // A record that was already verified but no longer matches object
    // storage is an explicit action state: it is not silently demoted,
    // because downstream processing may already have consumed it.
    const to: MediaState = settled
      ? 'ACTION_REQUIRED'
      : 'FAILED';

    const unresolved =
      await this.repository.transitionState(
        recording.id,
        to,
        {
          verifiedAt: new Date().toISOString(),
          failureCode: verification.failure!.code,
          failureMessage: verification.failure!.message,
        },
      );

    return {
      attachment: unresolved ?? recording,
      verification,
    };
  }
}
