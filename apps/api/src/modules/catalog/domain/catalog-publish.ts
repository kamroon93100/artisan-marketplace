import type {
  CatalogProduct,
  ProductState,
} from './catalog-product.js';
import { canTransition } from './catalog-state.js';

/**
 * Publication preconditions.
 *
 * The first-vertical-slice specification requires that "required product
 * data and review conditions must be satisfied" before a product becomes
 * buyer-visible, but it deliberately still lists "Required product
 * fields" as an open decision. The required set below is therefore the
 * conservative minimum that a buyer-visible listing cannot be published
 * without, kept as one named list so the decision stays visible and
 * extendable rather than being scattered through the publish path.
 */
export const PUBLISH_REQUIRED_FIELDS = [
  'title',
  'description',
] as const;

export type PublishRequiredField =
  (typeof PUBLISH_REQUIRED_FIELDS)[number];

/**
 * Only a product an authorized business workflow has already moved to
 * APPROVED may be published. ADR-002 reserves APPROVED and PUBLISHED for
 * authorized workflows and states that AI confidence can never authorize
 * publication on its own, so the review condition is expressed as the
 * state the product already had to reach.
 */
export const PUBLISHABLE_STATE: ProductState = 'APPROVED';

/**
 * States from which a product may be approved.
 *
 * Approval is what makes publication possible, so ADR-002 gives it the
 * same protection as publication itself: only a state the state machine
 * already permits reaching APPROVED from. A product still marked
 * `LOCAL_DRAFT` or `PENDING_SYNC` has not finished synchronizing and cannot
 * be approved, and `PUBLISHED` must return to review before it changes.
 */
const APPROVABLE_STATES: readonly ProductState[] = [
  'SYNCED',
  'REVIEW_REQUIRED',
];

/**
 * States that only an authorized business operation may establish.
 *
 * `APPROVED` and `PUBLISHED` are both reached through a named operation
 * that checks preconditions and records who authorized them. A generic
 * state assignment would skip all of that, so the state machine may permit
 * the edge while the application refuses the shortcut. This is the same
 * reason the state machine is not the only thing standing between a
 * client and a buyer-visible listing.
 *
 * Declared as a literal so the pair below is keyed by exactly these two
 * states; widening it to `ProductState` would demand a route message for
 * every state in the machine.
 */
const AUTHORIZED_OPERATION_STATES = [
  'APPROVED',
  'PUBLISHED',
] as const satisfies readonly ProductState[];

type AuthorizedOperationState =
  (typeof AUTHORIZED_OPERATION_STATES)[number];

/**
 * The authorized operation that establishes a state, for error messages
 * that have to tell a client where to go instead.
 */
const AUTHORIZED_OPERATION_ROUTES: Readonly<
  Record<AuthorizedOperationState, string>
> = {
  APPROVED:
    'POST /catalog/products/{id}/review/approve, so the outstanding AI suggestions are checked first',
  PUBLISHED:
    'POST /catalog/products/{id}/publish, so its preconditions are checked and a catalog version is recorded',
};

/**
 * States in which a product's fields are frozen.
 *
 * PUBLISHED is buyer-visible: editing it in place would rewrite the
 * published listing without producing a new catalog version, which is
 * exactly the silent rewrite ADR-002 and ADR-003 forbid. The state
 * machine already provides the honest route out of PUBLISHED
 * (PUBLISHED -> REVIEW_REQUIRED), after which an edit and a further
 * publish create the next version. ARCHIVED is terminal, so an archived
 * product stays exactly as it was.
 */
const FROZEN_STATES: readonly ProductState[] = [
  'PUBLISHED',
  'ARCHIVED',
];

export class PublishStateError extends Error {
  constructor(
    public readonly state: ProductState,
  ) {
    super(
      `Product cannot be published from state ${state}.`,
    );
    this.name = 'PublishStateError';
  }
}

export class PublishFieldsError extends Error {
  constructor(
    public readonly missingFields: readonly string[],
  ) {
    super(
      `Product cannot be published without: ${missingFields.join(', ')}.`,
    );
    this.name = 'PublishFieldsError';
  }
}

