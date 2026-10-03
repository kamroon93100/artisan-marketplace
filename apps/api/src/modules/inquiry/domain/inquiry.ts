import {
  INQUIRY_MESSAGE_MAX_LENGTH,
  INQUIRY_STATUSES,
} from '@artisan-marketplace/contracts';
import type { InquiryStatus } from '@artisan-marketplace/contracts';

export type { InquiryStatus };

/**
 * A buyer's inquiry against a published product.
 *
 * `catalogVersion` is the published version that was current when the
 * inquiry was created, and it is recorded rather than looked up on read.
 * That is the difference between an inquiry that still says which listing
 * the buyer responded to and one that silently starts describing a
 * different listing the next time the artisan republishes: the artisan's
 * edit after the fact must not rewrite what the buyer asked about.
 */
export type Inquiry = {
  id: string;
  buyerId: string;
  productId: string;
  catalogVersion: number;
  message: string;
  status: InquiryStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * The untrusted shape of a creation request, after nothing has been checked.
 *
 * The buyer is absent from it. Identity is resolved from the session and
 * passed separately, so no client can create an inquiry "from" someone else
 * by putting their id in the body.
 */
export type CreateInquiryInput = {
  productId: string;
  message: string;
  idempotencyKey: string;
  buyerId: string;
};

/**
 * A rejected inquiry field, naming the field at fault.
 *
 * A domain error rather than a transport error, so the same rule applies to
 * every caller and the HTTP layer decides only how to report it.
 */
export class InquiryValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'InquiryValidationError';
  }
}

/**
 * The statuses an inquiry may hold, as the single runtime list.
 *
 * Re-exported from contracts so the value that reaches a client and the
 * value the module accepts cannot come from two different lists.
 */
export const INQUIRY_STATUS_VALUES = INQUIRY_STATUSES;

/**
 * Validates a buyer's message.
 *
 * A blank message is refused rather than stored. An inquiry whose substance
 * is whitespace carries nothing for the artisan to answer, and accepting one
 * would create a record that looks like a real conversation and produces no
 * reply — the worst of both. The stored value is the trimmed message, so what
 * is read back is what was checked rather than a variant of it.
 *
 * The length is bounded because the message is unbounded client input being
 * written to canonical state. The bound is enforced here as well as in the
 * database, so an oversized message is refused with a message a client can
 * act on rather than as a constraint violation.
 */
export function assertValidInquiryMessage(
  message: unknown,
): string {
  if (typeof message !== 'string') {
    throw new InquiryValidationError(
      'message',
      'message is required and must be text.',
    );
  }

  const trimmed = message.trim();

  if (trimmed.length === 0) {
    throw new InquiryValidationError(
      'message',
      'message must not be blank.',
    );
  }

  if (trimmed.length > INQUIRY_MESSAGE_MAX_LENGTH) {
    throw new InquiryValidationError(
      'message',
      `message must be at most ${INQUIRY_MESSAGE_MAX_LENGTH} characters.`,
    );
  }

  return trimmed;
}

/**
 * Validates the product an inquiry names.
 *
 * A blank id is refused here rather than being looked up, so a missing
 * product is reported as the invalid input it is instead of as a lookup
 * that happened to find nothing.
 */
export function assertValidInquiryProductId(
  productId: unknown,
): string {
  if (typeof productId !== 'string') {
    throw new InquiryValidationError(
      'productId',
      'productId is required and must be text.',
    );
  }

  const trimmed = productId.trim();

  if (trimmed.length === 0) {
    throw new InquiryValidationError(
      'productId',
      'productId must not be blank.',
    );
  }

  return trimmed;
}

/**
 * Validates the retry key that makes creation idempotent.
 *
 * Required rather than optional, and required to be non-blank. Creation
 * without it is not "creation without deduplication": an offline client
 * retrying a request whose response it never saw would create a second
 * inquiry for the same intention, and a buyer who cannot tell which of the
 * two an artisan answers is worse off than one that was refused outright.
 */
export function assertValidIdempotencyKey(
  idempotencyKey: unknown,
): string {
  if (typeof idempotencyKey !== 'string') {
    throw new InquiryValidationError(
      'Idempotency-Key',
      'Idempotency-Key is required to create an inquiry.',
    );
  }

  const trimmed = idempotencyKey.trim();

  if (trimmed.length === 0) {
    throw new InquiryValidationError(
      'Idempotency-Key',
      'Idempotency-Key is required to create an inquiry.',
    );
  }

  return trimmed;
}
