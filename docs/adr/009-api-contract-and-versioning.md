# ADR-009: API Contract and Versioning

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision
The backend exposes explicit application APIs rather than exposing database tables or ORM models directly to clients.

API contracts are designed around business capabilities and workflows.

The first vertical slice uses a versioned API namespace so future contract evolution is explicit.

Initial external boundary:
- mobile artisan client
- buyer-facing client
- administrative/internal clients where required

## Contract Ownership
Each API operation has a clearly identified owning module.

Request and response schemas are explicit and validated at the boundary.

Internal database columns, provider SDK objects, queue payloads, and AI provider responses must not become accidental public API contracts.

## Validation
All client-controlled input is treated as untrusted.

Boundary validation occurs before business logic executes.

Validation includes applicable:
- authentication context
- authorization
- schema/type validation
- size limits
- enum/state constraints
- idempotency requirements

Business validation occurs after structural validation.

## Idempotency
Mutating operations that may be retried by offline clients or infrastructure define an idempotency contract.

The server records or otherwise safely resolves repeated requests so a retry cannot create duplicate logical work.

Idempotency behavior is part of the API contract rather than an undocumented implementation detail.

## Errors
Errors use stable machine-readable categories with human-safe messages.

Clients must not depend on database error strings or provider-specific error text.

Errors distinguish applicable categories such as:
- authentication failure
- authorization failure
- validation failure
- conflict
- rate limit
- dependency failure
- transient server failure
- permanent application failure

Sensitive internal diagnostics are returned only through authorized operational channels.

## Versioning
Breaking API changes require a new contract version.

Backward-compatible additions should not require an immediate client migration.

Deprecated fields or operations remain only for an explicitly defined compatibility period.

Database migrations and API versions are independent concerns.

## Offline Sync APIs
Sync endpoints are designed for replayable operations rather than blind state replacement.

Responses expose sufficient state and conflict information for the client to recover after retries or interrupted connectivity.

The API does not assume requests arrive exactly once or in order.

## Consequences
Positive:
- Stable client/backend boundary
- Safer independent evolution
- Explicit retry and conflict semantics
- Provider and database implementation details remain private
- Easier contract testing

Negative:
- API schemas require maintenance
- Versioning and deprecation become explicit responsibilities
- DTOs cannot simply mirror database models

## Rejected Alternative
Expose ORM/database models directly through generic CRUD endpoints.

Reason: it couples clients to persistence structure and makes authorization, business invariants, versioning, and future data-model changes harder to control.
