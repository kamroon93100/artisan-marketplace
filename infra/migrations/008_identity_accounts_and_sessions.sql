-- First-party identity accounts and server-side sessions.
--
-- This is migration 008. It exists because two recorded M8 decisions
-- require durable schema state that the repository does not yet have:
--
--   - Gate A chose mechanism A2 — server-issued opaque sessions with
--     provider "none / first-party" (docs/agent/m8-buyer-session-task.md,
--     Section 5). With no external provider, the server itself must hold
--     session state: establishment, expiry, rotation, and revocation are
--     all columns here rather than somebody else's database.
--   - Q2A chose CHOICE 1 — first-party registration + login (identifier +
--     password/passphrase validated against a server-side salted
--     strong-KDF hash; Q5.1 = Argon2id, complete PHC-format string), so a
--     durable account record carrying that hash is required (Section 6A).
--
-- Nothing in this file is improvised. The shape below follows recorded
-- decisions: Q3.2 (username/handle is the primary identifier), Q3.3 and
-- Q5.4 (BUYER assigned server-side at registration), Q3.4/Q5.4 (duplicate
-- normalized username = 409 CONFLICT), Q5.1 (Argon2id PHC strings only),
-- Q5.2 (canonical handle format `^[a-z0-9][a-z0-9_.-]{2,29}$`, 3–30
-- characters, lowercase canonical form, dedicated uniquely constrained
-- `username_normalized` column, no full-Unicode handle semantics),
-- Q5.3/Q5.4 (password policy is application-level), Q5.5 (15-minute
-- access, 30-day absolute single-use rotating refresh, replay → refresh
-- session revocation, logout without an access-token denylist), and Q5.6
-- (no durable throttle table in this migration).
--
-- Credential storage rule, applied throughout: this database stores
-- hashes, never plaintexts. No plaintext password, no plaintext access
-- token, and no plaintext refresh token can be read out of these tables —
-- consistent with the Q4 security design for migration 008 and with the
-- never-log/never-return guarantees in AGENTS.md Section 11 and
-- docs/architecture/security-privacy-observability-contract.md. What
-- "hash" means for the token columns is chosen by the Identity module at
-- implementation time, the same way the KDF dependency is (Q5.1); this
-- migration fixes only that the stored value is a one-way digest of the
-- credential and never the credential itself.
--
-- Style, matching 001–007: every statement is idempotent
-- (`create table if not exists`, `create index if not exists`, and
-- `comment on`), so applying this file twice is safe; IDs and
-- timestamps are application-supplied (no `gen_random_uuid()`, no
-- `now()` defaults); all times are `timestamptz`; there are no speculative
-- indexes — each one below answers a stated read or a stated uniqueness
-- requirement. This file depends on no earlier migration beyond normal
-- ordering: it creates both of its own tables, and it neither reads nor
-- alters any table from 001–007.
--
-- Deliberately absent from this migration, each for a recorded reason:
--
--   - No durable throttle table and no lockout state. Q5.6 forbids a
--     durable throttle table in migration 008; M8 throttles pre-auth
--     login attempts with the existing in-memory limiter keyed by
--     `(CF-Connecting-IP, username_normalized)`, and Q3.5/Q5.6 forbid
--     account lockout entirely. Throttle thresholds/windows are an
--     implementation-time security review item, not schema.
--   - No audit table. The security contract asks that important
--     transitions be auditable, but audit storage is a separately
--     approved decision; creating an empty audit table here would claim a
--     guarantee the system does not yet keep. Nothing in these tables may
--     ever be written with a credential value in an audit-shaped column.
--   - No RLS. This file contains no `enable row level security`
--     statement. RLS remains
--     the recorded, deferred ADR-007 gap, and M8 invariant 9 forbids
--     adding it — or claiming it — silently.
--   - No `inquiries.buyer_id` → `identity_accounts(id)` foreign key.
--     The task contract records that reference as its own separate
--     migration-approval decision, still open. Wiring it here would
--     change inquiry ownership semantics inside a migration scoped to
--     identity only.
--   - No reserved-name seed rows. Q5.2 requires a documented set of
--     system/reserved names, but reserved names are application-level
--     validation at registration: seeding them as migration-owned rows
--     would make a product policy editable only by schema change.
--   - No application code, endpoint, dependency, config, or secret is
--     touched by this file; it is schema only.

