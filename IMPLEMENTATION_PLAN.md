# Artisan Marketplace API - Dependency-Ordered Implementation Plan

This plan addresses the critical blockers preventing production deployment of the AI pipeline and related infrastructure. Each phase has explicit dependencies, file changes, risks, acceptance criteria, and test requirements.

---

## PHASE 1.1 - Hyperdrive Config (Prerequisite for AI Provider DB Access)

### Task
Replace placeholder Hyperdrive ID in `wrangler.jsonc` with the real deployed Hyperdrive configuration ID.

### Files to Modify
| File | Change |
|------|--------|
| `apps/api/wrangler.jsonc` | Line 24: Replace `"id": "00000000000000000000000000000000"` with real Hyperdrive config ID |

### Dependencies
- **External**: Cloudflare Hyperdrive must be provisioned with a non-owner PostgreSQL role (see Phase 1.2)
- **External**: PostgreSQL database must exist and be accessible

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Wrong Hyperdrive ID | Deploy fails or connects to wrong DB | Verify ID via `npx wrangler hyperdrive list` |
| Hyperdrive not configured for non-owner role | RLS enforcement fails (Phase 1.2) | Provision role first (Phase 1.2), then create Hyperdrive |

### Acceptance Criteria
- [ ] `npx wrangler deploy --dry-run` succeeds with real Hyperdrive ID
- [ ] `npx wrangler dev` connects to staging database via Hyperdrive binding
- [ ] Hyperdrive binding object delivered to Worker with valid `connectionString`

### Tests
```bash
# Dry-run deploy validates config
npx wrangler deploy --dry-run

# Local dev validates binding resolution
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://..." npx wrangler dev
```

---

## PHASE 1.2 - Non-owner PostgreSQL Role (Prerequisite for RLS Enforcement)

### Task
Provision a dedicated login role with least privileges, grant it the `artisan_marketplace_app` role, and update Hyperdrive to use this role.

### Files to Modify
| File | Change |
|------|--------|
| External (PostgreSQL) | `CREATE ROLE artisan_marketplace_worker LOGIN PASSWORD '...';` |
| External (PostgreSQL) | `GRANT artisan_marketplace_app TO artisan_marketplace_worker;` |
| External (Cloudflare) | Update Hyperdrive connection string to use new role |

### Dependencies
- **External**: PostgreSQL superuser access to create roles
- **External**: Cloudflare Hyperdrive config update capability

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Role has excessive privileges | RLS bypass possible | Use `artisan_marketplace_app` role which has table-level grants only |
| Hyperdrive not updated | Worker connects as owner | Update Hyperdrive config *after* role creation |
| Password rotation | Connection breaks | Use Cloudflare secret for password, not connection string |

### Acceptance Criteria
- [ ] `scripts/verify-rls-postgres.ps1` passes against staging database
- [ ] Worker connects via Hyperdrive using non-owner role
- [ ] RLS policies enforce row-level isolation for `artisan_marketplace_app` role
- [ ] No superuser/owner privileges in Worker connection

### Tests
```powershell
# Run RLS verification script
./scripts/verify-rls-postgres.ps1 -Environment staging

# Expected: All RLS policy tests pass, worker role cannot bypass policies
```

---

## PHASE 1.3 - Durable Object Rate Limiter (Parallelizable)

### Task
Wire the Durable Object rate limiter in composition roots when `AUTH_RATE_LIMITER` binding is present.

### Files to Modify
| File | Change |
|------|--------|
| `apps/api/src/modules/identity/composition.ts` | Import and wire `AuthRateLimiterDurableObject` when binding exists |
| `apps/api/src/worker.ts` | Export DO class (already done per wrangler.jsonc) |

### Dependencies
- **Already configured**: `wrangler.jsonc` lines 30-37 have DO binding and migration
- **Independent**: Can run in parallel with Phase 1.1/1.2

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| DO not bound in dev | Local tests fail | Use `wrangler dev` which provides binding |
| Migration not applied | DO storage missing | Run `npx wrangler migrations apply` |

### Acceptance Criteria
- [ ] Rate limit tests pass with real DO binding in staging
- [ ] Local `wrangler dev` provides DO binding automatically
- [ ] Auth endpoints enforce rate limits per subject hash

### Tests
```bash
# Run identity module tests with DO binding
npm test -- src/modules/identity/

# Verify rate limiting behavior
curl -X POST ... # Should get 429 after threshold
```

---

## PHASE 1.4 - Production AI Provider (Critical Blocker)

### Task
Create a production-ready AI provider implementation and wire it in the composition root based on `APP_ENV`.

### Files to Create
| File | Purpose |
|------|---------|
| `apps/api/src/modules/ai/infrastructure/openai-catalog-ai-provider.ts` | OpenAI implementation of `CatalogAiProvider` |
| `apps/api/src/modules/ai/infrastructure/anthropic-catalog-ai-provider.ts` | Alternative: Anthropic implementation (optional) |

