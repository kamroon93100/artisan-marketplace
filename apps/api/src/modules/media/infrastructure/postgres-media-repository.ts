import type {
  MediaAttachment,
  MediaFailureCode,
  MediaState,
} from '@artisan-marketplace/contracts';
import type {
  CreateMediaAttachmentInput,
  MediaRepository,
  VerifiedObjectMetadata,
} from '../application/media-repository.js';
import type {
  Database,
} from '../../../shared/persistence/database.js';
import { legalSourcesFor } from '../domain/media-state.js';

type MediaRow = {
  id: string;
  product_id: string;
  owner_id: string;
  kind: 'IMAGE' | 'AUDIO';
  object_key: string | null;
  content_type: string;
  size_bytes: string | number;
  state: MediaAttachment['state'];
  created_at: string;
  updated_at: string;
};

function mapRow(row: MediaRow): MediaAttachment {
  return {
    id: row.id,
    productId: row.product_id,
    ownerId: row.owner_id,
    kind: row.kind,
    objectKey: row.object_key,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  id,
  product_id,
  owner_id,
  kind,
  object_key,
  content_type,
  size_bytes,
  state,
  created_at,
  updated_at
`;

type StatePatch = {
  objectKey?: string;
  verifiedAt?: string;
  verifiedObject?: VerifiedObjectMetadata;
  failureCode?: MediaFailureCode | null;
  failureMessage?: string | null;
};

export class PostgresMediaRepository
  implements MediaRepository
{
  constructor(private readonly database: Database) {}

  async create(
    input: CreateMediaAttachmentInput,
  ): Promise<MediaAttachment> {
    const now = new Date().toISOString();

    const inserted = await this.database.query<MediaRow>(
      `
        INSERT INTO media_attachments (
          id,
          product_id,
          owner_id,
          kind,
          object_key,
          content_type,
          size_bytes,
          state,
          idempotency_key,
          created_at,
          updated_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          NULL,
          $4,
          $5,
          'REQUESTED',
          $6,
          $7,
          $7
        )
        ON CONFLICT (
          product_id,
          idempotency_key
        )
        DO NOTHING
        RETURNING ${SELECT_COLUMNS}
      `,
      [
        input.productId,
        input.ownerId,
        input.kind,
        input.contentType,
        input.sizeBytes,
        input.idempotencyKey,
        now,
      ],
    );

    if (inserted[0]) {
      return mapRow(inserted[0]);
    }

    const existing =
      await this.findByIdempotencyKey(
        input.productId,
        input.idempotencyKey,
      );

    if (!existing) {
      throw new Error(
        'Media attachment insert conflicted but the existing row could not be found.',
      );
    }

    return existing;
  }

  async getById(
    id: string,
  ): Promise<MediaAttachment | null> {
    const rows = await this.database.query<MediaRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM media_attachments
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return rows[0]
      ? mapRow(rows[0])
      : null;
  }

  async findByIdempotencyKey(
    productId: string,
    idempotencyKey: string,
  ): Promise<MediaAttachment | null> {
    const rows = await this.database.query<MediaRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM media_attachments
        WHERE product_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [
        productId,
        idempotencyKey,
      ],
    );

    return rows[0]
      ? mapRow(rows[0])
      : null;
  }

  async transitionState(
    id: string,
    to: MediaState,
    patch: StatePatch = {},
  ): Promise<MediaAttachment | null> {
    const now = new Date().toISOString();

    const rows = await this.database.query<MediaRow>(
      `
        UPDATE media_attachments
        SET
          state = $1,
          object_key = coalesce($2, object_key),
          verified_at = coalesce($3, verified_at),
          verified_content_length = coalesce($4, verified_content_length),
          verified_content_type = coalesce($5, verified_content_type),
          verified_etag = coalesce($6, verified_etag),
          failure_code = $7,
          failure_message = $8,
          updated_at = $9,
          version = version + 1
        WHERE id = $10
          AND state = any($11)
        RETURNING ${SELECT_COLUMNS}
      `,
      [
        to,
        patch.objectKey ?? null,
        patch.verifiedAt ?? null,
        patch.verifiedObject?.contentLength ?? null,
        patch.verifiedObject?.contentType ?? null,
        patch.verifiedObject?.etag ?? null,
        patch.failureCode ?? null,
        patch.failureMessage ?? null,
        now,
        id,
        [...legalSourcesFor(to)],
      ],
    );

    return rows[0]
      ? mapRow(rows[0])
      : null;
  }
}