-- ---------------------------------------------------------------------
-- identity_accounts — first-party account records
-- ---------------------------------------------------------------------
--
-- One row per registered account. This is the actor's durable identity:
-- ADR-006 keeps session mechanics behind the Identity boundary, and the
-- account record — not any client-supplied value — is what an actor id
-- resolves to.
--
-- Uniqueness lives on `username_normalized`, not `username` (Q5.2):
-- input is normalized before comparison, so two differently-cased
-- spellings of one handle converge on one row, and the duplicate case
-- returns 409 CONFLICT (Q3.4/Q5.4). The unique index — rather than a
-- read-then-write check in the service — is what actually stops two
-- concurrent registrations from winning the same handle.
create table if not exists identity_accounts (
  -- App-supplied, as in 001–007: no database-generated UUID default.
  id uuid primary key,

  -- The handle as the application records it. Bounded to the same 3–30
  -- range the canonical format allows; format and charset validation
  -- live on `username_normalized`, where the canonical form is
  -- guaranteed, so this column cannot reject a legitimate normalized
  -- value while still refusing absurd input.
  username text not null,

  -- The canonical, lowercase, comparison-safe form (Q5.2). This column
  -- is the identity used for uniqueness and for pre-authentication
  -- throttling, and the format check below must stay identical to the
  -- application's validator — the same relationship 007 records
  -- between `publishedSearchText` and its SQL twin: if the two drift
  -- apart, local tests and production would answer different questions
  -- about the same handle.
  username_normalized text not null,

  -- The complete PHC-encoded Argon2id string (Q5.1). The constraint
  -- below refuses anything that does not carry the `$argon2id$`
  -- algorithm tag, so a plaintext password — or a hash from a
  -- different, weaker algorithm — cannot be stored here by any writer,
  -- including a future one that skips the service. The baseline
  -- parameters (19456 KiB / 2 iterations / parallelism 1 / 16-byte
  -- salt / 32-byte tag) are the recorded design baseline; validating
  -- them against Cloudflare Workers resources and selecting the KDF
  -- dependency are implementation-time items, not schema.
  password_hash text not null,

  -- Server-stored roles (Gate A Q7, Choice A). The default expresses
  -- Q3.3: registrations receive BUYER, assigned server-side. Only
  -- BUYER and ARTISAN are storable in M8 — REVIEWER and SYSTEM exist
  -- in the contract's vocabulary but have no M8 decision behind them,
  -- so adding a role must be a deliberate schema change rather than
  -- something a stray write can introduce. There is no client
  -- role-assignment endpoint (Q3.3), so nothing client-chosen is ever
  -- written into this column.
  roles text[] not null default array['BUYER'],

  created_at timestamptz not null,
  updated_at timestamptz not null,

  constraint identity_accounts_username_length_check
    check (length(username) between 3 and 30),

  -- Q5.2's canonical format, enforced as defence in depth alongside
  -- the application's registration validation: first character
  -- lowercase alphanumeric, then 2–29 of [a-z0-9_.-], total 3–30
  -- characters. This also bounds `username_normalized` length in the
  -- same expression the format already implies, and rules out
  -- full-Unicode handles by construction (no M8 decision exists for
  -- them).
  constraint identity_accounts_username_normalized_format_check
    check (username_normalized ~ '^[a-z0-9][a-z0-9_.-]{2,29}$'),

  -- Explicit length bounds, so the 3–30 requirement is checkable as a
  -- check and not only as a property of the regular expression.
  constraint identity_accounts_username_normalized_length_check
    check (length(username_normalized) between 3 and 30),

  -- Argon2id PHC tag only (Q5.1). `left()` rather than `like`, so the
  -- test is an exact prefix comparison with no wildcard semantics.
  constraint identity_accounts_password_hash_check
    check (left(password_hash, 10) = '$argon2id$'),

  -- At least one role, no NULL elements, and only BUYER/ARTISAN.
  -- `array_position(roles, null) is null` is what makes a NULL
  -- element unambiguously a violation rather than an expression that
  -- evaluates to NULL and passes a CHECK.
  constraint identity_accounts_roles_check
    check (
      coalesce(array_length(roles, 1), 0) >= 1
      and array_position(roles, null) is null
      and roles <@ array['BUYER', 'ARTISAN']::text[]
    )
);

create unique index if not exists identity_accounts_username_normalized_idx
  on identity_accounts(username_normalized);

comment on table identity_accounts is
  'First-party account records: normalized handle, Argon2id password hash, and server-stored roles. The durable identity an actor id resolves to; never holds a plaintext credential.';

