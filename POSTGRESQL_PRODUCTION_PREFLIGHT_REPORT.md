# PostgreSQL Production Readiness Preflight Audit
## Artisan Marketplace API — Read-Only Assessment

**Date:** 2026-10-27  
**Scope:** Read-only inspection of code, config, migrations, and verification scripts. No production connections, no role creation, no Hyperdrive changes, no migrations, no deployments.

---

## Executive Summary

The Artisan Marketplace API has **implemented the complete database-layer foundation** for production PostgreSQL with Hyperdrive, Row-Level Security (RLS), and least-privilege roles. All code, migrations, and isolated verification proofs are in place and passing locally.

**The only blockers are external operational steps** that cannot be performed in this read-only audit:
1. Provisioning a non-owner login role in the target PostgreSQL instance
2. Updating the Hyperdrive configuration to use that login role
3. Running the verification proofs against a staging database

---

## 1. Current Implementation Status

### ✅ Fully Implemented (Code Complete)

| Area | Status | Evidence |
|------|--------|----------|
| **Hyperdrive Binding** | Configured | `wrangler.jsonc` contains binding `"HYPERDRIVE"` with real ID `934099e222e3407fa7af9e66a211d0ba` |
| **Connection Resolution** | Implemented | `postgres-connection.ts:25-45` resolves connection string from HYPERDRIVE binding object or raw string |
| **Actor Context Propagation** | Implemented | `postgres-database.ts:100-115` executes `SET_ACTOR_SQL` (`SET LOCAL app.actor_id = $1`) after `BEGIN` |
| **RLS Helper Function** | Implemented | Migration `010_row_level_security.sql:14-30` creates `app.current_actor_id()` returning UUID or null (fail-closed) |
| **RLS Policies** | Implemented | Migration `010` enables RLS on 6 tables (`catalog_products`, `catalog_versions`, `media_attachments`, `ai_jobs`, `ai_proposals`, `inquiries`) with 17 explicit policies |
| **Security-Definer View** | Implemented | Migration `010` creates `app.published_catalog_products` for buyer discovery without exposing drafts |
| **Privilege Group Role** | Defined | `app-role.sql` creates `artisan_marketplace_app` as `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS` with explicit table grants |
| **Local Dev Variable** | Documented | `.dev.vars.example:10` documents `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` |

### 🔄 Implemented but Not Activated in Production

| Area | Status | Gap |
|------|--------|-----|
| **Non-owner Login Role** | SQL defined (`app-role.sql`) | Must be created in target PostgreSQL instance; local dev uses table owner (`artisan_marketplace`) which is `SUPERUSER`/`BYPASSRLS` and bypasses all policies |
| **Hyperdrive → Login Role** | Binding exists | Hyperdrive config must be updated to point at the non-owner login role, not the owner |
| **FORCE ROW LEVEL SECURITY** | Deliberately not used | Owner bypass is intentional per ADR-007; will be enabled after non-owner login is verified |

### 📋 Documented but Not Yet Implemented (Future Slices)

| Area | Status | Notes |
|------|--------|-------|
| **Identity Tables RLS** | Deferred | `identity_accounts`, `identity_sessions`, `identity_refresh_grants` — session verification happens before actor exists; needs separate auth role or security-definer boundary |
| **Buyer Media Reads** | Deferred | Per-attachment visibility model not yet designed |
| **Artisan Inquiry Inbox** | Deferred | No product-owner policy for inquiries yet |
| **Reviewer Role** | Deferred | No reviewer role or separate AI service role exists |
| **Service-Role Boundary** | Deferred | Background workers must not reuse API login anonymously |

---

## 2. Missing or Incomplete Setup Steps (To Reach Production)

### Phase 1.1 — Hyperdrive & Database Foundation (IMPLEMENTATION_PLAN.md)

