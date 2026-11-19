import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'artisan-marketplace.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;

/**
 * Every account-owned local record is keyed by the authenticated server
 * actor id. A missing owner is a programming error, not a default: an
 * empty value must never be written because a query for one account could
 * then match rows written on behalf of no account at all.
 */
export function requireLocalOwnerId(ownerId: string): string {
  if (
    typeof ownerId !== 'string' ||
    ownerId.trim().length === 0
  ) {
    throw new Error(
      'Local data operations require an authenticated owner.',
    );
  }

  return ownerId;
}

/**
 * Initialize the database schema
 */
async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS local_product_drafts (
      local_id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT,
      title TEXT,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS local_product_drafts_updated_idx
      ON local_product_drafts(updated_at);

    CREATE TABLE IF NOT EXISTS media_intents (
      local_id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT,
      product_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      uri TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL,
      remote_media_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS media_intents_product_idx
      ON media_intents(product_id);

    CREATE INDEX IF NOT EXISTS media_intents_state_idx
      ON media_intents(state);

    CREATE TABLE IF NOT EXISTS sync_operations (
      operation_id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT,
      operation_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      last_error_message TEXT,
      next_attempt_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sync_operations_state_idx
      ON sync_operations(state);

    CREATE INDEX IF NOT EXISTS sync_operations_next_attempt_idx
      ON sync_operations(next_attempt_at);
  `);

  const draftColumns =
    await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(local_product_drafts)`,
    );

  if (
    !draftColumns.some(
      (column) => column.name === 'remote_product_id',
    )
  ) {
    await db.execAsync(
      `ALTER TABLE local_product_drafts ADD COLUMN remote_product_id TEXT`,
    );
  }

  // Existing installs gain the owner column without rewriting rows.
  // A row whose owner_id is NULL predates account ownership or was
  // written by a broken build. It is deliberately preserved but is
  // not readable or syncable by any account: every query below
  // matches an explicit owner, and NULL never equals one. Recovering
  // such rows requires a deliberate, human-authorized policy rather
  // than silently assigning them to whoever signs in next.
  if (
    !draftColumns.some(
      (column) => column.name === 'owner_id',
    )
  ) {
    await db.execAsync(
      `ALTER TABLE local_product_drafts ADD COLUMN owner_id TEXT`,
    );
  }

  // The server's media state is recorded locally so an interrupted
  // upload can resume from where it stopped, and so the artisan
  // sees the real state instead of a guess after a restart.
  const mediaColumns =
    await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(media_intents)`,
    );

  if (
    !mediaColumns.some(
      (column) => column.name === 'remote_state',
    )
  ) {
    await db.execAsync(
      `ALTER TABLE media_intents ADD COLUMN remote_state TEXT`,
    );
  }

  if (
    !mediaColumns.some(
      (column) => column.name === 'owner_id',
    )
  ) {
    await db.execAsync(
      `ALTER TABLE media_intents ADD COLUMN owner_id TEXT`,
    );
  }

  const operationColumns =
    await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(sync_operations)`,
    );

  if (
    !operationColumns.some(
      (column) => column.name === 'owner_id',
    )
  ) {
    await db.execAsync(
      `ALTER TABLE sync_operations ADD COLUMN owner_id TEXT`,
    );
  }

  // Owner-scoped indexes are created after the migration, because
  // an index over a column that an older database has not gained
  // yet would fail the whole startup.
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS local_product_drafts_owner_idx
      ON local_product_drafts(owner_id, updated_at);

    CREATE INDEX IF NOT EXISTS media_intents_owner_product_idx
      ON media_intents(owner_id, product_id);

    CREATE INDEX IF NOT EXISTS media_intents_owner_state_idx
      ON media_intents(owner_id, state);

    CREATE INDEX IF NOT EXISTS sync_operations_owner_state_idx
      ON sync_operations(owner_id, state, next_attempt_at);

    CREATE INDEX IF NOT EXISTS sync_operations_owner_aggregate_idx
      ON sync_operations(owner_id, aggregate_id);
  `);
}


export function getLocalDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(
      async (db) => {
        await initializeDatabase(db);
        return db;
      },
    );
  }

  return databasePromise;
}
