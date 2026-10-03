import type {
  AiFailure,
  AiJob,
  AiJobState,
} from '@artisan-marketplace/contracts';
import {
  AI_MAX_ATTEMPTS,
  AI_RETRY_BASE_DELAY_MS,
  AI_RETRY_MAX_DELAY_MS,
} from '@artisan-marketplace/contracts';

/**
 * The job lifecycle, stated once.
 *
 * Each member earns its place:
 *
 * - `QUEUED` is work that exists durably and has not been attempted.
 * - `RUNNING` is an attempt in flight.
 * - `RETRYING` is a transient failure with budget remaining, carrying the
 *   time the next attempt may start. It is distinct from `QUEUED` because the
 *   work has already been attempted and the wait is a backoff, not a
 *   dispatch delay.
 * - `PARTIAL_RESULT` is output that validated in part: something usable
 *   exists and something was rejected. It is not a success, and it is not a
 *   failure, so it must be able to say so.
 * - `SUCCEEDED` is a fully valid proposal set.
 * - `FAILED` is a terminal permanent failure. The human has to act, or the
 *   manual path has to be taken.
 * - `DEAD_LETTERED` is a transient failure that ran out of budget. Keeping
 *   it separate from `FAILED` preserves the distinction ADR-008 requires
 *   between a permanent rejection and an exhausted retry, which are handled
 *   and alerted on differently.
 *
 * `SUCCEEDED`, `FAILED`, and `DEAD_LETTERED` are terminal. A terminal job is
 * never re-run, which is what makes a redelivered queue message safe.
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<AiJobState, readonly AiJobState[]>
> = {
  QUEUED: ['RUNNING'],
  RUNNING: [
    'SUCCEEDED',
    'PARTIAL_RESULT',
    'RETRYING',
    'FAILED',
    'DEAD_LETTERED',
  ],
  RETRYING: ['RUNNING', 'DEAD_LETTERED'],
  PARTIAL_RESULT: ['RUNNING', 'RETRYING', 'DEAD_LETTERED'],
  SUCCEEDED: [],
  FAILED: [],
  DEAD_LETTERED: [],
};

const TERMINAL_STATES: ReadonlySet<AiJobState> = new Set<AiJobState>([
  'SUCCEEDED',
  'FAILED',
  'DEAD_LETTERED',
]);

export function canTransitionJob(
  from: AiJobState,
  to: AiJobState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalJobState(
  state: AiJobState,
): boolean {
  return TERMINAL_STATES.has(state);
}

export class AiJobTransitionError extends Error {
  constructor(
    public readonly from: AiJobState,
    public readonly to: AiJobState,
  ) {
    super(
      `Invalid AI job state transition: ${from} -> ${to}`,
    );
    this.name = 'AiJobTransitionError';
  }
}

export function assertValidJobTransition(
  from: AiJobState,
  to: AiJobState,
): void {
  if (!canTransitionJob(from, to)) {
    throw new AiJobTransitionError(from, to);
  }
}

/**
 * States in which a job may not begin another attempt. `RETRYING` is
 * excluded on purpose: a retry that is due now is the normal case, and
 * refusing it would make the backoff an unconditional failure. The caller
 * compares `nextAttemptAt` instead.
 */
export function isRunnableJobState(
  state: AiJobState,
): boolean {
  return (
    state === 'QUEUED' ||
    state === 'RETRYING' ||
    state === 'PARTIAL_RESULT'
  );
}

export function isRetryDue(job: AiJob, now: number): boolean {
  if (!job.nextAttemptAt) {
    return true;
  }

  return Date.parse(job.nextAttemptAt) <= now;
}

/**
 * Decides the state a failed attempt leaves the job in.
 *
 * The three-way split is the whole retry contract:
 *
 * - A permanent failure never retries, however much budget remains.
 * - A transient failure with budget remaining becomes `RETRYING` and records
 *   when the next attempt may start.
 * - A transient failure with no budget left becomes `DEAD_LETTERED`, which
 *   is distinguishable from a permanent `FAILED`.
 */
export function resolveFailureState(
  attemptCount: number,
  maxAttempts: number,
  failure: AiFailure,
): 'RETRYING' | 'FAILED' | 'DEAD_LETTERED' {
  if (!failure.retryable) {
    return 'FAILED';
  }

  return attemptCount < maxAttempts ? 'RETRYING' : 'DEAD_LETTERED';
}

/**
 * Exponential backoff, capped. Deterministic on purpose: the delay is
 * persisted on the job and asserted in tests, so it must be reproducible, and
 * a retry storm argument is not a reason to make a persisted value
 * unassertable.
 */
export function retryDelayMs(attemptCount: number): number {
  if (attemptCount < 1) {
    return 0;
  }

  return Math.min(
    AI_RETRY_BASE_DELAY_MS * 2 ** (attemptCount - 1),
    AI_RETRY_MAX_DELAY_MS,
  );
}

export function nextAttemptAt(
  attemptCount: number,
  now: number,
): string {
  return new Date(
    now + retryDelayMs(attemptCount),
  ).toISOString();
}

export function defaultMaxAttempts(
  configured?: number,
): number {
  if (
    configured === undefined ||
    !Number.isInteger(configured) ||
    configured < 1
  ) {
    return AI_MAX_ATTEMPTS;
  }

  return configured;
}

/**
 * A readable job failure summary for the run path. Kept next to the state
 * machine so the two cannot describe the same situation differently.
 */
export function describeJobFailure(
  job: AiJob,
): string {
  if (!job.failure) {
    return `AI job ${job.id} is ${job.state}.`;
  }

  return (
    `AI job ${job.id} is ${job.state} after ` +
    `${job.attemptCount} attempt(s): ` +
    `${job.failure.code} - ${job.failure.message}`
  );
}