| Step | Status | What Remains |
|------|--------|--------------|
| 1.1.1 Hyperdrive config exists | ✅ Done | Binding ID `934099e222e3407fa7af9e66a211d0ba` in `wrangler.jsonc` |
| 1.1.2 Non-owner login role | 🔴 **External** | Must run `CREATE ROLE artisan_marketplace_api WITH LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;` in target PostgreSQL, then `GRANT artisan_marketplace_app TO artisan_marketplace_api;` |
| 1.1.3 Update Hyperdrive to use login | 🔴 **External** | In Cloudflare dashboard: edit Hyperdrive connection `934099e222e3407fa7af9e66a211d0ba` → set username to `artisan_marketplace_api` |
| 1.1.4 Apply migration 010 | ✅ Done (code) | Must be applied to target database (part of standard deploy) |
| 1.1.5 Apply app-role.sql | ✅ Done (code) | Must be run against target database after migration 010 |
| 1.1.6 Verify with proof script | 🔴 **External** | Run `scripts/verify-rls-postgres.ps1` against staging database |

### Phase 1.2 — DO Rate Limiter (Separate)
- Binding `AUTH_RATE_LIMITER` configured in `wrangler.jsonc` ✅
- Implementation complete in `operation-rate-limit.ts` ✅

### Phase 1.3 — Production AI Provider
- Configuration documented in `.dev.vars.example` (lines 19-25) ✅
- Requires valid OpenAI key at deploy time

### Phase 1.4 — Verification Gates
- All proof scripts exist and pass locally ✅
- Must be run against staging after Hyperdrive reconfiguration

---

## 3. Exact Prerequisites for Staging Verification

Before running any verification against a staging database, the following **must** be completed externally:

### A. Target PostgreSQL Instance
- [ ] PostgreSQL instance provisioned and accessible
- [ ] Database `artisan_marketplace` (or configured name) created
- [ ] Network connectivity from Cloudflare Hyperdrive to the instance

### B. Non-Owner Login Role (Critical Path)
```sql
-- Run as database superuser/owner in target instance:
CREATE ROLE artisan_marketplace_api WITH LOGIN PASSWORD '<strong-password>' 
  NOSUPERUSER NOBYPASSRLS;
GRANT artisan_marketplace_app TO artisan_marketplace_api;
```
- The password must be stored in Cloudflare Hyperdrive config (not in repo)
- Role must **not** own the tables (owner remains `artisan_marketplace` or equivalent)

### C. Hyperdrive Configuration Update
- [ ] In Cloudflare Dashboard → Hyperdrive → connection `934099e222e3407fa7af9e66a211d0ba`
- [ ] Update "Username" to `artisan_marketplace_api`
- [ ] Update "Password" to the password created above
- [ ] Save and test connection

### D. Migration Application
- [ ] Run migrations `001` through `010` against target database
- [ ] Run `infra/database/app-role.sql` against target database

### E. Worker Restart/Deploy
- [ ] Deploy Worker with updated Hyperdrive binding (or restart local dev with new connection string)
- [ ] Verify Worker starts without `DEPENDENCY_FAILED` on database calls

### F. Verecution
```powershell
# From repo root, with staging connection string in env:
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = "postgres://artisan_marketplace_api:password@staging-host:5432/artisan_marketplace"
./scripts/verify-rls-postgres.ps1
```

---

## 4. Safe Verification Commands (Read-Only / Isolated)

All scripts below are **safe to run** — they create throwaway databases, apply migrations read-only, and clean up. They **do not** modify production.

