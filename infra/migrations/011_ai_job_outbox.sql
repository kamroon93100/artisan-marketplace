-- AI job outbox for reliable event dispatch to Cloudflare Queue.
--
-- ADR-008 mandates the transactional outbox pattern: the job row and its
-- corresponding outbox event are written in the same transaction, so a job
-- cannot exist without its dispatch record. A separate dispatcher process
-- claims pending events and publishes them to the queue.
--
-- This migration is forward-only and adds no destructive operations.

begin;

create table if not exists ai_job_outbox (
  id uuid primary key,

  -- The job this event belongs to. Not a foreign key because the outbox
  -- survives the job's lifecycle and must be queryable even if the job is
  -- archived or cleaned up in a future slice.
  job_id uuid not null,

  -- The actor who owns the job. Denormalised so the dispatcher can route
  -- without joining ai_jobs. This is also what the queue consumer will
  -- restore as app.actor_id for RLS enforcement.
  owner_id uuid not null,

  -- Event payload version. The dispatcher and consumer must agree on the
  -- shape; increment when the payload contract changes.
  payload_version integer not null default 1,

  -- The message sent to the queue. Contains everything the consumer needs
  -- to re-hydrate the actor context and run the job.
  payload jsonb not null,

  -- Lifecycle state of the outbox event itself. The dispatcher transitions
  -- PENDING -> DISPATCHED -> ACKED. FAILED is for events that exceeded
  -- max dispatch attempts without reaching the queue.
  state text not null default 'PENDING',

  -- How many times the dispatcher has tried to publish this event.
  dispatch_attempt integer not null default 0,
  max_dispatch_attempts integer not null default 5,

  -- When this event is eligible for the next dispatch attempt. Null means
  -- immediately eligible.
  next_dispatch_at timestamptz,

  -- The dispatcher instance that currently holds the lease on this event.
  -- Null when not leased. Used for FOR UPDATE SKIP LOCKED claiming.
  leased_by text,
  lease_expires_at timestamptz,

  created_at timestamptz not null,
  updated_at timestamptz not null,
  dispatched_at timestamptz,
  acked_at timestamptz,

  constraint ai_job_outbox_state_check
    check (state in ('PENDING', 'DISPATCHED', 'ACKED', 'FAILED')),

  constraint ai_job_outbox_dispatch_attempt_check
    check (dispatch_attempt >= 0),

  constraint ai_job_outbox_max_dispatch_attempts_check
    check (max_dispatch_attempts >= 1)
);

create index if not exists ai_job_outbox_job_id_idx
  on ai_job_outbox(job_id);

create index if not exists ai_job_outbox_owner_id_idx
  on ai_job_outbox(owner_id);

-- The dispatcher scans for runnable events. A partial index keeps the scan
-- off terminal states.
create index if not exists ai_job_outbox_dispatchable_idx
  on ai_job_outbox(next_dispatch_at, created_at)
  where state in ('PENDING', 'DISPATCHED');

comment on table ai_job_outbox is
  'Transactional outbox for AI job events. Written atomically with the job row so no job exists without its dispatch record.';

comment on column ai_job_outbox.payload_version is
  'Schema version of the payload JSON. Consumer and dispatcher must agree. Increment on breaking changes.';

comment on column ai_job_outbox.payload is
  'Complete message for the queue consumer: jobId, productId, ownerId, correlationId, causationId, idempotencyKey, attempt, maxAttempts.';

comment on column ai_job_outbox.leased_by is
  'Dispatcher instance identity holding the FOR UPDATE SKIP LOCKED lease. Null when unleased.';

comment on column ai_job_outbox.lease_expires_at is
  'When the current lease expires. A stalled dispatcher lease allows another instance to claim the event.';

commit;