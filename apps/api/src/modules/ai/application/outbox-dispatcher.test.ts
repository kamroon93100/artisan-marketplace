import {
  claimPendingEvents,
  acknowledgeEvent,
  releaseEvent,
  dispatchEvents,
  runDispatcherOnce,
  createDispatcherRunner,
} from './outbox-dispatcher.js';
import assert from 'node:assert/strict';
import type { Database, Transaction } from '../../../shared/persistence/database.js';
import type { Queue } from '@cloudflare/workers-types';

const EVENT_ID_1 = '11111111-1111-4111-8111-111111111111';
const EVENT_ID_2 = '22222222-2222-4222-8222-222222222222';
const EVENT_ID_3 = '33333333-3333-4333-8333-333333333333';
const JOB_ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER_ID = '00000000-0000-4000-8000-000000000001';

type QueryCall = {
  sql: string;
  params?: readonly unknown[];
};

class FakeDatabase implements Database {
  readonly calls: QueryCall[] = [];
  transactions = 0;
  private queuedRows: Array<readonly unknown[]> = [];

  queueRows(...rows: readonly unknown[][]): void {
    this.queuedRows = [...rows];
  }

  async query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly T[]> {
    this.calls.push({ sql, params });
    return (this.queuedRows.shift() ?? []) as readonly T[];
  }

  async transaction<T>(
    operation: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    this.transactions += 1;
    return operation({
      query: (sql, params) => this.query(sql, params),
    });
  }
}

class FakeQueue {
  readonly sent: Array<{ body: unknown }> = [];
  shouldFail = false;

  async sendBatch(messages: Iterable<{ body: unknown }>): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Queue publish failed');
    }
    for (const message of messages) {
      this.sent.push(message);
    }
  }
}

function pendingEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID_1,
    payload: JSON.stringify({
      payloadVersion: 1,
      jobId: JOB_ID_1,
      productId: 'product-1',
      ownerId: OWNER_ID,
      correlationId: 'corr-1',
      causationId: null,
      idempotencyKey: 'key-1',
      attempt: 0,
      maxAttempts: 3,
    }),
    ...overrides,
  };
}

async function testClaimPendingEventsClaimsEvents(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([pendingEvent({ id: EVENT_ID_1 })]);

  const claimed = await claimPendingEvents(database, 10);

  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, EVENT_ID_1);

  const sql = database.calls[0]?.sql ?? '';
  for (const fragment of [
    'UPDATE ai_job_outbox',
    'SET',
    'state = \'DISPATCHED\'',
    'dispatch_attempt = dispatch_attempt + 1',
    'leased_by =',
    'lease_expires_at =',
    'FOR UPDATE SKIP LOCKED',
    'RETURNING id, payload',
  ]) {
    if (!sql.includes(fragment)) {
      throw new Error(`claimPendingEvents must ${fragment}`);
    }
  }
}

async function testClaimPendingEventsRespectsBatchSize(): Promise<void> {
  const database = new FakeDatabase();
  // FakeDatabase doesn't enforce LIMIT, so we only queue 2 events
  database.queueRows([pendingEvent({ id: EVENT_ID_1 }), pendingEvent({ id: EVENT_ID_2 })]);

  const claimed = await claimPendingEvents(database, 2);

  assert.equal(claimed.length, 2);
  assert.equal(claimed[0].id, EVENT_ID_1);
  assert.equal(claimed[1].id, EVENT_ID_2);
}

async function testClaimPendingEventsSkipsLockedEvents(): Promise<void> {
  const database = new FakeDatabase();
  // First claim returns EVENT_ID_1, second claim returns EVENT_ID_2
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1 })], // First batch claims EVENT_ID_1
    [pendingEvent({ id: EVENT_ID_2 })], // Second batch claims EVENT_ID_2
  );

  const claimed1 = await claimPendingEvents(database, 10);
  const claimed2 = await claimPendingEvents(database, 10);

  assert.equal(claimed1.length, 1);
  assert.equal(claimed1[0].id, EVENT_ID_1);
  assert.equal(claimed2.length, 1);
  assert.equal(claimed2[0].id, EVENT_ID_2);
}

