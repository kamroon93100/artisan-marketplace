-- 010 - row-level security for artisan-owned and buyer-owned data.
--
-- Scope of this migration:
--
--   * publish the authenticated actor to PostgreSQL through a connection
--     setting (`app.actor_id`) and one stable helper, `app.current_actor_id()`;
--   * deny-by-default policies on the six tables that hold account-owned
--     business data: catalog_products, catalog_versions, media_attachments,
--     ai_jobs, ai_proposals, and inquiries;
--   * a narrow, security-definer view for the buyer-visible published
--     projection, so discovery never needs SELECT on a working product row.
--
-- What this migration deliberately does not do:
--
--   * It does not FORCE row-level security. The table owner and any role with
--     BYPASSRLS still bypass these policies. That is intentional while the
--     only provisioned application connection is the table owner: migrations,
--     backfills, and trusted operations must keep working. Enforcement
--     begins when the application connects as a non-owner, NOBYPASSRLS login
--     role. See infra/database/README.md and
--     docs/architecture/data-and-rls-contract.md.
--   * It does not add RLS to identity_accounts, identity_sessions, or
--     identity_refresh_grants. Session verification happens before an actor
--     identity exists, so those tables need a separate auth role or
--     security-definer boundary before they can be protected this way.
--   * It does not create a login role, a password, or a connection string.
--     Credentials are deployment configuration, not schema.
--   * It does not add reviewer or service-role policies. The current review
--     path is the owner reviewing their own product, and the AI pipeline runs
--     under the actor's request. A separate service role remains a recorded
--     gap.
--
-- Idempotence: every statement is re-runnable. Policies are dropped and
-- recreated because PostgreSQL 16 has no `create policy if not exists`.
-- No table data is changed and no object is dropped except policies owned by
-- this migration.

begin;

create schema if not exists app;

revoke all on schema app from public;

-- Returns the actor id set by the application for this connection, or null
-- when the value is absent, empty, or not a UUID. The null result is what
-- makes the policies fail closed: a missing setting denies every tenant row
-- instead of matching nothing or raising a cast error.
create or replace function app.current_actor_id()
returns uuid
language sql
stable
as $$
  select case
    when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then value::uuid
    else null
  end
  from (
    select nullif(current_setting('app.actor_id', true), '') as value
  ) as setting;
$$;

comment on function app.current_actor_id() is
  'The session-resolved actor for this connection, read from app.actor_id. Null when absent or invalid, which makes the RLS policies deny access. The value is set by the API from the verified session, never from a request body.';

-- The published projection discovery and inquiry validation may read.
--
-- This is deliberately a security-definer view owned by the table owner: it
-- exposes only the product id, the currently published version, and the
-- lifecycle state of products that already have a published version and are
-- not archived. A buyer therefore cannot read the working row, including
-- unpublished edits to a published product, while discovery still has the
-- two columns it joins on. It must remain owned by the table owner (or a role
-- with BYPASSRLS); changing ownership would make the view subject to the
-- owner-only policy on catalog_products.
create or replace view app.published_catalog_products
with (security_invoker = false) as
select
  p.id,
  p.published_version,
  p.state
from public.catalog_products p
where p.published_version is not null
  and p.state <> 'ARCHIVED';

comment on view app.published_catalog_products is
  'Buyer-visible product pointer projection: id, current published version, and lifecycle state. Security definer and intentionally narrow so working drafts stay behind RLS.';

revoke all on app.published_catalog_products from public;

-- ---------------------------------------------------------------------------
-- catalog_products
-- ---------------------------------------------------------------------------
--
-- Owners see and mutate their own working row. Buyers do not get a row-level
-- policy on this table at all; discovery reads the published projection view.
-- The insert policy also refuses a row that is born approved or published,
-- because createDraft is the only insertion path and it always starts in
-- LOCAL_DRAFT.
alter table public.catalog_products
  enable row level security;

drop policy if exists catalog_products_owner_select
  on public.catalog_products;
create policy catalog_products_owner_select
  on public.catalog_products
  for select
  to public
  using (owner_id = app.current_actor_id());

