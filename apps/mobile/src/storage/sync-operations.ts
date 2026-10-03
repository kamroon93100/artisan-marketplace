import { getLocalDatabase } from './database';
import type {
  LocalMediaIntent,
  SyncOperation,
  SyncOperationState,
} from './media-intents';
import { asRemoteMediaState } from './media-intents';

function mapSyncRow(
  row: Record<string, unknown>,
): SyncOperation {
  const state = String(row.state) as SyncOperationState;

  return {
    operationId: String(row.operation_id),
    operationType: 'CREATE_MEDIA_ATTACHMENT',
    aggregateId: String(row.aggregate_id),
    idempotencyKey: String(row.idempotency_key),
    state,
    attempts: Number(row.attempts),
    lastErrorCode:
      row.last_error_code == null
        ? null
        : String(row.last_error_code),
    lastErrorMessage:
      row.last_error_message == null
        ? null
        : String(row.last_error_message),
    nextAttemptAt:
      row.next_attempt_at == null
        ? null
        : String(row.next_attempt_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

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
      row.remote_media_id == null
        ? null
        : String(row.remote_media_id),
    remoteState: asRemoteMediaState(row.remote_state),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listPendingSyncOperations(
  limit = 10,
): Promise<SyncOperation[]> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  const rows = await db.getAllAsync<Record<string, unknown>>(
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
      WHERE state = 'PENDING'
        AND (
          next_attempt_at IS NULL
          OR next_attempt_at <= ?
        )
      ORDER BY created_at ASC
      LIMIT ?
    `,
    now,
    limit,
  );

  return rows.map(mapSyncRow);
}

export async function getLocalMediaIntent(
  localId: string,
): Promise<LocalMediaIntent | null> {
  const db = await getLocalDatabase();

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
    `,
    localId,
  );

  return row ? mapMediaRow(row) : null;
}

export async function listSyncOperationsForAggregate(
  aggregateId: string,
): Promise<SyncOperation[]> {
  const db = await getLocalDatabase();

  const rows = await db.getAllAsync<Record<string, unknown>>(
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
      WHERE aggregate_id = ?
      ORDER BY created_at ASC
    `,
    aggregateId,
  );

  return rows.map(mapSyncRow);
}

export async function claimSyncOperation(
  operationId: string,
): Promise<SyncOperation | null> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  let claimed = false;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync(
      `
        UPDATE sync_operations
        SET
          state = 'IN_FLIGHT',
          attempts = attempts + 1,
          updated_at = ?,
          last_error_code = NULL,
          last_error_message = NULL
        WHERE operation_id = ?
          AND state = 'PENDING'
      `,
      now,
      operationId,
    );

    claimed = result.changes === 1;
  });

  if (!claimed) {
    return null;
  }

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
    `,
    operationId,
  );

  return row ? mapSyncRow(row) : null;
}

/**
 * Proves an operation is still being worked on.
 *
 * Stale recovery reclaims an operation whose `updated_at` is older than
 * a threshold. A large upload on a slow connection can run for longer
 * than that, so without a heartbeat a live upload would be reclaimed and
 * retried by another attempt while it is still writing bytes.
 *
 * The write is a no-op unless the operation is still `IN_FLIGHT`, so a
 * heartbeat can never resurrect an operation that has already been
 * reclaimed, acked, or cancelled.
 */
export async function heartbeatSyncOperation(
  operationId: string,
): Promise<void> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE sync_operations
      SET updated_at = ?
      WHERE operation_id = ?
        AND state = 'IN_FLIGHT'
    `,
    now,
    operationId,
  );
}

export async function markMediaSynced(
  localId: string,
  operationId: string,
  remoteMediaId: string,
): Promise<void> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `
        UPDATE media_intents
        SET
          state = 'SYNCED',
          remote_media_id = ?,
          updated_at = ?
        WHERE local_id = ?
      `,
      remoteMediaId,
      now,
      localId,
    );

    await txn.runAsync(
      `
        UPDATE sync_operations
        SET
          state = 'ACKED',
          next_attempt_at = NULL,
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = ?
        WHERE operation_id = ?
          AND state IN ('PENDING', 'IN_FLIGHT')
      `,
      now,
      operationId,
    );
  });
}

/**
 * Records where an upload has reached without acknowledging it.
 *
 * The operation stays in flight until the media is verified, so an
 * interrupted upload is retried rather than treated as done. Persisting
 * the remote state at each step is what lets a restarted app resume
 * instead of starting over blind.
 */
export async function recordMediaRemoteProgress(
  localId: string,
  remoteMediaId: string,
  remoteState: string,
): Promise<void> {
  const known = asRemoteMediaState(remoteState);

  if (!known) {
    // An unrecognized state is not written, so a local record can never
    // claim a state the rest of the app does not understand.
    return;
  }

  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE media_intents
      SET
        remote_media_id = ?,
        remote_state = ?,
        updated_at = ?
      WHERE local_id = ?
    `,
    remoteMediaId,
    known,
    now,
    localId,
  );
}

