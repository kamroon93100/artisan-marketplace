# Artisan Marketplace — Master Project Bible

**System & Frontend Design Blueprint · Q&A Encyclopedia · Judge Presentation Pack**

| | |
|---|---|
| Repository | `artisan-marketplace` |
| Document | `docs/PRESENTATION_AND_ARCHITECTURE_BIBLE.md` |
| Basis | Read-only inspection of the repository at the time of writing |
| Audience | Judges, technical reviewers, and the two-person presenting team |
| Status legend | **VERIFIED** = observed in source/config this audit · **DECLARED** = stated by a repo document · **GAP** = explicitly not implemented or not exercised |

> **Evidence rule used throughout this document.** Every structural claim below is traceable to a file that was opened, or to a route registration that was read. Where a repository *document* makes a claim that was not independently re-run (for example "the AI pipeline is feature-complete"), it is labelled **DECLARED** and not promoted to **VERIFIED**. No command in this audit was a test run; nothing here is evidence that a suite passed.

---

## 0. Reading this document

- **Section 1** is the inventory: every directory, what it is for, what it depends on.
- **Section 2** is the machine: topology, request path, offline sync, media, AI, publish, discovery, data model.
- **Section 3** is the human interface: screens, tokens, journeys, accessibility, and a ranked polish plan.
- **Section 4** explains ten concepts from first principles, so a judge can probe any of them.
- **Section 5** is the Q&A encyclopedia — 30 questions with answers that stay inside the evidence.
- **Section 6** is the presentation itself: slides, a timed script, the live-demo runbook, the fallback, and the checklist.

Two presenters are assumed. The script in §6.2 is split **A** and **B** and totals roughly 540 spoken words (~3 min 50 s at a calm 140 wpm).

---

## 1. Complete file-by-file & module-by-module inventory

### 1.0 Repository shape

```
artisan-marketplace/
├─ apps/
│  ├─ api/          Cloudflare Worker + Hono backend
│  └─ mobile/       Expo / React Native client (Android-first)
├─ packages/
│  ├─ contracts/    Shared type + state vocabulary (the only populated package)
│  ├─ config/       Placeholder
│  └─ utils/        Placeholder
├─ infra/
│  ├─ docker/       Local Postgres + S3-compatible storage
│  ├─ database/     Least-privilege role provisioning
│  └─ migrations/   001–011 SQL, applied in order
├─ docs/
│  ├─ adr/          001–011 architecture decision records
│  ├─ architecture/ Seven cross-cutting contracts
│  ├─ specs/        first-vertical-slice.md
│  ├─ agent/        Execution / task / review / evidence templates
│  └─ MVP_DEMO_GUIDE.md
├─ scripts/         20 PowerShell + TypeScript operational scripts
├─ tests/           12 runtime suites (Postgres, RLS, isolation, journeys)
├─ AGENTS.md        Operating contract (precedence, invariants, verification)
├─ CONTEXT.md       Domain context and actor model
├─ README.md        Setup + known limitations
├─ IMPLEMENTATION_PLAN.md, AI_PIPELINE_AUDIT_REPORT.md, M8_MIGRATION_009_DESIGN_REPORT.md
└─ package.json, pnpm-workspace.yaml, tsconfig.json, .graphifyignore
```

**Dependency direction (enforced by convention, not by a build rule):**

```
apps/mobile ──┐
              ├──► packages/contracts (types + state vocabulary)
apps/api   ───┘
     │
     ├──► infra/migrations  (schema the API assumes)
     └──► Cloudflare: Hyperdrive → Postgres, R2/S3, Queues, Workers AI, Durable Objects
```

`packages/contracts` is imported by both sides; `packages/config` and `packages/utils` are currently inert (see 1.2). There is **no** shared runtime code between the client and the server beyond types — which is deliberate: a shared *type* cannot drift, a shared *implementation* can.

---

### 1.1 Root configuration

| Path | Plain-English analogy | Technical responsibility | Depends on |
|---|---|---|---|
| `package.json` | The building's front desk | Workspace root. `packageManager: pnpm@11.9.0`. Scripts: `check`, `test`, `typecheck` (all fan out with `pnpm -r`), `verify:mobile` → `scripts/verify.ps1`, `verify` → `verify:mobile`. Only devDependency is `tsx`. | pnpm |
| `pnpm-workspace.yaml` | The list of offices in the building | Declares the workspace so `apps/*` and `packages/*` share one lockfile and one install. | pnpm |
| `tsconfig.json` | The shared grammar rulebook | Base TypeScript settings inherited by each package's own `tsconfig`. | TypeScript |
| `AGENTS.md` | The site safety code | Rule precedence (safety → user requirement → AGENTS → specs/ADRs → skills), product invariants (offline-first, AI trust boundary, state separation, idempotency, media direct-to-object-store), verification contract, operational safeguards (two attempts per diagnostic; no destructive cleanup). | — |
| `CONTEXT.md` | The product's dictionary | Domain context: the nine-step vertical slice, the two actors (Artisan, Buyer), and the statement that the slice is the anchor for scope. | — |
| `README.md` | The visitor's guide | Setup, commands, and the authoritative **known-limitations** list: Android-only (web not working), AI/voice pipeline not exercised in final verification, demo accounts created by in-app registration. | — |
| `IMPLEMENTATION_PLAN.md` | A pre-flight checklist | Dependency-ordered plan for production blockers (Hyperdrive config, non-owner DB role, provider credentials). Treat as a to-do document, not as proof any item is done. | — |
| `AI_PIPELINE_AUDIT_REPORT.md` | A prior inspection report | **DECLARED** read-only assessment of the AI module (two providers, four-stage validation, retry/dead-letter, review integration). Useful for depth; not re-verified here. | — |
| `M8_MIGRATION_009_DESIGN_REPORT.md` | A design note | Rationale and final schema for durable refresh-grant history: one active grant per session, rotation chain via `rotated_to`, `token_hash` unique index. | — |
| `.graphifyignore` | A "do not photograph" list | Excludes `.agents/`, `.opencode/`, `graphify-out/`, editor dirs, `*.log` from the knowledge graph. | — |

---

### 1.2 `packages/`

| Path | Analogy | Responsibility | Depends on |
|---|---|---|---|
| `packages/contracts/src/index.ts` | The shared dictionary's table of contents | Re-exports the six contract modules. | the six modules |
| `packages/contracts/src/catalog/catalog.ts` | Product vocabulary | `PRODUCT_STATES` (nine values), create/get/update/transition/publish/version DTOs. | — |
| `packages/contracts/src/media/media.ts` | Attachment vocabulary | `MEDIA_KINDS`, remote media states, upload descriptor shape. | — |
| `packages/contracts/src/ai/ai.ts` | Machine-work vocabulary | AI job states, failure codes, proposal field kinds, decision vocabulary. | — |
| `packages/contracts/src/review/review.ts` | Human-gate vocabulary | Blocking reasons and the review suggestion projection (kept distinct from `AiProposal`, per ADR-009). | — |
| `packages/contracts/src/discovery/discovery.ts` | Buyer-facing vocabulary | Published product projection, search page shape. | — |
| `packages/contracts/src/inquiry/inquiry.ts` | Buyer-message vocabulary | Inquiry status, create/list shapes. | — |
| `packages/contracts/package.json` | The package's ID card | `type: module`, `exports: ./src/index.ts`, scripts `check`/`typecheck`/`test` — **`test` is `echo "Contract tests not created yet"`**. | TypeScript 6.0.3 |
| `packages/config/src/index.ts` | An empty labelled drawer | One comment: shared configuration primitives *will* live here. **GAP: no implementation.** | — |
| `packages/utils/src/index.ts` | A second empty drawer | One comment: deterministic shared utilities *will* live here. **GAP: no implementation.** | — |

**Why this matters for judging:** the shared-contract idea is real and load-bearing, but only in `packages/contracts`. Do not claim a populated shared-utility layer. The honest framing is: *"we created the seams, and deliberately left two of them empty rather than filling them with speculative code."*

---

### 1.3 `apps/api` — the Worker

#### 1.3.1 Entry points and configuration

| Path | Analogy | Responsibility | Depends on |
|---|---|---|---|
| `src/worker.ts` | The building's power inlet | Module Worker default export `{ fetch, queue, scheduled }`. Statically imports `argon2.wasm` and `blake2b.wasm`, registers them via `registerPrecompiledArgon2Modules` **before** the first request, re-exports `AuthRateLimiterDurableObject`. Exists because Cloudflare forbids runtime Wasm codegen. `queue` validates each message with `validateQueueMessage`, then `getAiServices(env, payload.ownerId).pipeline.run(...)`; invalid messages call `message.retry()` so the queue's retry/DLQ policy handles them. `scheduled` runs the outbox dispatcher and deliberately swallows errors so the cron keeps firing. | `src/index.ts`, wasm binaries, AI composition |
| `src/index.ts` | The reception desk | Builds the `Hono<ApiEnv>` app. Global middleware stamps `requestId` (from `x-request-id` or `crypto.randomUUID()`) and `correlationId` (from `x-correlation-id`, defaulting to the request id) into `requestContext`, then echoes both as response headers. `app.onError` maps `AppError.code` → 404/403/401/400/409/429/503/500 and everything else → 500 `INTERNAL_ERROR` with a generic message. `/health` is registered **before** the mounts, deliberately. | all seven module routers |
| `wrangler.jsonc` | The utility contract | `main: src/worker.ts`; `compatibility_date: 2026-09-18`; `nodejs_compat` (node-postgres needs TCP/TLS built-ins); Hyperdrive binding `HYPERDRIVE` id `934099e222e3407fa7af9e66a211d0ba`; Workers AI binding `AI`; Queue producer + consumer on `ai-job-queue` (batch 10, timeout 5 s, `max_retries: 3`, DLQ `ai-job-queue-dlq`); cron `* * * * *`; Durable Object binding `AUTH_RATE_LIMITER` → `AuthRateLimiterDurableObject` with SQLite migration tag `v1-auth-rate-limiter`. **No connection string is embedded.** | Cloudflare account resources |
| `wrangler-config.test.ts` | A lock on the utility contract | Asserts the Worker entry is `src/worker.ts`, that no `postgres://` URI or `localConnectionString` is committed, and that the expected bindings exist. Runs in the fast verification path. | `wrangler.jsonc` |

**Route mounts, in registration order (VERIFIED):**

```
GET  /health                          public in every environment
     /  ─────────────► authRoutes      /v1/auth/register | login | refresh | logout
     /catalog ───────► catalogRoutes   /products ...
     /catalog ───────► mediaRoutes     /products/:id/media, /media/:id/upload-*
     /catalog ───────► aiRoutes        /products/:id/ai-jobs, /ai-jobs/:jobId...
     /catalog ───────► reviewRoutes    /products/:id/review, /review/approve
     /discovery ─────► discoveryRoutes /products, /products/:productId
     /  ─────────────► inquiryRoutes   /inquiries, /inquiries/:inquiryId
```

**Why `/health` is first — the single best "we thought about operations" detail in the repo:** `authRoutes` and `inquiryRoutes` are both mounted at `/`, so their `*` middleware runs on *every* path. The inquiry mount resolves an actor before any handler. In a deployed Worker (no development seam) a health probe registered later would be answered `401 UNAUTHENTICATED` — an unmonitorable service. Registering the handler first ends the chain, so health stays public everywhere. This is documented in-source as "load-bearing rather than cosmetic."

#### 1.3.2 `src/shared` — cross-cutting

| Path | Analogy | Responsibility |
|---|---|---|
| `shared/auth/session.ts` | The ID check at the door | `requireActor` / `requireActorSync`. Resolves the actor from the session, never from the request body. Distinguishes `401` (no/invalid credential) from `503` (session infrastructure unavailable), and documents the development seam policy. |
| `shared/context/api-env.ts` | The socket list | `ApiEnv` = `{ Bindings, Variables }`: Hyperdrive, AI, Queue, Durable Object, env strings, and `requestContext`. |
| `shared/context/request-context.ts` | The visitor's badge | `ActorContext` (`actorId`, `roles`, `authenticated`) and `RequestContext` (`requestId`, `correlationId`, `actor`). Default actor is `anonymous`. |
| `shared/errors/app-error.ts` | The standard complaint form | `AppError` with a closed `ErrorCode` set (`NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`, `VALIDATION_FAILED`, `CONFLICT`, `RATE_LIMITED`, `DEPENDENCY_FAILED`, `TRANSIENT_FAILURE`, `INTERNAL_ERROR`) and `UnauthenticatedReason`. |
| `shared/persistence/database.ts` | The "any database" socket | `Database`, `SqlExecutor`, `Transaction` interfaces — the seam every repository codes against. |
| `shared/persistence/postgres-database.ts` | The Postgres adapter | `PostgresDatabase`, plus `PostgresDatabase.forActor(conn, actorId)` which opens a transaction and calls `set_config('app.actor_id', $1, true)` — **transaction-local**, so the RLS actor cannot leak to the next request on a pooled connection. |
| `shared/persistence/postgres-connection.ts` | The address resolver | `resolvePostgresConnectionString(env)` — one place that decides whether there is a database at all. |
| `shared/ratelimit/rate-limit-middleware.ts` | The queue ticket dispenser | `enforceRateLimit` + `rateLimitMiddleware`, per-actor operation keys via `buildOperationKey`, `RATE_LIMITED` → 429. Backed by in-memory (dev), SQLite, and Durable Object implementations. |

#### 1.3.3 Modules

