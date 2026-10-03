import type {
  MediaAttachment,
  MediaState,
} from '@artisan-marketplace/contracts';
import type {
  CreateMediaAttachmentInput,
  MediaRepository,
  StatePatch,
} from '../application/media-repository.js';
import { legalSourcesFor } from '../domain/media-state.js';

export { type StatePatch };

export class InMemoryMediaRepository implements MediaRepository {
  private readonly attachments = new Map<string, MediaAttachment>();
  private readonly idempotency = new Map<string, string>();

  async create(
    input: CreateMediaAttachmentInput,
  ): Promise<MediaAttachment> {
    const key = this.idempotencyKey(
      input.productId,
      input.idempotencyKey,
    );

    const existingId = this.idempotency.get(key);

    if (existingId) {
      const existing = this.attachments.get(existingId);

      if (existing) {
        return existing;
      }
    }

    const now = new Date().toISOString();

    const attachment: MediaAttachment = {
      id: crypto.randomUUID(),
      productId: input.productId,
      ownerId: input.ownerId,
      kind: input.kind,
      objectKey: null,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      state: 'REQUESTED',
      createdAt: now,
      updatedAt: now,
    };

    this.attachments.set(attachment.id, attachment);
    this.idempotency.set(key, attachment.id);

    return attachment;
  }

  async getById(
    id: string,
  ): Promise<MediaAttachment | null> {
    return this.attachments.get(id) ?? null;
  }

  async findByIdempotencyKey(
    productId: string,
    idempotencyKey: string,
  ): Promise<MediaAttachment | null> {
    const attachmentId = this.idempotency.get(
      this.idempotencyKey(productId, idempotencyKey),
    );

    if (!attachmentId) {
      return null;
    }

    return this.attachments.get(attachmentId) ?? null;
  }

  async transitionState(
    id: string,
    to: MediaState,
    patch: StatePatch = {},
  ): Promise<MediaAttachment | null> {
    const attachment = this.attachments.get(id);

    if (
      !attachment ||
      !legalSourcesFor(to).includes(attachment.state)
    ) {
      return null;
    }

    const updated: MediaAttachment = {
      ...attachment,
      state: to,
      objectKey: patch.objectKey ?? attachment.objectKey,
      updatedAt: new Date().toISOString(),
    };

    this.attachments.set(id, updated);

    return updated;
  }

  private idempotencyKey(
    productId: string,
    idempotencyKey: string,
  ): string {
    return `${productId}:${idempotencyKey}`;
  }
}
