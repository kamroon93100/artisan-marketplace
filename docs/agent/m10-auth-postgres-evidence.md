# Implementation Evidence

Milestone: **M10-A — real PostgreSQL runtime proof of `IdentityService` +
`PostgresSessionStore`.**

## Task

Prove, against a real PostgreSQL instance rather than an in-memory or test
double, that the approved authentication lifecycle works end to end through
`PostgresSessionStore`, and that the resulting auth state is durable across a
database restart.

## Goal

Replace the assumption that `PostgresSessionStore` satisfies the `SessionStore`
port with executed proof, and repair only the genuine integration defects that
proof exposes.

## What the proof covers

`tests/m10-auth-postgres/auth-postgres-runtime.test.ts` runs as two processes
with a real `docker restart` between them, so the read phase can only answer
from canonical database state.

Write phase — the 15 required auth scenarios:

1. register
2. login
3. wrong password (uniform 401, no details)
4. unknown username (uniform 401, no details)
5. refresh (first rotation)
6. old refresh credential is consumed, with `rotated_to` linkage
7. session revocation after replay detection
8. logout (revokes refresh side only)
9. repeated logout (idempotent)
10. access credential natural expiry
11. duplicate username (409 CONFLICT)
12. reserved username (400 VALIDATION_FAILED)
13. credentials never appear in errors or failure representations
14. expired refresh credential
15. revoked refresh credential

Read-after-restart phase — persistence of account and password hash, session,
initial **and** rotated refresh grants, consumed-grant history, replay
detection, and revocation; plus duplicate-username enforcement and
idempotent repeat logout after restart.

## Defects found by real-database execution

| # | Defect | Where | Nature |
|---|--------|-------|---------|
| 1 | `putAsync()` persisted credentials verbatim while every lookup and rotation hashed them, so `rotateRefreshGrant()` found no session and refresh returned `SESSION_UNKNOWN`. | `PostgresSessionStore` | Real product defect |
| 2 | `revokeRefreshSession` was declared on the `SessionStore` port and implemented by `TestSessionStore`, but absent from `PostgresSessionStore`. `logoutAsync()` therefore fell back to re-upserting a record whose credentials were already digests, hashing them a second time and permanently orphaning the session's token lookups (repeat logout returned `SESSION_UNKNOWN`). | `PostgresSessionStore` | Real product defect |
| 3 | Roles were read from `identity_sessions.roles`, which does not exist in the approved migration 008 schema. | `PostgresSessionStore` | Real product defect |

Defect 3 was initially misdiagnosed as a migration schema gap and a
`roles` column was added to migration 008. That was **incorrect** and has been
reverted; see "Migration contracts" below.

## Roles are read from `identity_accounts`

Roles are authoritative on `identity_accounts` (Gate A Q7). Session reads join
the account rather than storing a second copy:

```sql
SELECT s.*, a.roles
FROM identity_sessions s
JOIN identity_accounts a ON a.id = s.actor_id
```

`putAsync()` does not write `roles`. This is deliberate: a denormalized copy on
the session would silently drift the moment an account's roles changed, leaving
live sessions holding roles the account no longer had. Rotation and replay
locking use `FOR UPDATE OF s` so only the session row is locked, never the
joined account.

## Migration contracts unchanged

- **Migration 008** is restored to its approved contract: `identity_sessions`
  has exactly **10** columns and **0** defaulted columns; `roles` exists only on
  `identity_accounts`. No `alter table` / `add column` remains in the file.
- **Migration 009** was never modified.
- Auth contracts, Argon2id parameters, `IdentityService` architecture, mobile
  auth, RLS, and distributed rate limiting are untouched.

SHA256 at close:

```
008_identity_accounts_and_sessions.sql  F4DF2338BDF5BBBF0F545334A55CDC0164DBE012907A4FA325EC4E0447DAB3C1
009_identity_refresh_grants.sql         967330A911B6591172DC2046A2991BE72A31F66A04D98C44978819D18D011BAC
```

Live schema confirms the contract: `identity_sessions` = 10 columns / 0
defaults; `identity_refresh_grants` = 7 columns.

## M9 verification-harness classification defect

The migration 009 proof failed with:

```
FAIL: migration 008 identity objects differed before and after migration 009:
  => fk:identity_refresh_grants:identity_refresh_grants_session_id_fkey:identity_sessions:del=c:upd=a
```

This was a defect in the **verification harness**, not in migration 009.