Every module follows the same internal shape — `domain/` (pure rules), `application/` (use cases + ports), `infrastructure/` (adapters), `composition.ts` (the only place dependencies are chosen), `http.ts` (boundary validation), `index.ts` (exports), plus colocated tests.

| Module | Analogy | Domain / application | Infrastructure | HTTP surface (VERIFIED) |
|---|---|---|---|---|
| **identity** | Passport office | `domain/{session,roles,credential}`, `application/{identity-service,session-store}`, `auth-rate-limit.ts` | `postgres-session-store`, `in-memory-session-store`, `test-session-store`, `password.ts`, `argon2-driver.ts`, `argon2-modules.ts` | `POST /v1/auth/register`, `/login`, `/refresh`, `/logout` |
| **catalog** | The artisan's workbench | `domain/{catalog-state,catalog-publish}`, `application/catalog-service` | `postgres-catalog-repository` | `POST /products` · `GET /products/:id` · `PATCH /products/:id` · `GET /products/:id/versions` · `POST /products/:id/publish` · `POST /products/:id/transition` |
| **media** | The loading dock | `domain/{media-attachment,media-state,media-verification,media-object-key}`, `application/{media-service,media-repository}` | `postgres-media-repository`, `in-memory-media-repository` | `POST /products/:id/media` · `POST /media/:id/upload-authorization` · `POST /media/:id/upload-start` · `POST /media/:id/upload-completion` |
| **ai** | The drafting assistant | `domain/{catalog-ai-provider,ai-validation-pipeline,ai-proposal-staleness,ai-job,ai-input-hash,ai-error}`, `application/{ai-pipeline-service,ai-review-service,ai-repository,catalog-product-port,outbox-dispatcher,queue-consumer}` | `deterministic-catalog-ai-provider`, `openai-catalog-ai-provider`, `workers-ai-catalog-ai-provider`, `postgres-ai-repository`, `catalog-service-port` | `POST /products/:id/ai-jobs` · `GET /products/:id/ai-jobs` · `GET /ai-jobs/:jobId` · `GET /ai-jobs/:jobId/history` · `POST /ai-jobs/:jobId/run` · `POST /ai-jobs/:jobId/decisions` |
| **review** | The sign-off desk | `domain/review-readiness`, `application/{review-service,review-port}` | `catalog-review-port`, `ai-suggestions-port` | `GET /products/:id/review` · `POST /products/:id/review/approve` |
| **discovery** | The shop window | `domain/discovery-query`, `application/{discovery-service,discovery-port}` | `catalog-published-port` | `GET /products?search=&limit=&offset=` · `GET /products/:productId` |
| **inquiry** | The suggestion box | `domain/inquiry`, `application/{inquiry-service,inquiry-repository,published-product-port}` | `postgres-inquiry-repository`, `in-memory-inquiry-repository`, `catalog-published-port` | `GET /inquiries` · `GET /inquiries/:inquiryId` · `POST /inquiries` |

**Module-boundary observations worth defending:**

- There is **no `sync` module**. Product synchronisation is `POST /catalog/products` + `PATCH /catalog/products/:id` with an `Idempotency-Key`. A separate sync module would have duplicated catalog rules for no gain.
- **Review is separately composed and separately mounted** even though it shares the `/catalog` URL prefix. The in-source comment is explicit: *"a shared URL prefix is not a module dependency, and the prefix says where the product lives, not who owns the rule about it."* That is the cleanest articulation of the boundary in the codebase.
- Cross-module reads go through **ports** (`CatalogProductPort`, `PublishedProductPort`, `ReviewPort`, `AiSuggestionsPort`), never through another module's repository or table. This is what makes the in-memory and Postgres adapters interchangeable in tests.
- `GET /catalog/products/:id` deliberately uses `getOwnedById` rather than the module's internal unscoped lookup, because the internal one would let any authenticated actor read another artisan's draft by guessing an id.

**Provider selection is fail-closed (VERIFIED in `ai/composition.ts`):**

| `APP_ENV` | Behaviour |
|---|---|
| `development` / `test` | Deterministic fixture provider; in-memory repository permitted. |
| `production` / `staging` / `preview` | `AI_PROVIDER=workers-ai` → requires `AI` binding; `AI_PROVIDER=openai` → requires `OPENAI_API_KEY`; unset → prefer Workers AI, else OpenAI, else throw `DEPENDENCY_FAILED`. |
| anything else | Throw `DEPENDENCY_FAILED` — no silent fallback. |

The same function refuses the in-memory repository outside dev/test, on the stated grounds that *"a deployment that loses every job looks healthy until the work vanishes."* The deterministic provider is refused in production because *"a stub that answers instead of calling a real provider would make the product look assisted while nothing was being generated."*

---

### 1.4 `apps/mobile` — the client

#### 1.4.1 Routing (`src/app/`)

| Path | Analogy | Responsibility |
|---|---|---|
| `_layout.tsx` | The front door | `ThemeProvider` → `AuthProvider` → `AuthGate` (sign-in screen when no session) → `AppTabs`. The gate sits *between* the two halves: a device with a session sees the app, one without sees sign-in. |
| `components/app-tabs.tsx` | The two hallways | `NativeTabs` with exactly two triggers: `(home)` → "Home", `explore` → "Explore", using template-rendered PNG icons and theme-derived colours. |
| `(home)/_layout.tsx`, `(home)/index.tsx` | The workbench | Home: owner-scoped draft list, "Create Product", "Continue your latest draft", the `/inquiries` action, signed-in identity, sign-out. Clears draft state immediately on account switch so one account's work is never shown while another's is loading. |
| `(home)/inquiries/_layout.tsx`, `index.tsx` | The sent-mail folder | Renders `InquiryHistory`. |
| `explore/_layout.tsx`, `explore/index.tsx` | The shop window | Tab root rendering `DiscoveryScreen` **without** a back affordance. |
| `explore/discovery/index.tsx`, `explore/discovery/[productId].tsx` | The shop window, pushed | Same list *with* back affordance; detail route by `productId`. |

The "one list implementation, two presentations" decision is asserted by a test (`discovery-display.test.ts`) rather than left to convention.

#### 1.4.2 Features (`src/features/`)

| Path | Analogy | Responsibility |
|---|---|---|
| `auth/AuthScreen.tsx` | The door | One screen, two explicit modes (sign in / create account). Never sends a role — the server assigns `BUYER` and artisan permission remains a server decision. Never logs a credential. Never distinguishes unknown-username from wrong-password, because the server does not. |
| `auth/auth-state.ts` | The door's rulebook | React-free state machine: restore → validate access → rotate refresh → signed-out-with-actionable-message. Sign-out always clears the device even if the server is unreachable. |
| `auth/session-provider.tsx` | The door's wiring | Installs the session client before any request; restores before the app is shown; a build with no API URL fails loudly here rather than presenting a sign-in that cannot succeed. |
| `capture/CreateProductScreen.tsx` | The workbench surface | Draft load, photo, voice, save, sync, progress, retry, review entry. Coordinates `draft-sync`, `product-sync`, `media-sync`, `ai-job-enqueue`. |
| `capture/PhotoCapture.tsx` | The camera | `expo-image-picker`, camera **and** library, quality 0.8, no forced edit. Permission denial simply returns. |
| `capture/VoiceRecorder.tsx` | The microphone | `expo-audio` high-quality preset, `document` directory, record/prepare/stop/playback via `useAudioPlayer`. |
| `capture/DraftStatus.tsx` | The status lamp | Human-readable state; live byte progress so an upload is distinguishable from a stall; `formatPercent` clamps 0–100 and falls back to the word "Uploading" when total bytes are unknown. |
| `capture/draft-sync.ts` | The foreman | Sequences: list media → retry outstanding operations → sync products → sync media (with progress) → enqueue AI job → refresh. All dependencies injected, so it runs in Node tests. |
| `discovery/DiscoveryScreen.tsx` | The shop window | Paged search over published products, server message preserved verbatim on failure, retry affordance, back affordance only when pushed. |
| `discovery/ProductDetailScreen.tsx` | The object label | Published version, materials, published date, inquiry composer entry. |
| `discovery/discovery-display.ts` | The label printer | `describeDiscoveryFailure` (server message verbatim; unknown errors retryable), `formatPublishedAt`, `showsBackAffordance`. |
| `inquiry/InquiryComposer.tsx` | The question card | Buyer never named; identity from session. One composition attempt = one idempotency key, so a retry after a dropped response converges. Length validated as typed. Send disabled in flight. |
| `inquiry/InquiryHistory.tsx` | The sent-mail list | Buyer-scoped read, newest first; asks for no buyer id and shows only what the server returned. |
| `inquiry/inquiry-navigation.ts` | The signpost | `INQUIRY_HISTORY_ROUTE = '/inquiries'` in one place, with a test asserting the action and the route constant agree. |
| `review/ReviewProductScreen.tsx` | The sign-off desk | Renders current vs proposed per field, provenance, staleness, and ACCEPT/EDIT/REJECT. Approve is only reachable when every proposal is decided. |
| `review/review-decision.ts` | The sign-off rulebook | React-free: an edit sends the artisan's own value (not the model's), list-valued fields stay lists, typed values survive a failed request. Explicitly states there is no decision here the server has not already authorised. |

#### 1.4.3 Storage, sync, network, security

| Path | Analogy | Responsibility |
|---|---|---|
| `storage/database.ts` | The local filing cabinet | `expo-sqlite`, DB `artisan-marketplace.db`, `PRAGMA journal_mode = WAL`, idempotent `CREATE TABLE IF NOT EXISTS`. `requireLocalOwnerId` **throws** on a blank owner — an empty owner must never be written, because a query for one account could otherwise match unowned rows. |
| `storage/product-drafts.ts` | The draft folder | `LOCAL_PRODUCT_STATES = LOCAL_ONLY \| PENDING_SYNC \| ACTION_REQUIRED \| SYNCED`; create/list/update, `setLocalProductRemoteId`. |
| `storage/media-intents.ts` | The attachment folder | `LOCAL_MEDIA_STATES`, `SYNC_OPERATION_STATES = PENDING \| IN_FLIGHT \| ACKED \| ACTION_REQUIRED`, and `REMOTE_MEDIA_STATES` mirroring the server vocabulary so local and remote never disagree about what happened. |
| `storage/sync-operations.ts` | The dispatch ledger | Claim, heartbeat, retry-with-backoff, mark-acknowledged, mark-action-required, recover stale in-flight operations, redeclare media intent, record remote progress. |
| `sync/product-sync.ts` | The outbox for products | Iterates `PENDING_SYNC` drafts without a remote id; `idempotencyKey = product:${localId}`; success stores the remote id; failure classifies retry vs action-required. |
| `sync/media-sync.ts` | The outbox for bytes | Five-attempt bounded loop; claim → authorize → upload bytes → complete → verify; heartbeat to prove liveness; stale recovery; retry classification. |
| `sync/byte-uploader.ts` | The pipe to the loading dock | A port, not an implementation: bytes go **straight to object storage** with a short-lived single-object URL and never through the application server. Exists so the pipeline is testable without a filesystem. |
| `sync/local-file-size.ts` | The scale | The declared size is a claim; the file is the only authority. `null` means "unknown", never "zero" — an unmeasurable file is not evidence the declaration is wrong. |
| `sync/upload-outcome.ts` | The verdict | 2xx is success; every other status is failure. `401`/`403` are recoverable because the next attempt obtains a fresh authorization. Free of native imports so it is verifiable without a device. |
| `network/auth-transport.ts` | The passport courier | Register/login/refresh/logout; persists the session on success (a sign-in that cannot be stored is a failed sign-in). |
| `network/authorization.ts` | The badge holder | Installs the session client once so the `Authorization` header is correct from the first request. |
| `network/product-sync-transport.ts` + `product-sync-contract.ts` | Product courier | Typed create/update calls with `Idempotency-Key`. |
| `network/media-sync-transport.ts` | Media courier | Create attachment, authorize, complete; classifies failures for the sync loop. |
| `network/discovery-transport.ts` | Window shopper | Search + detail, with `DISCOVERY_PAGE_SIZE_DEFAULT/MAX` and `DISCOVERY_SEARCH_MAX_LENGTH`. |
| `network/inquiry-transport.ts` | Message courier | List/get/create with idempotency. |
| `network/review-transport.ts` + `review-contract.ts` | Sign-off courier | Fetch review surface, apply decisions, approve. |
| `network/ai-job-enqueue-transport.ts` | Draft-request courier | Enqueue with `Idempotency-Key` and a media reference list. |
| `network/expo-file-byte-uploader.ts` | The actual pipe | Native upload implementation; resolves for **any** completed HTTP response, which is exactly why `upload-outcome.ts` exists. |
| `network/expo-file-size-probe.ts` | The actual scale | Native file-size measurement. |
| `security/session-storage.ts` | The safe | Secure storage for the session pair. |
| `security/redact-secrets.ts` | The shredder | Removes credentials/URLs from messages before they reach logs or durable error fields. |
| `constants/theme.ts` | The paint swatches | Five colour roles in light and dark, six-step spacing scale, platform font map, tab inset, max content width. |
| `config/api.ts` | The address book | `EXPO_PUBLIC_API_URL` read at **call time**; blank throws a configuration fault. |
| `hooks/use-theme.ts`, `use-color-scheme.ts` (+`.web`) | The light switch | Theme resolution; web variant exists but the web target is not supported. |
| `components/themed-text.tsx`, `themed-view.tsx` | The house style | Semantic wrappers over RN `Text`/`View`. |
| `components/hint-row.tsx`, `external-link.tsx`, `web-badge.tsx`, `ui/collapsible.tsx`, `animated-icon.tsx` (+`.web`), `app-tabs.tsx` (+`.web`) | Furniture | Small shared primitives. The `.web` twins are evidence that a web target was attempted, not that it works. |
| `types/css.d.ts`, `global.css` | Import plumbing | Lets the theme import a CSS file under the bundler. |

