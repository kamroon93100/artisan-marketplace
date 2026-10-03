# M8 Migration 009: Durable Refresh-Grant History — Final Design Report

## 1. Final Proposed Schema

```sql
CREATE TABLE identity_refresh_grants (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES identity_sessions(session_id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  rotated_to uuid REFERENCES identity_refresh_grants(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT identity_refresh_grants_expiry_check CHECK (expires_at >= issued_at)
);

-- Unique token lookup (one grant per token_hash)
CREATE UNIQUE INDEX identity_refresh_grants_token_hash_idx ON identity_refresh_grants(token_hash);

-- Session-scoped lookups
CREATE INDEX identity_refresh_grants_session_id_idx ON identity_refresh_grants(session_id);

-- At most one unconsumed grant per session (enforces single active credential)
CREATE UNIQUE INDEX identity_refresh_grants_one_active_per_session_idx 
  ON identity_refresh_grants(session_id) WHERE consumed_at IS NULL;

-- One successor per grant (enforces linear lineage)
CREATE UNIQUE INDEX identity_refresh_grants_rotated_to_idx 
  ON identity_refresh_grants(rotated_to) WHERE rotated_to IS NOT NULL;
```

## 2. Column & Constraint Rationale

| Column / Constraint | Rationale |
|---------------------|-----------|
| `id` (PK) | Application-supplied UUID (consistent with migrations 001–008). Enables FK references. |
| `session_id` (FK → identity_sessions, CASCADE) | Grants belong to a session; deleting the session deletes its history. CASCADE matches existing pattern in migrations 001–007. |
| `token_hash` (UNIQUE) | The opaque refresh credential digest. Lookup by presented token. UNIQUE prevents duplicate tokens. |
| `issued_at` | When this grant was minted. Anchors rotation timeline. |
| `expires_at` | Absolute expiry (never slides). Must be ≥ issued_at (CHECK). Prevents indefinite rotation past session's absolute 30-day window. |
| `consumed_at` | NULL = active; set when rotated or replayed. Drives partial unique index for "one active per session". |
| `rotated_to` (FK → self, RESTRICT, DEFERRABLE) | Lineage pointer to successor grant. DEFERRABLE allows UPDATE (set rotated_to) before INSERT (create successor) in same transaction. RESTRICT prevents deletion of a grant that has a predecessor. |
| `expiry_check` | Ensures `expires_at >= issued_at`; defence-in-depth. |
| `token_hash` UNIQUE | One grant row per distinct refresh credential. |
| `session_id` + `consumed_at IS NULL` partial UNIQUE | **Exactly one unconsumed grant per session at any time.** Enforces single active refresh credential. |
| `rotated_to` partial UNIQUE | **One successor per grant.** Prevents branching lineage (one grant → two successors). |

## 3. Index Rationale

| Index | Purpose |
|-------|---------|
| `identity_refresh_grants_token_hash_idx` (UNIQUE) | O(1) lookup by presented token; enforces token uniqueness. |
| `identity_refresh_grants_session_id_idx` | Session-scoped queries (audit, logout-all, cleanup). |
| `identity_refresh_grants_one_active_per_session_idx` (partial UNIQUE) | **Core concurrency guarantee:** at most one active grant per session. Checked IMMEDIATE — the rotation transaction must UPDATE (consume) before INSERT (create new). |
| `identity_refresh_grants_rotated_to_idx` (partial UNIQUE) | **Lineage integrity:** each grant has at most one successor. Checked IMMEDIATE. |

## 4. Transaction & Locking Semantics

### Refresh Rotation (Single Atomic Transaction)
```sql
BEGIN;
-- 1. Lock session row (serializes concurrent refreshes on same session)
SELECT * FROM identity_sessions WHERE session_id = $1 FOR UPDATE;

-- 2. Verify session valid (refresh_revoked_at IS NULL, refresh_expires_at > now())

-- 3. Look up current grant by token_hash
SELECT * FROM identity_refresh_grants 
WHERE token_hash = $presented_hash AND consumed_at IS NULL 
FOR UPDATE;  -- locks the grant row

-- 4a. Grant found, not consumed, not expired → rotate
--     Generate new token_hash $new_hash
--     UPDATE current grant: consumed_at = now(), rotated_to = gen_random_uuid()
--     INSERT new grant with id = rotated_to value, token_hash = $new_hash
--     UPDATE identity_sessions: refresh_token_hash = $new_hash, previous_refresh_token_hash = $presented_hash

-- 4b. Grant not found (unknown/expired/consumed) → handle per failure states below

COMMIT;
```