export class EditStateError extends Error {
  constructor(
    public readonly state: ProductState,
  ) {
    super(
      `Product cannot be edited in state ${state}.`,
    );
    this.name = 'EditStateError';
  }
}

/**
 * Raised when a product is in a state it cannot be approved from.
 */
export class ApproveStateError extends Error {
  constructor(
    public readonly state: ProductState,
  ) {
    super(
      `Product cannot be approved from state ${state}.`,
    );
    this.name = 'ApproveStateError';
  }
}

/**
 * Raised when a state is only reachable through a named operation.
 *
 * The state machine may allow the edge — `REVIEW_REQUIRED -> APPROVED` is
 * a real edge — but the edge is not a shortcut a client may take on its
 * own, because the authorized operation is what checks the review
 * condition and records the actor.
 */
export class AuthorizedOperationRequiredError extends Error {
  constructor(
    public readonly state: ProductState,
  ) {
    super(
      `${state} is established by an authorized operation. Use ${AUTHORIZED_OPERATION_ROUTES[state as AuthorizedOperationState]}.`,
    );
    this.name = 'AuthorizedOperationRequiredError';
  }
}

/**
 * Asserts that a state may not be assigned by a generic transition.
 *
 * This is the application-level half of the rule: the pure state machine
 * stays a statement about which edges exist, and this keeps the
 * precondition-carrying operations the only way to cross the two edges
 * whose meaning is a human decision.
 */
export function assertAssignableState(
  state: ProductState,
): void {
  if (
    (AUTHORIZED_OPERATION_STATES as readonly string[]).includes(
      state,
    )
  ) {
    throw new AuthorizedOperationRequiredError(state);
  }
}

/**
 * Asserts that a product may be approved from the state it is in.
 *
 * Both the explicit list and the state machine's own opinion are checked,
 * for the same reason `assertPublishableState` checks both: if the
 * transition table ever stops allowing a state to reach APPROVED, approval
 * stops with it rather than quietly writing a state nothing authorises.
 */
export function assertApprovableState(
  state: ProductState,
): void {
  if (
    !APPROVABLE_STATES.includes(state) ||
    !canTransition(state, 'APPROVED')
  ) {
    throw new ApproveStateError(state);
  }
}

/**
 * Whether a product in this state can be approved right now.
 *
 * Read-only, for a review surface that has to say what is blocking
 * approval without performing one. An already-approved product is not
 * blocked: it reached the goal, and a repeat approval converges on it.
 */
export function isApprovableState(state: ProductState): boolean {
  return (
    state === 'APPROVED' ||
    (APPROVABLE_STATES.includes(state) &&
      canTransition(state, 'APPROVED'))
  );
}

/**
 * Asserts the review condition for publication.
 *
 * Both the explicit precondition and the state machine's own opinion are
 * checked, so the two cannot drift apart unnoticed: if the transition
 * table ever stops allowing APPROVED -> PUBLISHED, publication stops with
 * it instead of quietly writing a version no transition authorises.
 */
export function assertPublishableState(
  state: ProductState,
): void {
  if (
    state !== PUBLISHABLE_STATE ||
    !canTransition(state, 'PUBLISHED')
  ) {
    throw new PublishStateError(state);
  }
}

/**
 * Asserts the required-data condition for publication. A blank string is
 * treated as missing, because whitespace is not information a buyer can
 * use and would otherwise be snapshotted as a published value.
 */
export function assertPublishableFields(
  product: Pick<CatalogProduct, PublishRequiredField>,
): void {
  const missing = PUBLISH_REQUIRED_FIELDS.filter(
    (field) => !product[field]?.trim(),
  );

  if (missing.length > 0) {
    throw new PublishFieldsError(missing);
  }
}

/**
 * Asserts that a product's fields may still be changed. Publication and
 * archival freeze the record; everything else is a working state.
 */
export function assertEditable(state: ProductState): void {
  if (FROZEN_STATES.includes(state)) {
    throw new EditStateError(state);
  }
}

/**
 * The next version number for a product that has never been published.
 * Versions are 1-based so that "no version" stays distinguishable from
 * "version zero".
 */
export function nextCatalogVersionNumber(
  publishedVersion: number | null,
): number {
  return (publishedVersion ?? 0) + 1;
}