drop policy if exists catalog_products_owner_insert
  on public.catalog_products;
create policy catalog_products_owner_insert
  on public.catalog_products
  for insert
  to public
  with check (
    owner_id = app.current_actor_id()
    and state = 'LOCAL_DRAFT'
    and published_version is null
  );

drop policy if exists catalog_products_owner_update
  on public.catalog_products;
create policy catalog_products_owner_update
  on public.catalog_products
  for update
  to public
  using (owner_id = app.current_actor_id())
  with check (owner_id = app.current_actor_id());

-- No delete policy: deletion is not an operation this slice exposes. The
-- owner and trusted service role can still delete through their bypass.

-- ---------------------------------------------------------------------------
-- catalog_versions
-- ---------------------------------------------------------------------------
--
-- An owner sees every immutable version of their own product. Any other
-- actor sees only the version currently published for a buyer-visible
-- product, which is the same projection discovery uses. Versions are
-- inserted only by publication, with published_by set to the actor, and are
-- never updated or deleted.
alter table public.catalog_versions
  enable row level security;

drop policy if exists catalog_versions_read
  on public.catalog_versions;
create policy catalog_versions_read
  on public.catalog_versions
  for select
  to public
  using (
    exists (
      select 1
      from public.catalog_products p
      where p.id = catalog_versions.product_id
        and p.owner_id = app.current_actor_id()
    )
    or exists (
      select 1
      from app.published_catalog_products p
      where p.id = catalog_versions.product_id
        and p.published_version = catalog_versions.version_number
    )
  );

drop policy if exists catalog_versions_owner_insert
  on public.catalog_versions;
