import type { Database, Transaction } from '../../../shared/persistence/database.js';
import type { AiRepository } from './ai-repository.js';
import type { Queue, MessageSendRequest } from '@cloudflare/workers-types';

/**
 * Lease duration for dispatcher claims. A dispatcher instance claims a batch
 * of events and has this long to publish them before another instance can
 * steal the lease. Chosen to be long enough for network latency + queue
 * publish, short enough that a crashed dispatcher doesn't block events for
 * too long.
 */
const DISPATCHER_LEASE_MS = 30_000;

/**
 * Maximum number of events to claim in one batch. Limits memory and the
 * blast radius of a single dispatcher crash.
 */
const DISPATCHER_BATCH_SIZE = 100;

/**
 * Dispatcher instance identity. In production this should be unique per
 * Worker instance (e.g., using a UUID generated at startup).
 */
let dispatcherInstanceId: string | null = null;

function getDispatcherInstanceId(): string {
  if (!dispatcherInstanceId) {
    dispatcherInstanceId = `dispatcher-${crypto.randomUUID()}`;
  }
  return dispatcherInstanceId;
}

/**
 * Claims a batch of pending outbox events for dispatch.
 *
 * Uses FOR UPDATE SKIP LOCKED to atomically claim events without blocking
 * other dispatcher instances. The lease prevents a stalled dispatcher from
 * holding events indefinitely.
 */
export async function claimPendingEvents(
  database: Database,
  batchSize: number = DISPATCHER_BATCH_SIZE,
): Promise<readonly { id: string; payload: unknown }[]> {
  const now = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + DISPATCHER_LEASE_MS).toISOString();
  const instanceId = getDispatcherInstanceId();

  return database.transaction(async (tx: Transaction) => {
    // Claim events by updating their state and lease
    const claimed = await tx.query<{ id: string; payload: unknown }>(
      `
        UPDATE ai_job_outbox
        SET
          state = 'DISPATCHED',
          dispatch_attempt = dispatch_attempt + 1,
          leased_by = $1,
          lease_expires_at = $2,
          updated_at = $3
        WHERE id IN (
          SELECT id
          FROM ai_job_outbox
          WHERE state IN ('PENDING', 'DISPATCHED')
            AND (next_dispatch_at IS NULL OR next_dispatch_at <= $3)
            AND dispatch_attempt < max_dispatch_attempts
            AND (leased_by IS NULL OR lease_expires_at <= $3)
          ORDER BY next_dispatch_at NULLS FIRST, created_at
          LIMIT $4
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, payload
      `,
      [instanceId, leaseExpiresAt, now, batchSize],
    );

    return claimed;
  });
}

/**
 * Marks an outbox event as acknowledged (successfully published to queue).
 */
export async function acknowledgeEvent(
  database: Database,
  eventId: string,
): Promise<void> {
  const now = new Date().toISOString();

  await database.query(
    `
      UPDATE ai_job_outbox
      SET
        state = 'ACKED',
        leased_by = NULL,
        lease_expires_at = NULL,
        updated_at = $1,
        acked_at = $1
      WHERE id = $2
        AND state = 'DISPATCHED'
    `,
    [now, eventId],
  );
}

/**
 * Marks an outbox event as failed to dispatch (released for retry).
 */
export async function releaseEvent(
  database: Database,
  eventId: string,
  error: string,
): Promise<void> {
  const now = new Date().toISOString();

  // If max attempts exceeded, mark as FAILED; otherwise back off and retry
  await database.query(
    `
      UPDATE ai_job_outbox
      SET
        state = CASE
          WHEN dispatch_attempt >= max_dispatch_attempts THEN 'FAILED'
          ELSE 'PENDING'
        END,
        leased_by = NULL,
        lease_expires_at = NULL,
        next_dispatch_at = CASE
          WHEN dispatch_attempt >= max_dispatch_attempts THEN NULL
          ELSE now() + interval '1 minute' * (dispatch_attempt + 1)
        END,
        updated_at = $1
      WHERE id = $2
        AND state = 'DISPATCHED'
    `,
    [now, eventId],
  );
}

/**
 * Dispatches a batch of events to the Cloudflare Queue.
 * Returns the IDs of events that were successfully published.
 */
export async function dispatchEvents(
  queue: Queue<unknown>,
  events: readonly { id: string; payload: unknown }[],
): Promise<string[]> {
  if (events.length === 0) {
    return [];
  }

  // Cloudflare Queues accept an iterable of MessageSendRequest objects
  // with body, optional contentType, and optional delaySeconds
  const messages: Iterable<MessageSendRequest<unknown>> = events.map((event) => ({
    body: event.payload,
    // Note: Cloudflare generates message IDs; we don't set custom IDs
    // The event ID is included in the payload for correlation
  }));

  await queue.sendBatch(messages);

  return events.map((e) => e.id);
}

/**
 * Runs one iteration of the dispatcher loop: claim, publish, acknowledge.
 * Returns the number of events successfully dispatched.
 */
export async function runDispatcherOnce(
  database: Database,
  queue: Queue,
  batchSize: number = DISPATCHER_BATCH_SIZE,
): Promise<number> {
  const claimed = await claimPendingEvents(database, batchSize);

  if (claimed.length === 0) {
    return 0;
  }

  try {
    const dispatchedIds = await dispatchEvents(queue, claimed);

    // Acknowledge successfully dispatched events
    for (const id of dispatchedIds) {
      await acknowledgeEvent(database, id);
    }

    return dispatchedIds.length;
  } catch (error) {
    // Release all claimed events for retry
    for (const event of claimed) {
      await releaseEvent(database, event.id, String(error));
    }
    throw error;
  }
}

/**
 * Creates a dispatcher runner that can be used in a scheduled handler or
 * a background loop.
 */
export function createDispatcherRunner(
  database: Database,
  queue: Queue,
  options?: { batchSize?: number },
) {
  return async (): Promise<number> => {
    return runDispatcherOnce(database, queue, options?.batchSize);
  };
}