---

### 1.5 `infra`

| Path | Analogy | Responsibility |
|---|---|---|
| `docker/local-compose.yml` | The local utility room | Postgres 16 on host port **55432** and an S3-compatible store (RustFS) on **9000/9001**, per the demo guide. |
| `database/app-role.sql` | The key cabinet | Creates `artisan_marketplace_app`: `NOLOGIN`, `NOSUPERUSER`, **`NOBYPASSRLS`**, `NOCREATEDB`, `NOCREATEROLE`, `INHERIT`. Grants exactly the API's operations: `catalog_products` S/I/U (no delete), `catalog_versions` S/I, `media_attachments` S/I/U, `ai_jobs` S/I/U, `ai_proposals` S/I/U, `ai_job_outbox` S/I/U, `inquiries` S/I, `identity_*` S/I/U. Also grants `SELECT` on `app.published_catalog_products` and `EXECUTE` on `app.current_actor_id()`. A deployment creates a separate login role, grants this group, and points Hyperdrive at it. |
| `database/README.md` | The key cabinet's instructions | Activation steps: non-owner login, `NOBYPASSRLS`, not a table owner. |
| `migrations/001_catalog/migration.sql` | The product table | `catalog_products(id uuid pk, owner_id uuid, title, description, category, materials text[] default '{}', state, created_at, updated_at, version bigint default 1)`; `CHECK` state in the nine values; indexes on `owner_id`, `state`, `updated_at`. |
| `migrations/002_media/migration.sql` | The attachment table | `media_attachments` (state machine + object key + declared size). |
| `migrations/003_catalog_idempotency.sql` | The "same request twice" table | Idempotency records for catalog operations. |
| `migrations/004_media_upload_verification.sql` | The "did the bytes arrive" columns | Upload verification fields/state. |
| `migrations/005_catalog_versions.sql` | The archive | `catalog_versions` — immutable published snapshots. |
| `migrations/006_ai_jobs_and_proposals.sql` | The drafting desk | `ai_jobs`, `ai_proposals` (with immutability trigger referenced by the RLS migration). |
| `migrations/007_inquiries_and_published_search.sql` | The shop window | `inquiries`, published-search projection, `pg_trgm` + GIN index. |
| `migrations/008_identity_accounts_and_sessions.sql` | The passport ledger | `identity_accounts`, `identity_sessions`. |
| `migrations/009_identity_refresh_grants.sql` | The rotation chain | `identity_refresh_grants` — unique `token_hash`, one unconsumed grant per session, `rotated_to` chain. |
| `migrations/010_row_level_security.sql` | The tenant walls | `app` schema; `app.current_actor_id()`; security-definer view `app.published_catalog_products`; policies for six tables. |
| `migrations/011_ai_job_outbox.sql` | The outbox | `ai_job_outbox` — the transactional-outbox table the dispatcher claims from. |

**`010` in detail, because it is the security centrepiece (VERIFIED):**

- `app.current_actor_id()` returns `null` when `app.actor_id` is absent, empty, or not a UUID. `null` makes every policy deny — **fail closed**, not "match nothing by accident".
- `app.published_catalog_products` is `security_invoker = false`, owned by the table owner, exposing only `(id, published_version, state)` for products with a published version and not `ARCHIVED`. Buyers therefore never get `SELECT` on a working product row, including unpublished edits to a published product.
- Policies: owners select/insert/update their own `catalog_products`, and insert is additionally constrained to `state = 'LOCAL_DRAFT'` and `published_version is null`; `catalog_versions` readable by owner or by anyone for the currently published version, insertable only by the owner; `media_attachments` owner-only (buyer-facing media has no disclosure model yet, so granting it would invent one); `ai_jobs` and `ai_proposals` require **both** the denormalised `owner_id` and the product's owner, so a forged row cannot point at another artisan's product; `inquiries` buyer-only select and insert, with insert requiring the product's **current published version** to match.
- Deliberate exclusions, stated in-source: no `FORCE ROW LEVEL SECURITY`; no RLS on `identity_*` (session verification happens before an actor exists); no delete policies; no reviewer or service-role policies (the current review path is the owner reviewing their own product).

---

### 1.6 `docs`

| Path | Responsibility |
|---|---|
| `adr/001-modular-monolith-boundaries.md` | Modular monolith over microservices. |
| `adr/002-canonical-state-and-ai-boundary.md` | Canonical state lives in Postgres; AI only proposes. |
| `adr/003-offline-first-sync-and-idempotency.md` | Local-first writes, explicit sync, idempotency keys. |
| `adr/004-media-upload-and-object-lifecycle.md` | Direct-to-object-store uploads, short-lived authorizations. |
| `adr/005-ai-jobs-provider-abstraction.md` | Provider behind `catalogAI.generate()`-style interfaces. |
| `adr/006-authentication-authorization-boundary.md` | Identity from session; roles are server decisions. |
| `adr/007-database-ownership-and-rls.md` | Owner-scoped rows, non-owner app role, fail-closed actor setting. |
| `adr/008-events-outbox-and-queue-boundary.md` | Transactional outbox; queue is transport, not truth. |
| `adr/009-api-contract-and-versioning.md` | Boundary validation before business logic; versioned contracts. |
| `adr/010-verification-and-testing-strategy.md` | Fast unit path + Postgres runtime path. |
| `adr/011-repository-layout-and-module-implementation.md` | The `domain/application/infrastructure/composition/http` layout. |
| `architecture/architecture-baseline.md` | The system's shape and invariants. |
| `architecture/sync-contract.md` | What "synced" means and who decides. |
| `architecture/ai-contract.md` | The AI trust boundary and validation stages. |
| `architecture/auth-and-session-contract.md` | Token lifecycle and actor resolution. |
| `architecture/data-and-rls-contract.md` | Ownership, policies, and the activation gap. |
| `architecture/module-boundaries.md` | What each module may know about another. |
| `architecture/security-privacy-observability-contract.md` | Logging rules, redaction, correlation ids. |
| `specs/first-vertical-slice.md` | The nine-step slice this repository is built around. |
| `agent/{execution-protocol,task-template,review-template,evidence-template}.md` | The durable agent workflow: contract → context → implement → verify → review → evidence → human-controlled finish. |
| `MVP_DEMO_GUIDE.md` | Demo topology, prerequisites, migration order, seed script, 10-minute demo table, troubleshooting, known limitations. |

---

### 1.7 `scripts`

| Script | Purpose |
|---|---|
| `verify.ps1` | **The gate.** Eight steps: mobile `tsc --noEmit`; mobile `eslint .`; api `tsc --noEmit`; `wrangler deploy --dry-run`; contracts `tsc`; config `tsc`; utils `tsc`; then 74 named suites via `tsx` against `tests/m2-media-upload/tsconfig.json`. Preflights that all eight tools exist and that every suite path exists, then fails fast. |
| `start-api.ps1` | API startup helper. |
| `seed-demo.ps1`, `seed-demo.ts` | Repeatable demo seed; prints fresh UUIDs each run. |
| `run-m5.ps1`, `run-m6.ps1` | Milestone runners. |
| `verify-m3-postgres.ps1`, `verify-m4-postgres.ps1`, `verify-m5-postgres.ps1`, `verify-m6-postgres.ps1`, `verify-m8-db-wiring-postgres.ps1`, `verify-m8-actor-isolation-postgres.ps1`, `verify-m8-unauthenticated-401-postgres.ps1`, `verify-m8-identity-migration-postgres.ps1`, `verify-m9-identity-migration-postgres.ps1`, `verify-m10-auth-postgres.ps1`, `verify-rls-postgres.ps1` | Postgres-backed runtime verification per milestone. |
| `verify-worker-auth.ps1`, `test-ratelimit-runtime.ps1` | Worker auth and Durable Object rate-limit runtime checks. |

---

### 1.8 `tests`

Twelve suites, each with its own `tsconfig.json`, several with Node shims.

| Suite | What it exercises |
|---|---|
| `m1-storage` | Local SQLite schema and draft/media/operation persistence (with `node-sqlite-test-shim.ts`). |
| `m2-account-isolation` | One account cannot see another's local records. |
| `m2-product-sync` | Product push path and idempotency. |
| `m2-media-upload` (3 suites + shim) | Media upload pipeline, storage, and end-to-end runtime. |
| `m3-catalog-lifecycle` | Draft → … → published state machine against Postgres. |
| `m4-ai-pipeline` | AI job lifecycle against Postgres. |
| `m5-review-publish` (2 suites) | Review surface + publish, and review-screen transport identity. |
| `m6-buyer-journey` | Search → detail → inquiry against Postgres. |
| `m8-actor-isolation` | Cross-actor reads/writes denied by RLS. |
| `m8-db-wiring` | Real database wiring. |
| `m8-unauthenticated-401` | Unauthenticated requests get 401, not 500. |
| `m10-auth-postgres` | Auth against Postgres. |
| `rls-policy` | Policy behaviour under a non-owner role. |
| `ratelimit-runtime` | Durable Object limiter under `wrangler` (own worker + config). |

---

### 1.9 Honest gaps (state these before a judge finds them)

| Gap | Exact status | How to defend it |
|---|---|---|
| **Web target** | `*.web.tsx` variants exist (`app-tabs.web.tsx`, `animated-icon.web.tsx`, `use-color-scheme.web.ts`), but `README.md` states web support is not working. | "We built Android-first on purpose. The web files are scaffolding, not a shipped target. Claiming otherwise would be the first thing a judge could falsify." |
| **AI + voice end-to-end** | The AI module is fully implemented and has providers, validation, outbox, queue consumer and Postgres repositories. `README.md` states the AI/voice pipeline was **not exercised** in final verification. | "The code path exists and is unit-tested; the live provider call and the real voice transcription were not part of the final verification run. That is a verification gap, not a design gap — and we would rather say so than fake it." |
| **Real transcription** | No transcription provider adapter appears in the module inventory. The enqueue route accepts an optional `transcription` field. | "Voice is captured and uploaded as media; the transcription step is the next integration. The contract already accepts a transcription so the pipeline does not need reshaping." |
| **`packages/config`, `packages/utils`** | Comment-only files; `test` scripts are `echo` stubs. | "Deliberate empty seams. We did not invent utilities before there was a second caller." |
| **Artisan inbox** | `inquiries` has buyer-only select/insert; the RLS migration states the artisan inbox does not exist yet. | "The buyer's half is complete and ownership-scoped. The artisan inbox is the next slice, and we did not fake a policy for it." |
| **RLS enforcement in a local run** | Policies exist and are `ENABLE`d, but the migration deliberately does not `FORCE` them; enforcement begins when the app connects as a non-owner `NOBYPASSRLS` login. `app-role.sql` provisions that role. | "The wall is built and the key is issued. Which role you connect as determines whether the wall is visible to you — that is how Postgres works, and we documented it rather than pretending otherwise." |
| **Demo seed IDs** | `seed-demo.ts` generates fresh UUIDs each run; the IDs printed in `MVP_DEMO_GUIDE.md` §18 are from a previous run. | Never read IDs from the guide. Read them from the seed output on the day. |
| **Stale route names in the demo guide** | `MVP_DEMO_GUIDE.md` lists `/auth/register`, `/products/drafts`, `/products/:id/sync`, `/discovery/search`. The verified mounts are `/v1/auth/register`, `/catalog/products`, `/catalog/products/:id`, `/discovery/products`. | Use the verified routes in §1.3.1. Flag the guide as stale if asked. |

---

## 2. End-to-end system architecture & data flow

### 2.1 Topology

```
                        ┌──────────────────────────────────────────┐
                        │            ARTISAN'S PHONE               │
                        │  Expo / React Native (Android-first)     │
                        │                                          │
                        │  ┌────────────────┐  ┌────────────────┐  │
                        │  │  UI (screens)  │  │ SecureStore    │  │
                        │  └───────┬────────┘  └────────────────┘  │
                        │          │                               │
                        │  ┌───────▼────────┐  ┌────────────────┐  │
                        │  │ feature logic  │  │ expo-audio     │  │
                        │  │ (React-free)   │  │ expo-image-    │  │
                        │  └───────┬────────┘  │ picker         │  │
                        │          │           └────────────────┘  │
                        │  ┌───────▼────────┐  ┌────────────────┐  │
                        │  │ sync engine    │──▶│ SQLite (WAL)   │  │
                        │  │ product/media  │◀──│ drafts, media, │  │
                        │  └───────┬────────┘  │ sync ops       │  │
                        │          │           └────────────────┘  │
                        └──────────┼───────────────────────────────┘
                                   │ HTTPS  (Bearer token)
                                   ▼
        ┌──────────────────────────────────────────────────────────────┐
        │                  CLOUDFLARE WORKER (Hono)                    │
        │  requestContext (requestId, correlationId, actor)             │
        │                                                              │
        │  /v1/auth/*   /catalog/*   /discovery/*   /inquiries   /health│
        │      │            │             │             │              │
        │  identity      catalog        discovery     inquiry          │
        │                media            │             │              │
        │                ai ──────────────┘             │              │
        │                review                         │              │
        │      │            │             │             │              │
        │  DurableObject  PostgresDatabase.forActor(actorId)           │
        │  rate limiter        │  set_config('app.actor_id', …, true)   │
        └──────────────────────┼───────────────────────────────────────┘
                               │ Hyperdrive (pooled)
                               ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  POSTGRESQL 16        RLS: owner_id = app.current_actor_id() │
        │  catalog_products · catalog_versions · media_attachments     │
        │  ai_jobs · ai_proposals · ai_job_outbox · inquiries           │
        │  identity_accounts · identity_sessions · identity_refresh_grants
        └──────────────────────────────────────────────────────────────┘
                               ▲                        ▲
             outbox claim / publish            presigned PUT
                               │                        │
        ┌──────────────────────┴──────┐      ┌──────────┴─────────────┐
        │  CLOUDFLARE QUEUE           │      │  OBJECT STORAGE        │
        │  ai-job-queue (retry 3)     │      │  RustFS / R2 / S3      │
        │  ai-job-queue-dlq           │      │  originals only        │
        └──────────────┬──────────────┘      └────────────────────────┘
                       │ consumer
                       ▼
        ┌──────────────────────────────────────────────┐
        │  AI PIPELINE                                 │
        │  provider: Workers AI | OpenAI | deterministic│
        │  4-stage validation → proposals (never writes │
        │  canonical product fields)                    │
        └──────────────────────────────────────────────┘
```

