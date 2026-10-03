# Module Boundaries

Status: Draft for first vertical slice

## Principle
Use a modular monolith with explicit boundaries.

A module owns a coherent domain responsibility and exposes a small interface.

Do not create a module merely because a table, route, or provider exists.

## Proposed Modules

### Identity
Owns:
- authenticated identity
- roles
- session-related application context
- authorization context

Must not own product business state.

### Catalog
Owns:
- products
- product drafts
- product media metadata
- catalog versions
- publish/archive transitions

Canonical product business state lives here.

### Sync
Owns:
- synchronization operations
- idempotency handling
- retry/recovery coordination
- client/server synchronization contracts

Sync must not become the canonical product store.

### Media
Owns:
- upload authorization
- media metadata
- object-storage references
- upload lifecycle

Binary media itself lives in R2.

### AI
Owns:
- AI jobs
- provider adapters
- AI proposals
- validation pipeline
- AI job retry/failure state

AI cannot directly own canonical product state.

### Review
Owns:
- review decisions
- risk/manual-review state
- moderation transitions

Review decisions must remain distinct from AI confidence.

### Discovery
Owns:
- buyer-facing product discovery
- search queries
- retrieval orchestration

Discovery reads canonical published state.

### Inquiry
Owns:
- buyer inquiries
- inquiry lifecycle
- inquiry authorization

Inquiries reference published catalog state.

### Audit / Observability
Owns:
- audit events
- operational event metadata
- correlation/causation relationships

Do not store sensitive credentials in this module.

## Cross-Module Rules
- Modules communicate through explicit interfaces.
- Avoid direct writes into another module's tables.
- Canonical state transitions belong to the owning module.
- Shared infrastructure must not become a dumping ground for domain logic.
- Database foreign keys may express domain relationships without granting arbitrary write authority.
- External providers are isolated behind adapters.

## First-Slice Dependency Direction
Identity
  ↓
Catalog ← Sync
  ↓       ↓
Media     AI
  ↓       ↓
Catalog ← Review
  ↓
Discovery
  ↓
Inquiry

Audit/Observability spans all modules without owning their business state.

## Open Decisions
- Exact module folder structure
- Module interface format
- Event vs direct-call boundaries
- Shared error model
- Transaction ownership
- Cross-module transaction strategy
- Provider adapter location

## Acceptance
Every first-slice operation must have one obvious owning module.

If ownership is ambiguous, resolve the domain boundary before implementation.