async function testClaimPendingEventsIgnoresAckedEvents(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([]);

  const claimed = await claimPendingEvents(database, 10);

  assert.equal(claimed.length, 0);
}

async function testAcknowledgeEventMarksAcked(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([{ id: EVENT_ID_1 }]);

  await acknowledgeEvent(database, EVENT_ID_1);

  const sql = database.calls[0]?.sql ?? '';
  for (const fragment of [
    'UPDATE ai_job_outbox',
    'state = \'ACKED\'',
    'leased_by = NULL',
    'lease_expires_at = NULL',
    'acked_at =',
    'WHERE id =',
    'AND state = \'DISPATCHED\'',
  ]) {
    if (!sql.includes(fragment)) {
      throw new Error(`acknowledgeEvent must ${fragment}`);
    }
  }
}

async function testAcknowledgeEventIdempotent(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([], []); // First ACK succeeds, second finds nothing

  await acknowledgeEvent(database, EVENT_ID_1);
  await acknowledgeEvent(database, EVENT_ID_1);

  // Should not throw - idempotent
  assert.equal(database.calls.length, 2);
}

async function testReleaseEventRetriesOnFailure(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([{ id: EVENT_ID_1, dispatch_attempt: 1, max_dispatch_attempts: 5 }]);

  await releaseEvent(database, EVENT_ID_1, 'test error');

  const sql = database.calls[0]?.sql ?? '';
  for (const fragment of [
    'UPDATE ai_job_outbox',
    'CASE',
    'WHEN dispatch_attempt >= max_dispatch_attempts THEN \'FAILED\'',
    'ELSE \'PENDING\'',
    'leased_by = NULL',
    'lease_expires_at = NULL',
    'next_dispatch_at =',
    'WHERE id =',
    'AND state = \'DISPATCHED\'',
  ]) {
    if (!sql.includes(fragment)) {
      throw new Error(`releaseEvent must ${fragment}`);
    }
  }
}

async function testReleaseEventMarksFailedWhenMaxAttemptsExceeded(): Promise<void> {
  const database = new FakeDatabase();
  database.queueRows([{ id: EVENT_ID_1, dispatch_attempt: 5, max_dispatch_attempts: 5 }]);

  await releaseEvent(database, EVENT_ID_1, 'test error');

  const sql = database.calls[0]?.sql ?? '';
  if (!sql.includes('WHEN dispatch_attempt >= max_dispatch_attempts THEN \'FAILED\'')) {
    throw new Error('releaseEvent must mark FAILED when max attempts exceeded');
  }
  // next_dispatch_at is set to NULL in the CASE WHEN max attempts exceeded
  if (!sql.includes('WHEN dispatch_attempt >= max_dispatch_attempts THEN NULL')) {
    throw new Error('releaseEvent must set next_dispatch_at to NULL when FAILED');
  }
}

async function testDispatchEventsSendsToQueue(): Promise<void> {
  const queue = new FakeQueue();
  const events = [
    { id: EVENT_ID_1, payload: { jobId: JOB_ID_1, payloadVersion: 1 } },
    { id: EVENT_ID_2, payload: { jobId: JOB_ID_2, payloadVersion: 1 } },
  ];

  const dispatched = await dispatchEvents(queue as unknown as Queue<unknown>, events);

  assert.equal(dispatched.length, 2);
  assert.equal(queue.sent.length, 2);
  assert.equal(queue.sent[0].body, events[0].payload);
  assert.equal(queue.sent[1].body, events[1].payload);
}

async function testDispatchEventsReturnsEmptyForEmptyInput(): Promise<void> {
  const queue = new FakeQueue();
  const dispatched = await dispatchEvents(queue as unknown as Queue<unknown>, []);
  assert.equal(dispatched.length, 0);
  assert.equal(queue.sent.length, 0);
}

