# Media Attachment Migration

Adds the durable server-side metadata boundary for catalog media.

Ownership:
- `product_id` establishes the catalog relationship.
- `owner_id` records the owning artisan identity.
- `kind`, `content_type`, and `size_bytes` describe the media metadata.
- `state` follows the media lifecycle state machine.
- `idempotency_key` makes retries deduplicable per product.
- `object_key` remains nullable until object storage is introduced.

Not included yet:
- authentication/RLS
- R2 upload authorization
- upload completion verification
- media processing
- queue workers
- deletion/purge jobs