**The three structural promises this diagram makes:**

1. **The phone can always write.** Every user action lands in SQLite first. The network is an optimisation, not a precondition.
2. **The Worker is stateless.** All durable state is Postgres or object storage. The only stateful edge component is the rate limiter, and it is a Durable Object because a counter needs a home.
3. **Bytes bypass the Worker.** Media is authorised by the Worker and written by the phone directly to object storage. The Worker never proxies a photo.

### 2.2 Request lifecycle (every authenticated call)

```
1. Request arrives at the Worker
2. Global middleware: requestId = x-request-id ?? UUID
                      correlationId = x-correlation-id ?? requestId
                      requestContext = { requestId, correlationId, actor: anonymous }
3. Router matches a mount (/catalog, /discovery, /inquiries, /v1/auth)
4. Mount-level middleware resolves the actor from the session
      ├─ no credential / invalid  → 401 UNAUTHENTICATED
      └─ session store unreachable → 503 DEPENDENCY_FAILED
5. Handler validates the boundary BEFORE business logic
      ├─ missing/invalid field → 400 VALIDATION_FAILED (+ details.field)
      └─ missing Idempotency-Key where required → 400
6. Rate limit check (per-actor operation key)
      └─ exceeded → 429 RATE_LIMITED
7. Service call with actorId from context — never from the body
8. Repository opens a transaction and sets app.actor_id transaction-locally
9. Postgres evaluates RLS against app.current_actor_id()
      └─ no matching row → 404 NOT_FOUND (ownership failures are 404, not 403)
10. Handler returns JSON; response carries x-request-id and x-correlation-id
11. Errors: AppError.code → 404/403/401/400/409/429/503/500; unknown → 500 generic
```

**Why 404 instead of 403 for another buyer's inquiry:** a 403 confirms the row exists. A 404 leaks nothing. The route comment says this explicitly.

### 2.3 Offline-first write path (the core sequence)

```
ARTISAN                 LOCAL SQLITE                 API                  POSTGRES
   │                         │                        │                      │
   │ tap Create Product      │                        │                      │
   ├────────────────────────▶│ insert draft           │                      │
   │                         │ state = LOCAL_ONLY     │                      │
   │◀────────────────────────┤                        │                      │
   │                         │                        │                      │
   │ take photo              │                        │                      │
   ├────────────────────────▶│ media intent           │                      │
   │ record voice            │ PENDING_SYNC           │                      │
   ├────────────────────────▶│ (uri, size, type, key) │                      │
   │                         │                        │                      │
   │ tap Save / Sync         │                        │                      │
   ├────────────────────────▶│ draft → PENDING_SYNC   │                      │
   │                         │                        │                      │
   │                    ┌────┴──── network? ────┐     │                      │
   │                    │ no                    │ yes │                      │
   │                    ▼                       ▼     │                      │
   │            "Saved on device"      POST /catalog/products                │
   │            "Waiting for          Idempotency-Key: product:<localId>     │
   │             connection"          ─────────────────▶ createDraft         │
   │                                          │        ─────────────────────▶│
   │                                          │◀────── product(id, state) ────┤
   │                         ┌────────────────┘        │                      │
   │                         │ store remoteProductId   │                      │
   │                         │ state = SYNCED          │                      │
   │                         ▼                        │                      │
   │            for each media intent:                │                      │
   │            POST /catalog/products/:id/media      │                      │
   │            Idempotency-Key: media:<localId>:<kind>                      │
   │            ─────────────────▶ REQUESTED ────────────────────────────────▶│
   │            POST /catalog/media/:id/upload-authorization                 │
   │            ◀──────────── { url, headers, expiresInSeconds }             │
   │                         │                        │                      │
   │            PUT bytes ──────────────────────────────────────▶ OBJECT STORE
   │            (progress: bytesSent / totalBytes)   │                      │
   │            POST /catalog/media/:id/upload-completion                    │
   │            ─────────────────▶ verify size/type ────────────────────────▶│
   │                         │  VERIFIED              │                      │
   │            POST /catalog/products/:id/ai-jobs    │                      │
   │            Idempotency-Key: ai:<localId>         │                      │
   │            ─────────────────▶ insert ai_jobs (QUEUED)                   │
   │                              + ai_job_outbox (same transaction)         │
   │                         │                        │                      │
   │            state = REVIEW_REQUIRED when proposals exist                 │
   │◀────────────────────────┤                        │                      │
```

**Failure branches and what the artisan sees:**

| Failure | Local outcome | Visible copy | Next action |
|---|---|---|---|
| No network | draft stays `PENDING_SYNC`; ops stay `PENDING` | "Waiting for connection" | Retry when connected |
| Server 4xx (validation) | op → `ACTION_REQUIRED` with code + message | "Action needed" + server message | Artisan edits and retries |
| Server 5xx / timeout | op → `PENDING` with `nextAttemptAt` | "Uploading" or "Waiting to retry" | Automatic backoff |
| Upload 401/403 | op → retry; fresh authorization next attempt | "Uploading" | Automatic |
| Upload other 4xx | op → `ACTION_REQUIRED` | "Action needed" | Artisan re-captures |
| App killed mid-upload | `IN_FLIGHT` op recovered by stale recovery | "Uploading" on next open | Automatic resume |
| Duplicate tap / replay | same idempotency key → same row, `deduplicated: true` | unchanged | none |

### 2.4 Media upload sequence (detail)

```
phone                         worker                        object store
  │                             │                                │
  │ POST /products/:id/media    │                                │
  │ {kind, contentType, size}   │                                │
  ├────────────────────────────▶│ validate kind + required fields │
  │                             │ insert media_attachments        │
  │                             │   state = REQUESTED             │
  │◀────────────────────────────┤ 201 {attachment, deduplicated}  │
  │                             │                                │
  │ POST /media/:id/upload-authorization                          │
  ├────────────────────────────▶│ state → UPLOAD_AUTHORIZED       │
  │                             │ sign single-object PUT          │
  │◀────────────────────────────┤ {url, method, headers, ttl}     │
  │                             │                                │
  │ PUT url + exact headers     │                                │
  ├─────────────────────────────────────────────────────────────▶│ store bytes
  │◀─────────────────────────────────────────────────────────────┤ 200
  │                             │                                │
  │ POST /media/:id/upload-completion                             │
  ├────────────────────────────▶│ HEAD object; compare size/type  │
  │                             │ state → VERIFIED | ACTION_REQUIRED
  │◀────────────────────────────┤ {verified, verification}        │
```

**The security property:** the URL is a temporary credential for exactly one object. It is never logged, never stored in a durable error message, and never shown to the artisan (`media-sync-contract.ts` says so; `redact-secrets.ts` enforces the redaction).

### 2.5 AI pipeline

```
        enqueue (HTTP, actor-scoped)                cron: * * * * *
                 │                                        │
                 ▼                                        ▼
   ┌──────────────────────────┐              ┌─────────────────────────┐
   │ insert ai_jobs (QUEUED)  │              │ outbox dispatcher       │
   │ insert ai_job_outbox     │              │ claim pending events    │
   │  ── same transaction ──  │              │ publish to AI_JOB_QUEUE │
   └──────────────────────────┘              └───────────┬─────────────┘
                                                          │
                                                          ▼
                                              ┌─────────────────────────┐
                                              │ queue consumer          │
                                              │ validate message schema │
                                              │ pipeline.run(jobId,     │
                                              │   ownerId, correlation) │
                                              └───────────┬─────────────┘
                                                          ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │ 1. schema validation        (shape of provider output)               │
   │ 2. semantic/business rules  (allowed categories, field constraints)  │
   │ 3. normalization            (trim, canonical form, list handling)    │
   │ 4. quality/risk assessment  (confidence, risk level, staleness)      │
   └───────────────────────────────┬──────────────────────────────────────┘
                                   ▼
                    ai_proposals (decision = PENDING)
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
             artisan decides                 retry / partial
        ACCEPT | EDIT | REJECT              RETRYING → SUCCEEDED
                    │                     or FAILED → DEAD_LETTERED
                    ▼
        review surface + approve
```

**Invariants:**

- The provider **never** writes `catalog_products`. It returns proposals.
- Confidence is **not** approval. A `0.97` proposal still needs a decision.
- An artisan-confirmed value is never silently overwritten; a later AI run produces a *new* proposal, and staleness is surfaced rather than applied.
- The queue is transport. If it is drained, `ai_jobs` still says what happened.

### 2.6 Review → approve → publish

```
GET /catalog/products/:id/review
  → current value | proposed value | provenance (provider, model, prompt/schema/pipeline versions)
  → staleness (product changed since the job ran?)
  → readiness: every proposal decided? every blocking field present?

POST /catalog/ai-jobs/:jobId/decisions
  → ACCEPT  : canonical field takes the proposed value
  → EDIT    : canonical field takes the artisan's value (never the model's)
  → REJECT  : canonical field keeps its current value

POST /catalog/products/:id/review/approve
  → no body, by design
  → state-idempotent: 200 whether or not this call changed the state
  → `deduplicated` tells a retrying client whether its intention was carried out

POST /catalog/products/:id/publish
  → requires APPROVED
  → allocates the next immutable catalog_versions row
  → records published_by = actor
  → Idempotency-Key required
  → 201 on create, 200 on deduplicated replay
```

`POST /catalog/products/:id/transition` refuses `APPROVED` and `PUBLISHED` with `409 CONFLICT` and points at the two named operations. Reason: each is the outcome of a workflow that checks preconditions and records who authorised it; letting the generic route reach those states would publish with none of that. The refusal is repeated at the service layer, because the boundary must hold for every caller, not only HTTP ones.

### 2.7 Discovery and inquiry

```
buyer                          worker                              postgres
  │                              │                                    │
  │ GET /discovery/products?search=bamboo&limit=20&offset=0           │
  ├─────────────────────────────▶│ validate search/limit/offset       │
  │                              │ escape LIKE metacharacters (_ %)   │
  │                              │ query published projection         │
  │                              │  pg_trgm GIN, newest first,        │
  │                              │  product_id tiebreaker             │
  │◀─────────────────────────────┤ {items, total, hasMore}            │
  │                              │                                    │
  │ GET /discovery/products/:id  │                                    │
  ├─────────────────────────────▶│ read immutable published version   │
  │                              │ unpublished/archived → 404 (same   │
  │                              │ message as nonexistent)            │
  │◀─────────────────────────────┤ {product}                          │
  │                              │                                    │
  │ POST /inquiries              │                                    │
  │ Idempotency-Key: <uuid>      │                                    │
  │ {productId, message}         │  buyer from session, never body    │
  ├─────────────────────────────▶│ require published version match    │
  │                              │ insert status = NEW, pin version   │
  │◀─────────────────────────────┤ 201                                │
```

Ownership behaviour: `GET /inquiries` is buyer-scoped; `GET /inquiries/:id` for another buyer's inquiry returns **404**, not 403, to avoid an existence oracle. The artisan inbox does not exist yet, and the RLS migration deliberately does not invent a policy for it.

### 2.8 Entity relationships

```
identity_accounts
  id (uuid, pk)
  username (unique)
  password_hash (argon2id)
  role (BUYER | ARTISAN, server-assigned)
      │
      │ 1
      ▼ n
identity_sessions ──── 1 ──── n ──── identity_refresh_grants
  session_id (pk)                       id (pk)
  account_id ───────────────────────▶   session_id
  expires_at                            token_hash (unique)
                                        consumed_at
                                        rotated_to ──┐ (self-reference:
                                                     └─ rotation chain)

identity_accounts.id ═══════════════ owner_id / buyer_id / published_by

catalog_products
  id (pk)
  owner_id ──────────────▶ identity_accounts.id
  title, description, category, materials text[]
  state ∈ {LOCAL_DRAFT, PENDING_SYNC, SYNCED, REVIEW_REQUIRED,
           APPROVED, PUBLISHED, ARCHIVED, CONFLICT, ACTION_REQUIRED}
  version (bigint)
  published_version (nullable)
      │ 1
      ├─────────────── n ──▶ catalog_versions
      │                       (product_id, version_number, snapshot,
      │                        published_by, published_at)
      │                       UNIQUE(product_id, version_number)
      │                       immutable: no update, no delete
      │
      ├─────────────── n ──▶ media_attachments
      │                       (id, product_id, owner_id, kind,
      │                        content_type, size_bytes, object_key,
      │                        state, idempotency_key)
      │
      ├─────────────── n ──▶ ai_jobs
      │                       (id, product_id, owner_id, state,
      │                        attempts, max_attempts, input_hash,
      │                        correlation_id, idempotency_key)
      │                          │ 1
      │                          └──── n ──▶ ai_proposals
      │                                        (job_id, product_id,
      │                                         field, proposed_value,
      │                                         confidence, risk,
      │                                         decision ∈ {PENDING,
      │                                         ACCEPTED, EDITED,
      │                                         REJECTED},
      │                                         decided_by, decided_at)
      │
      └─────────────── n ──▶ inquiries
                              (id, product_id, buyer_id, message,
                               status = NEW, catalog_version,
                               idempotency_key)
                                 │
                                 └── catalog_version ──▶ catalog_versions.version_number

ai_job_outbox
  (event id, aggregate/job id, event type, payload, claimed_at,
   published_at, attempts, last_error)
  — no RLS: it is infrastructure, not tenant data
```