comment on column identity_accounts.username_normalized is
  'Canonical lowercase handle per M8 Q5.2 (`^[a-z0-9][a-z0-9_.-]{2,29}$`, 3–30 chars). The uniqueness and throttling identity; duplicate normalized username returns 409 CONFLICT. Reserved-name screening is application-level validation, deliberately not seeded as rows here.';

comment on column identity_accounts.password_hash is
  'Complete PHC-format Argon2id string (M8 Q5.1). Never a plaintext password, never logged, never returned. The check constraint refuses any stored value without the $argon2id$ algorithm tag.';

comment on column identity_accounts.roles is
  'Server-assigned roles (Gate A Q7 Choice A); default BUYER per Q3.3. Only BUYER/ARTISAN are storable in M8 and client-supplied roles are never written here.';

-- ---------------------------------------------------------------------
-- identity_sessions — server-side session state
-- ---------------------------------------------------------------------
--
-- One row per established session, updated in place as credentials
-- rotate: `established_at` anchors the session and the absolute refresh
-- window, while the token columns hold whichever access/refresh
-- credentials are currently live. A session is therefore not a token —
-- `session_id` identifies the row and is safe to correlate, whereas the
-- token columns are credential material and are not.
--
-- `actor_id` uses ON DELETE RESTRICT rather than CASCADE. An account
-- row anchors every session it established: a cascade would silently
-- destroy live session state as a side effect of an unrelated delete,
-- while deleting the account and leaving sessions behind would hand out
-- credentials that authenticate to nothing. RESTRICT forces account
-- deletion to be an explicit, sequenced lifecycle decision — and no
-- account-deletion flow exists in M8 (account recovery is deferred to
-- M12). It is also the posture 001, 005, 006, and 007 already take on
-- their foreign keys.
create table if not exists identity_sessions (
  -- App-supplied session identity. Not a credential: this value may
  -- appear in correlation/debug output where the token columns never
  -- may.
  session_id uuid primary key,

  -- The account this session authenticates to. ON DELETE RESTRICT, per
  -- the reasoning above.
  actor_id uuid not null
    references identity_accounts(id)
    on delete restrict,

  -- Digest of the current opaque access credential (Gate A Q2:
  -- unpadded base64url of 32 random bytes, 256-bit). Lookup is by
  -- digest equality against the unique index below; the plaintext is
  -- never stored, so a leaked row yields nothing replayable.
  access_token_hash text not null,

  -- When the current access credential stops working: mint + 15 minutes
  -- (Gate A Q3). Rewritten whenever refresh mints a new access
  -- credential.
  access_expires_at timestamptz not null,

  -- Digest of the current refresh credential (same encoding and
  -- entropy as the access credential, Gate A Q2/Q3).
  refresh_token_hash text not null,

  -- Digest of the refresh credential this one replaced. Rotation moves
  -- the old digest here and writes the new one into
  -- `refresh_token_hash`, which is what makes single-use rotation
  -- detectable rather than merely documented (Q5.5): a replayed
  -- credential is not found in `refresh_token_hash` — it was replaced —
  -- but is found here, which proves it was already used, and the
  -- recorded response is revocation of the refresh session rather than
  -- a report-only error. Null until the session rotates at least once.
  --
  -- The unique index over this column deliberately relies on
  -- PostgreSQL's default treatment of NULLs in a btree unique index:
  -- NULL values are distinct, so any number of never-rotated sessions
  -- may store NULL here without conflicting. `nulls not distinct` must
  -- never be applied to it — that would make the second live session in
  -- the database unwritable.
  previous_refresh_token_hash text,

  -- Absolute refresh deadline: `established_at` + 30 days (Gate A Q3,
  -- Q5.5). Rotation must never move this value. It is absolute rather
  -- than sliding precisely so that refresh cannot extend the 30-day
  -- maximum: routine use must not be able to keep a refresh credential
  -- alive indefinitely, and the window a stolen credential can cover is
  -- bounded from the moment the session was established.
  refresh_expires_at timestamptz not null,

  -- Set when the refresh side of this session is revoked: logout, or
  -- replay of an already-rotated refresh credential (Q5.5). The access
  -- credential is deliberately NOT denylisted — Gate A Q5 keeps it
  -- usable until its natural 15-minute expiry — so this column kills
  -- renewal, not the in-flight access token.
  refresh_revoked_at timestamptz,

  -- Set when the session row as a whole is revoked, as distinct from
  -- only its refresh side: a later global-logout or account-level
  -- revocation needs a place to land that does not pretend the session
  -- merely expired. Either revocation column being set makes the
  -- session non-live, which is exactly what the partial sweep index
  -- below keys on. Null while the session has not been revoked —
  -- unlike the `not null` credential and deadline columns above, this
  -- is a "has this happened yet" marker, so it carries no default and
  -- no NOT NULL.
  revoked_at timestamptz,

  -- When the session was established (registration or login). This
  -- anchors the absolute 30-day refresh window; see the
  -- `refresh_expires_at` comment.
  established_at timestamptz not null
);

