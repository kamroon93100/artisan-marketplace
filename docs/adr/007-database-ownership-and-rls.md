# ADR-007: Database Ownership, RLS, and Transaction Boundaries

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision
PostgreSQL is the authoritative persistence layer for synced business state.

Tables have explicit module ownership.

Application code accesses another module's data through that module's interface rather than arbitrary cross-module writes.

## Table Ownership
Catalog owns product and catalog-version state.

Identity owns user/account identity state.

Media owns media metadata and object relationships.

AI owns AI jobs, proposals, execution metadata, and AI-result state.

Review owns review decisions and review workflow state.

Inquiry owns buyer inquiry state.

Audit/Observability owns audit records and operational telemetry.

Sync-owned records support synchronization and idempotency coordination but do not replace canonical business records.

## Row-Level Security
RLS is part of the server-side authorization boundary for protected tenant/resource data.

Policies must constrain access using authenticated actor context and applicable ownership or permission rules.

RLS is defense in depth; application-level authorization remains required.

Service-level operations that intentionally bypass ordinary user RLS must be explicit, narrowly scoped, and auditable.

## Transaction Ownership
A transaction is owned by the module responsible for the state mutation.

A module must not partially mutate another module's tables inside a convenience transaction.

Cross-module workflows use explicit module interfaces and, where asynchronous behavior is appropriate, durable events/jobs.

Transactions that update canonical state and create an outbox event do so atomically.

## Constraints
Database constraints protect invariants that must hold regardless of which application path performs the mutation.

Examples include required relationships, uniqueness, valid state references, and idempotency keys where applicable.

Business rules that require external calls or complex orchestration remain outside database constraints.

## Implementation Note (2026-10-22)

The first RLS slice is implemented by
`infra/migrations/010_row_level_security.sql`:

- The authenticated actor is published as `app.actor_id` inside every
  transaction, after `BEGIN`, with transaction-local scope
  (`set_config(..., true)`). `COMMIT` or `ROLLBACK` discards it, which is the
  safe invariant under transaction-mode pooling such as Hyperdrive.
  `app.current_actor_id()` normalizes it to a UUID or null; null denies every
  tenant row, so a missing actor fails closed.
- `catalog_products`, `catalog_versions`, `media_attachments`, `ai_jobs`,
  `ai_proposals`, and `inquiries` have RLS enabled with explicit owner or
  buyer policies.
- Buyer discovery reads a narrow security-definer view,
  `app.published_catalog_products`, rather than the working product row. That
  is what allows `catalog_products` to remain owner-only without breaking
  published reads.
- `infra/database/app-role.sql` defines a `NOLOGIN`, `NOBYPASSRLS` privilege
  group. A deployment must create a non-owner login role, grant the group to
  it, and point the application connection at that login. The local
  development connection is still the table owner and therefore bypasses the
  policies.
- `FORCE ROW LEVEL SECURITY` is deliberately not used while the owner and the
  trusted maintenance path are the same role. The owner bypass is explicit;
  it is not the enforcement target.
- Identity tables are outside this slice because session verification happens
  before an actor identity exists. Buyer media reads and the artisan inquiry
  inbox are also deferred until their visibility rules exist.

See `docs/architecture/data-and-rls-contract.md` and
`infra/database/README.md` for the current state, activation steps, and
remaining gaps.

## Consequences
Positive:
- Clear persistence ownership
- Defense-in-depth authorization
- Safer cross-module evolution
- Durable transactional state transitions
- Easier reasoning about future extraction

Negative:
- More explicit interfaces
- RLS policies require careful testing
- Cross-module workflows cannot rely on arbitrary table access

## Rejected Alternative
Allow every module to freely read and write every application table.

Reason: it creates hidden coupling, weakens authorization boundaries, and makes future changes and service extraction substantially harder.