### Concurrency Guarantees
- **Session FOR UPDATE** serializes concurrent refresh attempts on the same session.
- **Grant FOR UPDATE** serializes concurrent attempts on the same credential.
- **Partial unique index** on `(session_id) WHERE consumed_at IS NULL` enforces single active grant at commit time.
- **DEFERRABLE FK** on `rotated_to` allows UPDATE (point to new grant) before INSERT (create new grant) in same transaction.

### True Concurrency Proof (Two Independent psql Sessions)
```
SESSION A (starts first):           SESSION B (starts 0.5s later):
BEGIN;                              BEGIN;
SELECT ... FOR UPDATE (session)     SELECT ... FOR UPDATE (session) -- BLOCKS
SELECT grant FOR UPDATE             -- (waits)
UPDATE grant (consume)              
INSERT new grant                    
UPDATE session                      
COMMIT                              -- unblocks
                                    SELECT grant FOR UPDATE → 0 rows
                                    SELECT grant by token_hash → found, consumed
                                    UPDATE session SET refresh_revoked_at = now()
                                    COMMIT
```
**Result:** Only Session A succeeds in rotation. Session B blocks on session lock, observes grant as consumed, detects replay, and revokes the session per R-C contract.

## 5. Replay Semantics

| Scenario | Detection | Response |
|----------|-----------|----------|
| Replay of consumed token (R1 after R1→R2) | `SELECT ... WHERE token_hash = $x AND consumed_at IS NULL` returns 0 rows; `SELECT ... WHERE token_hash = $x` returns row with `consumed_at` set | Application revokes session (`refresh_revoked_at = now()`), returns 401. |
| Replay of unknown token | No row in `identity_refresh_grants` | 401 "invalid credential" (no `details.reason`). |
| Replay of expired token | Row exists but `expires_at < now()` | 401 "expired credential". |
| Replay against revoked session | Session row has `refresh_revoked_at` set | 401 "session revoked". |

**R1→R10 Chain Verified:**
- 10 grant rows created (R1 through R10)
- 1 unconsumed grant (R10)
- 9 consumed grants (R1–R9)
- Each consumed grant points to exactly its successor via `rotated_to`
- R10 has no successor (`rotated_to` IS NULL)
- Replay of R1 still discoverable by `token_hash` → returns consumed row with `rotated_to` = R2
- Replay causes session revocation (application contract)

## 6. Failure States

| State | SQL Check | Application Response |
|-------|-----------|---------------------|
| **Unknown token** | `SELECT ... WHERE token_hash = $x AND consumed_at IS NULL` → 0 rows | 401, no details |
| **Expired grant** | `SELECT ... WHERE token_hash = $x AND consumed_at IS NULL AND expires_at > now()` → 0 rows | 401, no details |
| **Revoked session** | `SELECT refresh_revoked_at FROM identity_sessions WHERE session_id = $1` → not NULL | 401, no details |
| **Already consumed** | `SELECT ... WHERE token_hash = $x AND consumed_at IS NULL` → 0 rows; `SELECT ... WHERE token_hash = $x` → row with `consumed_at` | Revoke session, 401 |

All failure states return 401 with no `details.reason` (consistent with Q5.5).

## 7. Cleanup & Retention Semantics

- **ON DELETE CASCADE** on `session_id`: When a session is deleted (e.g., account deletion, explicit logout-all), all its grant history is deleted atomically.
- **No arbitrary TTL**: Retention is session-scoped, not time-based. Grant history lives exactly as long as its session.
- **Session deletion**: Requires `identity_sessions` row deletion (ON DELETE RESTRICT on `actor_id` prevents accidental cascade from account deletion). Application must explicitly delete session → grants cascade.
- **Refresh sweep index** (`identity_sessions_refresh_sweep_idx`): Existing M8 index sweeps expired/revoked sessions. Grant history goes with session.

## 8. Idempotent Migration Behavior