-- Uniqueness, as named unique indexes rather than inline constraints,
-- matching how 001–007 express "the index is the guarantee": a
-- read-then-write in the service would let two concurrent requests both
-- pass an existence check, and the index is what actually stops the
-- second insert.

-- One session per access credential: presented tokens are verified by
-- digest equality against this index, and an unknown digest simply
-- matches no row (which is what "missing/unknown/invalid credential →
-- 401 with no details.reason" resolves against).
create unique index if not exists identity_sessions_access_token_hash_idx
  on identity_sessions(access_token_hash);

-- One session per current refresh credential: rotation writes the new
-- digest here, so two rows can never share a live refresh credential.
create unique index if not exists identity_sessions_refresh_token_hash_idx
  on identity_sessions(refresh_token_hash);

-- Replay detection (Q5.5): an already-rotated refresh digest must
-- resolve to the session that used it, so the replay can revoke that
-- refresh session instead of returning a report-only error.
--
-- NULLs are intentionally permitted to repeat. PostgreSQL btree unique
-- indexes treat NULLs as distinct, so every never-rotated session
-- stores NULL here without colliding — and that default must be
-- preserved (no `nulls not distinct`), or only one live unrotated
-- session could exist at a time.
create unique index if not exists identity_sessions_previous_refresh_token_hash_idx
  on identity_sessions(previous_refresh_token_hash);

-- "Sessions this account has" — logout-all scoping, per-account
-- session listing, and the ownership check every session lookup
-- performs after the token digest has already identified the row.
create index if not exists identity_sessions_actor_id_idx
  on identity_sessions(actor_id);

-- Retention sweeping. Sessions that are revoked (either way) or whose
-- refresh window has closed are dead rows that still hold credential
-- digests; the partial index keeps the sweep off live sessions, which
-- are the minority a sweep must skip rather than the data it reads.
create index if not exists identity_sessions_refresh_sweep_idx
  on identity_sessions(refresh_expires_at)
  where revoked_at is null
    and refresh_revoked_at is null;

comment on table identity_sessions is
  'Server-side session state for the Gate A A2 mechanism: one row per established session, updated in place as credentials rotate. Holds token digests only — never a plaintext access or refresh token.';

comment on column identity_sessions.session_id is
  'App-supplied session identity. Not a credential: unlike the token columns it may appear in correlation and diagnostic output.';

comment on column identity_sessions.actor_id is
  'The account this session authenticates to. ON DELETE RESTRICT: account deletion must be an explicit sequenced decision, never a cascade that silently destroys live sessions or an orphan that leaves credentials authenticating to nothing.';

comment on column identity_sessions.access_token_hash is
  'Digest of the current 256-bit opaque access credential. The plaintext is never stored; verification is digest equality against the unique index. No access-token denylist exists — revocation columns below stop renewal, and a live access credential ages out on its own 15-minute expiry.';

comment on column identity_sessions.previous_refresh_token_hash is
  'Digest of the refresh credential this one replaced. Enables Q5.5 replay detection: a digest absent from refresh_token_hash but present here was already rotated away, so the refresh session is revoked. Null until first rotation; the unique index permits any number of NULLs.';

comment on column identity_sessions.refresh_expires_at is
  'Absolute refresh deadline fixed at establishment (established_at + 30 days). Rotation never moves it: refresh cannot extend the 30-day maximum (Gate A Q3, Q5.5).';

comment on column identity_sessions.refresh_revoked_at is
  'Set when the refresh side is revoked — logout or refresh replay (Q5.5). Does not denylist the current access credential, which may live until its natural 15-minute expiry.';

comment on column identity_sessions.revoked_at is
  'Set when the session row as a whole is revoked, distinct from refresh-only revocation. Null while unrevoked.';

comment on column identity_sessions.established_at is
  'When the session was established (registration or login); anchors the absolute 30-day refresh window.';
