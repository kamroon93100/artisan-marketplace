import { getLocalDatabase } from './database';

export const LOCAL_PRODUCT_STATES = [
  'LOCAL_ONLY',
  'PENDING_SYNC',
  'ACTION_REQUIRED',
  'SYNCED',
] as const;

export type LocalProductState =
  (typeof LOCAL_PRODUCT_STATES)[number];

export type LocalProductDraft = {
  localId: string;
  remoteProductId: string | null;
  title: string | null;
  state: LocalProductState;
  createdAt: string;
  updatedAt: string;
};

function mapProductDraftRow(
  row: Record<string, unknown>,
): LocalProductDraft {
  const state = String(row.state);

  return {
    localId: String(row.local_id),
    remoteProductId:
      row.remote_product_id === null ||
      row.remote_product_id === undefined
        ? null
        : String(row.remote_product_id),
    title:
      row.title === null || row.title === undefined
        ? null
        : String(row.title),
    state: LOCAL_PRODUCT_STATES.includes(
      state as LocalProductState,
    )
      ? (state as LocalProductState)
      : 'LOCAL_ONLY',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function createLocalProductId(): string {
  return `product-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export async function createLocalProductDraft(): Promise<LocalProductDraft> {
  const db = await getLocalDatabase();
  const localId = createLocalProductId();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO local_product_drafts (
        local_id,
        remote_product_id,
        title,
        state,
        created_at,
        updated_at
      )
      VALUES (?, NULL, NULL, 'LOCAL_ONLY', ?, ?)
    `,
    localId,
    now,
    now,
  );

  const row =
    await db.getFirstAsync<Record<string, unknown>>(
      `
        SELECT
          local_id,
          remote_product_id,
          title,
          state,
          created_at,
          updated_at
        FROM local_product_drafts
        WHERE local_id = ?
      `,
      localId,
    );

  if (!row) {
    throw new Error(
      'Local product draft could not be created.',
    );
  }

  return mapProductDraftRow(row);
}

export async function getLocalProductDraft(
  localId: string,
): Promise<LocalProductDraft | null> {
  const db = await getLocalDatabase();

  const row =
    await db.getFirstAsync<Record<string, unknown>>(
      `
        SELECT
          local_id,
          remote_product_id,
          title,
          state,
          created_at,
          updated_at
        FROM local_product_drafts
        WHERE local_id = ?
      `,
      localId,
    );

  return row ? mapProductDraftRow(row) : null;
}

export async function setLocalProductRemoteId(
  localId: string,
  remoteProductId: string,
): Promise<LocalProductDraft> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE local_product_drafts
      SET
        remote_product_id = ?,
        updated_at = ?
      WHERE local_id = ?
    `,
    remoteProductId,
    now,
    localId,
  );

  const updated = await getLocalProductDraft(localId);

  if (!updated) {
    throw new Error(
      'Local product draft could not be read after remote id update.',
    );
  }

  return updated;
}

export async function updateLocalProductDraft(
  localId: string,
  input: {
    title?: string | null;
    state?: LocalProductState;
  },
): Promise<LocalProductDraft> {
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  const existing = await getLocalProductDraft(localId);

  if (!existing) {
    throw new Error(
      'Local product draft does not exist.',
    );
  }

  await db.runAsync(
    `
      UPDATE local_product_drafts
      SET
        title = ?,
        state = ?,
        updated_at = ?
      WHERE local_id = ?
    `,
    input.title === undefined
      ? existing.title
      : input.title,
    input.state ?? existing.state,
    now,
    localId,
  );

  const updated = await getLocalProductDraft(localId);

  if (!updated) {
    throw new Error(
      'Local product draft could not be read after update.',
    );
  }

  return updated;
}

export async function listLocalProductDrafts(): Promise<
  LocalProductDraft[]
> {
  const db = await getLocalDatabase();

  const rows =
    await db.getAllAsync<Record<string, unknown>>(
      `
        SELECT
          local_id,
          remote_product_id,
          title,
          state,
          created_at,
          updated_at
        FROM local_product_drafts
        ORDER BY updated_at DESC
      `,
    );

  return rows.map(mapProductDraftRow);
}
