# ADR-011: Repository Layout and Module Implementation

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision
Use a pnpm workspace monorepo with a small number of explicit applications and shared packages.

## Repository Layout

`	ext
apps/
  api/                    # Cloudflare Workers + Hono modular monolith
    src/
      modules/
        identity/
        catalog/
        sync/
        media/
        ai/
        review/
        discovery/
        inquiry/
        audit/
      shared/              # narrowly scoped application infrastructure

  mobile/                 # React Native + Expo application
    src/

packages/
  contracts/              # API/event/domain boundary schemas
  config/                 # shared configuration primitives only
  utils/                  # genuinely shared deterministic utilities

docs/
  adr/
  architecture/
  specs/

infra/
  migrations/
  scripts/

.agents/
.opencode/
`",
",

The API remains a modular monolith.

Each domain module owns its application logic, interfaces, persistence access, validation, and module-specific tests.

Shared infrastructure may be used by modules, but shared infrastructure must not contain hidden business ownership.

Modules must not import another module's internal implementation directly.

## Contracts Package
The contracts package contains explicitly shared boundary schemas where sharing reduces duplication without leaking persistence models.

Database ORM models and provider SDK types do not belong in the contracts package.

Contracts may cover API payloads, event envelopes, stable enums, and validation schemas.

## Mobile Rule
Mobile code is organized around user-facing features and domain workflows rather than mirroring backend database tables.

Local persistence, synchronization, media upload coordination, and AI progress presentation remain client concerns implemented against explicit API contracts.

## Infrastructure Rule
Infrastructure configuration is kept separate from application domain code.

Development infrastructure may initially use local PostgreSQL and local service emulators/mocks where practical.

Production infrastructure configuration must not leak secrets into source control.

## Test Placement
Module unit and integration tests live with the owning application/module.

Cross-application contract tests live with the contract boundary or dedicated test infrastructure.

End-to-end workflow tests live at the application/integration level rather than inside an individual domain module.

## Consequences
Positive:
- Clear physical mapping to domain ownership
- Low coupling
- Shared contracts without shared persistence models
- Straightforward local development
- Future service extraction remains possible

Negative:
- Monorepo tooling must be maintained
- Some cross-module workflows require explicit interfaces
- Shared packages require discipline to prevent becoming a dumping ground

## Rejected Alternative
Create a separate repository or independently deployed service for every domain module.

Reason: the first vertical slice does not yet justify the operational cost of independently deployed services.