**Cardinality summary:** one account → many products; one product → many versions (immutable), many media, many AI jobs, many inquiries; one AI job → many proposals; one inquiry → exactly one pinned catalog version.

### 2.9 State machines

**Canonical product (server, `catalog_products.state`, nine values per the CHECK constraint):**

```
LOCAL_DRAFT ──▶ PENDING_SYNC ──▶ SYNCED ──▶ REVIEW_REQUIRED ──▶ APPROVED ──▶ PUBLISHED
     │               │              │              │                │            │
     │               │              │              │                │            ▼
     └───────────────┴──────────────┴──────────────┴────────────────┴──────▶ ARCHIVED
                                     │              │
                                     ▼              ▼
                                 CONFLICT      ACTION_REQUIRED
```

`APPROVED` is reachable only via `POST …/review/approve`. `PUBLISHED` only via `POST …/publish`. `CONFLICT` and `ACTION_REQUIRED` are the honest states: they exist so the system never has to pretend a problem is a success.

**Local product (`storage/product-drafts.ts`):**

```
LOCAL_ONLY ──▶ PENDING_SYNC ──▶ SYNCED
                    │
                    └──▶ ACTION_REQUIRED ──(retry)──▶ PENDING_SYNC
```

**Local media intent:** `PENDING_SYNC → SYNCED | ACTION_REQUIRED`

**Sync operation:** `PENDING → IN_FLIGHT → ACKED | ACTION_REQUIRED`, with `IN_FLIGHT → PENDING` via stale recovery and `ACTION_REQUIRED → PENDING` via explicit retry.

**Remote media:** `REQUESTED → UPLOAD_AUTHORIZED → UPLOADING → UPLOADED → VERIFIED`, with `FAILED` and `ACTION_REQUIRED` as terminal-ish branches.

**AI job:** `QUEUED → RUNNING → SUCCEEDED`, with `RUNNING → RETRYING → RUNNING`, `PARTIAL_RESULT` for a usable-but-incomplete result, `FAILED`, and `DEAD_LETTERED` after the retry budget.

**Why two vocabularies and not one enum:** business state ("the artisan must look at this") and infrastructure state ("this job is on its third attempt") change for different reasons and at different rates. Merging them would make every infrastructure retry look like a business event. AGENTS.md §6 states this rule; the code honours it.

### 2.10 Error taxonomy

| Code | HTTP | Meaning | Client action |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | Boundary rejected the input; `details.field` names it | Fix input, do not retry blindly |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired credential | Refresh, then sign in |
| `FORBIDDEN` | 403 | Authenticated but not permitted | Do not retry |
| `NOT_FOUND` | 404 | Absent **or** not yours | Do not retry; refresh list |
| `CONFLICT` | 409 | State does not allow the operation | Re-read state, then act |
| `RATE_LIMITED` | 429 | Operation budget exhausted | Back off |
| `DEPENDENCY_FAILED` | 503 | A required dependency is unavailable | Retry with backoff |
| `TRANSIENT_FAILURE` | 503 | Temporary | Retry with backoff |
| `INTERNAL_ERROR` | 500 | Unexpected; generic message | Retry, then report with `requestId` |

The `requestId`/`correlationId` echoed on every response is what makes a user report actionable: one string finds the whole trace.

### 2.11 Trust boundaries

```
UNTRUSTED ──────────────────────────────────────────────────────── TRUSTED
  artisan input      │  boundary validation      │  domain rules
  buyer input        │  (http.ts, before any     │  (service, pure)
  AI output          │   business logic)         │
  external provider  │                           │
  request headers    │  actor from SESSION,      │
  file metadata      │  never from body          │
  presigned URLs     │  redacted before logging  │
```

Four rules that hold across the codebase:

1. **Identity comes from the session.** No route reads an actor id, buyer id, or owner id from a request body.
2. **AI output is untrusted input.** It passes the same four stages as any other external data.
3. **Secrets never enter logs.** Presigned URLs, tokens, and passwords are redacted or never formatted.
4. **Absence is not permission.** A missing `app.actor_id` denies every row; a missing owner id throws instead of writing an unowned record; a missing `Idempotency-Key` is a 400, not an implicit retry.

---

## 3. Frontend & UI/UX design specification

### 3.1 Information architecture

```
RootLayout
└─ ThemeProvider
   └─ AuthProvider
      └─ AuthGate ──────────────── no session ──▶ AuthScreen (sign in | create account)
         │
         └─ session ──▶ AppTabs (NativeTabs)
                        ├─ (home)  ── HomeScreen
                        │             ├─ Create Product ──▶ CreateProductScreen
                        │             │                     ├─ PhotoCapture
                        │             │                     ├─ VoiceRecorder
                        │             │                     ├─ DraftStatus
                        │             │                     └─ ReviewProductScreen
                        │             └─ Your questions ──▶ /inquiries ──▶ InquiryHistory
                        └─ explore ── ExploreScreen ──▶ DiscoveryScreen
                                                       └─▶ /explore/discovery/[productId]
                                                            └─ ProductDetailScreen
                                                               └─ InquiryComposer
```

**Two tabs, deliberately.** The product has two actors and two verbs: *make* (Home) and *find* (Explore). Anything else would be inventory, not navigation.

**The navigation contract:** the same `DiscoveryScreen` renders as the tab root (no back affordance) and as a pushed route (back affordance). This is a rule with a test, not a duplicated screen. The `/inquiries` destination lives in one constant with a test asserting the action and route agree.

### 3.2 Journeys

**Artisan — first product, bad signal**

| Step | Screen | System state made visible | Failure handling |
|---|---|---|---|
| 1 | AuthScreen | "Create account" | Server message verbatim; no username/password oracle |
| 2 | Home | "SIGNED IN AS …" | — |
| 3 | CreateProduct | Draft created locally | Owner required; throws rather than writing unowned |
| 4 | PhotoCapture | Thumbnail | Permission denied → no capture, no crash |
| 5 | VoiceRecorder | Record / stop / play | Permission denied → silent return |
| 6 | CreateProduct | "Saved on device" | Offline is a normal state, not an error |
| 7 | Sync | "Waiting for connection" → "Uploading 42%" | Progress distinguishes upload from stall |
| 8 | Review | "Needs your review" | Staleness shown; decisions required |
| 9 | Review | "Approved" | Approve enabled only when every proposal is decided |
| 10 | Publish | "Published" + version 1 | 409 explains what is missing |

**Buyer — discovery to inquiry**

| Step | Screen | System state | Failure handling |
|---|---|---|---|
| 1 | Explore | Published listings, newest first | Empty state + retry |
| 2 | Explore | Search "bamboo" | `%`/`_` escaped → literal match |
| 3 | ProductDetail | Version, materials, published date | Unpublished → 404 with generic message |
| 4 | InquiryComposer | Character count vs server limit | Send disabled in flight |
| 5 | InquiryHistory | "NEW" | Buyer-scoped; another buyer's id → 404 |

### 3.3 Design tokens (VERIFIED from `constants/theme.ts`)

**Colour — five semantic roles, two schemes**

| Token | Light | Dark | Role |
|---|---|---|---|
| `text` | `#000000` | `#ffffff` | Primary text and primary button fill |
| `background` | `#ffffff` | `#000000` | Page and primary button label |
| `backgroundElement` | `#F0F0F3` | `#212225` | Raised/inset surfaces, tab indicator |
| `backgroundSelected` | `#E0E1E6` | `#2E3135` | Selected state, 1 px borders |
| `textSecondary` | `#60646C` | `#B0B4BA` | Supporting copy, eyebrow labels |

That is the entire palette. Five roles, no brand hue, no gradients. It is a monochrome system where **contrast carries hierarchy** — which is the correct call for a product used outdoors, on cheap screens, by people who may not have perfect vision.

Contrast check: `#60646C` on `#ffffff` and `#B0B4BA` on `#000000` both clear the WCAG AA 4.5:1 threshold for body text. The 11–12 px eyebrow labels are the one place to watch, since they are small — they are bold and letter-spaced, which helps, but they should not carry information available nowhere else.

**Spacing — six steps, 4 px base with a 2 px hairline**

| Token | Value | Typical use |
|---|---|---|
| `half` | 2 | Hairline gaps |
| `one` | 4 | Label/value gap |
| `two` | 8 | Tight inner padding |
| `three` | 16 | Card padding, border radius |
| `four` | 24 | Screen padding, primary button vertical padding |
| `five` | 32 | Section separation |
| `six` | 64 | Top hero spacing, bottom safe gap |

**Layout constants:** `BottomTabInset` = 50 (iOS) / 80 (Android); `MaxContentWidth` = 800.

**Typography:** system fonts only, via `Platform.select` — `sans` / `serif` / `rounded` / `mono`, with web mapped to CSS variables. No bundled font files. On Android `sans` resolves to Roboto; on iOS to SF. This is the right trade for a low-end-device product: zero font download, zero layout shift, full script coverage for the user's own language.

### 3.4 Type scale in use (observed)

| Role | Size | Weight | Notes |
|---|---|---|---|
| Screen title | 38 | 800 | `letterSpacing: -1` — one per screen, never two |
| Primary action label | 17 | 800 | On a 24 px vertical padding button (~65 pt tall) |
| Body / subtitle | 16 | 400 | `lineHeight: 24` (1.5) |
| Card title | 16 | 700 | — |
| Secondary body | 13 | 400 | Helper text |
| Eyebrow | 12 | 800 | `letterSpacing: 1.2`, uppercase |
| Micro-label | 11 | 800 | `letterSpacing: 1.2`, uppercase |

**Rule implied by the code:** hierarchy comes from weight and letter-spacing, not from a rainbow of sizes. Four sizes do most of the work. That is a coherent, defensible system.

### 3.5 Reusable components

| Component | Kind | Contract |
|---|---|---|
| `ThemedText` | Primitive | Semantic text; the only sanctioned way to get colour |
| `ThemedView` | Primitive | Semantic surface |
| `AppTabs` | Navigation | Two triggers, theme-derived colours, template icons |
| `DraftStatus` | Status | `state`, `syncing`, `hasAttention`, optional `uploading {bytesSent,totalBytes}` |
| `PhotoCapture` | Input | `uri`, `onCaptured(asset)` |
| `VoiceRecorder` | Input | `uri`, `onRecorded(uri)` |
| `InquiryComposer` | Input | Injected transport; idempotency per composition |
| `InquiryHistory` | List | Buyer-scoped paged read |
| `DiscoveryScreen` | List | Optional `onBack`; injected transport |
| `ProductDetailScreen` | Detail | `productId`, `onBack`; injected transport |
| `ReviewProductScreen` | Workflow | `remoteProductId`, `onBack`; injected transport |
| `HintRow`, `ExternalLink`, `WebBadge`, `Collapsible`, `AnimatedIcon` | Furniture | Small shared primitives |

**The injection pattern is the design system's real backbone.** Every screen that touches the network takes its transport as an optional prop defaulting to the shared instance. That is what lets the review screen be exercised against refusals the real server would have to produce, without a mock framework.

### 3.6 The state language the UI must speak

AGENTS.md §13 requires the app to make system state understandable. Mapped to this codebase:

| Required visible state | Where it comes from | Current status |
|---|---|---|
| Saved on device | `LOCAL_ONLY` / `PENDING_SYNC` | **Implemented** (Home: "Saved on this phone") |
| Waiting for connection | offline + `PENDING_SYNC` | **Implemented** in `DraftStatus` |
| Uploading | `uploading.bytesSent/totalBytes` | **Implemented**, with % and an unknown-total fallback |
| Processing | AI job `QUEUED`/`RUNNING` | **Partial** — job state is fetchable; no dedicated progress surface |
| Needs your review | `REVIEW_REQUIRED` + undecided proposals | **Implemented** |
| Published | `PUBLISHED` + version | **Implemented** |
| Action needed | `ACTION_REQUIRED` + error code/message | **Implemented** at draft level |
| Conflict | `CONFLICT` | **GAP** — state exists in the vocabulary; no dedicated UI copy found |

### 3.7 Accessibility

What is present (VERIFIED in source):

- `accessibilityRole="button"` on the Home actions.
- `accessibilityLabel` on the inquiry-history action, written to announce the *destination* ("your questions") rather than repeating the visible title.
- Send is `disabled` while in flight, which prevents a double-submit at the interaction level, not just the request level.
- Primary buttons are ~65 pt tall, comfortably above the 44/48 pt minimum.
- Copy is plain-language and action-oriented ("Saved on this phone", "Waiting for connection").

What still needs work:

- `accessibilityState={{ disabled }}` is not consistently paired with `disabled`.
- No evidence of a tested Dynamic Type pass at 200%.
- No explicit Reduce Motion handling in the shared primitives (native tabs inherit platform behaviour, but the animated icon does not declare a policy).
- Decorative images need `accessible={false}` / empty alt to avoid noise.

