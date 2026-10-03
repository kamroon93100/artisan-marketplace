import type {
  CatalogProduct,
  CatalogVersion,
  ProductState,
} from '../domain/catalog-product.js';
import type {
  PublishedCatalogProduct,
  PublishedCatalogSearchQuery,
  PublishedCatalogSearchResult,
} from '../domain/catalog-published.js';
import {
  toPublishedProduct,
} from '../domain/catalog-published.js';
import type {
  CatalogRepository,
  CreateCatalogDraftInput,
  CreateCatalogDraftResult,
  PublishCatalogInput,
  PublishCatalogResult,
  UpdateCatalogProductInput,
} from '../application/catalog-repository.js';
import { CatalogPublishConflictError } from '../application/catalog-repository.js';
import type {
  Database,
  Transaction,
} from '../../../shared/persistence/database.js';

type CatalogRow = {
  id: string;
  owner_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  materials: readonly string[];
  state: ProductState;
  created_at: string;
  updated_at: string;
  published_version: string | number | null;
};

type VersionRow = {
  id: string;
  product_id: string;
  version_number: string | number;
  title: string;
  description: string;
  category: string | null;
  materials: readonly string[];
  published_at: string;
  published_by: string;
};

/**
 * A row of the buyer-visible published read.
 *
 * It has no `version_id` and no `published_by` because the buyer-facing
 * projection has neither; the query below does not select them, so a value
 * that must not reach a buyer is not even read out of the database on this
 * path.
 */
type PublishedRow = {
  product_id: string;
  version_number: string | number;
  title: string;
  description: string;
  category: string | null;
  materials: readonly string[];
  published_at: string;
};

function mapRow(row: CatalogRow): CatalogProduct {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    category: row.category,
    materials: [...row.materials],
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedVersion:
      row.published_version === null ||
      row.published_version === undefined
        ? null
        : Number(row.published_version),
  };
}

