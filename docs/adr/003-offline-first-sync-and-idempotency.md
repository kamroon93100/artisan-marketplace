# ADR-003: Offline-First Sync and Idempotency

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision
The mobile client is offline-first for artisan capture and draft creation.

User-created work must be persisted locally before network-dependent processing is attempted.

Synchronization is asynchronous and retryable.

Every operation that can be retried across the client, API, queue, or worker boundary must have an idempotency identity.

## Local Client
The device-local database stores:
- unsynced drafts
- pending operations
- local operation status
- upload metadata
- sync errors requiring user action

Saving a draft locally must not depend on network availability.

The UI exposes meaningful sync states instead of hiding synchronization behind a loading spinner.

## Server State
PostgreSQL remains the canonical source of synced business state.

A successful sync operation produces a durable server-side result that can be safely replayed without creating duplicate business records.

Repeated requests carrying the same idempotency key must converge on the same logical operation result.

## Transactional Outbox
When a business transaction changes state and an event must be emitted, the state change and outbox record are written atomically in the same database transaction.

The queue transports the outbox event after commit.

Queue delivery is treated as at-least-once; consumers therefore remain idempotent.

## Retry Rules
Retries may occur for transient network errors, temporary provider failures, queue delivery failures, and interrupted uploads.

Retries must not create duplicate products, media records, inquiries, or AI jobs.

Permanent failures transition to an explicit actionable state instead of retrying indefinitely.

## Conflicts
Conflicts are explicit application states, not silent overwrites.

AI output cannot overwrite an artisan-confirmed value.

Published catalog changes create a versioned change rather than mutating historical published state invisibly.

Media conflicts are resolved by preserving distinct uploaded objects or flagging a possible duplicate for review.

## Consequences
Positive:
- Reliable weak-network behavior
- Safe retries
- Recovery after process or connection interruption
- Duplicate-resistant asynchronous processing
- Clear user-visible failure states

Negative:
- Local persistence and sync coordination add implementation complexity
- Idempotency keys and operation records must be designed consistently
- Conflict resolution requires explicit product rules

## Rejected Alternatives
Network-required draft creation.

Reason: it would make the core artisan workflow unreliable under weak or unavailable connectivity.

Exactly-once delivery assumptions.

Reason: retries and distributed delivery must be designed around idempotent processing rather than relying on an exactly-once guarantee.