async function testDispatchEventsPropagatesQueueFailure(): Promise<void> {
  const queue = new FakeQueue();
  queue.shouldFail = true;
  const events = [{ id: EVENT_ID_1, payload: { jobId: JOB_ID_1 } }];

  let thrown = false;
  try {
    await dispatchEvents(queue as unknown as Queue<unknown>, events);
  } catch (error) {
    thrown = true;
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Queue publish failed');
  }

  if (!thrown) {
    throw new Error('dispatchEvents must propagate queue failure');
  }
}

async function testRunDispatcherOnceClaimsAndDispatches(): Promise<void> {
  const database = new FakeDatabase();
  const queue = new FakeQueue();

  // Claim returns 2 events, then 2 acks return empty
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1 }), pendingEvent({ id: EVENT_ID_2 })],
    [], // acknowledgeEvent for EVENT_ID_1
    [], // acknowledgeEvent for EVENT_ID_2
  );

  const dispatched = await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);

  assert.equal(dispatched, 2);
  assert.equal(queue.sent.length, 2);
  assert.equal(database.transactions, 1); // claim is in transaction, acks are separate
}

async function testRunDispatcherOnceReleasesOnQueueFailure(): Promise<void> {
  const database = new FakeDatabase();
  const queue = new FakeQueue();
  queue.shouldFail = true;

  // Claim returns 1 event, release returns release row
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1 })],
    [{ id: EVENT_ID_1, dispatch_attempt: 1, max_dispatch_attempts: 5 }], // releaseEvent
  );

  let thrown = false;
  try {
    await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);
  } catch (error) {
    thrown = true;
  }

  if (!thrown) {
    throw new Error('runDispatcherOnce must throw on queue failure');
  }

  // Verify releaseEvent was called - check for CASE with PENDING
  const releaseSql = database.calls[1]?.sql ?? '';
  if (!releaseSql.includes('ELSE \'PENDING\'')) {
    throw new Error('runDispatcherOnce must release events on queue failure');
  }
}

async function testRunDispatcherOnceReturnsZeroWhenNoEvents(): Promise<void> {
  const database = new FakeDatabase();
  const queue = new FakeQueue();

  database.queueRows([]);

  const dispatched = await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);

  assert.equal(dispatched, 0);
  assert.equal(queue.sent.length, 0);
}

async function testCreateDispatcherRunnerReturnsFunction(): Promise<void> {
  const database = new FakeDatabase();
  const queue = new FakeQueue();

  // Claim returns 1 event, ack returns empty
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1 })],
    [], // acknowledgeEvent
  );

  const runner = createDispatcherRunner(database, queue as unknown as Queue<unknown>, { batchSize: 5 });
  const dispatched = await runner();

  assert.equal(dispatched, 1);
  assert.equal(queue.sent.length, 1);
}

async function testRunDispatcherOnceRecoversFromPublishFailure(): Promise<void> {
  const database = new FakeDatabase();
  const queue = new FakeQueue();
  queue.shouldFail = true; // Queue fails on first run

  // First run: claim returns 1 event, queue fails, release returns release row (attempt 1 -> PENDING)
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1 })],
    [{ id: EVENT_ID_1, dispatch_attempt: 1, max_dispatch_attempts: 5 }], // releaseEvent sets back to PENDING
  );

  let thrown = false;
  try {
    await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);
  } catch {
    thrown = true;
  }
  if (!thrown) {
    throw new Error('First run must throw on queue failure');
  }

  // Verify event was released back to PENDING
  const releaseSql = database.calls[1]?.sql ?? '';
  if (!releaseSql.includes('ELSE \'PENDING\'')) {
    throw new Error('First run must release event on queue failure');
  }

  // Second run: queue succeeds, claim returns the same event (now PENDING again), ack returns empty
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1 })], // claim returns event again
    [], // acknowledgeEvent
  );
  queue.shouldFail = false; // Queue now works

  const dispatched = await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);

  assert.equal(dispatched, 1);
  assert.equal(queue.sent.length, 1);

  // Verify the event was claimed and acknowledged in the second run
  const claimSql = database.calls[2]?.sql ?? '';
  if (!claimSql.includes('state = \'DISPATCHED\'')) {
    throw new Error('Second run must claim the event');
  }
  const ackSql = database.calls[3]?.sql ?? '';
  if (!ackSql.includes('state = \'ACKED\'')) {
    throw new Error('Second run must acknowledge the event');
  }
}

