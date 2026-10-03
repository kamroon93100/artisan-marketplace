create table if not exists media_attachments (
  id uuid primary key,
  product_id uuid not null
    references catalog_products(id)
    on delete restrict,

  owner_id uuid not null,

  kind text not null,
  object_key text,
  content_type text not null,
  size_bytes bigint not null,

  state text not null,

  idempotency_key text not null,

  created_at timestamptz not null,
  updated_at timestamptz not null,
  version bigint not null default 1,

  constraint media_attachments_kind_check
    check (kind in ('IMAGE', 'AUDIO')),

  constraint media_attachments_state_check
    check (
      state in (
        'REQUESTED',
        'UPLOAD_AUTHORIZED',
        'UPLOADING',
        'UPLOADED',
        'VERIFIED',
        'FAILED',
        'ACTION_REQUIRED',
        'DELETED'
      )
    ),

  constraint media_attachments_size_check
    check (size_bytes > 0),

  constraint media_attachments_idempotency_check
    check (length(trim(idempotency_key)) > 0)
);

create unique index if not exists media_attachments_product_idempotency_idx
  on media_attachments(product_id, idempotency_key);

create unique index if not exists media_attachments_object_key_idx
  on media_attachments(object_key)
  where object_key is not null;

create index if not exists media_attachments_product_idx
  on media_attachments(product_id);

create index if not exists media_attachments_owner_idx
  on media_attachments(owner_id);

create index if not exists media_attachments_state_idx
  on media_attachments(state);

create index if not exists media_attachments_updated_at_idx
  on media_attachments(updated_at);

comment on table media_attachments is
  'Durable media metadata and lifecycle state for catalog product attachments.';

comment on column media_attachments.idempotency_key is
  'Client/server retry key scoped to the owning catalog product.';

comment on column media_attachments.object_key is
  'R2 object key; null until upload authorization/storage allocation exists.';
