import type {
  AiProposalField,
  CatalogProductResponse,
  ProductState,
  ReviewBlocking,
  ReviewBlockingReason,
  ReviewSuggestion,
} from '@artisan-marketplace/contracts';

/**
 * The product as the review surface needs it.
 *
 * The same shape the catalog API already returns, deliberately and in full.
 * A partial read model would have to invent something for the fields it
 * omits, and an invented `createdAt` or a hard-coded `publishedVersion: null`
 * is a value no one measured. Worse, a second product shape means the
 * artisan client holds two types for the same product and cannot tell
 * whether a missing version means "not published" or "not reported".
 *
 * What makes this a read model rather than a product is that the Review
 * module never constructs or stores one. It reads a snapshot to report on,
 * and it hands approval to the Catalog module, which owns the product and
 * every rule about writing to it.
 */
export type ReviewProductSnapshot = CatalogProductResponse;

/**
 * The fields a buyer-visible listing cannot be published without.
 *
 * This repeats the Catalog module's publish precondition on purpose rather
 * than importing it. The review surface has to be able to say "a
 * description is still missing" before anything is approved, and the list
 * it reports is the same list publication will enforce. Two lists would
 * drift, so the field names are asserted to match in
 * `review-readiness.test.ts`; the Catalog module remains the single place
 * that *enforces* them.
 */
export const REVIEW_REQUIRED_FIELDS = [
  'title',
  'description',
] as const;

export type ReviewRequiredField =
  (typeof REVIEW_REQUIRED_FIELDS)[number];

/**
 * States from which the Catalog module will accept an approval.
 *
 * Kept as a predicate over the same state machine the Catalog module uses
 * rather than as a second transition table. `review-readiness.test.ts`
 * asserts this agrees with `assertApprovableState` for every state, so the
 * two cannot drift without a test failing.
 */
const NON_APPROVABLE_STATES: readonly ProductState[] = [
  'LOCAL_DRAFT',
  'PENDING_SYNC',
  'PUBLISHED',
  'ARCHIVED',
  'CONFLICT',
  'ACTION_REQUIRED',
];

export type ApprovalReadiness = {
  blocking: readonly ReviewBlocking[];
  readyForApproval: boolean;
};

function fieldValueOf(
  product: ReviewProductSnapshot,
  field: AiProposalField,
): string | readonly string[] | null {
  if (field === 'materials') {
    return product.materials;
  }

  return product[field];
}

function describeMissingField(
  field: ReviewRequiredField,
): string {
  return field === 'title'
    ? 'This product has no title yet. Buyers need one to recognise it.'
    : 'This product has no description yet. Buyers need one to know what it is.';
}

function describeUndecided(field: AiProposalField): string {
  return `A suggested ${field} has not been accepted, edited, or rejected yet.`;
}

function describeState(state: ProductState): string {
  switch (state) {
    case 'PUBLISHED':
      return 'This product is already published. Return it to review before changing it.';
    case 'ARCHIVED':
      return 'This product is archived and cannot be published.';
    case 'LOCAL_DRAFT':
    case 'PENDING_SYNC':
      return 'This product has not finished syncing, so it cannot be approved yet.';
    default:
      return `This product is ${state} and cannot be approved from there.`;
  }
}

/**
 * What stands between this product and approval.
 *
 * The whole of "reviewed" lives here, as one pure function over one
 * snapshot, so the review surface and the approval operation can never
 * disagree about whether a product is ready. The approval path calls this
 * and refuses when the answer is non-empty, which is what makes "no
 * suggestion is outstanding" a rule rather than a hope.
 *
 * The reasons are reported rather than silently resolved:
 *
 * - A blank publish-required field is missing data, and no decision fixes
 *   it. It is a *value* the artisan must supply, so it is listed
 *   separately from an undecided suggestion.
 * - An undecided valid proposal is the review condition itself. A proposal
 *   the pipeline already rejected carries no suggestion and cannot be
 *   applied, so it is not an outstanding decision and does not block.
 * - A product in a state approval cannot be reached from blocks for a
 *   reason that has nothing to do with AI, which is why it is reported
 *   without a field.
 *
 * Confidence appears nowhere in this function. ADR-002 is explicit that
 * confidence is routing information and not approval, so no confidence
 * value can resolve any of these reasons.
 */
export function evaluateApprovalReadiness(
  product: ReviewProductSnapshot,
  suggestions: readonly ReviewSuggestion[],
): ApprovalReadiness {
  const blocking: ReviewBlocking[] = [];

  for (const field of REVIEW_REQUIRED_FIELDS) {
    if (!product[field]?.trim()) {
      blocking.push({
        reason: 'MISSING_PUBLISH_FIELD' as ReviewBlockingReason,
        field,
        message: describeMissingField(field),
      });
    }
  }

  /**
   * One entry per field, not per proposal. A second job proposing the same
   * field does not make the field twice as unreviewed, and a list an
   * artisan reads should not repeat itself.
   */
  const undecided = new Set<AiProposalField>();

  for (const suggestion of suggestions) {
    undecided.add(suggestion.field);
  }

  for (const field of undecided) {
    blocking.push({
      reason: 'UNDECIDED_PROPOSAL' as ReviewBlockingReason,
      field,
      message: describeUndecided(field),
    });
  }

  if (NON_APPROVABLE_STATES.includes(product.state)) {
    blocking.push({
      reason: 'PRODUCT_NOT_APPROVABLE' as ReviewBlockingReason,
      message: describeState(product.state),
    });
  }

  return {
    blocking,
    readyForApproval: blocking.length === 0,
  };
}

/**
 * The canonical value a suggestion would replace, normalized for display.
 *
 * Materials are stored as a list and text as a string, so a suggestion's
 * `currentValue` is null rather than an empty string or an empty list when
 * the field is unset. "Nothing there yet" and "an empty string" are
 * different states for a person deciding whether to accept.
 */
export function currentValueFor(
  product: ReviewProductSnapshot,
  field: AiProposalField,
): string | readonly string[] | null {
  const value = fieldValueOf(product, field);

  if (value === null) {
    return null;
  }

  /**
   * Split on the value's own type rather than with `Array.isArray`, which
   * does not narrow a `readonly` array union: the negative branch would keep
   * the list in scope and the text branch would be unchecked.
   */
  if (typeof value === 'string') {
    return value.trim() === '' ? null : value;
  }

  return value.length === 0 ? null : [...value];
}
