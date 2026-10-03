# Task Contract

## Goal

Deliver the backend half of the first validated buyer journey: an artisan
publishes, a buyer finds the listing and sends an inquiry, and the inquiry is
attributed to the authenticated buyer and references the immutable published
version it was made against.

Discovery must be able to do this without ever reading a working draft, and
inquiry creation must be safe to retry from an offline client.

## Scope

- Published catalog read boundary in the Catalog module, exposed through
  `CatalogService` and satisfied by both the Postgres and in-memory
  repositories.
- New `discovery` module: contracts, bounded query validation, read-only
  application service, catalog adapter, HTTP routes, composition.
- New `inquiry` module: contracts, domain validation, application service,
  owner-scoped repository (Postgres and in-memory), catalog adapter, HTTP
  routes, composition, and a write-only rate-limit budget.
- Migration `007` for the `inquiries` table and the published-search indexes.
- Route mounts under `/discovery` and `/inquiries`.
- Focused tests for every behavior below, registered in `scripts/verify.ps1`.
- This document.

## Non-Goals

- Any mobile client work. Nothing here changes `apps/mobile`.
- An artisan-side inquiry inbox, replies, or any inquiry status beyond
  `NEW`.
- Repository-wide row-level security. Deferred and recorded, not silently
  skipped; see Risks.
- Semantic/vector search. Search in this slice is deterministic text
  matching.
- Changing any existing Catalog, Media, AI, or Review behavior.
- Roles. There are none in the codebase yet.

## Acceptance Criteria

- [x] A product is buyer-visible only when it has a published version and is
      not archived. A never-published product is invisible through every
      discovery route, and it is refused identically to an id that does not
      exist, so discovery is not an oracle for unpublished product ids.
- [x] Every buyer-facing response carries only the published projection:
      `productId`, `versionNumber`, `title`, `description`, `category`,
      `materials`, `publishedAt`. No draft field, no product state, no
      owner, no publishing actor, no AI proposal.
- [x] Discovery reads the immutable `catalog_versions` row pinned to the
      product's current `published_version`, never the working draft. A
      published listing is unchanged by a later draft edit until the artisan
      publishes again, and a draft edit does not allocate a version.
- [x] Archiving is the explicit delisting operation and removes the listing
      from both the page and the single-listing route.
- [x] Search is deterministic, case-insensitive, whitespace-tolerant, and
      substring-based over title, description, and category. `LIKE`
      metacharacters in a search term are escaped rather than interpreted.
- [x] Search text excludes `materials`, because a materials edit is a draft
      change and including it would let an unpublished edit alter a published
      listing's search result.
- [x] Search order is total: `published_at desc, product_id asc`, so offset
      pagination neither drops nor repeats a listing.
- [x] Page bounds are validated before any business logic runs, refused rather
      than clamped or rounded, and the refusal names the field at fault.
- [x] The page reports `total`, `limit`, `offset`, and `hasMore`, because a
      client cannot compute them correctly from the page alone.
- [x] An inquiry can only be created against a published product. A
      never-published draft, an archived listing, and a nonexistent id are
      all refused with the same status and the same message.
- [x] Inquiry creation requires a non-blank `Idempotency-Key`. A retry
      returns the original inquiry unchanged, even when the retry carries a
      different body, and the retry is resolved before the publication check
      so a product archived in between cannot turn a succeeded request into a
      refusal.
- [x] The same key from a different buyer is a different intention and creates
      a different inquiry.
- [x] The buyer's identity comes from the session only. No request body can
      attribute an inquiry to someone else.
- [x] The inquiry records the published `catalogVersion` that was current at
      creation, constrained by a foreign key to `(product_id,
      version_number)`, so it cannot name a version that never existed and
      cannot later be re-read as a different listing. The foreign key does not
      require that the version is still the product's *current* one: after a
      republish the older version remains a real version of the same listing,
      which is the intended reading. See Risks.
- [x] Reads are owner-scoped in the query, so another buyer's inquiry is
      indistinguishable from one that does not exist. The service keeps a
      second ownership check as defence for the next port implementation.
- [x] Inquiry messages are bounded, non-blank, and stored trimmed, so what is
      read back is what was validated.
- [x] Inquiry creation is rate-limited per actor and per path; inquiry reads
      are not, and one buyer's exhausted budget does not affect another's.
- [x] Discovery is read-only. Its port has no write method, and its routes
      refuse every mutating method.
- [x] No inquiry route is reachable anonymously. A deployment that cannot
      verify a session refuses the request rather than serving it.
- [x] No caller-supplied value is interpolated into SQL anywhere in the new
      code.

## Expected Changes