create policy catalog_versions_owner_insert
  on public.catalog_versions
  for insert
  to public
  with check (
    published_by = app.current_actor_id()
    and exists (
      select 1
      from public.catalog_products p
      where p.id = catalog_versions.product_id
        and p.owner_id = app.current_actor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- media_attachments
-- ---------------------------------------------------------------------------
--
-- Media is owner-only in this slice. Buyer-facing media has no visibility
-- model yet (a published product may still carry a private voice note), so
-- granting buyers the published media rows would invent a disclosure rule
-- that the product has not decided. The owner policy still prevents every
-- cross-artisan read and write.
alter table public.media_attachments
  enable row level security;

drop policy if exists media_attachments_owner_select
  on public.media_attachments;
create policy media_attachments_owner_select
  on public.media_attachments
  for select
  to public
  using (owner_id = app.current_actor_id());

drop policy if exists media_attachments_owner_insert
  on public.media_attachments;
create policy media_attachments_owner_insert
  on public.media_attachments
  for insert
  to public
  with check (
    owner_id = app.current_actor_id()
    and state = 'REQUESTED'
    and exists (
      select 1
      from public.catalog_products p
      where p.id = media_attachments.product_id
        and p.owner_id = app.current_actor_id()
    )
  );

drop policy if exists media_attachments_owner_update
  on public.media_attachments;
create policy media_attachments_owner_update
  on public.media_attachments
  for update
  to public
  using (
    owner_id = app.current_actor_id()
    and exists (
      select 1
      from public.catalog_products p
      where p.id = media_attachments.product_id
        and p.owner_id = app.current_actor_id()
    )
  )
  with check (
    owner_id = app.current_actor_id()
    and exists (
      select 1
      from public.catalog_products p
      where p.id = media_attachments.product_id
        and p.owner_id = app.current_actor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- ai_jobs
-- ---------------------------------------------------------------------------
--
-- A job belongs to the owner of the product it works on. The policy checks
-- both the denormalised owner_id and the product's owner so a forged row
-- cannot point at another artisan's product. Jobs are born QUEUED; the
-- lifecycle after that is the application's state machine, not RLS.
alter table public.ai_jobs
  enable row level security;

drop policy if exists ai_jobs_owner_select
  on public.ai_jobs;
create policy ai_jobs_owner_select
  on public.ai_jobs
  for select
  to public
  using (
    owner_id = app.current_actor_id()
    and exists (
      select 1
      from public.catalog_products p
      where p.id = ai_jobs.product_id
        and p.owner_id = app.current_actor_id()
    )
  );

drop policy if exists ai_jobs_owner_insert
  on public.ai_jobs;
create policy ai_jobs_owner_insert
  on public.ai_jobs
  for insert
  to public
  with check (
    owner_id = app.current_actor_id()
    and state = 'QUEUED'
    and exists (
      select 1
      from public.catalog_products p
      where p.id = ai_jobs.product_id
        and p.owner_id = app.current_actor_id()
    )
  );

drop policy if exists ai_jobs_owner_update
  on public.ai_jobs;
create policy ai_jobs_owner_update
  on public.ai_jobs
  for update
  to public
  using (
    owner_id = app.current_actor_id()
    and exists (
      select 1
      from public.catalog_products p
      where p.id = ai_jobs.product_id
        and p.owner_id = app.current_actor_id()
    )
  )
  with check (
    owner_id = app.current_actor_id()
    and exists (
      select 1
      from public.catalog_products p
      where p.id = ai_jobs.product_id
        and p.owner_id = app.current_actor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- ai_proposals
-- ---------------------------------------------------------------------------
--
-- Proposals inherit ownership from their job, and are additionally pinned to
-- the job's product. New proposals are pending and undecided. A decision may
-- only record the current actor as decided_by. The existing immutability
-- trigger still limits which columns an update may touch at all.
alter table public.ai_proposals
  enable row level security;

drop policy if exists ai_proposals_owner_select
  on public.ai_proposals;
create policy ai_proposals_owner_select
  on public.ai_proposals
  for select
  to public
  using (
    exists (
      select 1
      from public.ai_jobs j
      where j.id = ai_proposals.job_id
        and j.owner_id = app.current_actor_id()
        and j.product_id = ai_proposals.product_id
    )
  );

drop policy if exists ai_proposals_owner_insert
  on public.ai_proposals;
create policy ai_proposals_owner_insert
  on public.ai_proposals
  for insert
  to public
  with check (
    decision = 'PENDING'
    and decided_by is null
    and exists (
      select 1
      from public.ai_jobs j
      where j.id = ai_proposals.job_id
        and j.owner_id = app.current_actor_id()
        and j.product_id = ai_proposals.product_id
    )
  );

drop policy if exists ai_proposals_owner_update
  on public.ai_proposals;
create policy ai_proposals_owner_update
  on public.ai_proposals
  for update
  to public
  using (
    exists (
      select 1
      from public.ai_jobs j
      where j.id = ai_proposals.job_id
        and j.owner_id = app.current_actor_id()
        and j.product_id = ai_proposals.product_id
    )
  )
  with check (
    exists (
      select 1
      from public.ai_jobs j
      where j.id = ai_proposals.job_id
        and j.owner_id = app.current_actor_id()
        and j.product_id = ai_proposals.product_id
    )
    and (
      decided_by is null
      or decided_by = app.current_actor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- inquiries
-- ---------------------------------------------------------------------------
--
-- An inquiry is the buyer's own record. Reads are buyer-only; the artisan
-- inbox does not exist yet, so no product-owner policy is invented here. A
-- buyer may create an inquiry only against the product's current published
-- version, which the published projection view answers without giving the
-- buyer access to the working product row. No update or delete policy
-- exists: the statuses an inbox will add arrive with that slice.
alter table public.inquiries
  enable row level security;

drop policy if exists inquiries_buyer_select
  on public.inquiries;
create policy inquiries_buyer_select
  on public.inquiries
  for select
  to public
  using (buyer_id = app.current_actor_id());

drop policy if exists inquiries_buyer_insert
  on public.inquiries;
create policy inquiries_buyer_insert
  on public.inquiries
  for insert
  to public
  with check (
    buyer_id = app.current_actor_id()
    and status = 'NEW'
    and exists (
      select 1
      from app.published_catalog_products p
      where p.id = inquiries.product_id
        and p.published_version = inquiries.catalog_version
    )
  );

commit;
