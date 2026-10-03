# ADR-001: Modular Monolith and Module Boundaries

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision
Start the product as a modular monolith with explicit domain ownership boundaries.

Do not introduce independently deployed microservices until validated usage or a concrete operational requirement justifies extraction.

## Module Owners
- Identity: identity, roles, session context, authorization context
- Catalog: products, drafts, media relationships, catalog versions, publishing state
- Sync: synchronization operations, idempotency, retry/recovery coordination
- Media: upload authorization, media metadata, object-storage lifecycle
- AI: AI jobs, provider adapters, proposals, validation and AI-job lifecycle
- Review: review decisions, risk/manual-review state, moderation transitions
- Discovery: buyer-facing search/discovery over published catalog state
- Inquiry: buyer inquiries and their lifecycle
- Audit/Observability: audit and operational telemetry

## Dependency Rule
A module may call another module only through an explicit interface owned by the target module.

Canonical business-state mutation remains inside the owning module.

Cross-module convenience helpers must not become hidden write paths.

External providers are isolated behind adapters.

## Direction
User-facing flows may orchestrate multiple modules, but ownership remains singular.

Sync sends authorized changes toward Catalog.
AI produces proposals consumed by Catalog/Review; AI does not directly mutate Catalog.
Review authorizes or rejects review-required transitions owned by Catalog.
Discovery reads published Catalog state.
Inquiry references published Catalog state.
Audit/Observability records activity across modules without owning their business state.

## Consequences
Positive:
- Clear ownership
- Smaller interfaces
- Easier testing
- Future extraction remains possible
- Less accidental coupling

Negative:
- Some workflows cross module interfaces
- Transactions spanning modules require explicit design
- The first implementation needs discipline to avoid bypass paths

## Rejected Alternative
Premature microservices for every domain.

Reason: operational complexity would increase before product usage demonstrates the need.
