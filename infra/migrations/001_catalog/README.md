# Catalog persistence notes

## Canonical table

`catalog_products` is the server-side canonical product record.

## Ownership

`owner_id` identifies the actor/resource owner. Final authorization and RLS policies are not implemented by this migration yet.

## State

The database constraint mirrors the shared Catalog state contract.

## Version

`version` is reserved for optimistic concurrency / sync conflict detection.

## Deliberately not included yet

- RLS policies
- foreign keys to Identity
- catalog versions/history table
- media relationships
- AI proposal tables
- review tables
- outbox
- embeddings
