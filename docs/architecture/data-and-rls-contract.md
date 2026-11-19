# Data and RLS Contract

Status: Draft for first vertical slice

## Canonical Entities
- User
- Artisan Profile
- Buyer Profile
- Product
- Product Media
- Catalog Version
- Inquiry
- Review Decision
- AI Job
- AI Proposal
- Sync Operation
- Outbox Entry
- Audit Event

## Ownership
- An artisan owns their product drafts and product-editing rights.
- Buyers can discover published products.
- Buyers can create inquiries against published products.
- Reviewers can access only the review surfaces and records authorized for their role.
- AI jobs and proposals are system-managed records.

## Product Boundary
Product is canonical business state.

AI Proposal is non-canonical suggestion state.

Catalog Version represents a published snapshot.

## Media Boundary
Product Media stores metadata and the authorized relationship to the R2 object.

Binary media does not belong in PostgreSQL.

## Inquiry Boundary
An inquiry references a published product.

An inquiry must not depend on a local-only draft or AI proposal.

## RLS Principles
- Deny by default.
- Every exposed table must have an intentional access policy.
- Authorization is based on authenticated identity and role/ownership relationships.
- Never rely on the client to enforce authorization.
- Service-role operations must be isolated from normal user operations.

## Current Enforcement State

ADR-007 and the principles above remain binding. Migration
`010_row_level_security.sql` is the first enforcement slice:

- `catalog_products`, `catalog_versions`, `media_attachments`, `ai_jobs`,
  `ai_proposals`, and `inquiries` have row-level security enabled.
- The API publishes the session-resolved actor to PostgreSQL as
  `app.actor_id` inside every transaction, using transaction-local scope
  (`set_config(..., true)`) after `BEGIN`. `COMMIT` or `ROLLBACK` discards the
  setting, so a transaction-mode pooler cannot carry one request's actor into
  the next. `app.current_actor_id()` returns null when the setting is absent,
  empty, or not a UUID, so a missing actor is denied rather than defaulted.
- `catalog_products` is owner-only for `SELECT`. Buyers read published data
  through `app.published_catalog_products`, a narrow security-definer view
  exposing only `id`, `published_version`, and `state`. Working drafts,
  including unpublished edits to a published product, never become row-visible
  to another account.
- `media_attachments` is owner-only in this slice. Buyer media reads are
  deferred until a per-attachment published-visibility model exists; a
  published product may still carry a private voice note.
- `inquiries` is buyer-only. The artisan inbox does not exist yet, so no
  product-owner policy has been invented for it.
- `ai_jobs` and `ai_proposals` are owned through the product owner. The AI
  pipeline runs under the actor's request; there is no separate AI service
  role yet.

### Role model and activation blocker

`infra/database/app-role.sql` creates a `NOLOGIN`, `NOSUPERUSER`,
`NOBYPASSRLS` privilege group, `artisan_marketplace_app`. A deployment creates
a separate login role, grants that group to it, and points the application
connection (including the Hyperdrive binding) at that login. The login must not
own the tables.

That activation is not complete in the local development database: its only
application role, `artisan_marketplace`, owns the tables and is
`SUPERUSER`/`BYPASSRLS`. Policies are present but bypassed for that
connection. The owner bypass is intentional while migrations, backfills, and
trusted operations use the same role; `FORCE ROW LEVEL SECURITY` is not used.
See `infra/database/README.md` for the activation steps and
`tests/rls-policy/` for the isolated proof under a real non-owner login.

### Still outside RLS

- `identity_accounts`, `identity_sessions`, and `identity_refresh_grants`.
  Session verification happens before an actor identity exists; these tables
  need a separate auth role or a security-definer boundary.
- Buyer media reads and the artisan inquiry inbox, as described above.
- Reviewer and service-role operations. There is no reviewer role and no
  separate AI service role; a background worker must not reuse the API login
  without an actor.

## Artisan Access
An artisan may:
- read their own products
- create product drafts
- edit products they own
- manage media belonging to their authorized products
- review and confirm their AI proposals
- view their product state and sync-related status

An artisan must not:
- read another artisan's private drafts
- modify another artisan's product
- modify canonical review decisions
- modify AI job state directly

## Buyer Access
A buyer may:
- read published catalog information
- read media attached to published products (target; not yet implemented — buyer
  media reads are deferred until a per-attachment visibility model exists)
- create inquiries against published products
- read inquiries they are authorized to see

A buyer must not:
- read private artisan drafts
- read private AI proposals
- modify product ownership or review state

## Reviewer Access
Reviewer permissions must be explicit and role-based.

Reviewers may access only records required for authorized moderation/review workflows.

## AI Access
AI processing must not operate as an ordinary end-user client.

AI jobs may read only the minimum authorized inputs.

AI processing may create proposal records but cannot bypass the canonical validation/review boundary.

In the current slice, AI jobs and proposals are owner-scoped through the
product owner and run under the authenticated actor's database connection.
There is no separate AI service role; a background worker must be given an
explicit actor and must not reuse the API login anonymously.

## Publishing Boundary
A product becomes buyer-visible only through an explicit publish transition.

Published catalog data is the read boundary for buyer discovery.

## Audit Boundary
Important authorization-sensitive changes should produce auditable events.

Audit records must not contain passwords, tokens, raw authorization headers, or unnecessary sensitive data.

## Open Decisions
- Exact table columns
- Deployment login role provisioning (the NOLOGIN privilege group is defined;
  the login credential remains deployment configuration)
- Service-role boundary
- Reviewer assignment model
- Soft-delete/tombstone fields
- Catalog-version schema
- Buyer media visibility model
- Artisan inquiry inbox and status transitions

## Acceptance
Every first-slice user path must have an explicit database authorization rule.

No security boundary may depend only on frontend behavior.