`verify-m9-identity-migration-postgres.ps1` classified migration-008-owned
objects by testing whether an inventory line *mentioned* `identity_accounts` or
`identity_sessions`. Migration 009's own foreign key *references*
`identity_sessions`, so its inventory line mentions an 008 table while being
owned by 009, and it was miscounted as an 008 preservation object. Because M9
applies migrations 001–008 before snapshotting, 008 objects always pre-exist,
so the preservation check was structurally unsatisfiable the moment 009 created
that key. The `$m8FirstApplication` guard protected only the re-application
comparison, not the primary one.

Fix: classify by **ownership** instead of mention. Inventory lines are
`kind:field:field:…`, so the owning object is field 2 for every kind except
`policy:`, where field 2 is the schema and the owning table is field 3.

```powershell
function Test-OwnedBy([string] $line, [string] $table) {
  $parts = $line -split ':'
  $ownerIndex = if ($parts[0] -eq 'policy') { 2 } else { 1 }
  if ($parts.Count -le $ownerIndex) { return $false }
  return $parts[$ownerIndex] -eq $table
}
```

Applied to `$m8BeforeIdentity`, `$m8AfterIdentity`, and the re-application
comparison. `$identityLines` still uses the raw name patterns, so migration
009's FK remains **counted** in the 52-object total; it is only excluded from
the 008 preservation set. No assertion, expected-count, allowed-pattern, SQL
structural assertion, idempotency pass, or restart check was altered.

## Verification

Target for every proof, asserted by each script: `127.0.0.1:55432`,
database `artisan_marketplace_dev`, container `artisan-marketplace-postgres`.
Each script refuses any connection string that is not that target. The native
PostgreSQL on 5432 is a different instance and was never contacted.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/verify-m8-identity-migration-postgres.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/verify-m9-identity-migration-postgres.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/verify-m10-auth-postgres.ps1
pnpm verify
```

| Gate | Result |
|------|--------|
| M8 migration 008 proof | `M8 MIGRATION 008 POSTGRESQL PROOF PASSED` — 201 objects idempotent, survived restart, 0 rows |
| M9 migration 009 proof | `M8 MIGRATION 009 POSTGRESQL PROOF PASSED` — `0 objects removed or altered from migrations 001-008`, `52/52` identity objects, 219 objects idempotent, survived restart |
| M10-A write phase | `M10 AUTH POSTGRES WRITE PHASE PASSED` |
| M10-A restart | `docker restart artisan-marketplace-postgres`, health polled to `healthy` |
| M10-A read phase | `M10 AUTH POSTGRES READ-AFTER-RESTART PHASE PASSED` |
| M10-A overall | `M10 AUTH POSTGRESQL PROOF PASSED` |
| Full repository | `FULL FAST VERIFY PASSED` (all 8 stages, incl. typecheck and dry-run) |

M9 was executed twice, the second run taking the `009 already present: True`
branch, to confirm the classification fix is repeatable and not
ordering-dependent.

## Files

Added:
- `tests/m10-auth-postgres/auth-postgres-runtime.test.ts`
- `tests/m10-auth-postgres/tsconfig.json`
- `scripts/verify-m10-auth-postgres.ps1`
- this note

Modified:
- `apps/api/src/modules/identity/infrastructure/postgres-session-store.ts`
- `infra/migrations/008_identity_accounts_and_sessions.sql` (reverted to approved)
- `scripts/verify-m9-identity-migration-postgres.ps1` (classification only)

## Evidence Status

`VERIFIED` for the 15 auth scenarios, restart persistence, and the M8/M9/M10
sequence.

## Unverified Items

- None for M10-A scope.

## Risks

- `createCredentialHasherSync()` uses `require('crypto')`, flagged in-code as
  Workers-incompatible. Pre-existing and out of M10-A scope.
- M8 and M9 assert zero rows, and M8 additionally requires no identity relation
  beyond the two 008 tables. The local proof database must therefore be reset
  between a run and a fresh M8/M9 sequence.
- The repository has no commits, so the change set could not be reviewed with
  `git diff`.

## Follow-ups

- Consider recording the M9 classification fix under ADR-010
  (verification and testing strategy), since it corrected a harness bug that
  made the 009 proof unsatisfiable on any database where 008 already existed.

## Human Approval Required

- Commit: **not performed** — awaiting human authorization
- Push: **not performed**
- Pull request: **not performed**
- Merge: **not performed**
- Deployment: **not performed**
- External production changes: **none**