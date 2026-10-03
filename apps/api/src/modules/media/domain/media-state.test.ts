import {
  assertValidTransition,
  canIssueUploadAuthorization,
  canRecordUploaded,
  canStartUpload,
  canTransition,
  legalSourcesFor,
} from './media-state.js';
import type { MediaState } from '@artisan-marketplace/contracts';

const ALL_STATES: readonly MediaState[] = [
  'REQUESTED',
  'UPLOAD_AUTHORIZED',
  'UPLOADING',
  'UPLOADED',
  'VERIFIED',
  'FAILED',
  'ACTION_REQUIRED',
  'DELETED',
];

const valid: Array<[MediaState, MediaState]> = [
  ['REQUESTED', 'UPLOAD_AUTHORIZED'],
  ['UPLOAD_AUTHORIZED', 'UPLOADING'],
  ['UPLOADING', 'UPLOADED'],
  ['UPLOADED', 'VERIFIED'],
  ['VERIFIED', 'DELETED'],
  ['FAILED', 'REQUESTED'],
  // The interrupted-upload recovery edge: the same object is written
  // again and re-verified rather than a second media record created.
  ['FAILED', 'UPLOADING'],
  ['UPLOAD_AUTHORIZED', 'UPLOADED'],
];

const invalid: Array<[MediaState, MediaState]> = [
  ['REQUESTED', 'VERIFIED'],
  ['VERIFIED', 'UPLOADING'],
  ['DELETED', 'REQUESTED'],
  // A record that failed verification has no stored object to claim, so
  // it must re-arm before the arrival of one can be recorded.
  ['FAILED', 'UPLOADED'],
  ['FAILED', 'VERIFIED'],
  ['VERIFIED', 'UPLOAD_AUTHORIZED'],
  ['UPLOADED', 'UPLOADING'],
];

for (const [from, to] of valid) {
  if (!canTransition(from, to)) {
    throw new Error(`Expected valid transition: ${from} -> ${to}`);
  }

  assertValidTransition(from, to);
}

for (const [from, to] of invalid) {
  if (canTransition(from, to)) {
    throw new Error(`Expected invalid transition: ${from} -> ${to}`);
  }

  let threw = false;

  try {
    assertValidTransition(from, to);
  } catch {
    threw = true;
  }

  if (!threw) {
    throw new Error(`Expected transition to throw: ${from} -> ${to}`);
  }
}

/**
 * `legalSourcesFor` is what both repositories use to decide whether a
 * compare-and-set may apply. If it were allowed to disagree with
 * `canTransition`, a caller could write a state the machine forbids, so
 * the two are checked against each other exhaustively rather than by
 * example.
 */
for (const to of ALL_STATES) {
  const sources = legalSourcesFor(to);

  // Re-entering a state is a re-issue or a resume, not a transition.
  if (!sources.includes(to)) {
    throw new Error(
      `Expected ${to} to be a legal source for itself.`,
    );
  }

  for (const from of ALL_STATES) {
    if (from === to) {
      continue;
    }

    if (canTransition(from, to) !== sources.includes(from)) {
      throw new Error(
        `legalSourcesFor(${to}) disagrees with the transition ` +
          `table at ${from} -> ${to}.`,
      );
    }
  }
}

/**
 * The invariants the service relies on are stated once, here, and
 * proven for every state rather than assumed by a reader.
 */
for (const state of ALL_STATES) {
  // A record whose object was already accepted must never be given a
  // fresh write authorization, or an accepted object could be
  // overwritten.
  if (
    (state === 'VERIFIED' || state === 'DELETED') &&
    canIssueUploadAuthorization(state)
  ) {
    throw new Error(
      `Expected ${state} to refuse upload authorization.`,
    );
  }

  // Recording an arrival requires that a write could legally have
  // happened, and that the record is not already terminal for this
  // purpose.
  if (canRecordUploaded(state) && !canStartUpload(state) && state !== 'UPLOADED') {
    throw new Error(
      `Expected ${state} to be unable to record an arrival it could not start.`,
    );
  }

  if (
    !canIssueUploadAuthorization(state) &&
    canRecordUploaded(state)
  ) {
    throw new Error(
      `Expected ${state} not to record an arrival it cannot authorize.`,
    );
  }
}

// DELETED is terminal: nothing follows it.
if (
  ALL_STATES.some((to) => canTransition('DELETED', to))
) {
  throw new Error(
    'Expected DELETED to be a terminal state.',
  );
}

console.log('MEDIA STATE TESTS PASSED');