### 3.8 Low-connectivity design principles (the ones this app actually follows)

1. **Offline is a state, not an error.** The copy says "Saved on this phone", not "Failed to save".
2. **Never block a write on a read.** Capture does not wait for the network.
3. **Progress must be distinguishable from a stall.** Byte-level progress, with an honest "Uploading" when the total is unknown.
4. **Every retry is safe.** One idempotency key per attempt-series, so a retry cannot create a second product, photo, job, or question.
5. **The user is told the next useful action.** "Action needed" always carries the server's own message.
6. **Nothing is silently lost.** An unmeasurable file is left alone rather than assumed zero; an unreadable session signs out rather than trapping the user.

### 3.9 Demo polish plan (ranked, smallest-risk first)

| # | Change | Why it matters on stage | Effort | Risk |
|---|---|---|---|---|
| 1 | **Fix the mojibake in user-visible copy.** `HomeScreen` renders `We�ll` and `Creating�`, and the "Continue draft" row renders `?` where a chevron belongs. | These are the *first* strings a judge reads on the first screen. A corrupted apostrophe and a `?` arrow read as "unfinished" louder than any feature can compensate. | Minutes | None — string/encoding only |
| 2 | **Make artisan screens theme-aware.** `HomeScreen` (and other screens importing `Colors.light` directly) ignore the dark palette even though the root switches navigation theme. | A judge toggling dark mode and seeing half the app stay white is a visible inconsistency. | Small | Low |
| 3 | **Add a real empty state to Explore** ("No pieces published yet — be the first") with a retry action. | The demo may open Explore before anything is published. A blank list looks broken; a designed empty state looks deliberate. | Small | Low |
| 4 | **Add `accessibilityState` to every `disabled` control** and `accessible={false}` to decorative images. | Cheap, and it is the difference between "we say accessibility" and "we did accessibility". | Small | None |
| 5 | **Show a "Processing" chip on the draft** while an AI job is `QUEUED`/`RUNNING`. | Turns an invisible wait into visible progress, and gives the presenter something to narrate. | Small | Low |
| 6 | **Photo thumbnail + voice duration chips on the capture screen.** | Makes the capture tangible in a 4-minute demo; currently the media is implied rather than shown. | Small–medium | Low |
| 7 | **Discovery list skeleton** instead of a bare spinner on first load. | Perceived performance; the list is the "shop window". | Small | Low |
| 8 | **Dynamic Type pass at 200%** on Home, Create, Review, Detail. Fix any fixed-height containers. | A judge *will* test large text on a mobile app. | Medium | Low |
| 9 | **Reduce Motion audit** for the animated icon and any transition. | Platform trust; also an explicit AGENTS.md requirement. | Small | Low |
| 10 | **Seed-data narrative:** ensure the seeded published items read like real craft (basket, mug set, wall hanging) and the pending item has four proposals. | A demo is a story. The seed already does this; keep it. | None | — |

**Do not do before the demo:** restyle the palette, add a font, add a component library, or restructure navigation. The monochrome system and two-tab shape are coherent; changing them under time pressure is how a demo becomes a regression.

### 3.10 UI debt register (say these before a judge does)

| Debt | Evidence | Consequence |
|---|---|---|
| Partial dark mode | Direct `Colors.light` imports in artisan screens | Toggling scheme produces a mixed UI |
| Encoding corruption | `We�ll`, `Creating�`, `?` arrow in `(home)/index.tsx` | Visible unprofessionalism on the first screen |
| No dedicated `CONFLICT` UI | State exists; no copy found | A conflict would surface as a generic action-required |
| No processing surface | Job state fetchable; no progress component | AI wait is invisible |
| Web scaffolding present | `*.web.tsx` files exist | Suggests support that is not there; `README.md` is honest about it |
| No artisan inbox | RLS migration says so explicitly | Buyers can ask; artisans cannot yet read in-app |
| No image optimisation | Demo guide known-limitations | Originals are stored; bandwidth cost on poor networks |
| No push notifications | Demo guide known-limitations | Sync completion is discovered on next open |

---

## 4. Every concept explained from first principles

Each entry answers three questions: *what problem exists without it*, *what the mechanism actually is*, *where it lives in this repo*.

### 4.1 Monorepo and pnpm workspaces

**Problem without it:** the client and the server must agree on the shape of a product, a media attachment, an AI proposal, and an inquiry. If each keeps its own copy, the copies drift, and the drift is discovered in production as a runtime shape error.

**Mechanism:** a *workspace* is one repository containing several packages that share a single dependency graph and a single lockfile. pnpm stores each package version once on disk and links it into the packages that need it, so three packages wanting TypeScript do not produce three copies. `pnpm -r run <script>` runs a script in every package, which is how the root `check` / `test` / `typecheck` scripts work. `pnpm-workspace.yaml` declares which directories are packages.

**Here:** root `package.json` pins `pnpm@11.9.0` and fans out with `pnpm -r`. `apps/api`, `apps/mobile`, `packages/contracts`, `packages/config`, `packages/utils` are the members. The payoff is concrete: `@artisan-marketplace/contracts` exports `./src/index.ts` directly, so both sides import the *same file*, not a published copy.

**The trade-off, stated honestly:** one repository means one CI surface and one version to reason about, at the cost of coarser access control and a slower full install. At this size the trade is obviously correct; at fifty teams it would not be.

### 4.2 Offline-first / local-first architecture

**Problem without it:** the target user is an artisan with intermittent signal. If every action is a network call, the app is unusable exactly when it is most needed. Worse, a spinner that never resolves teaches the user that their work was lost.

**Mechanism:** invert the order. The **local database is the write target**; the network is a replication mechanism that runs later. The user's action completes immediately and locally. A sync engine then pushes queued operations, with retry, backoff, and a durable record of what has and has not been acknowledged.

The hard part is not "save locally". The hard part is **knowing what happened**. That requires three things:
1. a durable operation log (not just the data), so an interrupted push can be resumed;
2. an idempotency key per logical operation, so a resumed push cannot duplicate;
3. a state vocabulary that distinguishes "saved here" from "accepted there".

**Here:** `storage/` holds three tables — drafts, media intents, sync operations — in SQLite with WAL. `sync/` pushes products then media. `draft-sync.ts` sequences the whole thing and reports progress. `sync-operations.ts` implements claim / heartbeat / retry / acknowledge / recover-stale, which is what makes an app kill mid-upload recoverable rather than corrupting.

**The honest limit:** offline-first covers *capture and sync*. Discovery and inquiry are online reads. That is a deliberate scope choice: a buyer browsing a stale catalogue is worse than a buyer told to reconnect.

### 4.3 SQLite versus PostgreSQL

**Problem without it:** one database cannot be both on the phone and shared between users.

**Mechanism:** they are different tools with different jobs.

| | SQLite (device) | PostgreSQL (server) |
|---|---|---|
| Location | Inside the app process | Separate server |
| Concurrency | One writer at a time (WAL lets readers proceed) | Many concurrent writers, MVCC |
| Ownership | This device, this account | All accounts, enforced by RLS |
| Job | Remember un-synced intent | Be the canonical truth |
| Failure mode | Lost if the app is uninstalled | Lost if not backed up |

**Here:** SQLite uses `PRAGMA journal_mode = WAL` and `CREATE TABLE IF NOT EXISTS` for idempotent initialisation. Every local record is keyed by the **authenticated server actor id** (`requireLocalOwnerId`), so two accounts on one phone cannot see each other's drafts. Postgres holds `catalog_products` and everything downstream.

**The subtle point a judge may probe:** the same word means different things on each side. "Synced" locally means "the server acknowledged"; "SYNCED" on the server means "this row exists in canonical storage". They are related but not identical, which is exactly why the local and remote media state lists are separate constants that mirror each other rather than sharing one enum.

### 4.4 Shared contracts and boundary validation

**Problem without it:** a type that exists in two places is a type that will disagree in two places. And a type is not a runtime check — JSON arriving over the wire is untrusted regardless of what TypeScript believes.

**Mechanism:** two separate ideas, often confused.
- **Compile-time contract:** one shared type definition, imported by both sides. Catches drift before runtime.
- **Runtime validation:** explicit checks at the boundary, before business logic. Catches malformed input that the type system cannot see.

**Here:** `packages/contracts` is the compile-time half — six modules covering catalog, media, AI, review, discovery, inquiry, plus the state vocabularies. The runtime half lives in each module's `http.ts`: required fields, enum membership, numeric ranges, `Idempotency-Key` presence — all checked before a service is called. `discovery/http.ts` is the cleanest example: `parseDiscoveryQuery` validates `search`, `limit`, and `offset` and throws a typed error naming the offending field, and the handler converts it to `400 VALIDATION_FAILED` with `details.field`.

**Why not a schema library:** the boundary checks are small, explicit, and readable; adding a validator dependency would buy little at this size. That is a defensible choice, not an oversight — but it is also the first thing to revisit if the DTO count triples.

### 4.5 Modular monolith and ports/adapters

**Problem without it:** a single deployable is simple to operate but becomes a tangle; microservices are independently deployable but impose network failure modes, distributed transactions, and operational overhead on a two-person team.

**Mechanism:** a **modular monolith** keeps one deployable and enforces internal boundaries by structure. The pattern used here is ports-and-adapters (hexagonal):
- `domain/` — pure rules, no I/O;
- `application/` — use cases plus **ports** (interfaces) for anything external;
- `infrastructure/` — **adapters** implementing those ports;
- `composition.ts` — the single place that chooses which adapter to construct;
- `http.ts` — boundary validation and transport mapping.

**Here:** all seven modules follow it. `CatalogProductPort`, `PublishedProductPort`, `ReviewPort`, `AiSuggestionsPort` are the cross-module seams. `PostgresCatalogRepository` and `InMemoryCatalogRepository` are interchangeable adapters. `composition.ts` is where `APP_ENV` decides between them.

**Why this is more than ceremony:** the review screen can be driven against refusals the real server would have to produce, because the transport is a port. The AI pipeline can be tested without a provider, because the provider is a port. The boundary is what makes the tests cheap.

**The stated rule:** no module imports another module's repository or table. Cross-module reads go through a port. A shared URL prefix (`/catalog`) is not a dependency — the review module is separately composed and separately mounted under the same prefix.

### 4.6 Hono on Cloudflare Workers

**Problem without it:** a Node server needs a process, a region, and a keep-warm strategy. For a global, low-traffic, latency-sensitive API, that is cost and complexity for no benefit.

**Mechanism:** a Worker is a V8 isolate, not a container. It starts in milliseconds, runs close to the user, and is billed per request. `fetch` is the entry point. Hono is a small router that runs on that runtime and exposes middleware, typed environment bindings, and `onError`.

**Here:** `src/index.ts` builds the Hono app; `src/worker.ts` is the Worker-only shell exporting `{ fetch, queue, scheduled }`. Three runtime realities shaped the code:
1. **No runtime Wasm codegen.** Argon2 and blake2b must be precompiled at build time and imported statically. That is why `main` is `src/worker.ts` and not `src/index.ts` — the app must stay importable from Node, which cannot statically import `.wasm` the same way.
2. **`nodejs_compat` is required** because node-postgres reaches Postgres over Node's TCP/TLS built-ins.
3. **Statelessness is mandatory.** Anything that must survive between requests goes to Postgres, object storage, a Queue, or a Durable Object.

**The rate limiter is the exception that proves the rule:** a counter needs a home, so it lives in a Durable Object backed by SQLite. That is the only stateful edge component, and it exists because a sliding window cannot be computed from nothing.

### 4.7 Hyperdrive and connection pooling

**Problem without it:** Postgres allocates a process per connection. A Worker may run in hundreds of isolates across dozens of locations; if each opened its own connection, the database would be exhausted by connection overhead alone, and every request would pay a TCP + TLS handshake across an ocean.

**Mechanism:** Hyperdrive sits between the Worker and Postgres. It maintains a warm pool near the database, so a Worker in any region gets a connection without a cold handshake, and the database sees a small, stable number of connections rather than one per isolate. In local development, the same binding object is supplied from an environment variable, so there is **one code path** for local and production.

**Here:** `wrangler.jsonc` declares the `HYPERDRIVE` binding and **no connection string**. `wrangler dev` reads `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` from the shell. `resolvePostgresConnectionString(env)` is the single resolver. `wrangler-config.test.ts` asserts that no `postgres://` URI and no `localConnectionString` is ever committed — a test that exists specifically to prevent a credential leak via configuration drift.

**The security half, which is the more interesting half:** because connections are pooled and reused across requests, a naive `SET app.actor_id` would leak one user's identity to the next request on the same connection. `PostgresDatabase.forActor` therefore opens a transaction and calls `set_config('app.actor_id', $1, true)` — the `true` makes it **transaction-local**, so it is discarded at commit or rollback. Combined with `app.current_actor_id()` returning `null` for a missing or malformed value, the failure mode is "deny everything", not "allow the previous user".

### 4.8 Authentication and API security

**Problem without it:** the API is on the public internet and holds artisans' work and buyers' messages. Identity must be established once, carried on every request, and never trusted from the payload.

**Mechanism, in four layers:**