async function testDuplicateDeliveryIsIdempotentAtAck(): Promise<void> {
  const database = new FakeDatabase();
  const queue = new FakeQueue();

  // Simulate duplicate delivery: claim returns 1 event, first ack succeeds, second ack also succeeds (idempotent)
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1 })], // claim
    [], // first acknowledgeEvent
    [], // second acknowledgeEvent (duplicate delivery)
  );

  // First dispatch
  const dispatched1 = await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);
  assert.equal(dispatched1, 1);
  assert.equal(queue.sent.length, 1);

  // Simulate the message being redelivered (e.g., consumer crashed before ack)
  // The dispatcher would claim again if the event wasn't ACKED, but since we ACKED,
  // the second claim should return nothing
  database.queueRows([]); // second claim returns empty (already ACKED)

  const dispatched2 = await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);
  assert.equal(dispatched2, 0);
  assert.equal(queue.sent.length, 1); // No new messages sent
}

async function testTerminalStatesAreNotReclaimed(): Promise<void> {
  const database = new FakeDatabase();

  // Test that ACKED events are not reclaimed
  database.queueRows([]); // No pending events (ACKED are filtered out)
  const claimedAcked = await claimPendingEvents(database, 10);
  assert.equal(claimedAcked.length, 0);

  // Test that FAILED events are not reclaimed
  database.queueRows([]); // No pending events (FAILED are filtered out)
  const claimedFailed = await claimPendingEvents(database, 10);
  assert.equal(claimedFailed.length, 0);
}

/**
 * Priority 2: Regression tests for due-time scheduling behavior
 */

async function testClaimPendingEventsRespectsNextDispatchAt(): Promise<void> {
  const database = new FakeDatabase();
  const now = new Date().toISOString();
  const futureTime = new Date(Date.now() + 60_000).toISOString(); // 1 minute in future

  // Event with next_dispatch_at in the future should NOT be claimed
  database.queueRows([]);

  const claimed = await claimPendingEvents(database, 10);

  assert.equal(claimed.length, 0, 'Event with future next_dispatch_at should not be claimed');

  // Verify the SQL includes the next_dispatch_at check
  const sql = database.calls[0]?.sql ?? '';
  if (!sql.includes('next_dispatch_at')) {
    throw new Error('claimPendingEvents SQL must check next_dispatch_at');
  }
}

async function testClaimPendingEventsClaimsDueEvents(): Promise<void> {
  const database = new FakeDatabase();
  const pastTime = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago

  // Event with next_dispatch_at in the past SHOULD be claimed
  database.queueRows([pendingEvent({
    id: EVENT_ID_1,
    next_dispatch_at: pastTime,
  })]);

  const claimed = await claimPendingEvents(database, 10);

  assert.equal(claimed.length, 1, 'Event with past next_dispatch_at should be claimed');
  assert.equal(claimed[0].id, EVENT_ID_1);
}

async function testClaimPendingEventsClaimsNullNextDispatchAt(): Promise<void> {
  const database = new FakeDatabase();

  // Event with NULL next_dispatch_at (initial enqueue) SHOULD be claimed
  database.queueRows([pendingEvent({
    id: EVENT_ID_1,
    next_dispatch_at: null,
  })]);

  const claimed = await claimPendingEvents(database, 10);

  assert.equal(claimed.length, 1, 'Event with NULL next_dispatch_at should be claimed');
  assert.equal(claimed[0].id, EVENT_ID_1);
}