/**
 * Re-declares a local media record against the file that is actually on the
 * device, and detaches it from any server record created for the old
 * declaration.
 *
 * A record's declared size is a claim made at capture time. When the file
 * turns out to be a different length, the record cannot be repaired in
 * place on the server: media declarations are immutable, so the same
 * declared size always replays onto the same server record. Continuing to
 * reuse that record would spend the remaining attempt budget on a
 * verification failure that can never clear.
 *
 * The local record is therefore moved onto a new logical request: the size
 * is corrected, the idempotency key is replaced, and the remote binding is
 * cleared so the next attempt creates a fresh server record for the bytes
 * that will actually be uploaded. The previous server record is left alone
 * for the artisan's record rather than being reused or deleted.
 *
 * Both rows are written in one exclusive transaction. A correction that
 * only landed on one of them would either keep a stale idempotency key on
 * the operation or leave the intent still bound to the record the
 * correction was meant to abandon, and either one makes the next attempt
 * wrong rather than merely redundant.
 *
 * The operation's state is deliberately left untouched: this runs while
 * the operation is claimed, and re-arming it here would make it claimable
 * a second time while this attempt is still running. The attempt that
 * triggered the correction immediately follows it and resolves the state
 * by succeeding or by writing a fresh failure.
 */
export async function redeclareLocalMediaIntent(
  localId: string,
  idempotencyKey: string,
  sizeBytes: number,
): Promise<void> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();
  const operationId = `${localId}:CREATE_MEDIA_ATTACHMENT`;

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `
        UPDATE media_intents
        SET
          size_bytes = ?,
          idempotency_key = ?,
          remote_media_id = NULL,
          remote_state = NULL,
          updated_at = ?
        WHERE local_id = ?
      `,
      sizeBytes,
      idempotencyKey,
      now,
      localId,
    );

    await txn.runAsync(
      `
        UPDATE sync_operations
        SET
          idempotency_key = ?,
          attempts = 0,
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = ?
        WHERE operation_id = ?
          AND aggregate_id = ?
      `,
      idempotencyKey,
      now,
      operationId,
      localId,
    );
  });
}

/**
 * Returns operations that were left in flight by an app that was killed
 * mid-upload back to the pending queue.
 *
 * Without this, an interrupted upload would never be retried: the
 * pending query only selects PENDING rows, so a stranded IN_FLIGHT row
 * would silently strand the artisan's media. Re-running is safe because
 * every step of the lifecycle is idempotent on the server.
 */
export async function recoverStaleSyncOperations(
  staleBefore: string,
): Promise<number> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  const result = await db.runAsync(
    `
      UPDATE sync_operations
      SET
        state = 'PENDING',
        next_attempt_at = NULL,
        updated_at = ?
      WHERE state = 'IN_FLIGHT'
        AND updated_at <= ?
    `,
    now,
    staleBefore,
  );

  return result.changes;
}

export async function markSyncRetry(
  localId: string,
  operationId: string,
  errorCode: string,
  errorMessage: string,
  nextAttemptAt: string,
): Promise<void> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `
        UPDATE media_intents
        SET
          state = 'PENDING_SYNC',
          updated_at = ?
        WHERE local_id = ?
      `,
      now,
      localId,
    );

    await txn.runAsync(
      `
        UPDATE sync_operations
        SET
          state = 'PENDING',
          last_error_code = ?,
          last_error_message = ?,
          next_attempt_at = ?,
          updated_at = ?
        WHERE operation_id = ?
          AND state IN ('PENDING', 'IN_FLIGHT')
      `,
      errorCode,
      errorMessage,
      nextAttemptAt,
      now,
      operationId,
    );
  });
}

/**
 * Re-arms an operation the artisan explicitly asked to retry.
 *
 * The attempt budget is reset because the ceiling exists to stop a
 * failure from being retried forever *on its own*. The budget only
 * counts unattended attempts, so a deliberate re-arm has to start a
 * fresh budget; otherwise re-arming would grant a single attempt and
 * immediately exhaust itself again, leaving the artisan no usable way
 * forward. Retries here are initiated by a person, so they stay
 * bounded by that person's intent rather than by the automatic ceiling.
 */
export async function retrySyncOperation(
  operationId: string,
): Promise<void> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const operation =
      await txn.getFirstAsync<Record<string, unknown>>(
        `
          SELECT aggregate_id
          FROM sync_operations
          WHERE operation_id = ?
            AND state = 'ACTION_REQUIRED'
        `,
        operationId,
      );

    if (!operation) {
      return;
    }

    await txn.runAsync(
      `
        UPDATE sync_operations
        SET
          state = 'PENDING',
          last_error_code = NULL,
          last_error_message = NULL,
          next_attempt_at = NULL,
          attempts = 0,
          updated_at = ?
        WHERE operation_id = ?
          AND state = 'ACTION_REQUIRED'
      `,
      now,
      operationId,
    );

    await txn.runAsync(
      `
        UPDATE media_intents
        SET
          state = 'PENDING_SYNC',
          updated_at = ?
        WHERE local_id = ?
      `,
      now,
      String(operation.aggregate_id),
    );
  });
}
export async function markSyncActionRequired(
  localId: string,
  operationId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `
        UPDATE media_intents
        SET
          state = 'ACTION_REQUIRED',
          updated_at = ?
        WHERE local_id = ?
      `,
      now,
      localId,
    );

    await txn.runAsync(
      `
        UPDATE sync_operations
        SET
          state = 'ACTION_REQUIRED',
          last_error_code = ?,
          last_error_message = ?,
          next_attempt_at = NULL,
          updated_at = ?
        WHERE operation_id = ?
          AND state IN ('PENDING', 'IN_FLIGHT')
      `,
      errorCode,
      errorMessage,
      now,
      operationId,
    );
  });
}