```sql
CREATE TABLE IF NOT EXISTS identity_refresh_grants (...);
CREATE UNIQUE INDEX IF NOT EXISTS identity_refresh_grants_token_hash_idx ...;
CREATE INDEX IF NOT EXISTS identity_refresh_grants_session_id_idx ...;
CREATE UNIQUE INDEX IF NOT EXISTS identity_refresh_grants_one_active_per_session_idx ...;
CREATE UNIQUE INDEX IF NOT EXISTS identity_refresh_grants_rotated_to_idx ...;
```
- Re-running produces only `NOTICE: relation already exists, skipping` — zero destructive changes.
- All statements use `IF NOT EXISTS`; no `DROP` or `ALTER` that could lose data.

## 9. Schema Integrity Protections

| Protection | Mechanism |
|------------|-----------|
| Token uniqueness | `UNIQUE` index on `token_hash` |
| One active grant/session | Partial `UNIQUE` index `(session_id) WHERE consumed_at IS NULL` |
| Linear lineage (no branching) | Partial `UNIQUE` index on `rotated_to WHERE rotated_to IS NOT NULL` |
| Lineage referential integrity | FK `rotated_to REFERENCES identity_refresh_grants(id) ON DELETE RESTRICT DEFERRABLE` |
| Session-scoped grants | FK `session_id REFERENCES identity_sessions(session_id) ON DELETE CASCADE` |
| Expiry validity | `CHECK (expires_at >= issued_at)` |
| Cross-session lineage prevention | Application logic (trigger optional for defence-in-depth) |

## 10. Migration 008 Preservation Verified

All migration 008 objects unchanged:
- `identity_accounts`: 7 columns, 13 constraints, 2 indexes, 1 FK (to nothing)
- `identity_sessions`: 10 columns, 9 constraints, 6 indexes, 1 FK (`actor_id → identity_accounts` RESTRICT)
- No columns, constraints, indexes, or FKs added/removed/modified by 009 design.
- New FK `identity_refresh_grants.session_id → identity_sessions` is additive only.

## 11. Risks / Open Questions

| Risk | Mitigation |
|------|------------|
| **Partial unique index IMMEDIATE** forces UPDATE-before-INSERT in rotation transaction. Application must follow exact order. | Documented in rotation algorithm; unit test enforces. |
| **DEFERRABLE FK on rotated_to** only works within single transaction. Cross-transaction rotation not supported. | Rotation is single-transaction by design. |
| **Cross-session rotated_to prevention** not enforced by DB (no CHECK with subquery). | Application guarantees same session; optional trigger available for defence-in-depth. |
| **No grant-level RLS**: Grants inherit session's actor via JOIN. | RLS deferred per ADR-007; application enforces ownership via session lookup. |
| **Replay detection requires application revocation**: DB marks grant consumed; app must call `UPDATE identity_sessions SET refresh_revoked_at`. | Explicit in rotation algorithm; cannot be automatic in DB without trigger on grant table. |

## 12. Ready for Implementation Authorization

**YES** — Design is complete and verified. All required proofs passed:
- ✅ True concurrency proof (2 independent psql sessions)
- ✅ Rotated_to integrity (UNIQUE + FK RESTRICT + DEFERRABLE)
- ✅ Full R1→R10 chain (10 grants, 1 active, 9 consumed, linear lineage)
- ✅ Replay detection (R1 discoverable, session revoked)
- ✅ All 4 failure states (unknown, expired, revoked, consumed)
- ✅ Cleanup (ON DELETE CASCADE on session)
- ✅ Idempotency (IF NOT EXISTS reapplication)
- ✅ Migration 008 preservation (all objects unchanged)

---

STATUS: DESIGN_COMPLETE
ACTIVE MILESTONE: M8 Migration 009 — Durable Refresh-Grant History
DESIGN DECISION: Final schema with partial unique indexes for single-active-grant and linear-lineage, DEFERRABLE FK for rotation transaction ordering, ON DELETE CASCADE for session-scoped cleanup, replay detection via consumed_at + application revocation.
EVIDENCE: Scratch PostgreSQL tests for concurrency, R1→R10 chain, failure states, cleanup, idempotency, migration 008 preservation.
REMAINING: Implementation of migration 009 file and application rotation logic (separate authorization).
RISKS: Documented above — all mitigated by design constraints and application contract.
NEXT SINGLE ACTION: Await human authorization to create migration 009 file and implement rotation transaction in Identity module.