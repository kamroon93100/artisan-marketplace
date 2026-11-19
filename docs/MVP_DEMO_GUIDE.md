# Artisan Marketplace — MVP Demo Guide

## 1. Project Overview

Artisan Marketplace is an offline-first market-linkage and smart-cataloging platform for artisans. It enables artisans to capture product information (photos, voice descriptions) on mobile devices, sync to a Cloudflare Workers backend where AI generates catalog proposals (title, description, category, materials), review and approve those proposals, and publish to a buyer-facing catalog. Buyers can discover published products, view details, and send inquiries.

**Key Capabilities Demonstrated:**
- Offline-first mobile capture (photos + voice)
- Transactional sync with idempotency and retry
- AI-powered catalog field generation with deterministic provider for testing
- Human-in-the-loop review and approval workflow
- Immutable catalog versioning on publish
- Buyer discovery with full-text search
- Buyer inquiries pinned to published versions
- End-to-end ownership and authorization (RLS)

---

## 2. Architecture and Major Modules

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│   Mobile App    │────▶│  Cloudflare API  │────▶│  PostgreSQL (via   │
│  (Expo/React    │     │  (Workers +      │     │   Hyperdrive)     │
│   Native)       │     │   Queues)        │     │                    │
└─────────────────┘     └──────────────────┘     └────────────────────┘
        │                       │                       │
        │                       ▼                       │
        │              ┌──────────────────┐             │
        │              │   AI Pipeline    │             │
        │              │  (Queue Consumer │             │
        │              │   + Provider)    │             │
        │              └──────────────────┘             │
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Local SQLite    │     │  Object Storage  │     │  Search Index      │
│ (drafts, media, │     │  (RustFS/S3)     │     │  (pg_trgm GIN)     │
│  sync ops)      │     │                  │     │                    │
└─────────────────┘     └──────────────────┘     └────────────────────┘
```

**Major Modules:**
- **Identity** — Registration, login, JWT sessions, refresh tokens, rate limiting
- **Catalog** — Product drafts, state machine (LOCAL_DRAFT → PENDING_SYNC → SYNCED → REVIEW_REQUIRED → APPROVED → PUBLISHED), versioning
- **Media** — Media attachments, upload authorization, byte upload, verification
- **AI** — Job queue, deterministic provider, proposals, review decisions, transactional outbox
- **Review** — Human review surface, proposal decisions (ACCEPT/EDIT/REJECT), approval gate
- **Discovery** — Buyer search, published product detail, search projection
- **Inquiry** — Buyer inquiries pinned to catalog version, deduplication

---

## 3. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22+ | JavaScript runtime |
| pnpm | 9+ | Package manager |
| Docker Desktop | 4.x | Local PostgreSQL & object storage |
| Wrangler | 4.x | Cloudflare Workers CLI |
| Expo CLI | 57+ | React Native development |

---

## 4. Docker and PostgreSQL Startup

```powershell
# Start local infrastructure stack
docker compose -f infra/docker/local-compose.yml up -d

# Verify containers are healthy
docker ps --filter "name=artisan-marketplace" --format "{{.Names}} {{.Status}}"
# Expected: both containers running, postgres shows (healthy)
```

**Services started:**
- `artisan-marketplace-postgres` — PostgreSQL 16 on port 55432
- `artisan-marketplace-storage` — RustFS (S3-compatible) on ports 9000/9001

---

## 5. API Startup

```powershell
cd apps/api

# Set required environment variable (current session only)
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = 'postgresql://artisan_marketplace:artisan_marketplace_dev@localhost:55432/artisan_marketplace_dev'

# Start Workers dev server
npx wrangler dev
```

**API will be available at:** `http://localhost:8787`

**Key endpoints:**
- `POST /auth/register` — Register artisan/buyer
- `POST /auth/login` — Login
- `POST /products/drafts` — Create product draft
- `POST /products/:id/sync` — Sync product
- `POST /products/:id/media` — Create media attachment
- `POST /products/:id/ai-jobs` — Enqueue AI job
- `GET /products/:id/review` — Get review surface
- `POST /products/:id/review/approve` — Approve product
- `POST /products/:id/publish` — Publish product
- `GET /discovery/search` — Search published products
- `GET /discovery/products/:id` — Get published product detail
- `POST /inquiries` — Create inquiry

---

## 6. Mobile Application Startup

