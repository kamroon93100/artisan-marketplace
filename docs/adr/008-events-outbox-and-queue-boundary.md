# ADR-008: Events, Transactional Outbox, and Queue Boundary

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision
Business state changes that require asynchronous processing or downstream notification use durable events.

Events are persisted through a transactional outbox before they are dispatched to the queue.

The database transaction that changes canonical state and creates the corresponding outbox record is atomic.

## Event Contract
Every event contains:
- event_id
- event_type
- event_version
- aggregate_id
- producer
- occurred_at
- correlation_id
- causation_id when applicable
- idempotency_key
- payload

Event payloads are versioned contracts rather than arbitrary database snapshots.

Consumers must tolerate repeated delivery.

## Outbox
The outbox is durable application state.

An outbox record is created in the same database transaction as its source state mutation.

Dispatch failure does not roll back the already-committed business transaction.

Unpublished or failed outbox records remain recoverable until an explicit retention policy removes them.

## Queue Boundary
The queue transports work; it does not become the source of truth.

Queue delivery is treated as at-least-once.

Consumers therefore require idempotent handling.

A queue message may safely be redelivered without producing duplicate canonical state.

## Consumer Rules
Consumers validate event type and version before processing.

Unknown event versions fail explicitly rather than being silently interpreted.

Transient failures may retry.

Permanent failures move to an explicit dead-letter or failed state.

Side effects that can themselves be retried require their own idempotency protection.

## Ordering
Global ordering is not assumed.

Where ordering matters, consumers use the aggregate identity and explicit version or sequence information rather than depending on incidental queue timing.

## Observability
Event processing records correlation information sufficient to trace:
- originating request or mutation
- outbox record
- queue delivery
- consumer attempt
- downstream side effect

Failures must expose enough diagnostic information to distinguish transient failure, permanent failure, malformed input, authorization failure, and dependency failure.

## Consequences
Positive:
- Durable asynchronous workflows
- Safe recovery after queue or worker failure
- Traceable cross-module processing
- Explicit retry and dead-letter behavior
- Future provider and worker changes remain isolated

Negative:
- Outbox storage and dispatch workers are required
- Event schemas need version management
- Consumers require idempotency and failure handling

## Rejected Alternative
Publish queue messages directly from application code after committing business state.

Reason: the application could successfully commit the business change and then lose the message before durable dispatch, creating an unrecoverable state transition gap.
