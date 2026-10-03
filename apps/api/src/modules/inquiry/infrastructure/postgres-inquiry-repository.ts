import type { Inquiry } from '../domain/inquiry.js';
import type {
  CreateInquiryResult,
  InquiryPage,
  InquiryRepository,
} from '../application/inquiry-repository.js';
import { InquiryCreateConflictError } from '../application/inquiry-repository.js';
import type { Database } from '../../../shared/persistence/database.js';

type InquiryRow = {
  id: string;
  buyer_id: string;
  product_id: string;
  catalog_version: string | number;
  message: string;
  status: Inquiry['status'];
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS = `
  id,
  buyer_id,
  product_id,
  catalog_version,
  message,
  status,
  created_at,
  updated_at
`;

function mapRow(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    buyerId: row.buyer_id,
    productId: row.product_id,
    catalogVersion: Number(row.catalog_version),
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresInquiryRepository
  implements InquiryRepository
{
  constructor(private readonly database: Database) {}

  /**
   * Writes the inquiry, or converges on the one its key already created.
   *
   * The uniqueness is in the database rather than in a read-then-write here.
   * Two concurrent retries of the same offline request would both pass a
   * "does it exist yet" check and both insert; the unique index on
   * `(buyer_id, idempotency_key)` is what actually makes the second one
   * fail, and `ON CONFLICT DO NOTHING` is what turns that failure into the
   * same answer the second one would have produced.
   *
   * The catalog version is written from the caller's validated read and is
   * additionally constrained by a foreign key to the published version it
   * names. That is the database's half of "an inquiry references published
   * catalog state": a row that named a draft, or a version that was never
   * published, cannot be written here even by code that skipped the check.
   */
  async create(input: {
    buyerId: string;
    productId: string;
    catalogVersion: number;
    message: string;
    idempotencyKey: string;
  }): Promise<CreateInquiryResult> {
    const now = new Date().toISOString();

    const rows = await this.database.query<InquiryRow>(
      `
        INSERT INTO inquiries (
          id,
          buyer_id,
          product_id,
          catalog_version,
          message,
          status,
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
          'NEW',
          $5,
          $6,
          $6
        )
        ON CONFLICT (buyer_id, idempotency_key)
        DO NOTHING
        RETURNING ${SELECT_COLUMNS}
      `,
      [
        input.buyerId,
        input.productId,
        input.catalogVersion,
        input.message,
        input.idempotencyKey,
        now,
      ],
    );

    const inserted = rows[0];

    if (inserted) {
      return {
        inquiry: mapRow(inserted),
        created: true,
      };
    }

    const existing =
      await this.findByIdempotencyKey(
        input.buyerId,
        input.idempotencyKey,
      );

    if (existing) {
      return {
        inquiry: existing,
        created: false,
      };
    }

    /**
     * The insert was refused but the key is not there. That cannot happen
     * through the conflict target, so reporting it as a lost race would
     * tell a buyer their inquiry was a duplicate when nothing is known.
     * Surfacing it as an infrastructure fault is the honest answer.
     */
    throw new InquiryCreateConflictError(
      input.buyerId,
      input.idempotencyKey,
    );
  }

  async findByIdempotencyKey(
    buyerId: string,
    idempotencyKey: string,
  ): Promise<Inquiry | null> {
    const rows = await this.database.query<InquiryRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM inquiries
        WHERE buyer_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [buyerId, idempotencyKey],
    );

    return rows[0] ? mapRow(rows[0]) : null;
  }

  /**
   * Scoped in the query, not by filtering afterwards.
   *
   * The buyer is part of the `WHERE` clause, so this cannot return another
   * buyer's inquiry even if the ownership rule later changes. It is the
   * difference between a read that is allowed to be wrong and one that
   * cannot express the mistake.
   */
  async findOwnedById(
    inquiryId: string,
    buyerId: string,
  ): Promise<Inquiry | null> {
    const rows = await this.database.query<InquiryRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM inquiries
        WHERE id = $1
          AND buyer_id = $2
        LIMIT 1
      `,
      [inquiryId, buyerId],
    );

    return rows[0] ? mapRow(rows[0]) : null;
  }

  /**
   * A bounded page of one buyer's inquiries, newest first.
   *
   * `id` is the tie-breaker so the order is total and a page boundary cannot
   * skip or repeat an inquiry, which matters here for the same reason it
   * matters in discovery: two inquiries created in the same millisecond must
   * not swap places between two requests.
   *
   * The count is a separate statement for the same reason as in the catalog
   * search: a window count over an offset past the end returns nothing, and
   * a buyer with inquiries would then be told they have none.
   */
  async listOwnedByBuyer(
    buyerId: string,
    page: { limit: number; offset: number },
  ): Promise<InquiryPage> {
    const counted = await this.database.query<{
      total: string | number;
    }>(
      `
        SELECT count(*) AS total
        FROM inquiries
        WHERE buyer_id = $1
      `,
      [buyerId],
    );

    const rows = await this.database.query<InquiryRow>(
      `
        SELECT ${SELECT_COLUMNS}
        FROM inquiries
        WHERE buyer_id = $1
        ORDER BY created_at desc, id asc
        LIMIT $2 OFFSET $3
      `,
      [buyerId, page.limit, page.offset],
    );

    return {
      inquiries: rows.map(mapRow),
      total: Number(counted[0]?.total ?? 0),
    };
  }
}