1. **Password storage.** Argon2id — memory-hard, so a GPU attack is expensive. Salt and parameters are in the hash string. Verified with a constant-time comparison.
2. **Session pair.** A short-lived **access** credential plus a longer-lived **refresh** credential. Refresh **rotates**: each use consumes the grant and issues a successor. `identity_refresh_grants` enforces one unconsumed grant per session (partial unique index) and records the rotation chain via `rotated_to`, so replay of a consumed token is detectable rather than silently accepted.
3. **Actor resolution.** `requireActor` reads the session and produces an `ActorContext`. Every handler takes the actor id from that context. **No route reads an owner id, buyer id, or actor id from a request body.** This single rule removes the entire class of "change the id in the JSON" attacks.
4. **Authorisation at the data layer.** Row-level security compares `owner_id` / `buyer_id` to `app.current_actor_id()`. Application code cannot forget the filter, because the filter is in the database.

Plus: per-actor rate limits on the operations that can be abused (registration, login, product creation, publish, AI enqueue/run, media authorisation, inquiry creation, discovery search); `401` for a bad credential versus `503` for an unreachable session store, so an outage does not masquerade as a logout; and `404` instead of `403` when a row belongs to someone else, so the API is not an existence oracle.

**What is deliberately not claimed:** RLS is `ENABLE`d but not `FORCE`d. A table owner bypasses policies by design, so migrations and backfills keep working. Enforcement begins when the app connects as a non-owner `NOBYPASSRLS` login — which `infra/database/app-role.sql` provisions. The honest sentence is: *the wall and the key both exist; which role you connect as decides whether the wall applies to you.*

### 4.9 Idempotency and sync reconciliation

**Problem without it:** mobile networks drop responses, not requests. The server may have committed a write whose response never arrived. The client retries. Without protection, the artisan gets two products, two photos, two AI jobs, or the buyer asks the same question twice.

**Mechanism:** an **idempotency key** is a client-generated identifier for a *logical operation*. The server records it alongside the result. A repeat with the same key returns the original result instead of performing the work again. The response carries a `deduplicated` flag so the client can tell "I created this" from "this already existed".

**Four properties make it work here:**
1. **The key is stable across retries.** `product:${localId}`, `media:${localId}:${kind}`, one key per inquiry composition. The key is generated once, at the moment of intent, not per HTTP attempt.
2. **The write is absolute, not relative.** `PATCH` carries the full value of each supplied field. Replaying it converges instead of incrementing.
3. **The check and the write are atomic.** The key is recorded in the same transaction as the effect, so a crash between them cannot produce a duplicate.
4. **The key is required where duplication is harmful.** `POST /catalog/products/:id/ai-jobs`, `POST /inquiries`, `POST /catalog/products/:id/media`, and `POST /catalog/products/:id/publish` reject a request without one. The reasoning in-source: *creation without an idempotency key is not creation without deduplication, it is creation that cannot be safely retried by an offline client.*

**Reconciliation on the client:** the sync operation table records `attempts`, `last_error_code`, `last_error_message`, and `next_attempt_at`. A retryable failure schedules a later attempt; a non-retryable one becomes `ACTION_REQUIRED` and is shown to the artisan with the server's own words. A stale `IN_FLIGHT` operation (app killed) is recovered on next open rather than being stuck forever.

**The queue gets the same treatment:** `ai_job_outbox` is written in the same transaction as `ai_jobs`, then a cron dispatcher claims and publishes. If the queue loses a message, the outbox still says the job exists, and the job's own state machine records what happened. The queue is transport; it is never the source of truth.

### 4.10 AI as an untrusted proposal engine

**Problem without it:** the product's promise is that an artisan with limited literacy or limited time does not have to write a catalogue entry from scratch. But an AI that writes directly to the catalogue can publish a hallucinated material, a wrong category, or a price that harms the artisan. Confidence scores are not accountability.

**Mechanism — the pipeline, and the boundary that matters:**

```
capture → offline draft → sync → queue → provider
   → 1. schema validation
   → 2. semantic / business validation
   → 3. normalization
   → 4. quality / risk assessment
   → proposals (PENDING)  ──►  human decision  ──►  canonical value
```

**Five rules, each of which is visible in the code:**

1. **AI never writes canonical product fields.** It writes `ai_proposals`. The only path from a proposal to `catalog_products` is an explicit decision.
2. **Confidence is not approval.** A 0.97 proposal is still `PENDING`. Approval requires a human decision on every proposal, and then a separate `approve` operation, and then a separate `publish`.
3. **An artisan-confirmed value is never silently overwritten.** A later AI run creates a *new* proposal; staleness is surfaced (`ai-proposal-staleness.ts`) rather than applied.
4. **Provenance is recorded.** Provider, model, prompt/schema/pipeline versions travel with the proposal, so a result can be explained after the fact.
5. **The provider is replaceable and fails closed.** Deterministic in dev/test; Workers AI or OpenAI in production/staging/preview; anything else throws `DEPENDENCY_FAILED`. A missing credential is a refusal, not a silent stub.

**Why "human in the loop" is a real claim here and not a slogan:** there are three separate human gates (decide each proposal → approve the product → publish), each with its own route, its own precondition check, and its own recorded actor. You cannot reach `PUBLISHED` by posting `{state: "PUBLISHED"}` to the generic transition route; it returns `409` and points at the two named operations.

---

## 5. Judge Q&A encyclopedia

Answers are written to be said aloud in 20–40 seconds. Where the honest answer is "not yet", it says so.

### Architecture & stack

**Q1. Why a monorepo?**
Because the client and the server must agree on the shape of every object. `packages/contracts` is imported by both, so a field rename breaks the build on both sides instead of surfacing as a runtime error. One lockfile, one install, one version of TypeScript.

**Q2. Why a modular monolith instead of microservices?**
Because we have two developers and one validated journey. Microservices would give us independent deploys we do not need, in exchange for network partitions, distributed transactions, and observability overhead we cannot staff. The modules are separated by ports and adapters, so a module *could* be extracted later — but only when a real isolation requirement justifies it.

**Q3. What actually enforces the module boundaries?**
Three things: cross-module access goes through a port interface, never another module's repository or table; each module has its own `composition.ts`, so dependency choice happens in one place; and the `http.ts` boundary is the only place a module sees HTTP. The `/catalog` URL prefix is shared by four modules and is explicitly *not* a dependency.

**Q4. Why Hono and Cloudflare Workers?**
Latency and cost. A Worker starts in milliseconds and runs near the user; we pay per request, not for an idle process. Hono is a small router that fits that runtime and gives typed bindings and middleware. The cost is that we must respect isolate constraints — which is why Argon2's Wasm is precompiled at build time and why `main` is `src/worker.ts`.

**Q5. What is the hardest engineering constraint in the stack?**
Connection identity. Workers are pooled and Hyperdrive reuses connections, so a naive `SET app.actor_id` would leak one user's identity into the next request. We set it with `set_config(..., true)` inside a transaction — transaction-local — and `app.current_actor_id()` returns null for a missing or malformed value, so the failure mode is deny-all rather than allow-previous.

**Q6. What would you change if you had ten times the users?**
Three things, in order: partition the largest tables and add read replicas through Hyperdrive; move AI work to a dedicated consumer with per-provider concurrency limits; and split discovery into a read model that can be cached at the edge. None of those require changing the module boundaries — that is the point of drawing them now.

### Offline, sync, and data integrity

**Q7. Walk me through what happens when the network drops mid-upload.**
The bytes stop, but the operation is already `IN_FLIGHT` in SQLite with a heartbeat. On next open, stale recovery returns it to `PENDING`. The next attempt asks for a **fresh** upload authorization, because the previous URL was short-lived, and re-sends from the start. The media row is the same row — the idempotency key has not changed — so no duplicate attachment appears.

**Q8. How do you prevent duplicate products when a user taps twice?**
The key is generated at the moment of intent, not per HTTP attempt: `product:${localId}`. The server records it in the same transaction as the insert. The second request returns the original result with `deduplicated: true` and HTTP 200 instead of 201.

**Q9. What if the response is lost but the write succeeded?**
That is the exact case idempotency exists for. The retry carries the same key, the server finds the record, and returns it. The client converges on the row the first attempt created.

**Q10. How do you handle conflicting edits?**
Per the project's conflict policy: media merges and flags probable duplicates; title and description take the newest artisan-confirmed edit; AI metadata never silently overwrites a confirmed value; a change to a published listing creates a new immutable version; deletes are tombstoned before any purge. In this slice the conflict *state* exists (`CONFLICT`) and versioning is implemented; a full multi-device merge UI is not.

**Q11. Why does the client keep three tables instead of one?**
Because they answer different questions. Drafts are *what the artisan made*. Media intents are *what must be uploaded*. Sync operations are *what has been attempted and what happened*. Collapsing them would make "did this upload succeed?" a property of the draft, which is exactly the coupling that makes retries unreliable.

**Q12. What stops one account seeing another's drafts on a shared phone?**
Every local record is keyed by the authenticated server actor id, and `requireLocalOwnerId` throws on a blank value rather than writing an unowned row. The Home screen also clears its draft state immediately on account switch, so one account's work is never displayed while another's is loading.

### Database, RLS, and security

**Q13. Where is the source of truth?**
PostgreSQL for canonical state. Object storage for bytes. SQLite for un-synced intent. The queue is transport only — it is never authoritative. The AI provider owns nothing.

**Q14. Explain your row-level security in one breath.**
Every tenant table has policies comparing `owner_id` or `buyer_id` to `app.current_actor_id()`, which reads a transaction-local setting written from the verified session. A missing or malformed setting returns null, which denies every row. Buyers never get `SELECT` on a working product row — discovery reads a narrow security-definer view exposing only id, published version, and state.

**Q15. But you're connecting as the table owner, so RLS doesn't apply.**
Correct, and we say so. The policies are enabled but deliberately not forced, because migrations and backfills must keep working as the owner. `infra/database/app-role.sql` provisions a `NOLOGIN`, `NOBYPASSRLS` privilege group; a deployment creates a login role, grants the group, and points Hyperdrive at it. The moment you connect as that role, the wall applies. We documented the activation step instead of pretending it was already active.

**Q16. How do you stop a client from claiming to be another user?**
No route reads an actor, owner, or buyer id from a request body. Identity comes from the session, is resolved once into `requestContext`, and is passed to the service explicitly. The RLS layer then re-checks it at the data boundary.

**Q17. Why 404 instead of 403 for someone else's inquiry?**
A 403 confirms the row exists. A 404 tells the caller nothing. The same reasoning applies to unpublished products in discovery: an unpublished id and a nonexistent id get the same message.

**Q18. How are passwords stored?**
Argon2id, memory-hard, with the salt and parameters embedded in the hash string, verified in constant time. The Wasm binaries are precompiled at build time because Workers forbid runtime Wasm codegen.

**Q19. What about refresh-token replay?**
Refresh rotates: each use consumes the grant and issues a successor. `identity_refresh_grants` has a unique `token_hash` and a partial unique index allowing at most one unconsumed grant per session, plus a `rotated_to` chain. A consumed token presented again is not a valid credential.

**Q20. Where could a secret leak, and what did you do about it?**
Four places: configuration, logs, error messages, and upload URLs. Configuration: `wrangler-config.test.ts` fails the build if a `postgres://` URI or `localConnectionString` is committed. Logs and errors: `redact-secrets.ts` strips credentials and presigned URLs, and the media contract states the URL must never be logged or shown. Upload URLs are short-lived and single-object.

### AI and voice

**Q21. What exactly does the AI do?**
It proposes catalogue fields — title, description, category, materials — from the captured media and any transcription. It writes proposals, not product rows. Each proposal carries a confidence, a risk level, and provenance.

**Q22. What stops it publishing something wrong?**
Three human gates and four validation stages. The proposal must be decided (accept, edit, or reject), the product must then be approved, and only then can it be published. Confidence is never treated as approval. And an artisan's edit sends *their* value, not the model's.

**Q23. What if the AI is unavailable?**
In development and test we use a deterministic provider. In production, staging, and preview the provider selection fails closed: no configured provider means `DEPENDENCY_FAILED`, never a silent stub. Review degrades gracefully — if AI is unavailable there are no suggestions, but the artisan can still complete and publish the product.

**Q24. Is the AI pipeline verified end to end?**
Not in the final verification run — and `README.md` says so. The module is fully implemented and unit-tested, with two real providers, a validation pipeline, an outbox, a queue consumer, and Postgres repositories. What was not exercised is the live provider call and real voice transcription. That is a verification gap, not a design gap, and we would rather name it than have you find it.

**Q25. Why a deterministic provider at all?**
Because a demo and a test both need the same input to produce the same output. It is refused outside development and test, precisely so it can never make a production deployment *look* assisted while generating nothing.

### Product, scope, and honesty

**Q26. Does it work on iOS and web?**
Android is the supported target. iOS code paths exist because Expo is cross-platform, but iOS was not the verification target. Web is explicitly not working — `README.md` says so, and the `.web.tsx` files are scaffolding, not a shipped target. We chose one platform and finished the vertical slice rather than shipping three half-platforms.

**Q27. What is genuinely missing?**
The artisan inbox (buyers can ask; artisans cannot yet read in-app), push notifications, image optimisation, a category taxonomy, payments, and real transcription. All are recorded in the demo guide's known-limitations table.

**Q28. What are the two empty packages for?**
`packages/config` and `packages/utils` are deliberate seams with no implementation. We did not invent shared utilities before there was a second caller. Their `test` scripts are placeholders and we do not claim otherwise.

**Q29. What is the single most important design decision?**
That AI output is untrusted input and canonical state is human-authorised. Everything else follows: proposals instead of writes, three gates instead of one, provenance, staleness, and the refusal to treat confidence as permission.

