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
