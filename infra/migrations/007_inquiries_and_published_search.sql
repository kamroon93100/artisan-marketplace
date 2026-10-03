-- Buyer inquiries, and deterministic published-text search.
--
-- Two things happen here, and they are here together because the second is
-- a property of the read that the first depends on: an inquiry can only
-- reference a published catalog version, and making that reference cheap to
-- find for buyers is what makes published catalog the read boundary in
-- practice.
--
-- Neither touches a product's working record. Nothing here writes to
-- `catalog_products` or `catalog_versions`, and no product state changes as
-- a result of this migration.

-- ---------------------------------------------------------------------
-- Deterministic published-text search
-- ---------------------------------------------------------------------
--
-- Decision A for this slice: buyer search is deterministic, case-insensitive
-- substring matching over published catalog text. Semantic and vector search
-- are deferred.
--
-- The expression below is the SQL form of `publishedSearchText` in
-- `apps/api/src/modules/catalog/domain/catalog-published.ts`, and the two
-- must stay identical. The in-memory repository matches with the TypeScript
-- function, so a divergence between them would make local development and
-- tests answer a different question from production.
--
-- `materials` is deliberately excluded. Joining an array is a STABLE rather
-- than IMMUTABLE SQL function, so an expression containing it cannot be
-- indexed; including it would mean a search that cannot use an index. The
-- materials are still returned to buyers in the listing. Recorded as a
-- limitation, not an oversight.

create extension if not exists pg_trgm;

comment on extension pg_trgm is
  'Trigram support for the deterministic published-catalog substring search. The search itself is a plain lower() + LIKE; the trigram index is what keeps it from being a sequential scan of the published catalog as it grows.';

-- The text a published listing is searched against, lower-cased so the
-- match is case-insensitive by construction rather than by remembering to
-- write `lower()` in each query.
--
-- `using gin` is required, not decorative: `gin_trgm_ops` is a GIN operator
-- class, and an index without it is a btree index whose operator class does
-- not exist. `lower(...)` is IMMUTABLE, so the whole expression is indexable.
create index if not exists catalog_versions_search_text_idx
  on catalog_versions
  using gin (
    lower(
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(category, '')
    )
    gin_trgm_ops
  );

-- The published read joins a version to the product's current published
-- version and orders by publication time. The first is already served by
-- `catalog_versions_product_version_idx`; the second is what makes "newest
-- first" answerable without sorting the whole published catalog.
create index if not exists catalog_versions_published_at_idx
  on catalog_versions(published_at desc, product_id asc);

-- Visibility is "has a published version and is not archived", and the
-- product side of that decision is a filter on one column of one table.
-- This index exists so a narrowed published read does not have to scan every
-- product to find the archived ones.
create index if not exists catalog_products_published_version_idx
  on catalog_products(published_version)
  where published_version is not null;

-- ---------------------------------------------------------------------
-- Inquiries
-- ---------------------------------------------------------------------
--
-- `docs/architecture/data-and-rls-contract.md` fixes the boundary: an
-- inquiry references a published product, and must not depend on a local-only
-- draft or an AI proposal.
--
-- The reference is expressed as a foreign key to `(product_id,
-- version_number)` on `catalog_versions`, not merely to the product, so that
-- an inquiry can never dangle: a row naming a version that does not exist
-- cannot be written here by any writer, including a future one that skips
-- the service. `catalog_versions` rows are immutable and never deleted, so
-- the reference cannot be invalidated afterwards either.
--
-- What this does not prove is that the version is the product's *currently*
-- published one. That is the application's decision, and it has to stay
-- there: after a republish, version 1 still exists and is still the version a
-- buyer legitimately asked about, so the database cannot and should not
-- reject it. The FK pins the reference; the published check happens once, in
-- the service, against the immutable read.

create table if not exists inquiries (
  id uuid primary key,

  -- The buyer who sent it. The value is the authenticated actor, so it is
  -- never a client assertion; the reads are scoped by it.
  buyer_id uuid not null,

  product_id uuid not null,

  -- The published version that was current when the inquiry was created.
  -- Recorded rather than resolved on read, so a later republish does not
  -- change which listing the buyer actually asked about.
  catalog_version integer not null,

  message text not null,

  -- Only 'NEW' exists today. The statuses an artisan inbox will produce
  -- arrive with that slice; listing them here now would be a promise the
  -- server cannot keep, and a client branching on one would be wrong.
  status text not null default 'NEW',

  created_at timestamptz not null,
  updated_at timestamptz not null,

  -- Required, not optional. Creation without a retry key is not creation
  -- without deduplication: a client that never saw the first response would
  -- create a second inquiry for the same intention.
  idempotency_key text not null,

  constraint inquiries_published_version_fkey
    foreign key (product_id, catalog_version)
    references catalog_versions(product_id, version_number)
    on delete restrict,

  constraint inquiries_status_check
    check (status in ('NEW')),

  constraint inquiries_message_check
    check (
      length(trim(message)) > 0
      and length(message) <= 2000
    ),

  constraint inquiries_catalog_version_check
    check (catalog_version >= 1),

  constraint inquiries_idempotency_check
    check (length(trim(idempotency_key)) > 0)
);

comment on table inquiries is
  'Buyer inquiries against published catalog state. An inquiry references a published catalog version and never a working draft or an AI proposal. Authorization is enforced in the application: every read is scoped by buyer_id, and repository-wide RLS is deferred — see the gap recorded in docs/agent/m6-buyer-journey-task.md.';

comment on column inquiries.buyer_id is
  'The authenticated buyer. Every read scopes by this column, so a buyer can only reach their own inquiries.';

comment on column inquiries.catalog_version is
  'The published catalog version this inquiry refers to. Constrained to a real catalog_versions row, so the reference cannot name a version that does not exist or dangle afterwards. It deliberately does not require the product to still point at this version: after a republish the earlier version remains the one the buyer asked about.';

comment on column inquiries.message is
  'The buyer''s message. The 2000 bound here must stay equal to INQUIRY_MESSAGE_MAX_LENGTH in packages/contracts/src/inquiry/inquiry.ts; the database repeats it so oversized input is refused as input rather than as a constraint violation, and the two drifting apart would make the limit depend on which layer noticed first.';

comment on column inquiries.status is
  'Inquiry lifecycle state. Only NEW exists in this slice; the artisan inbox slice adds the states an artisan produces.';

comment on column inquiries.idempotency_key is
  'Client retry key, scoped to the buyer. Required, and unique per buyer, so a repeated offline delivery converges on the inquiry it already created.';

-- The idempotency guarantee is the index, not a read-then-write in the
-- service. Two concurrent retries both pass a "does it exist yet" check and
-- both insert; this is what actually stops the second one.
create unique index if not exists inquiries_buyer_idempotency_idx
  on inquiries(buyer_id, idempotency_key);

-- The buyer's own list, newest first. `id` is the tie-breaker so the order
-- is total: without it, two inquiries created in the same millisecond can
-- swap places between two page requests, and the buyer sees one twice and
-- the other not at all.
create index if not exists inquiries_buyer_recent_idx
  on inquiries(buyer_id, created_at desc, id asc);
