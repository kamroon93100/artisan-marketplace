-- Migration 009: Durable Refresh-Grant History (R-C)
--
-- This migration implements the R-C durable refresh-grant history chosen
-- in Q6. It creates a separate table to record every refresh grant issued,
-- consumed, and rotated, providing:
--
--   - Complete replay detection: every consumed grant remains discoverable
--     by its token_hash, enabling the server to identify a replayed
--     credential and revoke the session (Q5.5).
--   - Linear lineage: each grant points to exactly one successor via
--     rotated_to, so the chain R1 -> R2 -> ... -> R10 is traceable.
--   - Single active grant per session: a partial unique index enforces
--     at most one unconsumed grant at any time.
--   - Session-scoped cleanup: ON DELETE CASCADE on session_id removes
--     grant history when its session is deleted.
--   - No silent overwrite of artisan-confirmed values (consistent with
--     AGENTS.md Section 10: AI trust boundary).
--
-- Style matches 001-008: idempotent (IF NOT EXISTS), application-supplied
-- IDs/timestamps (no gen_random_uuid(), no now() defaults), timestamptz,
-- every index answers a stated read or uniqueness requirement.
--
-- Depends on: 008_identity_accounts_and_sessions.sql (identity_sessions)

-- ---------------------------------------------------------------------
-- identity_refresh_grants — durable refresh-grant history
-- ---------------------------------------------------------------------
-- One row per refresh grant issued. A grant is "active" while consumed_at
-- is NULL; rotation sets consumed_at and rotated_to, then inserts the
-- successor. Replay of any consumed grant (including R1 after R1->R2->...->R10)
-- is detectable by token_hash and revokes the session per R-C contract.

create table if not exists identity_refresh_grants (
  -- App-supplied, no database-generated UUID default (matches 001-008).
  id uuid primary key,

  -- The session this grant belongs to. CASCADE so deleting the session
  -- removes its grant history atomically. The session's ON DELETE RESTRICT
  -- on actor_id already forces explicit account deletion.
  session_id uuid not null
    references identity_sessions(session_id)
    on delete cascade,

  -- Digest of the opaque refresh credential (same 256-bit encoding as
  -- identity_sessions.refresh_token_hash). The plaintext is never stored.
  token_hash text not null,

  -- When this grant was minted.
  issued_at timestamptz not null,

  -- Absolute expiry: never slides with rotation. Must be >= issued_at.
  -- The application must enforce that this never exceeds the session's
  -- refresh_expires_at (established_at + 30 days).
  expires_at timestamptz not null,

  -- Set when this grant is consumed by a successful rotation or by a
  -- replay detection. NULL = active; non-NULL = consumed.
  consumed_at timestamptz,

  -- The successor grant's id. Set atomically with the successor's INSERT
  -- in the rotation transaction. DEFERRABLE allows UPDATE (this grant)
  -- before INSERT (successor). RESTRICT prevents deleting a grant that
  -- has a predecessor pointing to it.
  rotated_to uuid
    references identity_refresh_grants(id)
    on delete restrict
    deferrable initially deferred,

  -- Expiry sanity: expires_at must not precede issued_at.
  constraint identity_refresh_grants_expiry_check
    check (expires_at >= issued_at)
);

-- One grant per distinct refresh token hash. Lookup by presented token
-- is O(1) and guarantees uniqueness.
create unique index if not exists identity_refresh_grants_token_hash_idx
  on identity_refresh_grants(token_hash);

-- Session-scoped queries: audit, logout-all, and ownership checks.
create index if not exists identity_refresh_grants_session_id_idx
  on identity_refresh_grants(session_id);

-- Core concurrency guarantee: at most one unconsumed grant per session.
-- Checked IMMEDIATE, so the rotation transaction must UPDATE (consume
-- the old grant) before INSERT (create the new grant) in the same
-- transaction. The partial condition means consumed grants do not count
-- toward the limit.
create unique index if not exists identity_refresh_grants_one_active_per_session_idx
  on identity_refresh_grants(session_id)
  where consumed_at is null;

-- Lineage integrity: each grant has at most one successor. Prevents
-- branching chains (one grant -> two successors). Checked IMMEDIATE.
create unique index if not exists identity_refresh_grants_rotated_to_idx
  on identity_refresh_grants(rotated_to)
  where rotated_to is not null;

comment on table identity_refresh_grants is
  'Durable refresh-grant history for the M8 Q6 R-C design. One row per issued grant; rotation consumes the old grant (consumed_at, rotated_to) and inserts the successor. Replay of any consumed grant is detectable by token_hash and revokes the session.';

comment on column identity_refresh_grants.id is
  'App-supplied grant identity. Not a credential: safe for correlation and diagnostic output.';

comment on column identity_refresh_grants.session_id is
  'The session this grant belongs to. ON DELETE CASCADE: session deletion removes its grant history.';

comment on column identity_refresh_grants.token_hash is
  'Digest of the opaque refresh credential (256-bit unpadded base64url). Never plaintext. Verification is digest equality against the unique index.';

comment on column identity_refresh_grants.issued_at is
  'When this grant was minted.';

comment on column identity_refresh_grants.expires_at is
  'Absolute expiry, fixed at issuance. Never slides with rotation; the application must ensure it does not exceed the session refresh_expires_at.';

comment on column identity_refresh_grants.consumed_at is
  'When this grant was consumed (rotation or replay detection). NULL = active; non-NULL = consumed. Drives the partial unique index for single active grant per session.';

comment on column identity_refresh_grants.rotated_to is
  'The successor grant id. Set by rotation: UPDATE this grant, then INSERT the successor with this id. DEFERRABLE INITIALLY DEFERRED allows UPDATE before INSERT in the same transaction. RESTRICT prevents deleting a grant that a predecessor points to.';