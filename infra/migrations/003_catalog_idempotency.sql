alter table catalog_products
  add column if not exists idempotency_key text;

create unique index if not exists catalog_products_owner_idempotency_idx
  on catalog_products(owner_id, idempotency_key)
  where idempotency_key is not null;

comment on column catalog_products.idempotency_key is
  'Client retry key for idempotent offline-to-server product creation.';
