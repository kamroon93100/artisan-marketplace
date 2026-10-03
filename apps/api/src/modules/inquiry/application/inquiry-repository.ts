import type { Inquiry } from '../domain/inquiry.js';

/**
 * A bounded page of one buyer's inquiries.
 *
 * The total is carried separately from the page for the same reason the
 * discovery page carries one: a page is empty both when the buyer has no
 * inquiries and when the offset is past the end of a list they do have, and
 * a client told "no more" in the second case would be wrong.
 */
export type InquiryPage = {
  inquiries: readonly Inquiry[];
  total: number;
};

/**
 * The outcome of a creation.
 *
 * `created` is false when this request carried an `Idempotency-Key` that had
 * already created an inquiry. The two cases return the same inquiry, so a
 * retry converges rather than duplicating; the flag is what lets a client
 * tell which one it was.
 */
export type CreateInquiryResult = {
  inquiry: Inquiry;
  created: boolean;
};

/**
 * Signals that a creation lost a race for its idempotency key.
 *
 * Distinct from an infrastructure failure, for the same reason the catalog
 * publish conflict is: a lost race means a concurrent request already
 * established the outcome and the caller should converge on it, while a
 * database error means nothing is known and must propagate rather than be
 * reported to a buyer as a business conflict.
 */
export class InquiryCreateConflictError extends Error {
  constructor(
    public readonly buyerId: string,
    public readonly idempotencyKey: string,
  ) {
    super(
      'Inquiry creation lost a race for its idempotency key.',
    );
    this.name = 'InquiryCreateConflictError';
  }
}

/**
 * The inquiry module's own persistence.
 *
 * Every read is scoped to a buyer in the *query*, not by filtering the
 * result afterwards. The difference matters: an unscoped read that is then
 * filtered can leak through a bug — a page size applied before the filter, a
 * forgotten branch, a future method added without the check — whereas a
 * scoped read cannot return another buyer's row at all. The service also
 * re-checks ownership on what it is handed, because the second layer costs
 * nothing and the boundary is worth defending twice.
 */
export interface InquiryRepository {
  create(
    input: {
      buyerId: string;
      productId: string;
      catalogVersion: number;
      message: string;
      idempotencyKey: string;
    },
  ): Promise<CreateInquiryResult>;
  findByIdempotencyKey(
    buyerId: string,
    idempotencyKey: string,
  ): Promise<Inquiry | null>;
  findOwnedById(
    inquiryId: string,
    buyerId: string,
  ): Promise<Inquiry | null>;
  listOwnedByBuyer(
    buyerId: string,
    page: { limit: number; offset: number },
  ): Promise<InquiryPage>;
}
