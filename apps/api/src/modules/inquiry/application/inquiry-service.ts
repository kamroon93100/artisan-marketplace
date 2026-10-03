import {
  INQUIRY_PAGE_SIZE_DEFAULT,
  INQUIRY_PAGE_SIZE_MAX,
} from '@artisan-marketplace/contracts';
import { AppError } from '../../../shared/errors/app-error.js';
import type { Inquiry } from '../domain/inquiry.js';
import {
  InquiryValidationError,
  assertValidIdempotencyKey,
  assertValidInquiryMessage,
  assertValidInquiryProductId,
} from '../domain/inquiry.js';
import type { InquiryRepository } from './inquiry-repository.js';
import type { PublishedProductPort } from './published-product-port.js';

/**
 * A bounded page of the buyer's own inquiries, with the applied bounds
 * reported back so a client can page without recomputing them.
 */
export type InquiryListResult = {
  inquiries: readonly Inquiry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/**
 * Buyer inquiries against published catalog state.
 *
 * The reference to the catalog is read-only and is made through a port that
 * can only answer "is this visible, and at which version". Nothing here
 * writes to the catalog, and nothing here reads a working draft: an inquiry
 * names a published version, so a value that a later draft edit or AI
 * proposal could change is never what the inquiry points at.
 *
 * Identity is an argument, never a field of the request. `buyerId` is
 * established from the authenticated actor, so a client cannot create an
 * inquiry attributed to someone else, and it is applied to every read, so
 * a client cannot read someone else's.
 */
export class InquiryService {
  constructor(
    private readonly inquiries: InquiryRepository,
    private readonly publishedProducts: PublishedProductPort,
  ) {}

  /**
   * Creates a buyer's inquiry against a published product.
   *
   * The order of the checks is the order a client needs them explained in:
   * the request is validated, then a retry is resolved, then publication is
   * checked, then the record is written.
   *
   * The retry check deliberately comes before the publication check. A
   * retry arrives after the first attempt already created the inquiry, and
   * a window in which the artisan archived the product in between would
   * otherwise turn a request that genuinely succeeded into a refusal. The
   * same reasoning the catalog publish path uses, for the same reason.
   */
  async create(input: {
    productId: unknown;
    message: unknown;
    idempotencyKey: unknown;
    buyerId: string;
  }): Promise<{ inquiry: Inquiry; created: boolean }> {
    const productId = assertValidInquiryProductId(
      input.productId,
    );
    const message = assertValidInquiryMessage(input.message);
    const idempotencyKey = assertValidIdempotencyKey(
      input.idempotencyKey,
    );

    const replayed =
      await this.inquiries.findByIdempotencyKey(
        input.buyerId,
        idempotencyKey,
      );

    if (replayed) {
      return {
        inquiry: replayed,
        created: false,
      };
    }

    const published =
      await this.publishedProducts.getPublishedProduct(
        productId,
      );

    /**
     * An inquiry can only reference something a buyer could have seen.
     *
     * Reported as `NOT_FOUND` with a message that says what to do instead,
     * and without distinguishing "never published" from "archived" from
     * "does not exist": telling a caller which of those it hit would make
     * this endpoint a way to probe for the existence of an artisan's
     * unpublished work, which is the precise thing a buyer-facing surface
     * must not disclose.
     */
    if (!published) {
      throw new AppError(
        'NOT_FOUND',
        'This product is not available for inquiry. Only published products can be inquired about.',
        { productId },
      );
    }

    return this.inquiries.create({
      buyerId: input.buyerId,
      productId,
      catalogVersion: published.versionNumber,
      message,
      idempotencyKey,
    });
  }

  /**
   * One of the buyer's own inquiries.
   *
   * The read is scoped to the buyer in the query, so another buyer's inquiry
   * is indistinguishable from one that does not exist. That is deliberate:
   * a `403` here would confirm the inquiry exists, which is a disclosure
   * about another buyer's activity that a buyer has no need to receive.
   */
  async getOwn(
    inquiryId: string,
    buyerId: string,
  ): Promise<Inquiry> {
    const inquiry = await this.inquiries.findOwnedById(
      inquiryId,
      buyerId,
    );

    if (!inquiry) {
      throw new AppError(
        'NOT_FOUND',
        'Inquiry was not found.',
        { inquiryId },
      );
    }

    /**
     * The second ownership check. The query already scopes by buyer, so
     * this cannot fire for the current implementations — it is here because
     * a port is an interface, and the next implementation of it is not
     * obliged to have made the same mistake this one was careful about.
     */
    if (inquiry.buyerId !== buyerId) {
      throw new AppError(
        'FORBIDDEN',
        'The inquiry belongs to another buyer.',
        { inquiryId },
      );
    }

    return inquiry;
  }

  /**
   * A bounded page of the buyer's own inquiries, newest first.
   */
  async listOwn(
    buyerId: string,
    page: { limit?: unknown; offset?: unknown },
  ): Promise<InquiryListResult> {
    const limit = readPageSize(page.limit);
    const offset = readPageOffset(page.offset);

    const result = await this.inquiries.listOwnedByBuyer(
      buyerId,
      { limit, offset },
    );

    return {
      inquiries: result.inquiries,
      total: result.total,
      limit,
      offset,
      hasMore: offset + result.inquiries.length < result.total,
    };
  }
}

function readPageSize(raw: unknown): number {
  if (raw === undefined) {
    return INQUIRY_PAGE_SIZE_DEFAULT;
  }

  return readBoundedInteger(
    raw,
    'limit',
    1,
    INQUIRY_PAGE_SIZE_MAX,
  );
}

function readPageOffset(raw: unknown): number {
  if (raw === undefined) {
    return 0;
  }

  return readBoundedInteger(
    raw,
    'offset',
    0,
    Number.MAX_SAFE_INTEGER,
  );
}

/**
 * A page size or offset, parsed from a query string or refused.
 *
 * A non-numeric or fractional value is refused rather than rounded or
 * defaulted, and a value above the ceiling is refused rather than clamped.
 * Both would otherwise answer a question the client did not ask: a clamped
 * limit hands back fewer rows than requested with no indication that the
 * number it sent was ignored.
 */
function readBoundedInteger(
  raw: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new InquiryValidationError(
      field,
      `${field} must be a whole number.`,
    );
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed)) {
    throw new InquiryValidationError(
      field,
      `${field} must be a whole number.`,
    );
  }

  if (parsed < minimum) {
    throw new InquiryValidationError(
      field,
      `${field} must be at least ${minimum}.`,
    );
  }

  if (parsed > maximum) {
    throw new InquiryValidationError(
      field,
      `${field} must be at most ${maximum}.`,
    );
  }

  return parsed;
}
