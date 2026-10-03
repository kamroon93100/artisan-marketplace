import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'artisan-marketplace.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;

export function getLocalDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(
      async (db) => {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;

          CREATE TABLE IF NOT EXISTS local_product_drafts (
            local_id TEXT PRIMARY KEY NOT NULL,
            title TEXT,
            state TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE INDEX IF NOT EXISTS local_product_drafts_updated_idx
            ON local_product_drafts(updated_at);

          CREATE TABLE IF NOT EXISTS media_intents (
            local_id TEXT PRIMARY KEY NOT NULL,
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

        return db;
      },
    );
  }

  return databasePromise;
}