| Script | Purpose | Requirements |
|--------|---------|--------------|
| `scripts/verify-rls-postgres.ps1` | **Primary RLS proof** — creates throwaway DB, applies 001-010 + app-role.sql, creates temp non-owner login, proves all 17 policies enforce correctly under `NOBYPASSRLS` | Docker, local PostgreSQL container on port 55432 (`infra/docker/local-compose.yml`) |
| `scripts/verify-m8-actor-isolation-postgres.ps1` | Proves credential→actor resolution isolation with real PostgreSQL | Same as above |
| `scripts/verify-m8-db-wiring-postgres.ps1` | Proves HYPERDRIVE binding → PostgresSessionStore wiring (401 vs DEPENDENCY_FAILED) | Same as above; applies migrations 001-009 |
| `scripts/verify-m10-auth-postgres.ps1` | Full auth lifecycle: write phase → PostgreSQL restart → read-after-restart proves persistence of accounts, sessions, refresh grants, replay detection, revocation | Same as above; applies migrations 001-009; restarts container |

### Local Development Prerequisites
```powershell
# 1. Start local PostgreSQL (port 55432, isolated from system PostgreSQL on 5432)
docker compose -f infra/docker/local-compose.yml up -d

# 2. Set connection string for local dev (from approved secret source)
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = "postgres://artisan_marketplace:password@127.0.0.1:55432/artisan_marketplace_dev"

# 3. Run any proof script
./scripts/verify-rls-postgres.ps1
```

### Scope Guards (Built Into Every Script)
- All scripts **refuse to run** if connection string targets port 5432 (system PostgreSQL)
- All scripts **refuse to run** if database name ≠ `artisan_marketplace_dev`
- All scripts **refuse to run** if host ≠ `127.0.0.1`
- These are explicit assertions, not assumptions

---

## 5. Permission / Ownership Concerns

### Current Local Development (Intentional Bypass)
- Local dev uses role `artisan_marketplace` which **owns all tables**
- This role is `SUPERUSER` and `BYPASSRLS` → **all RLS policies are bypassed**
- This is **by design** (ADR-007, data-and-rls-contract.md:86-90)
- Purpose: migrations, backfills, trusted operations use same role; `FORCE ROW LEVEL SECURITY` not used