```powershell
cd apps/mobile

# Install dependencies (first time only)
pnpm install

# Start Expo development server
npx expo start

# Options:
#   - Press 'w' for web
#   - Press 'a' for Android emulator
#   - Press 'i' for iOS simulator
#   - Scan QR code with Expo Go on physical device
```

**Mobile flows:**
- **Capture** — Photo + voice → local draft → sync → AI job enqueue
- **Review** — View AI proposals → Accept/Edit/Reject → Approve → Publish
- **Discovery** — Search published products → View detail → Send inquiry
- **Inquiries** — View own inquiry history

---

## 7. Environment Variable Names Required

The following environment variables must be set (values are local development only):

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` | PostgreSQL connection string for local Hyperdrive development |
| `EXPO_PUBLIC_API_URL` | API base URL for mobile (e.g., `http://localhost:8787` or ngrok tunnel) |
| `RUSTFS_ACCESS_KEY` | Object storage access key (default: `artisan_dev`) |
| `RUSTFS_SECRET_KEY` | Object storage secret key (default: `artisan_dev_secret_2026`) |

**Never commit actual values.** Use `.dev.vars` (git-ignored) or session-only PowerShell `$env:VAR = 'value'`.

---

## 8. Local Database Migration and Seed

```powershell
# Apply all migrations (idempotent, safe to re-run)
docker exec -i artisan-marketplace-postgres psql -v ON_ERROR_STOP=1 -U artisan_marketplace -d artisan_marketplace_dev < infra/migrations/005_catalog_versions.sql
docker exec -i artisan-marketplace-postgres psql -v ON_ERROR_STOP=1 -U artisan_marketplace -d artisan_marketplace_dev < infra/migrations/006_ai_jobs_and_proposals.sql
docker exec -i artisan-marketplace-postgres psql -v ON_ERROR_STOP=1 -U artisan_marketplace -d artisan_marketplace_dev < infra/migrations/007_inquiries_and_published_search.sql
docker exec -i artisan-marketplace-postgres psql -v ON_ERROR_STOP=1 -U artisan_marketplace -d artisan_marketplace_dev < infra/migrations/008_identity_accounts_and_sessions.sql
docker exec -i artisan-marketplace-postgres psql -v ON_ERROR_STOP=1 -U artisan_marketplace -d artisan_marketplace_dev < infra/migrations/009_identity_refresh_grants.sql
docker exec -i artisan-marketplace-postgres psql -v ON_ERROR_STOP=1 -U artisan_marketplace -d artisan_marketplace_dev < infra/migrations/010_row_level_security.sql
docker exec -i artisan-marketplace-postgres psql -v ON_ERROR_STOP=1 -U artisan_marketplace -d artisan_marketplace_dev < infra/migrations/011_ai_job_outbox.sql

# Seed demo data (repeatable, creates new UUIDs each run)
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = 'postgresql://artisan_marketplace:artisan_marketplace_dev@localhost:55432/artisan_marketplace_dev'
npx tsx scripts/seed-demo.ts
```

---

## 9. Demo Account Setup

The seed script creates fresh UUIDs each run. Use the printed IDs:

```text
Artisan ID:  <printed UUID>
Buyer ID:    <printed UUID>
Buyer #2 ID: <printed UUID>
```

**In the mobile app:**
- Register/login as the artisan using the Artisan ID
- Register/login as a buyer using the Buyer ID

**Note:** The demo uses the deterministic AI provider, which returns predictable proposals based on the transcription input. This is a **development-only behavior** — production uses a real AI provider.

---

## 10. Complete Artisan-to-Buyer Demonstration

### 10.1 Artisan Capture Flow
1. Open mobile app, login as **Artisan**
2. Tap "Create Product" → "Add Photo" → take/select photo
3. Tap "Record Voice" → describe the product (e.g., "Handwoven bamboo basket for bread storage")
4. Tap "Sync Now" — product draft syncs, media uploads, AI job enqueued
5. Wait for sync to complete (green checkmark)

### 10.2 AI Processing and Proposal Review
1. Tap "Review This Product" on the synced product
2. Review screen shows 4 AI proposals:
   - **Title** — Accept / Edit / Reject
   - **Description** — Accept / Edit / Reject
   - **Category** — Accept / Edit / Reject
   - **Materials** — Accept / Edit / Reject
3. For each proposal, choose a decision
4. "Approve" button enables only when all proposals are decided
5. Tap "Approve" → product moves to APPROVED

