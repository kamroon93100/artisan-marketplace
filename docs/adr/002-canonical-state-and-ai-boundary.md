# ADR-002: Canonical State and AI Proposal Boundary

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision
PostgreSQL is the canonical source of truth for synced business state.

AI output is untrusted proposal data and is never the canonical product record.

An AI pipeline may generate, transform, classify, extract, summarize, translate, embed, or recommend values, but it must not directly mutate canonical product state.

## Canonical State
Catalog owns product state, catalog versions, publishing state, and confirmed business values.

Sync owns synchronization operations and retry/recovery coordination, but does not become a second source of truth.

R2 owns media objects; PostgreSQL owns their metadata and relationships.

Queue messages transport work and events; they are not authoritative state.

## AI Boundary
AI workers write AI-job state and proposal artifacts through the AI module.

Proposals must pass schema validation and applicable semantic/business validation before entering review or controlled application flows.

AI confidence is routing information, not approval.

An AI failure must not prevent manual product creation or correction.

AI must never silently overwrite an artisan-confirmed value.

## Provenance
AI-derived fields should retain sufficient provenance to explain:
- value
- source
- source type
- model/provider
- model version
- prompt/schema/pipeline versions where applicable
- confidence where available
- confirmation actor and time when later confirmed

## Publishing
Only authorized business workflows may transition canonical catalog state to APPROVED or PUBLISHED.

AI-generated content may participate in the workflow but cannot independently authorize publication.

Changes to an already published product create an explicit catalog-version change rather than silently rewriting historical published state.

## Consequences
Positive:
- Clear trust boundary
- Auditable AI behavior
- Human correction remains possible
- Provider changes do not redefine product state
- AI outages do not destroy core catalog functionality

Negative:
- Additional proposal and validation records
- More explicit state transitions
- AI-assisted workflows require orchestration rather than direct table writes

## Rejected Alternative
Allow AI workers to directly update canonical product tables.

Reason: it would couple probabilistic output to authoritative business state and make rollback, auditing, validation, and human correction substantially harder.