function mapVersionRow(row: VersionRow): CatalogVersion {
  return {
    id: row.id,
    productId: row.product_id,
    versionNumber: Number(row.version_number),
    title: row.title,
    description: row.description,
    category: row.category,
    materials: [...row.materials],
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

function mapPublishedRow(
  row: PublishedRow,
): PublishedCatalogProduct {
  return {
    productId: row.product_id,
    versionNumber: Number(row.version_number),
    title: row.title,
    description: row.description,
    category: row.category,
    materials: [...row.materials],
    publishedAt: row.published_at,
  };
}

/**
 * Turns a search term into a `LIKE` pattern that matches it literally.
 *
 * `LIKE` treats `%`, `_`, and the escape character itself as syntax. A
 * buyer searching for "50% wool" would otherwise get a pattern that matches
 * almost the whole catalog, which is both wrong and a cheap way to make the
 * search endpoint expensive.
 */
function likeContainsPattern(search: string): string {
  const escaped = search
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');

  return `%${escaped}%`;
}

const SELECT_COLUMNS = `
  id,
  owner_id,
  title,
  description,
  category,
  materials,
  state,
  created_at,
  updated_at,
  published_version
`;

const VERSION_SELECT_COLUMNS = `
  id,
  product_id,
  version_number,
  title,
  description,
  category,
  materials,
  published_at,
  published_by
`;

/**
 * The buyer-visible published read.
 *
 * Two properties of this query carry the guarantees the rest of the system
 * is allowed to assume, so they are worth stating rather than leaving to be
 * discovered:
 *
 * 1. **It never reads the working draft.** Every column comes from
 *    `catalog_versions`, and the join pins the version to the one the
 *    product currently has published. `catalog_products` is joined for its
 *    pointer and its archive flag and contributes no listing value, so a
 *    draft edit cannot reach a buyer through this path.
 *
 * 2. **A never-published product cannot appear.** The join requires
 *    `v.version_number = p.published_version`, which is unsatisfiable while
 *    `published_version` is null — there is no version row to match — so
 *    invisibility before publication is a property of the query rather
 *    than a filter that could be forgotten.
 *
 * This predicate mirrors `isPublishedReadVisible` in
 * `domain/catalog-published.ts`. The rule is stated there and cannot be
 * reused here because the domain function runs in TypeScript and this runs
 * in the database, so the two are kept in step by pointing at each other
 * and by `postgres-catalog-repository.test.ts` asserting this shape. If one
 * changes, the other has to change with it.
 */
const PUBLISHED_VISIBILITY_PREDICATE = `
  p.published_version is not null
  and p.state <> 'ARCHIVED'
`;

/**
 * The case-insensitive text a published listing is searched against.
 *
 * It is the SQL form of `publishedSearchText` in
 * `domain/catalog-published.ts`, including the exclusion of `materials`.
 * The two must stay identical: the in-memory repository matches with the
 * TypeScript function, so a divergence would make local development and
 * tests answer a different question from production.
 *
 * `%` and `_` are escaped by the caller because this is used with `LIKE`,
 * where they are wildcards; a search for a literal `%` must not become a
 * match-everything pattern.
 */
const PUBLISHED_SEARCH_TEXT = `
  lower(
    coalesce(v.title, '') || ' ' ||
    coalesce(v.description, '') || ' ' ||
    coalesce(v.category, '')
  )
`;

const PUBLISHED_SELECT_COLUMNS = `
  v.product_id,
  v.version_number,
  v.title,
  v.description,
  v.category,
  v.materials,
  v.published_at
`;

export class PostgresCatalogRepository
  implements CatalogRepository
{
  constructor(private readonly database: Database) {}

  async createDraft(
    input: CreateCatalogDraftInput,
  ): Promise<CreateCatalogDraftResult> {
    const now = new Date().toISOString();

    const rows = await this.database.query<CatalogRow>(
      `
        INSERT INTO catalog_products (
          id,
          owner_id,
          title,
          description,
          category,
          materials,
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
          $4,
          $5,
          'LOCAL_DRAFT',
          $6,
          $7,
          $7
        )
        ON CONFLICT (
          owner_id,
          idempotency_key
        )
        WHERE idempotency_key IS NOT NULL
        DO NOTHING
        RETURNING ${SELECT_COLUMNS}
      `,
      [
        input.ownerId,
        input.title ?? null,
        input.description ?? null,
        input.category ?? null,
        input.materials ?? [],
        input.idempotencyKey ?? null,
        now,
      ],
    );

    if (rows[0]) {
      return {
        product: mapRow(rows[0]),
        created: true,
      };
    }

    const existing =
      input.idempotencyKey?.trim()
        ? await this.findByIdempotencyKey(
            input.ownerId,
            input.idempotencyKey,
          )
        : null;

    if (existing) {
      return {
        product: existing,
        created: false,
      };
    }

    throw new Error(
      'Catalog product insert returned no row.',
    );
  }

  async findByIdempotencyKey(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<CatalogProduct | null> {
    const rows = await this.database.query<CatalogRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM catalog_products
        WHERE owner_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [ownerId, idempotencyKey],
    );

    return rows[0] ? mapRow(rows[0]) : null;
  }

  async getById(
    id: string,
  ): Promise<CatalogProduct | null> {
    const rows = await this.database.query<CatalogRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM catalog_products
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return rows[0]
      ? mapRow(rows[0])
      : null;
  }

  async transitionState(
    id: string,
    state: ProductState,
    expectedState: ProductState,
  ): Promise<CatalogProduct> {
    const now = new Date().toISOString();

    const rows = await this.database.query<CatalogRow>(
      `
        UPDATE catalog_products
        SET
          state = $1,
          updated_at = $2,
          version = version + 1
        WHERE id = $3
          AND state = $4
        RETURNING ${SELECT_COLUMNS}
      `,
      [
        state,
        now,
        id,
        expectedState,
      ],
    );

    const row = rows[0];

    if (!row) {
      /**
       * No row matched the expected state, so either the product was
       * deleted or a concurrent caller transitioned it first. Read the
       * current state to distinguish "not found" from "lost a race."
       */
      const current =
        await this.getById(id);

      if (!current) {
        throw new Error(
          `Product not found: ${id}`,
        );
      }

      throw new Error(
        `Invalid catalog state transition: ${current.state} -> ${state}`,
      );
    }

    return mapRow(row);
  }

  /**
   * Writes only the supplied fields.
   *
   * Building the assignment list from the fields actually present is
   * what makes a partial edit safe to retry and safe to run
   * concurrently: an absent field is never written, so a second edit to
   * a different field cannot be reverted by the first one's stale copy.
   */
  async updateFields(
    input: UpdateCatalogProductInput,
  ): Promise<CatalogProduct> {
    const now = new Date().toISOString();

    const assignments: string[] = [
      'updated_at = $1',
      'version = version + 1',
    ];

    const params: unknown[] = [now];

    const addAssignment = (
      column: string,
      value: unknown,
    ): void => {
      params.push(value);
      assignments.push(
        `${column} = $${params.length}`,
      );
    };

    if (input.title !== undefined) {
      addAssignment('title', input.title);
    }

    if (input.description !== undefined) {
      addAssignment('description', input.description);
    }

    if (input.category !== undefined) {
      addAssignment('category', input.category);
    }

    if (input.materials !== undefined) {
      addAssignment('materials', input.materials);
    }

    params.push(input.id);

    const rows = await this.database.query<CatalogRow>(
      `
        UPDATE catalog_products
        SET ${assignments.join(', ')}
        WHERE id = $${params.length}
        RETURNING ${SELECT_COLUMNS}
      `,
      params,
    );

    const row = rows[0];

    if (!row) {
      throw new Error(
        `Product not found: ${input.id}`,
      );
    }

    return mapRow(row);
  }

  /**
   * Publishes a product and writes its immutable catalog version in one
   * transaction.
   *
   * The two writes belong together: a PUBLISHED product whose version
   * row was never written would be buyer-visible with no published
   * record behind it, and a version row written for a product that never
   * reached PUBLISHED would be a snapshot of something buyers were never
   * shown. Allocating the version number from the row the
   * compare-and-set actually returned keeps the product's pointer and
   * the version it names from disagreeing.
   */
  async publish(
    input: PublishCatalogInput,
  ): Promise<PublishCatalogResult> {
    const now = new Date().toISOString();

    try {
      return await this.database.transaction(
        async (tx) => {
          /**
           * Re-checked inside the transaction rather than trusted from
           * the caller's earlier read. Between the two, a concurrent
           * publish with the same key may have committed; taking the
           * lock-free read here means the retry converges on that
           * version instead of racing to insert a duplicate.
           */
          const existing =
            await this.findVersionByIdempotencyKeyIn(
              tx,
              input.id,
              input.idempotencyKey,
            );

          if (existing) {
            const product = await this.requireProductRow(
              tx,
              input.id,
            );

            return {
              product,
              version: existing,
              created: false,
            };
          }

          const updated = await tx.query<CatalogRow>(
            `
              UPDATE catalog_products
              SET
                state = 'PUBLISHED',
                published_version =
                  coalesce(published_version, 0) + 1,
                updated_at = $1,
                version = version + 1
              WHERE id = $2
                AND state = $3
              RETURNING ${SELECT_COLUMNS}
            `,
            [now, input.id, input.expectedState],
          );

          const product = updated[0];

          if (!product) {
            throw new CatalogPublishConflictError(
              input.id,
            );
          }

          /**
           * The snapshot is taken from the row the update returned, not
           * from a separate read, so what is published is exactly the
           * state that became visible. `ON CONFLICT DO NOTHING` keeps a
           * duplicate key from raising; it is reported as a lost race so
           * the caller converges on the winner instead.
           */
          const inserted =
            await tx.query<VersionRow>(
              `
                INSERT INTO catalog_versions (
                  id,
                  product_id,
                  version_number,
                  title,
                  description,
                  category,
                  materials,
                  published_at,
                  published_by,
                  idempotency_key
                )
                VALUES (
                  gen_random_uuid(),
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6,
                  $7,
                  $8,
                  $9
                )
                ON CONFLICT (
                  product_id,
                  idempotency_key
                )
                  WHERE idempotency_key IS NOT NULL
                DO NOTHING
                RETURNING ${VERSION_SELECT_COLUMNS}
              `,
              [
                product.id,
                product.published_version,
                product.title,
                product.description,
                product.category,
                product.materials,
                now,
                input.publishedBy,
                input.idempotencyKey,
              ],
            );

          const version = inserted[0];

          if (!version) {
            throw new CatalogPublishConflictError(
              input.id,
            );
          }

          return {
            product: mapRow(product),
            version: mapVersionRow(version),
            created: true,
          };
        },
      );
    } catch (error) {
      /**
       * The transaction is already rolled back by the time this runs, so
       * the conflict can be resolved against committed state. An error
       * that is not a lost race is rethrown untouched: reporting an
       * infrastructure failure as a business conflict would tell a client
       * to retry something the server never evaluated.
       */
      if (
        error instanceof CatalogPublishConflictError
      ) {
        return this.resolvePublishConflict(input);
      }

      throw error;
    }
  }

  /**
   * Settles a publish whose compare-and-set or version insert lost a
   * race. A version already carrying this idempotency key means the
   * request did succeed, just not as the winner of the race, so the
   * caller is handed that version. Otherwise the product genuinely
   * cannot be published from where it now sits, and that is reported
   * as the conflict it is rather than as a success.
   */
  private async resolvePublishConflict(
    input: PublishCatalogInput,
  ): Promise<PublishCatalogResult> {
    const settled =
      await this.findVersionByIdempotencyKey(
        input.id,
        input.idempotencyKey,
      );

    const current = await this.getById(input.id);

    if (!current) {
      throw new Error(
        `Product not found: ${input.id}`,
      );
    }

    if (settled) {
      return {
        product: current,
        version: settled,
        created: false,
      };
    }

    throw new Error(
      `Invalid catalog state transition: ${current.state} -> PUBLISHED`,
    );
  }

  async findVersionByIdempotencyKey(
    productId: string,
    idempotencyKey: string,
  ): Promise<CatalogVersion | null> {
    return this.findVersionByIdempotencyKeyIn(
      this.database,
      productId,
      idempotencyKey,
    );
  }

  private async findVersionByIdempotencyKeyIn(
    executor: Database | Transaction,
    productId: string,
    idempotencyKey: string,
  ): Promise<CatalogVersion | null> {
    const rows = await executor.query<VersionRow>(
      `
        SELECT ${VERSION_SELECT_COLUMNS}
        FROM catalog_versions
        WHERE product_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [productId, idempotencyKey],
    );

    return rows[0] ? mapVersionRow(rows[0]) : null;
  }

  async listVersions(
    productId: string,
  ): Promise<readonly CatalogVersion[]> {
    const rows = await this.database.query<VersionRow>(
      `
        SELECT ${VERSION_SELECT_COLUMNS}
        FROM catalog_versions
        WHERE product_id = $1
        ORDER BY version_number DESC
      `,
      [productId],
    );

    return rows.map(mapVersionRow);
  }

  private async requireProductRow(
    tx: Transaction,
    id: string,
  ): Promise<CatalogProduct> {
    const rows = await tx.query<CatalogRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM catalog_products
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    const row = rows[0];

    if (!row) {
      throw new Error(
        `Product not found: ${id}`,
      );
    }

    return mapRow(row);
  }

  async getPublishedSnapshot(
    productId: string,
  ): Promise<PublishedCatalogProduct | null> {
    const rows = await this.database.query<PublishedRow>(
      `
        SELECT ${PUBLISHED_SELECT_COLUMNS}
        FROM catalog_versions v
        JOIN catalog_products p
          ON p.id = v.product_id
         AND v.version_number = p.published_version
        WHERE p.id = $1
          AND ${PUBLISHED_VISIBILITY_PREDICATE}
        LIMIT 1
      `,
      [productId],
    );

    return rows[0] ? mapPublishedRow(rows[0]) : null;
  }

  /**
   * A bounded page of buyer-visible listings, newest publication first.
   *
   * The count and the page are two statements rather than one window
   * function, for a specific reason: a window `count(*) over ()` is
   * computed over the same result the page is cut from, so an offset past
   * the end of the catalog returns no rows and no count either, and a
   * client would be told "no results" when the catalog has thousands.
   * Counting separately means `total` is right even when the page is empty.
   *
   * The two statements are not one snapshot, so a publication that lands
   * between them can make the total and the page disagree by one. That is
   * accepted for the first slice and recorded rather than hidden; a cursor
   * over a fixed snapshot is what would remove it.
   */
  async searchPublishedSnapshots(
    query: PublishedCatalogSearchQuery,
  ): Promise<PublishedCatalogSearchResult> {
    const search = query.search?.trim().toLowerCase();
    const pattern =
      search && search.length > 0
        ? likeContainsPattern(search)
        : null;

    const counted =
      await this.database.query<{ total: string | number }>(
        `
          SELECT count(*) AS total
          FROM catalog_versions v
          JOIN catalog_products p
            ON p.id = v.product_id
           AND v.version_number = p.published_version
          WHERE ${PUBLISHED_VISIBILITY_PREDICATE}
            AND (
              $1::text is null
              or ${PUBLISHED_SEARCH_TEXT} like $1 escape '\\'
            )
        `,
        [pattern],
      );

    const rows = await this.database.query<PublishedRow>(
      `
        SELECT ${PUBLISHED_SELECT_COLUMNS}
        FROM catalog_versions v
        JOIN catalog_products p
          ON p.id = v.product_id
         AND v.version_number = p.published_version
        WHERE ${PUBLISHED_VISIBILITY_PREDICATE}
          AND (
            $1::text is null
            or ${PUBLISHED_SEARCH_TEXT} like $1 escape '\\'
          )
        ORDER BY v.published_at desc, v.product_id asc
        LIMIT $2 OFFSET $3
      `,
      [pattern, query.limit, query.offset],
    );

    return {
      items: rows.map(mapPublishedRow),
      total: Number(counted[0]?.total ?? 0),
    };
  }
}