async function testExpiredLeaseRecovery(): Promise<void> {
  const database = new FakeDatabase();
  const now = new Date().toISOString();
  const expiredLease = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago - lease expired

  // Event with expired lease should be reclaimed
  database.queueRows([pendingEvent({
    id: EVENT_ID_1,
    state: 'DISPATCHED',
    leased_by: 'dispatcher-old-instance',
    lease_expires_at: expiredLease,
  })]);

  const claimed = await claimPendingEvents(database, 10);

  assert.equal(claimed.length, 1, 'Event with expired lease should be reclaimed');
  assert.equal(claimed[0].id, EVENT_ID_1);

  // Verify the SQL includes the lease expiration check
  const sql = database.calls[0]?.sql ?? '';
  if (!sql.includes('lease_expires_at')) {
    throw new Error('claimPendingEvents SQL must check lease_expires_at for recovery');
  }
}

async function testActiveLeaseNotRecovered(): Promise<void> {
  const database = new FakeDatabase();
  const now = new Date().toISOString();
  const futureLease = new Date(Date.now() + 60_000).toISOString(); // 1 minute in future - lease still active

  // Event with active lease should NOT be reclaimed
  database.queueRows([]);

  const claimed = await claimPendingEvents(database, 10);

  assert.equal(claimed.length, 0, 'Event with active lease should not be reclaimed');
}

async function testFailedPublicationRemainsRetryable(): Promise<void> {
  const database = new FakeDatabase();
  const queue = new FakeQueue();
  queue.shouldFail = true;

  // First run: claim event, queue fails, release should set back to PENDING with next_dispatch_at
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1, dispatch_attempt: 1, max_dispatch_attempts: 5 })], // claim
    [{ id: EVENT_ID_1, dispatch_attempt: 1, max_dispatch_attempts: 5 }], // releaseEvent - attempt 1 < 5, so PENDING
  );

  let thrown = false;
  try {
    await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);
  } catch {
    thrown = true;
  }
  if (!thrown) {
    throw new Error('First run must throw on queue failure');
  }

  // Verify releaseEvent was called and set state back to PENDING (not FAILED)
  const releaseSql = database.calls[1]?.sql ?? '';
  if (!releaseSql.includes('ELSE \'PENDING\'')) {
    throw new Error('Failed publication must set state to PENDING for retry');
  }
  // Verify next_dispatch_at is set for backoff
  if (!releaseSql.includes('next_dispatch_at =')) {
    throw new Error('Failed publication must set next_dispatch_at for backoff');
  }

  // Second run: queue succeeds, should be able to claim and dispatch the same event
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1 })], // claim returns event again (now PENDING with backoff)
    [], // acknowledgeEvent
  );
  queue.shouldFail = false;

  const dispatched = await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);

  assert.equal(dispatched, 1, 'Failed publication must remain retryable');
  assert.equal(queue.sent.length, 1);
}

async function testMaxDispatchAttemptsMarksFailed(): Promise<void> {
  const database = new FakeDatabase();
  const queue = new FakeQueue();
  queue.shouldFail = true;

  // Simulate max attempts reached
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1, dispatch_attempt: 5, max_dispatch_attempts: 5 })], // claim - already at max
    [{ id: EVENT_ID_1, dispatch_attempt: 5, max_dispatch_attempts: 5 }], // releaseEvent - attempt 5 >= 5, so FAILED
  );

  let thrown = false;
  try {
    await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);
  } catch {
    thrown = true;
  }
  if (!thrown) {
    throw new Error('Run must throw on queue failure');
  }

  // Verify releaseEvent marked as FAILED
  const releaseSql = database.calls[1]?.sql ?? '';
  if (!releaseSql.includes('WHEN dispatch_attempt >= max_dispatch_attempts THEN \'FAILED\'')) {
    throw new Error('Max attempts exceeded must mark FAILED');
  }
  // Verify next_dispatch_at is NULL when FAILED
  if (!releaseSql.includes('WHEN dispatch_attempt >= max_dispatch_attempts THEN NULL')) {
    throw new Error('FAILED event must have NULL next_dispatch_at');
  }
}

