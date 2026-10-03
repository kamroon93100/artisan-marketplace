-- Catalog versions.
--
-- `catalog_products` is the working record an artisan edits. This table
-- is what buyers have actually been shown, captured once per publish.
--
-- ADR-002 requires that a change to an already published product "create
-- an explicit catalog-version change rather than silently rewriting
-- historical published state", and ADR-003 repeats it for sync. The
-- first-vertical-slice specification makes it an acceptance criterion:
-- "Published changes create a new catalog version."
--
-- `001_catalog/README.md` previously listed a "catalog versions/history
-- table" as deliberately not included yet. This migration adds it.

alter table catalog_products
  add column if not exists published_version integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_products_published_version_check'
  ) then
    alter table catalog_products
      add constraint catalog_products_published_version_check
      check (
        published_version is null
        or published_version >= 1
      );
  end if;
end
$$;

comment on column catalog_products.published_version is
  'Number of the catalog version buyers currently see; null until the product has been published once. Distinct from the `version` optimistic-concurrency counter.';

create table if not exists catalog_versions (
  id uuid primary key,

  product_id uuid not null
    references catalog_products(id)
    on delete restrict,

  version_number integer not null,

  -- Snapshot of the canonical values as they stood at publish time.
  -- `title` and `description` are not null because the publish
  -- precondition requires them; category and materials are recorded
  -- exactly as published and may legitimately be absent.
  title text not null,
  description text not null,
  category text,
  materials text[] not null default '{}',

  published_at timestamptz not null,
  published_by uuid not null,

  idempotency_key text,

  constraint catalog_versions_version_number_check
    check (version_number >= 1),

  constraint catalog_versions_title_check
    check (length(trim(title)) > 0),

  constraint catalog_versions_description_check
    check (length(trim(description)) > 0),

  constraint catalog_versions_idempotency_check
    check (
      idempotency_key is null
      or length(trim(idempotency_key)) > 0
    )
);

create unique index if not exists catalog_versions_product_version_idx
  on catalog_versions(product_id, version_number);

create unique index if not exists catalog_versions_product_idempotency_idx
  on catalog_versions(product_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists catalog_versions_published_by_idx
  on catalog_versions(published_by);

comment on table catalog_versions is
  'Immutable published catalog snapshots. One row per successful publish of a product; never updated or deleted.';

comment on column catalog_versions.version_number is
  'Monotonic 1-based version within one product. Matches catalog_products.published_version while that version is the current one.';

comment on column catalog_versions.published_by is
  'Actor identity that authorized this publish; the audit record required for an authorization-sensitive change.';

comment on column catalog_versions.idempotency_key is
  'Client retry key scoped to the owning product, so a retried publish converges on the version it already created instead of creating another.';

-- Immutability.
--
-- A published snapshot that can be rewritten is not an audit record.
-- Application-level discipline alone would leave the guarantee resting
-- on the assumption that no future code path updates or deletes these
-- rows, so the guarantee is enforced where it actually has to hold:
-- the database, for every writer including migrations and manual fixes.
create or replace function catalog_versions_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'catalog_versions rows are immutable published snapshots; create a new version instead'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists catalog_versions_immutable on catalog_versions;

create trigger catalog_versions_immutable
  before update or delete on catalog_versions
  for each row
  execute function catalog_versions_reject_mutation();
