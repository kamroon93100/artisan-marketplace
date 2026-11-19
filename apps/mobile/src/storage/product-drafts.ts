import {
  getLocalDatabase,
  requireLocalOwnerId,
} from './database';

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

export async function createLocalProductDraft(
  ownerId: string,
): Promise<LocalProductDraft> {
  const owner = requireLocalOwnerId(ownerId);
  const db = await getLocalDatabase();
  const localId = createLocalProductId();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      INSERT INTO local_product_drafts (
        local_id,
        owner_id,
        remote_product_id,
        title,
        state,
        created_at,
        updated_at
      )
      VALUES (?, ?, NULL, NULL, 'LOCAL_ONLY', ?, ?)
    `,
    localId,
    owner,
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
          AND owner_id = ?
      `,
      localId,
      owner,
    );

  if (!row) {
    throw new Error(
      'Local product draft could not be created.',
    );
  }

  return mapProductDraftRow(row);
}

export async function getLocalProductDraft(
  ownerId: string,
  localId: string,
): Promise<LocalProductDraft | null> {
  const owner = requireLocalOwnerId(ownerId);
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
          AND owner_id = ?
      `,
      localId,
      owner,
    );

  return row ? mapProductDraftRow(row) : null;
}

export async function setLocalProductRemoteId(
  ownerId: string,
  localId: string,
  remoteProductId: string,
): Promise<LocalProductDraft> {
  const owner = requireLocalOwnerId(ownerId);
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  const result = await db.runAsync(
    `
      UPDATE local_product_drafts
      SET
        remote_product_id = ?,
        updated_at = ?
      WHERE local_id = ?
        AND owner_id = ?
    `,
    remoteProductId,
    now,
    localId,
    owner,
  );

  if (result.changes !== 1) {
    throw new Error(
      'Local product draft does not exist.',
    );
  }

  const updated = await getLocalProductDraft(
    owner,
    localId,
  );

  if (!updated) {
    throw new Error(
      'Local product draft could not be read after remote id update.',
    );
  }

  return updated;
}

export async function updateLocalProductDraft(
  ownerId: string,
  localId: string,
  input: {
    title?: string | null;
    state?: LocalProductState;
  },
): Promise<LocalProductDraft> {
  const owner = requireLocalOwnerId(ownerId);
  const db = await getLocalDatabase();
  const now = new Date().toISOString();

  const existing = await getLocalProductDraft(
    owner,
    localId,
  );

  if (!existing) {
    throw new Error(
      'Local product draft does not exist.',
    );
  }

  const result = await db.runAsync(
    `
      UPDATE local_product_drafts
      SET
        title = ?,
        state = ?,
        updated_at = ?
      WHERE local_id = ?
        AND owner_id = ?
    `,
    input.title === undefined
      ? existing.title
      : input.title,
    input.state ?? existing.state,
    now,
    localId,
    owner,
  );

  if (result.changes !== 1) {
    throw new Error(
      'Local product draft does not exist.',
    );
  }

  const updated = await getLocalProductDraft(
    owner,
    localId,
  );

  if (!updated) {
    throw new Error(
      'Local product draft could not be read after update.',
    );
  }

  return updated;
}

export async function listLocalProductDrafts(
  ownerId: string,
): Promise<LocalProductDraft[]> {
  const owner = requireLocalOwnerId(ownerId);
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
        WHERE owner_id = ?
        ORDER BY updated_at DESC
      `,
      owner,
    );

  return rows.map(mapProductDraftRow);
}
