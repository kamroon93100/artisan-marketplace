import {
  getLocalDatabase,
  requireLocalOwnerId,
} from './database';

export const LOCAL_MEDIA_STATES = [
  'PENDING_SYNC',
  'SYNCED',
  'ACTION_REQUIRED',
] as const;

export type LocalMediaState =
  (typeof LOCAL_MEDIA_STATES)[number];

export const SYNC_OPERATION_STATES = [
  'PENDING',
  'IN_FLIGHT',
  'ACKED',
  'ACTION_REQUIRED',
] as const;

export type SyncOperationState =
  (typeof SYNC_OPERATION_STATES)[number];

/**
 * The server-side media states this client can observe. They mirror the
 * canonical vocabulary rather than inventing a local one, so a local
 * record and its server record never disagree about what happened.
 */
export const REMOTE_MEDIA_STATES = [
  'REQUESTED',
  'UPLOAD_AUTHORIZED',
  'UPLOADING',
  'UPLOADED',
  'VERIFIED',
  'FAILED',
  'ACTION_REQUIRED',
] as const;

export type RemoteMediaState =
  (typeof REMOTE_MEDIA_STATES)[number];

export function asRemoteMediaState(
  value: unknown,
): RemoteMediaState | null {
  if (typeof value !== 'string') {
    return null;
  }

  return (
    REMOTE_MEDIA_STATES as readonly string[]
  ).includes(value)
    ? (value as RemoteMediaState)
    : null;
}

