/**
 * Buyer inquiries against published catalog state.
 *
 * `docs/architecture/data-and-rls-contract.md` fixes the boundary this
 * module exists to honour: an inquiry references a published product, and
 * must not depend on a local-only draft or an AI proposal. Nothing in this
 * contract carries a draft field, a proposal, a confidence value, or a
 * product state, because none of them could be depended upon without the
 * reference becoming unstable.
 */

/**
 * The inquiry statuses that exist today.
 *
 * M6 creates inquiries and reads them back; it does not answer them. The
 * statuses an artisan inbox will produce — read, responded, closed — arrive
 * with that slice. They are not listed here now, because a status no
 * operation can produce is a contract that promises a client something the
 * server cannot deliver, and a client that branches on it would be wrong
 * today and would have to be corrected later.
 */
export const INQUIRY_STATUSES = ['NEW'] as const;

export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

/** Longest accepted buyer message, in characters. */
export const INQUIRY_MESSAGE_MAX_LENGTH = 2000;

/** Default number of inquiries returned when a client does not ask for a size. */
export const INQUIRY_PAGE_SIZE_DEFAULT = 20;

/**
 * Hard ceiling on a requested page size. Bounded for the same reason as the
 * discovery page size: it is client-controlled input, and the server
 * enforces the ceiling itself rather than trusting the value.
 */
export const INQUIRY_PAGE_SIZE_MAX = 50;

/**
 * A buyer's inquiry.
 *
 * `catalogVersion` is the published version that was current when the
 * inquiry was created. It is recorded rather than derived, so the reference
 * stays meaningful after the artisan edits the product: the inquiry still
 * says which listing the buyer actually responded to.
 *
 * The buyer is named because the read is buyer-owned and the client needs
 * to know whose list it is showing; it is never taken from the request
 * body, and a buyer may only read an inquiry whose `buyerId` is their own.
 */
export type InquiryResponse = {
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
 * Creation request.
 *
 * The buyer identity is absent by design: it comes from the authenticated
 * actor, never from the body. `productId` must name a product that is
 * buyer-visible — published and not archived — or the request is refused.
 */
export type CreateInquiryRequest = {
  productId: string;
  message: string;
};

/**
 * Creation response.
 *
 * `deduplicated` is the honest signal for a repeated `Idempotency-Key`:
 * the retry converges on the inquiry the first request created rather than
 * creating a second one, and the status code alone cannot distinguish the
 * two cases from the client's side.
 */
export type CreateInquiryResponse = {
  inquiry: InquiryResponse;
  deduplicated: boolean;
};

/** A bounded page of the authenticated buyer's own inquiries. */
export type ListInquiriesResponse = {
  inquiries: readonly InquiryResponse[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

/** A single buyer-owned inquiry. */
export type GetInquiryResponse = {
  inquiry: InquiryResponse;
};
