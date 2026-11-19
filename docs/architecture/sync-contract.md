# Sync Contract

Status: Draft for first vertical slice

## Goal
Define how local artisan changes move from the device to canonical server state without data loss or duplicate application.

## Local Authority
- The device owns unsynchronized drafts.
- Local pending operations survive app restart.
- Network availability is not required to create a draft.

## Local Account Ownership
- Every locally persisted draft, media intent, and pending sync operation is
  keyed to the authenticated server actor id that created it.
- Storage queries require that actor. Screens may hide records, but hiding is
  not the boundary: the storage layer refuses cross-account reads, writes,
  claims, retries, and recovery.
- Logout clears credentials without deleting account-owned local rows.
  Signing back in as the same actor restores access. A different actor never
  receives those rows.
- A sync run only lists, recovers, claims, and uploads operations belonging to
  its own actor, so a queued upload cannot be sent under another account.
- Rows with no owner (created before ownership existed, or by a defective
  build) are preserved but are not readable or syncable by any account. They
  are never assigned to whichever actor signs in next; recovery requires a
  separate, explicit policy.

## Server Authority
- PostgreSQL owns synchronized canonical business state.
- A queue never becomes canonical state.

## Pending Operation
Every pending operation must identify:
- operation id
- local aggregate id
- operation type
- payload
- creation time
- attempt state
- idempotency key

## Required Behavior
- Safe retry
- Duplicate delivery tolerance
- Interrupted request recovery
- Network transition tolerance
- Explicit failure state
- Explicit recovery path

## Idempotency
Repeated delivery of the same logical operation must not create duplicate canonical records.

An idempotency key must be stable across retries of the same logical operation.

## Ordering
Operations must not silently assume perfect network ordering.

Where ordering is business-critical, the server must validate the expected predecessor/version before applying the operation.

## Conflicts
- Artisan-confirmed values remain authoritative over AI proposals.
- Conflicts must become explicit state, not silent overwrites.
- Published changes create a new catalog version.

## Sync States
- LOCAL_DRAFT
- PENDING_SYNC
- SYNCING
- SYNCED
- ACTION_REQUIRED
- CONFLICT
- FAILED

## Client Experience
- Saved on device
- Waiting for connection
- Syncing
- Synced
- Action needed
- Conflict needs review

## Open Decisions
- Exact SQLite tables
- Operation payload schema
- Server version field
- Batch size
- Retry/backoff policy
- Tombstone representation
- Conflict resolution API
- Partial batch failure semantics

## Acceptance
A sync implementation is acceptable only when offline creation, retry, duplicate delivery, interruption, stale state, and conflict behavior can each be demonstrated explicitly.
