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
The RLS principles above are the target. They are not yet fully implemented.

As of M6 (discovery and inquiry), enforcement is application-level only:

- `inquiries` has no RLS policy. Read isolation between buyers rests entirely
  on `buyer_id` being part of the `WHERE` clause of every query that reads an
  inquiry, and on the fact that the API is the only client. If any non-API
  client ever reaches PostgreSQL with the same credentials, this isolation
  disappears.
- `catalog_products`, `catalog_versions`, and the other M1-M5 tables are in
  the same position; nothing in this repository has added a policy yet.
- There is no role model, so no predicate could express one.

This is a recorded gap, not an approved end state. ADR-007 and the "RLS
Principles" section above remain binding, and the policy work must land before
a second data path exists.

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
- read media attached to published products
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

## Publishing Boundary
A product becomes buyer-visible only through an explicit publish transition.

Published catalog data is the read boundary for buyer discovery.

## Audit Boundary
Important authorization-sensitive changes should produce auditable events.

Audit records must not contain passwords, tokens, raw authorization headers, or unnecessary sensitive data.

## Open Decisions
- Exact table columns
- Role model
- Auth/session implementation
- Service-role boundary
- Exact RLS predicates
- Reviewer assignment model
- Soft-delete/tombstone fields
- Catalog-version schema
- Inquiry visibility rules
- Media authorization model

## Acceptance
Every first-slice user path must have an explicit database authorization rule.

No security boundary may depend only on frontend behavior.