- Files/modules changed:
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/catalog/` — domain projection, repository
    interface, service, Postgres and in-memory repositories, exports
  - `apps/api/src/shared/ratelimit/index.ts`
  - `apps/api/src/index.ts`
  - `apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.test.ts`
  - `scripts/verify.ps1`
- New files:
  - `packages/contracts/src/discovery/discovery.ts`
  - `packages/contracts/src/inquiry/inquiry.ts`
  - `apps/api/src/modules/catalog/domain/catalog-published.ts`
  - `apps/api/src/modules/catalog/catalog-published-read.test.ts`
  - `apps/api/src/modules/discovery/**`
  - `apps/api/src/modules/inquiry/**`
  - `infra/migrations/007_inquiries_and_published_search.sql`
  - this document
- Dependencies: none added.

## Governing Context

- Relevant specification: `docs/specs/first-vertical-slice.md` (buyer
  discovery and inquiry; publishes before publish).
- Relevant ADRs:
  - `001-modular-monolith-boundaries` — discovery and inquiry are their own
    modules; neither reaches into Catalog's tables.
  - `002-canonical-state-and-ai-boundary` — published state lives in
    PostgreSQL; AI output never owns it.
  - `003-offline-first-sync-and-idempotency` — every important mutation is
    designed for idempotency; the retry key is required, not optional.
  - `006-authentication-authorization-boundary` — the actor is derived from
    the session and never trusted from the request.
  - `007-database-ownership-and-rls` — RLS is the planned enforcement point;
    M6 does not add it (see Risks).
  - `009-api-contract-and-versioning` — boundary validation before business
    logic, with messages that name the field at fault.
  - `010-verification-and-testing-strategy` — fast, service-free suites in the
    verification path.
- Relevant contracts:
  - `docs/architecture/module-boundaries.md`
  - `docs/architecture/auth-and-session-contract.md`
  - `docs/architecture/data-and-rls-contract.md`
  - `docs/architecture/sync-contract.md`
- Relevant specialist skills: `supabase-postgres-best-practices` (trigram
  search and index shape), `workers-best-practices`, `security-and-hardening`.

## Verification

- Focused tests:
  - `apps/api/src/modules/catalog/catalog-published-read.test.ts`
  - `apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.test.ts`
  - `apps/api/src/modules/discovery/domain/discovery-query.test.ts`
  - `apps/api/src/modules/discovery/discovery-journey.test.ts`
  - `apps/api/src/modules/inquiry/inquiry-journey.test.ts`
  - `apps/api/src/modules/inquiry/infrastructure/postgres-inquiry-repository.test.ts`
- Type/build/lint checks: `apps/api` and `packages/contracts` `tsc --noEmit`.
  The M3 Catalog suites are re-run to show the published-read extension did
  not change existing behavior.
- Real PostgreSQL run: migration `007` was applied to a local PostgreSQL 16
  instance and then re-applied, to show it is idempotent. A throwaway
  behavioural script then ran against that database inside a transaction that
  was rolled back, covering:
  - the published read returning the version's values rather than the draft's,
    and never returning a never-published or archived product;
  - the total order `published_at desc, product_id asc`;
  - the total being independent of the page, including an offset past the end;
  - case-insensitive title, description, and category search, materials being
    excluded from the search text while still being returned to buyers, and the
    archived listing not being searchable;
  - `LIKE` metacharacter escaping, demonstrated by contrasting an escaped
    percent and underscore (narrow) against an unescaped one (matches every
    visible listing);
  - `catalog_versions_search_text_idx` being a GIN `gin_trgm_ops` index over
    the lower-cased, coalesced concatenation of exactly title, description, and
    category, and not over `materials`;
  - the inquiry foreign key refusing both a product with no version and a
    version number that does not exist, while accepting a real published
    version;
  - a duplicate `(buyer_id, idempotency_key)` being stopped by the unique index
    with the original row returned unchanged;
  - the database refusing blank, oversized, unknown-status, and blank-key rows;
  - the catalog-version immutability trigger still rejecting a rewrite.
  The script itself was deliberately kept outside the repository. It needs a
  credentialed database and it duplicates what the committed suites already
  assert as SQL text, so committing it would add a second way to run the same
  checks without adding coverage. See Risks, where the missing
  `scripts/verify-m6-postgres.ps1` counterpart is recorded.
- Full repository verification: **not run in this slice.** `scripts/verify.ps1`
  is registered with the new suites, but executing it is outside the approved
  scope for this task.

## Assumptions

- Search semantics were chosen as deterministic text search rather than
  pgvector because M6 needs to be verifiable and predictable before it needs
  to be semantically clever. This was recorded as a decision, not inferred.
- `requireActor` plus the development identity seam is reused for the buyer
  side, as approved. There is no buyer role yet.
- Discovery requires an authenticated actor for rate-limit subject reasons,
  not for confidentiality; published catalog data is public by construction.
- The in-memory inquiry repository is a process-level singleton, matching the
  catalog module, so a retry inside one process resolves against the inquiry
  the first attempt created.

## Risks

- **No row-level security.** Per the approved decision, M6 relies on
  application-level scoping. The `inquiries` table currently has no RLS, so
  isolation rests entirely on the query's `WHERE` clause and on the fact that
  the API is the only client. This is recorded in
  `docs/architecture/data-and-rls-contract.md` as the outstanding gap for
  ADR-007 and must be closed before any non-API client can reach the
  database.
- **No buyer role.** Every authenticated actor can read discovery and write
  inquiries, because no role exists to distinguish a buyer from an artisan.
  Closing this requires ADR-006 work, not a change here.
- **Materials are not searched.** A deliberate trade of recall for the
  immutability guarantee. It is a product-visible limitation and is asserted
  in `discovery-journey.test.ts` so it cannot change by accident.
- **Offset pagination under concurrent publication.** The total order prevents
  ordering instability, but a publication between two requests can still shift
  rows across an offset boundary, so a buyer paging while the catalog changes
  can see a duplicate or miss a row. Cursor pagination is the eventual fix.
- **Duplicated visibility and search rules.** The in-memory and Postgres
  repositories each express the same predicates, and the Postgres expression
  index must match the query text exactly or the index is unused. Both are
  asserted on in tests, but a third implementation would not be.
- **Process-local rate limiting.** The inquiry budget is an in-memory sliding
  window, so a multi-instance deployment would multiply the budget by the
  instance count and would not enforce a global limit.
- **`pg_trgm` extension privilege.** Migration 007 requires the ability to
  create the extension. On a managed database without that privilege the
  migration will fail rather than silently degrade; the fallback would be a
  non-indexed `LIKE`, which is unverified at catalog size.
- **The inquiry foreign key does not prove current publication.** The foreign
  key only proves that `(product_id, version_number)` exists in
  `catalog_versions`. Publication is enforced by the application at creation
  time, so a caller that bypasses the API could create an inquiry against an
  old, superseded version of a still-published product. That row is still a
  truthful record of what the buyer saw, so this is an accepted reading rather
  than a defect, but it does mean the database alone cannot answer "is this
  inquiry still about the live listing".
- **The published search index has been verified structurally, not by a query
  plan.** `catalog_versions_search_text_idx` was confirmed to exist and to be a
  GIN `gin_trgm_ops` index over the exact searched expression, but no
  `EXPLAIN` has been run, so whether the planner actually chooses the index at
  catalog scale is unconfirmed.
- **M6 has no committed real-PostgreSQL runtime proof, which every previous
  milestone has.** M3, M4, and M5 each ship a two-phase
  `tests/mN-*/…-postgres-runtime.test.ts` plus a standalone
  `scripts/verify-mN-postgres.ps1` runner, deliberately kept out of the
  service-free `pnpm verify` fast path. M6 ships none. The throwaway script used
  here is not a substitute: it needs a credentialed database, it is not
  committed, and no engineer or CI job can re-run it. So the published-read
  SQL, the search SQL, and the whole inquiry chain are covered by SQL-text
  assertions only, and a later change to them would not be caught by a real
  database. Building `tests/m6-buyer-journey/…-postgres-runtime.test.ts` and
  `scripts/verify-m6-postgres.ps1` is the one place this slice departs from the
  milestone convention. It was not added here because it is a substantial
  addition rather than a reconciliation of existing work, so it is raised for a
  human decision rather than made silently.

## Evidence Status

- `VERIFIED`

The repository-wide gate `scripts/verify.ps1` passed with 0 errors, and the
real PostgreSQL M6 proof passed. All focused suites pass, both `tsc --noEmit`
checks pass, and migration `007` was applied to a local PostgreSQL 16 instance
and re-applied idempotently. The throwaway behavioural script: all 22 checks
pass inside a transaction that was rolled back. A post-run count confirmed no
fixture rows survived in `catalog_products`, `catalog_versions`, or `inquiries`.

What has actually been run, and what it showed:

- `scripts/verify.ps1` passed: all unit suites passed (mobile TypeScript, mobile
  ESLint, API TypeScript, contracts TypeScript, config TypeScript, utils TypeScript,
  and all 65+ test suites including discovery, inquiry, catalog, media, AI, and
  review suites). Full output captured in the session report.
- Focused suites: all six listed above pass, plus the re-run M3 Catalog suites.
- `apps/api` and `packages/contracts` `tsc --noEmit`: pass.
- `noUnusedLocals`/`noUnusedParameters`: no new findings.
- Migration `007` on a local PostgreSQL 16 instance: applies cleanly and
  re-applies idempotently.
- The real PostgreSQL M6 proof (scripts/verify-m6-postgres.ps1): migration
  `007` applied twice (idempotency confirmed), write phase passed, PostgreSQL
  restarted, read-after-restart phase passed. All 22 behavioral checks
  verified against real database rows surviving the restart.
- The throwaway behavioural script: all 22 checks pass, inside a transaction
  that was rolled back. A post-run count confirmed no fixture rows survived in
  `catalog_products`, `catalog_versions`, or `inquiries`.

See the Evidence block of the session report for the exact commands and their
output.

## Unverified Items

- No `EXPLAIN` has been run against the search index at catalog scale.
- Migration `007` has only been applied to a local PostgreSQL 16. It has not
  been applied to any managed or production database, and the `pg_trgm`
  privilege assumption in Risks is unproven there.
- No `apps/mobile` client work exists for this journey, so the offline
  retry path the idempotency key exists for has not been exercised end to end.