### Files to Modify
| File | Change |
|------|--------|
| `apps/api/src/modules/ai/composition.ts` | Select provider by `APP_ENV`: deterministic (dev/test) vs real (staging/production) |
| `apps/api/wrangler.jsonc` | Add AI provider secrets: `OPENAI_API_KEY`, `AI_PROVIDER_MODEL`, `AI_PROVIDER_VERSION` |
| `apps/api/.dev.vars.example` | Document required secrets for local development |

### Dependencies
- **Phase 1.1**: Hyperdrive config for DB access (job persistence)
- **External**: OpenAI/Anthropic API keys provisioned
- **External**: Secrets added to Cloudflare Workers environment

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider API changes | Runtime failures | Pin model version, add version to attribution |
| Token costs uncontrolled | Budget overrun | Add max token limits, request logging |
| Provider failures not normalized | Pipeline crashes | Wrap all errors in `AiProviderError` with failure codes |
| Secrets committed | Security breach | Use Cloudflare secrets, never `.dev.vars` |

### Acceptance Criteria
- [ ] Real provider called in staging (`APP_ENV=staging`)
- [ ] Deterministic provider used in development/test
- [ ] All AI pipeline tests pass with real provider
- [ ] Attribution includes provider, model, modelVersion
- [ ] Provider errors mapped to `AiFailureCode` enum

### Tests
```bash
# Unit tests for new provider
npm test -- src/modules/ai/infrastructure/openai-catalog-ai-provider.test.ts

# Integration test with real provider (staging)
APP_ENV=staging npm test -- src/modules/ai/http.test.ts

# Verify deterministic provider still used in dev
APP_ENV=development npm test -- src/modules/ai/
```

### Provider Implementation Requirements

The `openai-catalog-ai-provider.ts` must:

1. **Implement `CatalogAiProvider` interface** exactly
2. **Attribution** includes:
   ```typescript
   readonly attribution: CatalogAiAttribution = {
     provider: 'openai',
     model: 'gpt-4o-mini', // or from secret
     modelVersion: '2024-07-18', // or from secret
   };
   ```
3. **Request format**: Transform `CatalogAiRequest` to OpenAI Chat Completions API
4. **Response handling**: Return raw `unknown` (validated downstream by pipeline)
5. **Error normalization**: Catch all errors, throw `AiProviderError` with:
   - `TRANSIENT` for rate limits, timeouts, 5xx
   - `PERMANENT` for auth failures, invalid requests, 4xx (except 429)
   - `UPSTREAM_UNAVAILABLE` for network errors
6. **Timeout**: 30s max per request
7. **Secrets**: Read `OPENAI_API_KEY`, `AI_MODEL`, `AI_MODEL_VERSION` from env

---

## PHASE 2+ - Integration Features (Post-Blockers)

### Phase 2.1 - AI Job Queue Consumer
- Background worker to process queued AI jobs
- Requires: Phase 1.4 complete, Cloudflare Queues configured

### Phase 2.2 - Media Analysis Provider
- Separate provider for image/audio analysis
- Requires: Phase 1.4 pattern established

### Phase 2.3 - Embedding Generation
- Vector search for product discovery
- Requires: pgvector extension, separate provider

### Phase 2.4 - Review Module AI Suggestions
- Wire AI proposals into review workflow
- Requires: Phase 1.4 complete, review HTTP endpoints

---

## Dependency Graph

```
Phase 1.1 (Hyperdrive Config)
    │
    ├─→ Phase 1.2 (Non-owner Role) ────┐
    │                                  │
    └─→ Phase 1.3 (DO Rate Limiter)    │
                                       ▼
                            Phase 1.4 (Production AI Provider) ◄── External: AI API Keys
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              Phase 2.1           Phase 2.2           Phase 2.3
              (Queue Consumer)    (Media Provider)    (Embeddings)
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       ▼
                              Phase 2.4 (Review Integration)
```

---

## Execution Order

| Order | Phase | Can Parallelize? | Blocked By |
|-------|-------|------------------|------------|
| 1 | 1.1 Hyperdrive Config | No | External Hyperdrive provisioned |
| 2 | 1.2 Non-owner Role | No | PostgreSQL access |
| 3 | 1.3 DO Rate Limiter | Yes (with 1.1/1.2) | wrangler.jsonc DO config (done) |
| 4 | 1.4 Production AI Provider | No | 1.1, 1.2, External AI keys |
| 5+ | 2.x Integration | After 1.4 | 1.4 complete |

---

## Quick Reference: Commands

```bash
# Phase 1.1: Validate Hyperdrive config
npx wrangler hyperdrive list
npx wrangler deploy --dry-run

# Phase 1.2: Verify RLS
./scripts/verify-rls-postgres.ps1 -Environment staging

# Phase 1.3: Test DO rate limiter
npm test -- src/modules/identity/

# Phase 1.4: Test AI provider
# Dev (deterministic)
APP_ENV=development npm test -- src/modules/ai/
# Staging (real provider)
APP_ENV=staging npm test -- src/modules/ai/
```