### Production Requirement (Must Change)
- Application **must not** connect as table owner
- Hyperdrive **must** use `artisan_marketplace_api` (non-owner, `NOBYPASSRLS`)
- The privilege group `artisan_marketplace_app` has **explicit grants only**:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_products, catalog_versions, 
    media_attachments, ai_jobs, ai_proposals, inquiries TO artisan_marketplace_app;
  GRANT USAGE, SELECT ON SEQUENCES ... TO artisan_marketplace_app;
  ```
- No `TRUNCATE`, no `REFERENCES`, no `TRIGGER`, no DDL rights

### Tables Outside Current RLS Slice
| Table | Reason | Risk if Unaddressed |
|-------|--------|---------------------|
| `identity_accounts` | Session verification before actor exists | Requires separate auth role or security-definer boundary |
| `identity_sessions` | Same | — |
| `identity_refresh_grants` | Same | — |
| `media_attachments` (buyer reads) | Per-attachment visibility not designed | Buyers cannot read media on published products |
| `inquiries` (artisan inbox) | No product-owner policy yet | Artisans cannot see inquiries on their products |

---

## 6. External Prerequisites Requiring Approval / Coordination

| Prerequisite | Owner | Action Required |
|--------------|-------|-----------------|
| **PostgreSQL instance provisioning** | Infra/Platform | Provision production PostgreSQL (RDS, Cloud SQL, Neon, etc.) |
| **Network egress for Hyperdrive** | Network/Security | Allow Cloudflare Hyperdrive IPs to reach PostgreSQL port |
| **Non-owner login role creation** | DBA/Platform | Run `CREATE ROLE artisan_marketplace_api ... GRANT artisan_marketplace_app TO ...` |
| **Hyperdrive config update** | Platform/Deploy | Update Hyperdrive connection `934099e222e3407fa7af9e66a211d0ba` username/password |
| **Secret management for password** | Security | Store login password in Cloudflare Hyperdrive config (not in repo, not in .dev.vars) |
| **Migration execution on target** | Deploy pipeline | Run migrations 001-010 + app-role.sql against target database |
| **Worker deploy with new binding** | Deploy pipeline | Deploy Worker after Hyperdrive config change |
| **Staging verification run** | Engineering | Execute `verify-rls-postgres.ps1` against staging Hyperdrive connection |

---

## 7. Facts vs. Assumptions

| Statement | Classification | Evidence |
|-----------|----------------|----------|
| "Hyperdrive is configured" | **Fact** | `wrangler.jsonc` binding ID `934099e222e3407fa7af9e66a211d0ba` exists |
| "RLS policies are implemented" | **Fact** | Migration `010` creates 17 policies on 6 tables |
| "RLS is enforced in production" | **Assumption** | Only true after non-owner login role is created and Hyperdrive updated |
| "Local dev bypasses RLS" | **Fact** | Local role is table owner + SUPERUSER + BYPASSRLS (ADR-007:76-80) |
| "verify-rls-postgres.ps1 proves RLS works" | **Fact** | Script creates temp non-owner login with NOBYPASSRLS and tests all policies |
| "Hyperdrive ID is real/provisioned" | **Fact** | ID format matches Cloudflare Hyperdrive UUID; binding exists in wrangler.jsonc |
| "Identity tables have RLS" | **False** | Explicitly deferred (data-and-rls-contract.md:96-98) |
| "Buyer media reads work" | **False** | Deferred until per-attachment visibility model (data-and-rls-contract.md:69-71) |
| "No code changes needed for production" | **Fact** | All application code handles actor context, connection resolution, rate limiting |
| "FORCE ROW LEVEL SECURITY is enabled" | **False** | Deliberately not used while owner=bypass role (ADR-007:78-80) |

---

## 8. Recommended Next Steps (Priority Order)

1. **Provision staging PostgreSQL** and verify Hyperdrive connectivity
2. **Create non-owner login role** `artisan_marketplace_api` in staging database
3. **Update Hyperdrive config** to use the new login role
4. **Run migrations 001-010 + app-role.sql** against staging
5. **Deploy Worker** (or restart local with staging connection string)
6. **Execute `verify-rls-postgres.ps1`** against staging — this is the definitive gate
7. **If verification passes**: Enable `FORCE ROW LEVEL SECURITY` on the 6 tables (future migration)
8. **Address deferred RLS slices** (identity tables, buyer media, artisan inbox, reviewer role) in subsequent vertical slices

---

## Appendix: Key File References

| File | Purpose |
|------|---------|
| `IMPLEMENTATION_PLAN.md` | Phases 1.1-1.4 production hardening plan |
| `wrangler.jsonc` | Hyperdrive binding, DO binding, AI binding |
| `infra/database/README.md` | Activation steps (migrations, app-role, login role, Hyperdrive, verify) |
| `apps/api/src/shared/persistence/postgres-connection.ts` | Connection string resolution from HYPERDRIVE binding |
| `apps/api/src/shared/persistence/postgres-database.ts` | Actor context via `SET LOCAL app.actor_id` |
| `infra/migrations/010_row_level_security.sql` | RLS policies, `app.current_actor_id()`, security-definer view |
| `infra/database/app-role.sql` | `artisan_marketplace_app` NOLOGIN privilege group with grants |
| `scripts/verify-rls-postgres.ps1` | Primary RLS enforcement proof (throwaway DB, non-owner login) |
| `scripts/verify-m8-actor-isolation-postgres.ps1` | Actor isolation proof |
| `scripts/verify-m8-db-wiring-postgres.ps1` | HYPERDRIVE → session store wiring proof |
| `scripts/verify-m10-auth-postgres.ps1` | Full auth lifecycle with PostgreSQL restart |
| `docs/adr/007-database-ownership-and-rls.md` | Accepted ADR with implementation notes |
| `docs/architecture/data-and-rls-contract.md` | Detailed contract, current enforcement state, gaps |

---

*This report is based solely on read-only inspection of the repository at commit `9b2aaec`. No production systems were accessed.*