### 10.3 Approval and Publication
1. On approved product, tap "Publish"
2. Confirm publication
3. Product moves to PUBLISHED, immutable catalog version created
4. Version history shows v1 with published values

### 10.4 Buyer Discovery and Inquiry
1. Switch to **Buyer** account (logout/login or use second device)
2. Tap "Discover" → search "bamboo" or "basket"
3. See published "Bamboo Storage Basket" with published title/description
4. Tap product → view detail page (shows version, materials, published date)
5. Tap "Ask a Question" → enter message → send
6. Inquiry created, pinned to catalog version 1
7. Tap "My Inquiries" → see sent inquiry with status "NEW"

---

## 11. AI Processing and Proposal Review (Detail)

**Deterministic Provider Behavior (Development Only):**
- Same transcription → same proposals
- Proposals derived from transcription + current product snapshot
- Categories: "basketry", "woodworking", "pottery", "textiles", "jewelry", "candles", "leatherwork", "millinery"
- Materials extracted from transcription nouns
- Description expands transcription into full sentences
- Confidence scores: 0.7–0.95
- Risk levels: NONE, LOW, MEDIUM, HIGH based on field completeness

**Review Surface Shows:**
- Current canonical value (or "not set")
- Proposed value from AI
- Provenance: provider, model, prompt/schema/pipeline versions
- Staleness indicator (if product changed since AI ran)
- Decision buttons: ACCEPT / EDIT / REJECT

---

## 12. Approval and Publication (Detail)

**Approval Rules:**
- All AI proposals must be decided (no PENDING)
- No missing publish-blocking fields (title, description, category)
- Owner-only authorization (RLS enforced)

**Publication Rules:**
- Product must be APPROVED
- Creates immutable `catalog_versions` row
- Idempotent — same idempotency key converges
- Version number increments on re-publish after returning to REVIEW_REQUIRED

---

## 13. Buyer Discovery and Inquiry (Detail)

**Discovery Search:**
- Searches published title, description, category (lowercased, trigram GIN index)
- Materials NOT searched (immutable snapshot only)
- LIKE metacharacters (`_`, `%`) escaped → literal match
- Results ordered: newest published first, product_id tiebreaker
- Pagination: limit/offset, total count, hasMore flag

**Inquiry Rules:**
- Only against PUBLISHED products
- Pinned to `catalog_version` at time of inquiry
- Per-buyer idempotency key deduplication
- Message length ≤ 2000 characters (enforced in DB)
- Buyer sees only own inquiries (RLS)
- Artisan sees inquiries on their products (future)

---

## 14. Common Startup and Network Problems

| Problem | Cause | Resolution |
|---------|-------|------------|
| `docker: command not found` | Docker Desktop not running | Start Docker Desktop app |
| `Container name already in use` | Previous run didn't clean up | `docker rm artisan-marketplace-storage` |
| `Hyperdrive connection string not set` | Env var missing | Set `$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` |
| `ECONNREFUSED 127.0.0.1:55432` | Postgres not ready | Wait for `(healthy)` status, check `docker logs` |
| `wrangler dev` fails to bind | Port 8787 in use | Kill existing process or change port |
| Mobile can't reach API | `EXPO_PUBLIC_API_URL` wrong | Use `http://10.0.2.2:8787` (Android emulator) or ngrok tunnel |
| `pg_trgm` extension missing | Migration 007 not applied | Run migration 007 |
| RLS "FORBIDDEN" on review | Wrong actor ID | Ensure `app.current_actor_id` matches product owner |

---

## 15. Recovery and Troubleshooting

**Reset local database completely:**
```powershell
docker compose -f infra/docker/local-compose.yml down -v
docker compose -f infra/docker/local-compose.yml up -d
# Re-apply migrations and re-seed
```

**Reset mobile local storage (Expo):**
```powershell
cd apps/mobile
npx expo start --clear
# Or uninstall/reinstall app on device/emulator
```

**View API logs:**
```powershell
# Wrangler dev output shows request logs
# For queue consumer logs, check wrangler dev output when jobs process
```

**View PostgreSQL logs:**
```powershell
docker logs artisan-marketplace-postgres --tail 100
```

**Verify migrations applied:**
```sql
SELECT * FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

**Verify RLS policies:**
```sql
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

---

## 16. Known Limitations