export type LocalMediaIntent = {
  localId: string;
  productId: string;
  kind: 'IMAGE' | 'AUDIO';
  uri: string;
  contentType: string;
  sizeBytes: number;
  idempotencyKey: string;
  state: LocalMediaState;
  remoteMediaId: string | null;
  remoteState: RemoteMediaState | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateLocalMediaIntentInput = {
  localId: string;
  productId: string;
  kind: 'IMAGE' | 'AUDIO';
  uri: string;
  contentType: string;
  sizeBytes: number;
  idempotencyKey: string;
};

export type SyncOperation = {
  operationId: string;
  operationType: 'CREATE_MEDIA_ATTACHMENT';
  aggregateId: string;
  idempotencyKey: string;
  state: SyncOperationState;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapMediaRow(
  row: Record<string, unknown>,
): LocalMediaIntent {
  return {
    localId: String(row.local_id),
    productId: String(row.product_id),
    kind: row.kind === 'AUDIO' ? 'AUDIO' : 'IMAGE',
    uri: String(row.uri),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes),
    idempotencyKey: String(row.idempotency_key),
    state:
      row.state === 'SYNCED'
        ? 'SYNCED'
        : row.state === 'ACTION_REQUIRED'
          ? 'ACTION_REQUIRED'
          : 'PENDING_SYNC',
    remoteMediaId:
      row.remote_media_id === null ||
      row.remote_media_id === undefined
        ? null
        : String(row.remote_media_id),
    remoteState: asRemoteMediaState(row.remote_state),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapSyncRow(
  row: Record<string, unknown>,
): SyncOperation {
  return {
    operationId: String(row.operation_id),
    operationType: 'CREATE_MEDIA_ATTACHMENT',
    aggregateId: String(row.aggregate_id),
    idempotencyKey: String(row.idempotency_key),
    state:
      row.state === 'ACKED'
        ? 'ACKED'
        : row.state === 'IN_FLIGHT'
          ? 'IN_FLIGHT'
          : row.state === 'ACTION_REQUIRED'
            ? 'ACTION_REQUIRED'
            : 'PENDING',
    attempts: Number(row.attempts),
    lastErrorCode:
      row.last_error_code === null ||
      row.last_error_code === undefined
        ? null
        : String(row.last_error_code),
    lastErrorMessage:
      row.last_error_message === null ||
      row.last_error_message === undefined
        ? null
        : String(row.last_error_message),
    nextAttemptAt:
      row.next_attempt_at === null ||
      row.next_attempt_at === undefined
        ? null
        : String(row.next_attempt_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function createLocalMediaIntent(
  ownerId: string,
  input: CreateLocalMediaIntentInput,
): Promise<LocalMediaIntent> {
  const owner = requireLocalOwnerId(ownerId);
  const db = await getLocalDatabase();
  const now = new Date().toISOString();
  const operationId = `${input.localId}:CREATE_MEDIA_ATTACHMENT`;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const inserted = await txn.runAsync(
      `
        INSERT INTO media_intents (
          local_id,
          owner_id,
          product_id,
          kind,
          uri,
          content_type,
          size_bytes,
          idempotency_key,
          state,
          remote_media_id,
          remote_state,
          created_at,
          updated_at
        )
        SELECT
          ?, ?, ?, ?, ?, ?, ?, ?,
          'PENDING_SYNC', NULL, NULL, ?, ?
        WHERE EXISTS (
          SELECT 1
          FROM local_product_drafts
          WHERE local_id = ?
            AND owner_id = ?
        )
      `,
      input.localId,
      owner,
      input.productId,
      input.kind,
      input.uri,
      input.contentType,
      input.sizeBytes,
      input.idempotencyKey,
      now,
      now,
      input.productId,
      owner,
    );

    /**
     * A media record may only be attached to a draft the same account can
     * read. Without this, a caller holding another account's local draft
     * id could create a record that the next sync would either strand or
     * try to upload against a product it does not own.
     */
    if (inserted.changes !== 1) {
      throw new Error(
        'The product draft does not belong to this account.',
      );
    }

    await txn.runAsync(
      `
        INSERT INTO sync_operations (
          operation_id,
          owner_id,
          operation_type,
          aggregate_id,
          idempotency_key,
          state,
          attempts,
          last_error_code,
          last_error_message,
          next_attempt_at,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          ?,
          'CREATE_MEDIA_ATTACHMENT',
          ?,
          ?,
          'PENDING',
          0,
          NULL,
          NULL,
          NULL,
          ?,
          ?
        )
      `,
      operationId,
      owner,
      input.localId,
      input.idempotencyKey,
      now,
      now,
    );
  });

  const row = await db.getFirstAsync<Record<string, unknown>>(
    `
      SELECT
        local_id,
        product_id,
        kind,
        uri,
        content_type,
        size_bytes,
        idempotency_key,
        state,
        remote_media_id,
        remote_state,
        created_at,
        updated_at
      FROM media_intents
      WHERE local_id = ?
        AND owner_id = ?
    `,
    input.localId,
    owner,
  );

  if (!row) {
    throw new Error(
      'Local media intent could not be created.',
    );
  }

  return mapMediaRow(row);
}

export async function getSyncOperation(
  ownerId: string,
  operationId: string,
): Promise<SyncOperation | null> {
  const owner = requireLocalOwnerId(ownerId);
  const db = await getLocalDatabase();

  const row = await db.getFirstAsync<Record<string, unknown>>(
    `
      SELECT
        operation_id,
        operation_type,
        aggregate_id,
        idempotency_key,
        state,
        attempts,
        last_error_code,
        last_error_message,
        next_attempt_at,
        created_at,
        updated_at
      FROM sync_operations
      WHERE operation_id = ?
        AND owner_id = ?
    `,
    operationId,
    owner,
  );

  return row ? mapSyncRow(row) : null;
}

export async function listLocalMediaIntents(
  ownerId: string,
  productId: string,
): Promise<LocalMediaIntent[]> {
  const owner = requireLocalOwnerId(ownerId);
  const db = await getLocalDatabase();

  const rows = await db.getAllAsync<Record<string, unknown>>(
    `
      SELECT
        local_id,
        product_id,
        kind,
        uri,
        content_type,
        size_bytes,
        idempotency_key,
        state,
        remote_media_id,
        remote_state,
        created_at,
        updated_at
      FROM media_intents
      WHERE product_id = ?
        AND owner_id = ?
      ORDER BY created_at ASC
    `,
    productId,
    owner,
  );

  return rows.map(mapMediaRow);
}