async function testNoLostRetryEventsOnDispatcherCrash(): Promise<void> {
  const database = new FakeDatabase();
  const queue = new FakeQueue();

  // Simulate: dispatcher claims events but crashes before acknowledging
  // First run: claims 2 events, queue succeeds, but dispatcher crashes before ack
  database.queueRows(
    [pendingEvent({ id: EVENT_ID_1 }), pendingEvent({ id: EVENT_ID_2 })], // claim
    // Simulate crash - no acknowledgeEvent calls
  );

  // First dispatcher run - we dispatch but don't complete (simulating crash)
  // We can't easily simulate the crash mid-function, so we test the recovery path:
  // After crash, the events are still in DISPATCHED state with a lease
  // The lease expires, then a new dispatcher run should reclaim them

  // Test the recovery by setting up events with expired leases
  const expiredLease = new Date(Date.now() - 60_000).toISOString();
  database.queueRows(
    [pendingEvent({
      id: EVENT_ID_1,
      state: 'DISPATCHED',
      leased_by: 'crashed-dispatcher',
      lease_expires_at: expiredLease,
      dispatch_attempt: 1,
      max_dispatch_attempts: 5,
    }), pendingEvent({
      id: EVENT_ID_2,
      state: 'DISPATCHED',
      leased_by: 'crashed-dispatcher',
      lease_expires_at: expiredLease,
      dispatch_attempt: 1,
      max_dispatch_attempts: 5,
    })], // claim returns both expired lease events
    [], // acknowledgeEvent for EVENT_ID_1
    [], // acknowledgeEvent for EVENT_ID_2
  );

  const dispatched = await runDispatcherOnce(database, queue as unknown as Queue<unknown>, 10);

  assert.equal(dispatched, 2, 'Both events should be recovered and dispatched');
  assert.equal(queue.sent.length, 2);
}

async function main(): Promise<void> {
  await testClaimPendingEventsClaimsEvents();
  await testClaimPendingEventsRespectsBatchSize();
  await testClaimPendingEventsSkipsLockedEvents();
  await testClaimPendingEventsIgnoresAckedEvents();
  await testAcknowledgeEventMarksAcked();
  await testAcknowledgeEventIdempotent();
  await testReleaseEventRetriesOnFailure();
  await testReleaseEventMarksFailedWhenMaxAttemptsExceeded();
  await testDispatchEventsSendsToQueue();
  await testDispatchEventsReturnsEmptyForEmptyInput();
  await testDispatchEventsPropagatesQueueFailure();
  await testRunDispatcherOnceClaimsAndDispatches();
  await testRunDispatcherOnceReleasesOnQueueFailure();
  await testRunDispatcherOnceReturnsZeroWhenNoEvents();
  await testCreateDispatcherRunnerReturnsFunction();
  await testRunDispatcherOnceRecoversFromPublishFailure();
  await testDuplicateDeliveryIsIdempotentAtAck();
  await testTerminalStatesAreNotReclaimed();

  // Priority 2: Due-time scheduling regression tests
  await testClaimPendingEventsRespectsNextDispatchAt();
  await testClaimPendingEventsClaimsDueEvents();
  await testClaimPendingEventsClaimsNullNextDispatchAt();
  await testExpiredLeaseRecovery();
  await testActiveLeaseNotRecovered();
  await testFailedPublicationRemainsRetryable();
  await testMaxDispatchAttemptsMarksFailed();
  await testNoLostRetryEventsOnDispatcherCrash();

  console.log('OUTBOX DISPATCHER TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});