| Limitation | Status | Notes |
|------------|--------|-------|
| Deterministic AI provider only | Development only | Production needs real provider integration |
| No push notifications | Future | Inquiry responses, sync status |
| Single artisan per product | By design | Co-authorship not in MVP |
| No image optimization pipeline | Future | RustFS stores originals |
| Web mobile only via Expo web | Partial | Native builds need Xcode/Android Studio |
| No payment/checkout | Out of scope | Market-linkage only in MVP |
| Buyer can't see inquiry replies | Future | Artisan response flow not built |
| No product categories taxonomy | Future | Free-text category field |
| Offline queue persistence | Implemented | SQLite-backed, survives app restart |

---

## 17. Exact Steps to Demonstrate Tomorrow

### Pre-Demo Setup (5 minutes before)
```powershell
# 1. Start Docker stack
docker compose -f infra/docker/local-compose.yml up -d

# 2. Wait for postgres healthy (check docker ps)
# 3. Apply migrations (if fresh DB)
# ... run all 7 migration files as in Section 8

# 4. Seed demo data
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = 'postgresql://artisan_marketplace:artisan_marketplace_dev@localhost:55432/artisan_marketplace_dev'
npx tsx scripts/seed-demo.ts
# Note the printed Artisan ID and Buyer ID

# 5. Start API
cd apps/api
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = 'postgresql://artisan_marketplace:artisan_marketplace_dev@localhost:55432/artisan_marketplace_dev'
npx wrangler dev
# Keep this terminal open

# 6. Start Mobile (new terminal)
cd apps/mobile
npx expo start
# Press 'w' for web demo, or use Expo Go on phone
```

### Demo Script (10 minutes)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open mobile web, login as **Artisan** (use seeded Artisan ID) | Home screen shows "Create Product" |
| 2 | Tap "Hand-carved Wooden Spoon Set" (has AI proposals) | Review screen with 4 PENDING proposals |
| 3 | Accept Description, Accept Category, Edit Title → "Olive Wood Spoon Set (3pc)", Reject Materials | All proposals decided, "Approve" enabled |
| 4 | Tap "Approve" → confirm | Product state → APPROVED |
| 5 | Tap "Publish" → confirm | Product state → PUBLISHED, version 1 created |
| 6 | Logout, login as **Buyer** (use seeded Buyer ID) | Discover screen |
| 7 | Search "spoon" | Finds "Olive Wood Spoon Set (3pc)" |
| 8 | Tap product → view detail | Shows published title, description, version 1, materials |
| 9 | Tap "Ask a Question" → "What's the length of the stirring spoon?" → Send | Inquiry created, status NEW |
| 10 | Tap "My Inquiries" | Shows the sent inquiry |
| 11 | (Optional) Switch to Artisan → view inquiries on product | Future: artisan sees buyer questions |

### Key Talking Points
- **Offline-first**: Capture works without network; sync is explicit
- **Idempotency**: Retry-safe at every layer (draft, media, AI job, publish, inquiry)
- **Human-in-the-loop**: AI proposes, human decides, audit trail preserved
- **Immutable versions**: Published snapshot never changes; edits create new versions
- **RLS enforcement**: Every query scoped to authenticated actor
- **Deterministic AI**: Same input → same output for reliable demos/tests

---

## 18. Quick Reference: Demo Data IDs (from last seed run)

```
Artisan:  9a451396-ae8a-4f96-91d7-30db0fe2e615
Buyer:    067e5cc8-c94a-4214-9047-407677778bb6
Buyer #2: ab4e48fb-fb0f-425c-acdc-ee831e00b637

Published:
  Bamboo Storage Basket:        aa8fac7c-a204-47cb-b352-315f7e98104f
  Ceramic Mug Set (4pc):        ae6ce0eb-100c-4c4b-860d-f9cc326f0edd
  Macramé Wall Hanging:         8f314a25-ecd0-48f5-8129-a311fa9973eb

AI Proposals Awaiting Review:
  Hand-carved Wooden Spoon Set: d0741560-27e5-49b9-b2fd-28698ae0a155
  AI Job:                       66ccb60e-1f28-4288-ba02-edfe30c28118

Inquiries:
  On Bamboo Basket (buyer)
  On Ceramic Mugs (buyer #2)
  On Wall Hanging (buyer)

Drafts (artisan-only):
  Leather Journal Cover
  Silver Pendant Necklace
  Beeswax Candle Set
```

*Run `npx tsx scripts/seed-demo.ts` again for fresh IDs.*