**Q30. How would you prove this works, right now, without trusting your slides?**
Three ways. `scripts/verify.ps1` runs eight gates — mobile and API typecheck, mobile lint, a Worker dry-run deploy, three package typechecks, and 74 named suites. The `tests/` directory has Postgres-backed runtime suites for the catalog lifecycle, AI pipeline, review/publish, buyer journey, actor isolation, RLS policy, and auth. And you can run the demo live: capture, sync, review, publish, then switch to a buyer account and send an inquiry.

---

## 6. Presentation deck, speaker script, and live-demo playbook

### 6.1 Deck — ten slides

> Rule applied: no slide carries more than 12 words of body text. The slides are prompts; the script carries the meaning.

| # | Title | On-slide content | Speaker |
|---|---|---|---|
| 1 | **Artisan Marketplace** | *Offline-first market linkage for artisans.* One line under it: "Capture. Sync. Review. Publish. Sell." | A |
| 2 | **The problem** | "No signal. No catalogue. No reach." + one sentence: "The artisan is not the bottleneck; the tooling is." | A |
| 3 | **The journey** | Nine-step strip: Photo → Voice → Saved on device → Sync → Upload → AI draft → Correct → Publish → Inquiry | A |
| 4 | **The architecture** | Topology: Phone / Worker / Postgres / Object storage / Queue / AI | B |
| 5 | **Offline is the design** | "SQLite is the write target. The network is replication." + `product:{localId}` | B |
| 6 | **AI proposes. Artisans decide.** | Three gates: Decide → Approve → Publish. "Confidence is not approval." | A |
| 7 | **Trust is structural** | "Identity from session. Ownership from RLS. Bytes never touch the API." | B |
| 8 | **Built vs next** | Two columns: Built (capture, sync, media, AI proposals, review, publish, discovery, inquiry) / Next (transcription, artisan inbox, notifications, iOS/web) | A |
| 9 | **Live demo** | Four beats: Capture · Review · Publish · Ask | B |
| 10 | **Why it matters** | "A product that exists only when the signal does, does not exist." | A |

### 6.2 Script — 3 min 50 s, two speakers

> Cue marks in brackets. Total ≈ 540 words at a calm pace. If you are running long, cut the bracketed sentence in slide 5 first.

**[Slide 1 — A]**
"Every artisan has a product worth buying. Most of them have no way to prove it exists. We built the shortest path between a phone with no signal and a buyer with a question."

**[Slide 2 — A]**
"The barrier is not craft. It is tooling. A catalogue form assumes literacy, a keyboard, and a stable connection. Our user has a phone, a product, and a voice. So we started from that."

**[Slide 3 — A]**
"Nine steps. Photograph it. Describe it out loud. It saves on the device immediately. When there is signal, it syncs. The photo uploads directly to storage. AI drafts a title, description, category, and materials. The artisan corrects it. They approve. They publish. A buyer finds it and asks a question."

**[Slide 4 — B]**
"Under that: an Expo app, a Cloudflare Worker running Hono, PostgreSQL through Hyperdrive, object storage, a queue, and a replaceable AI provider. Seven modules in one deployable. No microservices — we have two developers and one journey to prove."

**[Slide 5 — B]**
"The part that took the most thought is what happens when the network dies. SQLite is the write target, not a cache. The network is replication. Every logical operation carries one idempotency key, generated at the moment of intent, so a retry after a dropped response converges instead of duplicating. An interrupted upload is recovered on next open and re-authorised with a fresh URL. [The user never sees a spinner that means nothing.]"

**[Slide 6 — A]**
"AI is the part people expect us to oversell, so here is the boundary. The model writes proposals. It never writes the product. There are three separate human gates: decide every proposal, approve the product, publish it. Confidence is not approval. And when an artisan edits a field, we send their value, not the model's."

**[Slide 7 — B]**
"Trust is structural, not a policy page. Identity comes from the session — no route reads a user id from the request body. Ownership is enforced by row-level security against a transaction-local actor, so a pooled connection cannot leak one user into the next. And media bytes go straight from the phone to object storage with a short-lived single-object URL. The API never proxies a photo."

**[Slide 8 — A]**
"Built: offline capture, sync with retry and recovery, direct media upload, AI proposals, human review, immutable publish, buyer search, and inquiries. Next: real transcription, the artisan inbox, notifications, and iOS and web. We are telling you the second list on purpose."

**[Slide 9 — B]**
"Live: we will capture a product offline, sync it, review the AI draft, publish it, then switch to a buyer and ask a question. If the network misbehaves, that is the demo working."

**[Slide 10 — A]**
"A product that exists only when the signal does, does not exist. We made it exist first, and made it reachable second. That is the whole idea."

### 6.3 Live-demo runbook (PowerShell)

**Preconditions:** Docker Desktop running; Node 22+; pnpm; two terminals free; phone or emulator paired.

**Step 1 — infrastructure**

```powershell
docker compose -f infra/docker/local-compose.yml up -d
docker ps --filter "name=artisan-marketplace" --format "{{.Names}} {{.Status}}"
# expect postgres healthy on host port 55432, storage on 9000/9001
```

**Step 2 — migrations**

> The demo guide shows `< file` redirection. In PowerShell `<` is reserved and will fail. Use the pipe form below.

```powershell
$files = @(
  'infra/migrations/001_catalog/migration.sql',
  'infra/migrations/002_media/migration.sql',
  'infra/migrations/003_catalog_idempotency.sql',
  'infra/migrations/004_media_upload_verification.sql',
  'infra/migrations/005_catalog_versions.sql',
  'infra/migrations/006_ai_jobs_and_proposals.sql',
  'infra/migrations/007_inquiries_and_published_search.sql',
  'infra/migrations/008_identity_accounts_and_sessions.sql',
  'infra/migrations/009_identity_refresh_grants.sql',
  'infra/migrations/010_row_level_security.sql',
  'infra/migrations/011_ai_job_outbox.sql'
)
foreach ($f in $files) {
  Write-Host "applying $f"
  Get-Content -Raw $f | docker exec -i artisan-marketplace-postgres `
    psql -v ON_ERROR_STOP=1 -U artisan_marketplace -d artisan_marketplace_dev
  if ($LASTEXITCODE -ne 0) { throw "migration failed: $f" }
}
```

**Step 3 — seed, and capture the IDs**

```powershell
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = `
  'postgresql://artisan_marketplace:artisan_marketplace_dev@localhost:55432/artisan_marketplace_dev'

npx tsx scripts/seed-demo.ts
```

**Write the printed Artisan ID and Buyer ID on paper.** Do not copy them from `MVP_DEMO_GUIDE.md` §18 — the seed generates fresh UUIDs on every run.

**Step 4 — API (terminal 1, keep open)**

```powershell
cd apps/api
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = `
  'postgresql://artisan_marketplace:artisan_marketplace_dev@localhost:55432/artisan_marketplace_dev'
npx wrangler dev
```

The environment variable is **per PowerShell session**. If you open a new terminal, set it again. This is the single most common demo failure.

**Step 5 — prove the API is alive**

```powershell
Invoke-RestMethod http://localhost:8787/health | ConvertTo-Json
# expect ok = true and an environment field
```

**Step 6 — mobile (terminal 2)**

```powershell
cd apps/mobile
$env:EXPO_PUBLIC_API_URL = 'http://10.0.2.2:8787'   # Android emulator
# physical device on the same Wi-Fi: use your machine's LAN IP, e.g. http://192.168.1.20:8787
npx expo start
```

`10.0.2.2` is the Android emulator's alias for the host. `localhost` inside the emulator is the emulator itself, which is why it fails.

**Step 7 — the four beats**

| Beat | Do | Say | Expect |
|---|---|---|---|
| 1 | Create Product → photo → record voice → back | "No signal needed. It is already saved on the phone." | "Saved on this phone" |
| 2 | Sync | "Now it syncs. Watch the upload." | Progress %, then review-required |
| 3 | Review → decide four proposals → approve → publish | "AI proposed. I decided. I published." | APPROVED → PUBLISHED, version 1 |
| 4 | Sign out → sign in as buyer → Explore → search → open → ask | "And now it is findable." | Inquiry with status NEW |

**Step 8 — recovery commands**

```powershell
# full reset
docker compose -f infra/docker/local-compose.yml down -v
docker compose -f infra/docker/local-compose.yml up -d

# port 8787 in use
Get-NetTCPConnection -LocalPort 8787 | Select-Object OwningProcess
# stop only that process, never all node processes

# API unreachable from device
Test-NetConnection <your-lan-ip> -Port 8787
```

### 6.4 Backup plan

| Failure | Fallback | Time to switch |
|---|---|---|
| Postgres won't start | Show the recorded demo video; narrate over it | 5 s |
| Migrations fail | Skip to the pre-seeded snapshot; if unavailable, use the video | 10 s |
| API won't boot | Use `Invoke-RestMethod` against a recorded response set, or the video | 10 s |
| Device can't reach the API | Switch to the Android emulator with `10.0.2.2` | 60 s |
| Live AI unavailable | The deterministic provider already runs in development — this is the expected path, not a fallback | 0 s |
| Wi-Fi dies | That is the demo. Capture offline, show "Saved on this phone", then reconnect | 0 s |
| Projector/phone mirroring fails | Screenshots in slide 9; talk the four beats | 5 s |

**Non-negotiable:** have a 3-minute screen recording of the full journey, made on the demo machine, stored locally (not streamed). It is the only fallback that cannot fail with the network.

### 6.5 Readiness checklist

**Night before**

- [ ] `docker compose up -d`; both containers healthy
- [ ] All 11 migrations applied cleanly on a fresh volume
- [ ] `npx tsx scripts/seed-demo.ts` succeeds; IDs written down
- [ ] `npx wrangler dev` boots; `/health` returns `ok: true`
- [ ] `npx expo start` boots; app installs on the demo device
- [ ] Full four-beat run completed once, end to end
- [ ] Screen recording captured and played back locally
- [ ] Slides exported to PDF as well as the editor file

**Morning of**

- [ ] Docker running before you enter the room
- [ ] Both terminals open with the env var already set
- [ ] Phone charged, unlocked, app already signed in as artisan
- [ ] Buyer credentials on paper, not in a chat window
- [ ] Recording open in a second window
- [ ] Notifications silenced on both devices

**During**

- [ ] Say the state out loud before the screen shows it
- [ ] If something fails, name it plainly and move to the fallback — do not debug on stage
- [ ] Never read a UUID from the guide; read it from the seed output
- [ ] Keep the honest-limits slide in; it buys more credibility than it costs

**Do not**

- [ ] Commit, push, deploy, or reset a database during the session
- [ ] Paste a connection string into a slide, a chat, or a recording
- [ ] Claim the AI/voice pipeline was verified end to end
- [ ] Claim web or iOS support

---

## Appendix A — Verified route reference

```
GET    /health

POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout

POST   /catalog/products                      Idempotency-Key optional
GET    /catalog/products/:id
PATCH  /catalog/products/:id
GET    /catalog/products/:id/versions
POST   /catalog/products/:id/publish          Idempotency-Key required
POST   /catalog/products/:id/transition       refuses APPROVED / PUBLISHED (409)

POST   /catalog/products/:id/media            Idempotency-Key required
POST   /catalog/media/:id/upload-authorization
POST   /catalog/media/:id/upload-start
POST   /catalog/media/:id/upload-completion

POST   /catalog/products/:id/ai-jobs          Idempotency-Key required
GET    /catalog/products/:id/ai-jobs
GET    /catalog/ai-jobs/:jobId
GET    /catalog/ai-jobs/:jobId/history
POST   /catalog/ai-jobs/:jobId/run
POST   /catalog/ai-jobs/:jobId/decisions

GET    /catalog/products/:id/review
POST   /catalog/products/:id/review/approve   no body; state-idempotent

GET    /discovery/products?search=&limit=&offset=
GET    /discovery/products/:productId

GET    /inquiries
GET    /inquiries/:inquiryId
POST   /inquiries                             Idempotency-Key required
```

## Appendix B — Verification commands, and what they do not prove

```powershell
# the repository's fast gate
pnpm verify

# equivalent, explicitly
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/verify.ps1
```

Eight steps: mobile `tsc --noEmit` → mobile `eslint .` → api `tsc --noEmit` → `wrangler deploy --dry-run` → contracts `tsc` → config `tsc` → utils `tsc` → 74 named suites via `tsx`.

Postgres-backed suites have their own scripts (`verify-m3-postgres.ps1` … `verify-rls-postgres.ps1`) and require a running database.

**What this does not prove:** that the AI provider returned a real answer, that voice was transcribed, that web or iOS works, or that the deployed Hyperdrive instance is reachable. Those are separate, and the README's known-limitations list is the authoritative statement of which ones are open.

## Appendix C — Source-of-truth map for disputes

| Question | Authoritative file |
|---|---|
| What are the product states? | `infra/migrations/001_catalog/migration.sql` (CHECK constraint) |
| What does RLS actually allow? | `infra/migrations/010_row_level_security.sql` |
| What grants does the app role have? | `infra/database/app-role.sql` |
| What is mounted where? | `apps/api/src/index.ts` |
| What runs on a queue message? | `apps/api/src/worker.ts` |
| How is the AI provider chosen? | `apps/api/src/modules/ai/composition.ts` |
| What are the design tokens? | `apps/mobile/src/constants/theme.ts` |
| What is the local schema? | `apps/mobile/src/storage/database.ts` |
| What is the required verification? | `scripts/verify.ps1` and `AGENTS.md` §16 |
| What is honestly unfinished? | `README.md` known limitations + `docs/MVP_DEMO_GUIDE.md` §16 |

---

*End of document.*

