create table if not exists catalog_products (
  id uuid primary key,
  owner_id uuid not null,
  title text,
  description text,
  category text,
  materials text[] not null default '{}',
  state text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version bigint not null default 1,

  constraint catalog_products_state_check
    check (
      state in (
        'LOCAL_DRAFT',
        'PENDING_SYNC',
        'SYNCED',
        'REVIEW_REQUIRED',
        'APPROVED',
        'PUBLISHED',
        'ARCHIVED',
        'CONFLICT',
        'ACTION_REQUIRED'
      )
    )
);

create index if not exists catalog_products_owner_id_idx
  on catalog_products(owner_id);

create index if not exists catalog_products_state_idx
  on catalog_products(state);

create index if not exists catalog_products_updated_at_idx
  on catalog_products(updated_at);
