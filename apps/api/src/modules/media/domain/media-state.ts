import type { MediaState } from '@artisan-marketplace/contracts';

const ALLOWED_TRANSITIONS: Readonly<
  Record<MediaState, readonly MediaState[]>
> = {
  REQUESTED: ['UPLOAD_AUTHORIZED', 'FAILED', 'ACTION_REQUIRED'],
  // A client may report the arrival of an object without a separate
  // upload-start call, so recording arrival is legal from the moment the
  // write was authorized.
  UPLOAD_AUTHORIZED: [
    'UPLOADING',
    'UPLOADED',
    'FAILED',
    'ACTION_REQUIRED',
  ],
  UPLOADING: ['UPLOADED', 'FAILED', 'ACTION_REQUIRED'],
  UPLOADED: ['VERIFIED', 'FAILED', 'ACTION_REQUIRED'],
  VERIFIED: ['DELETED', 'ACTION_REQUIRED'],
  // FAILED -> UPLOADING is the interrupted-upload recovery edge: the
  // logical media record and its object key are preserved, so a client
  // may re-upload the same object and re-run verification instead of
  // creating a second media record.
  FAILED: ['REQUESTED', 'UPLOADING', 'ACTION_REQUIRED', 'DELETED'],
  ACTION_REQUIRED: ['REQUESTED', 'DELETED'],
  DELETED: [],
};

export function canTransition(
  from: MediaState,
  to: MediaState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(
  from: MediaState,
  to: MediaState,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid media state transition: ${from} -> ${to}`);
  }
}

/**
 * The states a transition to `to` may legally be applied from.
 *
 * Re-entering the same state is a re-issue or a resume rather than a
 * transition, so `to` itself is always a legal source. This is the only
 * place legal sources are defined: callers ask the machine instead of
 * passing their own list of acceptable states, so the service, the
 * in-memory repository, and the SQL repository can never disagree about
 * which moves exist.
 */
export function legalSourcesFor(
  to: MediaState,
): readonly MediaState[] {
  return [
    to,
    ...(Object.keys(ALLOWED_TRANSITIONS) as MediaState[]).filter(
      (from) => canTransition(from, to),
    ),
  ];
}

/**
 * Whether an object key may be allocated and a write authorization
 * issued for a record in `from`.
 *
 * A record whose object has already been accepted can never be
 * overwritten, so those states are excluded. This is a property of the
 * machine rather than a restatement of it: `media-state.test.ts` proves
 * that these are the only states with no path back to an object-writing
 * state.
 */
export function canIssueUploadAuthorization(
  from: MediaState,
): boolean {
  return from !== 'VERIFIED' && from !== 'DELETED';
}

/**
 * Whether a client may begin or resume writing the object.
 */
export function canStartUpload(from: MediaState): boolean {
  return canReEnter(from, 'UPLOADING');
}

/**
 * Whether the arrival of the object may be recorded.
 */
export function canRecordUploaded(from: MediaState): boolean {
  return canReEnter(from, 'UPLOADED');
}

function canReEnter(
  from: MediaState,
  to: MediaState,
): boolean {
  return from === to || canTransition(from, to);
}
