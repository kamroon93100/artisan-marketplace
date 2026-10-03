# Task Contract: M5 Human Review → Correction → Publish

## Goal

Close the last gap in the first vertical slice: give an artisan one
authorized workflow that carries a product from AI proposals to a
buyer-visible, immutable catalog version, and prove the whole chain against
real PostgreSQL across a restart.

The chain, end to end:

```
AI-generated proposals
→ artisan sees reviewable changes
→ artisan accepts / edits / rejects
→ canonical draft changes ONLY through that explicit decision
→ approve (an authorized business operation, not a state write)
→ publish (an authorized business operation)
→ immutable catalog version
→ published version survives a database restart
```

## Gap analysis (existing vs missing)

Read: `docs/architecture/ai-contract.md`, `docs/adr/002`,
`docs/adr/009`, `docs/architecture/data-and-rls-contract.md`,
`docs/specs/first-vertical-slice.md`, `docs/architecture/module-boundaries.md`,
and the current catalog / AI / mobile code.

### Existing

- **M4 (verified)** — AI job state machine, provider abstraction, the
  four-stage validation pipeline, retry / partial / dead-letter behaviour,
  proposal provenance, and `AiReviewService.applyDecisions`, which is the
  only route by which an AI-derived value can reach a product.
- **M3 (verified)** — `CatalogService.publish` requires `APPROVED`, requires
  non-blank `title`/`description`, allocates the next version, records
  `publishedBy`, is idempotent, and writes an immutable `catalog_versions`
  row. `POST /catalog/products/:id/publish` and
  `GET /catalog/products/:id/versions` exist.
- Migration `006` already provides the partial index that a "undecided
  proposals for this product" query needs
  (`ai_proposals_pending_idx on (product_id, job_id) where decision = 'PENDING'`).
- `apps/api/src/modules/review/` exists as a boundary placeholder, and
  `docs/architecture/module-boundaries.md` already assigns it "review
  decisions, risk/manual-review state, moderation transitions" with a
  documented dependency on both Catalog and AI.

### Missing — the whole of M5

1. **No authorized route to `APPROVED`.** `APPROVED` is currently reachable
   by `CatalogService.transition(id, 'APPROVED', actor)` and by
   `POST /products/:id/transition` with a client-supplied state. ADR-002
   reserves `APPROVED` and `PUBLISHED` for "authorized business workflows"
   and states AI confidence "cannot independently authorize publication". A
   generic state write is not a workflow: it performs no review check at
   all, so a product with four undecided AI proposals can be approved and
   published today. The first-vertical-slice requirement that "required
   product data and review conditions must be satisfied" is therefore
   unenforced.

2. **No reviewable surface.** `GET /ai-jobs/:jobId` returns one job's latest
   attempt. Nothing aggregates the proposals across a product's jobs, pairs
   a proposal with the canonical value it would replace, reports whether it
   was generated from input that has since changed, or says what still
   blocks approval. "Artisan sees reviewable changes" has no
   implementation at all.

3. **No publication gate that reflects review.** Because `APPROVED` is
   trivially reachable, `publish`'s `APPROVED` precondition proves nothing
   about whether a human ever saw the suggestions.

4. **No mobile client path.** M4 recorded "no mobile client work". The app
   can capture, sync, and upload; it cannot show a suggestion, decide on
   one, approve, or publish. The artisan half of the slice is unproven.

5. **No end-to-end review → publish → restart proof.** Nothing walks the full
   chain against a real database and re-reads it in a new process.

## Scope

### 1. Catalog: make approval an authorized operation

- `CatalogService.approve(id, actorId)` — ownership, state precondition,
  compare-and-set, idempotent (`changed: false` when already `APPROVED`).
- `assertApprovableState(state)` in `domain/catalog-publish.ts`.
- `CatalogService.transition` refuses `APPROVED` and `PUBLISHED`. Both are
  authorized operations, not state assignments; refusing them at the
  application boundary is what makes `publish`'s `APPROVED` precondition
  mean something. The pure state machine in `domain/catalog-state.ts` is
  unchanged.
- `POST /products/:id/transition` refuses `APPROVED` at the boundary too
  (ADR-009: boundary validation before business logic). It already refuses
  `PUBLISHED`.

**Touching M3 is required, not incidental.** M3's tests reach `APPROVED`
through the generic route purely as setup. Their setup helpers change to
call the new approve operation; every publish/versioning assertion stays
exactly as it was, and the M3 suites are re-run to prove it.

### 2. New `review` module

Per `docs/architecture/module-boundaries.md` and the documented
`Catalog ← Review` / `AI → Review` direction.

- `domain/review-readiness.ts` — pure. `evaluateApprovalReadiness(product,
  suggestions)` → ordered blocking reasons and `readyForApproval`. The one
  place that knows what "reviewed" means.
- `application/review-port.ts` — two narrow ports: `ReviewProductPort`
  (read, approve) and `ReviewSuggestionsPort` (undecided suggestions).
- `application/review-service.ts` — `getReview`, `approve`.
- `infrastructure/catalog-review-port.ts`,
  `infrastructure/ai-suggestions-port.ts` — adapters.
- `composition.ts`, `http.ts`, `index.ts`.
- `GET /catalog/products/:id/review`,
  `POST /catalog/products/:id/review/approve`.

### 3. Contracts

`packages/contracts/src/review/review.ts` — blocking reasons, the review
suggestion projection, and the two review responses. ADR-009 forbids
handing a client a database row, so the suggestion is a DTO that pairs the
proposal with the canonical value it would replace, not an `AiProposal`.

### 4. Proposal staleness: one implementation

`AiReviewService` already computes staleness from the job's input snapshot.
The review surface must show the same fact, so the function moves to
`ai/domain/ai-proposal-staleness.ts` and both call sites use it. Pure
function, no new dependency.

### 5. Mobile

- `src/network/review-contract.ts` + `review-transport.ts` + a focused
  transport test, following the existing `product-sync-transport` pattern.
- `src/features/review/ReviewProductScreen.tsx` — one screen: canonical
  values, undecided suggestions with confidence / risk / staleness,
  accept / edit / reject per suggestion, approve with its blocking
  reasons, publish, and published version history.
- Reached from `CreateProductScreen` once the draft has a
  `remoteProductId`.

No new navigation, state, or design-system infrastructure.

### 6. Verification

- Focused suites: review readiness, review service, catalog approve,
  review HTTP journey, mobile transport.
- `tests/m5-review-publish/` — real PostgreSQL, two processes, restart
  between them.
- `scripts/verify-m5-postgres.ps1`; registration in `scripts/verify.ps1`.
- `docs/architecture/ai-contract.md` — record the approval decision.

## Non-Goals

- Queue / outbox / dispatcher (ADR-008). Still a separate slice; `run`
  remains the worker seam.
- A real external AI provider. The deterministic adapter is the test
  fixture; the abstraction already permits a second one.
- Content moderation and mandatory-moderation workflows (`AGENTS.md` §10).
  The Review module's *mandatory moderation* role is a later slice; this
  one is the artisan's own review.
- Discovery, inquiry, buyer-facing reads.
- An audit-event table. `ai_proposals.decided_by/decided_at` and
  `catalog_versions.published_by` already carry the two authorization-
  sensitive facts; a general Audit module remains out of scope.
- A local queue for review actions on the client. See Risks.
- Any change to the AI pipeline, provider contract, or job state machine.

## Acceptance Criteria

Status key: `[x]` verified by the commands in Evidence Status. `[x]*` verified
with a recorded deviation — see Deviations. `[ ]` not established.

- [x] An artisan can read a product's review surface: canonical values,
      every undecided valid proposal with its provenance, confidence, risk,
      staleness, and the value it would replace.
      (`review-readiness.test.ts`, `review/http.test.ts`)
- [x] The review surface states what blocks approval, and why, with an
      empty list exactly when nothing does.
      (`review-readiness.test.ts`, `review-publish.test.ts`)
- [x] `APPROVED` cannot be reached by a generic state write, at the service
      or at the HTTP boundary, in either direction (`transition` and
      `transition` route).
      (`catalog-approve.test.ts`, `catalog-lifecycle.test.ts`,
      `catalog-lifecycle-http.test.ts`)
- [x] Approval is refused while any valid proposal for the product is still
      `PENDING`, naming the fields.
- [x] Approval is refused when a publish-required field is blank.
- [x] Approval is idempotent: a repeat returns the approved product and
      writes nothing. (`deduplicated` is the reported signal, not the
      status code.)
- [x] Approval is refused for another artisan's product and changes
      nothing.
- [x] Publish remains reachable only from `APPROVED`, still requires
      non-blank required fields, and still writes exactly one immutable
      version per publish (M3 behaviour unchanged). M3 test files were edited
      to reach `APPROVED` through the new operation, so the M3 suites were
      re-run rather than assumed — they are in the `pnpm verify` list below
      and passed. The claim that their *assertions* were left unchanged
      (setup helpers only) comes from the slice's own review; it could not be
      re-checked at finalization because the repository has no commits to
      diff against, so it is recorded as a claim rather than as independently
      verified.
- [x] The chain `proposal → decision → approve → publish → version` is
      proven against real PostgreSQL, and the version, the decision, the
      applied value, and the approval all survive a restart in a new
      process. (`scripts/verify-m5-postgres.ps1`; read phase assertions
      B1–B7.)
- [x]* The mobile screen can read the review surface, decide on a
      suggestion, approve, and publish, and reports a failed action without
      discarding the artisan's input.
      (`review-transport.test.ts`, `review-decision.test.ts`,
      `review-screen-transport-identity.test.ts`) Screen behaviour is proven
      against an injected transport; the shipped transport sends no
      credentials, so the screen is not proven against an authenticated
      API. See Deviation D2.
- [x] Mobile/API contract tests pass; `apps/api`, `packages/contracts`, and
      `apps/mobile` typecheck; `wrangler deploy --dry-run` succeeds;
      `pnpm verify` passes. Every one of those is a step of
      `scripts/verify.ps1` (mobile tsc, mobile eslint, API tsc,
      `wrangler deploy --dry-run`, contracts/config/utils tsc, then the unit
      suites), so the passing fast-path run is the evidence for all of them.

## Expected Changes

**New**

- `packages/contracts/src/review/review.ts`
- `apps/api/src/modules/review/`
  - `domain/review-readiness.ts`, `domain/review-readiness.test.ts`
  - `application/review-port.ts`
  - `application/review-service.ts`, `application/review-service.test.ts`
  - `infrastructure/catalog-review-port.ts`,
    `infrastructure/ai-suggestions-port.ts`
  - `composition.ts`, `composition.test.ts`, `http.ts`, `http.test.ts`,
    `index.ts`
- `apps/api/src/modules/ai/domain/ai-proposal-staleness.ts`
- `apps/api/src/modules/catalog/catalog-approve.test.ts`
- `apps/mobile/src/network/review-contract.ts`,
  `review-transport.ts`, `review-transport.test.ts`
- `apps/mobile/src/features/review/ReviewProductScreen.tsx`
- `tests/m5-review-publish/{review-publish-postgres-runtime.test.ts,tsconfig.json}`
- `scripts/verify-m5-postgres.ps1`

**Modified**

- `packages/contracts/src/index.ts`
- `apps/api/src/modules/catalog/application/catalog-service.ts`,
  `domain/catalog-publish.ts`, `http.ts`
- `apps/api/src/modules/ai/application/ai-review-service.ts`
- `apps/api/src/modules/ai/README.md`,
  `apps/api/src/modules/review/README.md`
- `apps/api/src/index.ts`, `apps/api/src/shared/ratelimit/index.ts`
- `apps/api/src/modules/catalog/catalog-lifecycle.test.ts`,
  `catalog-lifecycle-http.test.ts` (setup helpers only)
- `apps/mobile/src/features/capture/CreateProductScreen.tsx`
- `scripts/verify.ps1`, `docs/architecture/ai-contract.md`

Dependencies expected: none.

## Governing Context

- Specification: `docs/specs/first-vertical-slice.md` (Human Correction,
  Publishing, Required Failure Scenarios, acceptance 8–11, 14–16)
- ADRs: 002 (canonical state and AI proposal boundary), 003 (offline-first
  sync and idempotency), 005 (AI jobs and provider abstraction), 009 (API
  contract and versioning), 011 (repository layout)
- Contracts: `docs/architecture/ai-contract.md`,
  `docs/architecture/module-boundaries.md`,
  `docs/architecture/data-and-rls-contract.md`
- Skills: `incremental-implementation`, `test-driven-development`,
  `security-and-hardening`, `code-review-and-quality`, `karpathy-guidelines`

## Verification

- Focused: review readiness, review service, catalog approve, review HTTP
  journey, mobile transport. (The "review service" coverage lives in
  `review-readiness.test.ts` and the module-root `review-publish.test.ts`
  rather than a separate `review-service.test.ts`; see D1.)
- Real PostgreSQL: `scripts/verify-m5-postgres.ps1` — write phase,
  container restart, read phase in a new process.
- Build: API / contracts / mobile tsc, `wrangler deploy --dry-run`.
- Full repository: `pnpm verify`.
- Review: adversarial read of the finished diff, then a changed-file
  inspection.

All of the above were run; see Evidence Status for the recorded results.

## Assumptions

- **Review requires only a human decision, never a moderator.** The
  artisan reviewing their own product is the review condition for the first
  slice. `data-and-rls-contract.md` reserves reviewer-only surfaces for a
  moderation role that does not exist yet; that is not in scope here.
- **An undecided `REJECTED`-validation proposal does not block.** A proposal
  the pipeline already rejected carries no suggestion; the decision API
  refuses it for the same reason. Only `PENDING` + `VALID` blocks.
- **Approval checks required fields, not publication.** A product can be
  approved and still refuse to publish until its description is filled in.
  That matches the M3 behaviour the specification fixes and keeps approve
  and publish as two distinct, separately-authorized steps.
- **Review and publish require connectivity.** They act on server-authoritative
  canonical state, so they cannot be queued offline. The client states this
  and retains the artisan's input across a failed request.
- **Confidence never unblocks anything.** A high-confidence proposal still
  requires a decision. This is ADR-002 and is not revisited.

## Risks

- **A product with no AI job is approvable with no suggestions at all.**
  That is intentional — ADR-002 requires an AI failure never to block manual
  creation — but it means "reviewed" means "nothing is outstanding", not "a
  human inspected AI output". The review surface says which case it is.
- **Approve is not idempotent by key.** It converges on the recorded state
  instead. An approval creates no new record, so there is nothing to key;
  the accepted-value analogue is `catalog_versions.idempotency_key` on
  publish, which is already covered.
- **No client-side queue for review actions.** An artisan offline who has
  typed a correction cannot submit it until connectivity returns, and an
  interrupted approve is retried by hand. A local review-action queue is
  the same machinery as the M2 sync queue and is a separate slice; it is
  recorded here rather than silently omitted.
- **Closing `APPROVED` changes M3 test setup.** The M3 assertions are
  unchanged, but M3 test files are edited, so the M3 suites are re-run
  rather than assumed.
- **One product state cannot express "reviewed with suggestions left
  unresolved".** Refusing to approve is the enforcement; the state stays
  `REVIEW_REQUIRED` and the blocking list carries the reason.
- **The readiness check and the approval write are not one atomic step.**
  `ReviewService.approve` re-runs `evaluateApprovalReadiness` immediately
  before the write, against a fresh read, but that read and the
  `catalog_products` update are separate statements. A proposal that lands in
  the window between them is not seen, and the product is approved with it
  outstanding. The read phase of the PostgreSQL proof does not exercise this
  interleaving, so nothing here tests for it.

  This is the gap that `docs/architecture/ai-contract.md` ("Known gap", after
  the Approval section) and `apps/api/src/modules/review/README.md`
  ("Known gap") both defer to this document. Both were written pointing at a
  risk that was not recorded here; this entry closes that dangling pointer.
  Neither companion document overstates the bounding, and neither is amended
  by it.

  Closing it needs a single guard spanning `catalog_products.state` and
  `ai_proposals`, which would make one module read the other's tables or
  share its lock discipline — a change to the module-boundary contract
  (`docs/architecture/module-boundaries.md`), not a local fix. It is bounded
  today because the AI module refuses to enqueue for a product outside its
  working states, `APPROVED` is deliberately not one of them, and approval
  and publication are separate explicit operations, so an affected product
  stays `APPROVED` rather than buyer-visible until a second, deliberate
  publish. The remaining interleaving is an AI job enqueued before the
  approval and still running when it happened.

## Deviations

Recorded rather than smoothed over. None of these is a silent scope change;
each is a deliberate difference between this contract and what shipped.

- **D1 — `application/review-service.test.ts` was not created as its own
  file.** The service coverage is folded into
  `apps/api/src/modules/review/domain/review-readiness.test.ts`, which
  imports `ReviewService`, `CatalogServiceReviewProductPort`, and the
  `ReviewSuggestionsPort` fake directly, and prints
  `REVIEW READINESS AND SERVICE TESTS PASSED`. Readiness and the service
  that applies it are one rule seen at two altitudes, and splitting them
  across two runners would have duplicated the same in-memory Catalog
  fixtures to keep them honest. A second suite,
  `apps/api/src/modules/review/review-publish.test.ts`, was added beyond the
  Expected Changes list: it wires the real Catalog, AI, and Review modules
  over in-memory storage so the journey is proven across the seams the
  isolated fakes deliberately do not exercise.
- **D2 — session-authenticated mobile wiring is outside this slice.**
  `apps/api/src/modules/review/http.ts` calls `requireActor` and refuses an
  unreadable `authorization` header, exactly as the Catalog and AI routes
  do. `HttpReviewTransport` sends no credentials. That is not a shortcut
  introduced here: `product-sync-transport.ts` and `media-sync-transport.ts`
  send none either, so the whole client is unauthenticated pending the
  specification's open "Authentication/session model" decision
  (`docs/specs/first-vertical-slice.md`, Open Decisions) and ADR-006. The
  screen's behaviour is verified against an injected transport, so what is
  unproven is specifically the credentialed end-to-end path from the
  installed app to the API. Choosing the client session mechanism is a
  durable product decision and was not taken here.
- **D3 — `scripts/verify-m5-postgres.ps1` is standalone, by design.** The
  contract's Scope §6 asks for "registration in `scripts/verify.ps1`". The
  M5 *unit* suites are registered there (`verify.ps1` `$unitSuites`: the four
  review suites, `catalog-approve.test.ts`, the two mobile review suites, and
  `review-screen-transport-identity.test.ts`). The PostgreSQL proof is not,
  and is not meant to be: its own header says it needs a running database and
  a restart, and `scripts/verify.ps1` is the service-free fast path.
  `verify-m3-postgres.ps1` and `verify-m4-postgres.ps1` are standalone on the
  same basis, so this follows the established convention rather than breaking
  it.

## Evidence Status

**COMPLETE — verified, with the deviations above recorded.**

Recorded at finalization. Nothing below was re-run during finalization; the
finalization step was documentation and cleanup only. The one artifact this
step inspected directly is called out as such.

### 1. `pnpm verify` — PASSED

    FULL FAST VERIFY PASSED

`scripts/verify.ps1`, 8 steps, all green: Mobile TypeScript, Mobile ESLint,
API TypeScript, Cloudflare Worker `wrangler deploy --dry-run`, Contracts
TypeScript, Config TypeScript, Utils TypeScript, then the unit suites. The
test step ran every M5 suite, so each of these is verified:

- `apps\api\src\modules\review\domain\review-readiness.test.ts`
  (readiness + service, per D1)
- `apps\api\src\modules\review\review-publish.test.ts` (full journey)
- `apps\api\src\modules\review\composition.test.ts` — exists, registered at
  `scripts/verify.ps1` line 68
- `apps\api\src\modules\review\http.test.ts` (HTTP journey)
- `apps\api\src\modules\catalog\catalog-approve.test.ts`
- `apps\mobile\src\network\review-transport.test.ts`
- `apps\mobile\src\features\review\review-decision.test.ts`
- `tests\m5-review-publish\review-screen-transport-identity.test.ts`
  (mobile/API contract identity)

The M3 suites re-run for the `APPROVED` route change —
`catalog-lifecycle.test.ts` and `catalog-lifecycle-http.test.ts` — are in the
same list.

### 2. `scripts/verify-m5-postgres.ps1` — PASSED

    M5 REVIEW PUBLISH POSTGRESQL PROOF PASSED

Migrations `005_catalog_versions.sql` and `006_ai_jobs_and_proposals.sql`
applied (re-runnable by construction), then three steps: write phase, restart
of the `artisan-marketplace-postgres` container with a health wait, then the
read phase in a new process with its own services and database handle.

**Inspected directly during finalization:** the temporary root
`m5-postgres-proof.log` (UTF-16LE, 216 bytes) was decoded before deletion and
contains exactly the two process-emitted phase markers:

    M5 REVIEW PUBLISH POSTGRES WRITE PHASE PASSED
    M5 REVIEW PUBLISH POSTGRES READ-AFTER-RESTART PHASE PASSED

The script's terminal banner (`verify-m5-postgres.ps1` line 149) is a
`Write-Host` and was not captured into that redirected log, so the log
corroborates both phases but does not itself contain the terminal
`M5 REVIEW PUBLISH POSTGRESQL PROOF PASSED` line. Nothing else was captured
in the log. It has now been removed; the evidence above is its content.

What the read phase asserts in the new process, after the restart (source
read during finalization, assertions B1–B7 of
`tests/m5-review-publish/review-publish-postgres-runtime.test.ts`):

- **B1** the product is still `PUBLISHED` and the corrected title is intact
- **B2** exactly one `catalog_versions` row, version number 1, `published_by`
  = the owner, the stored title not rewritten; publish history intact
- **B3** the review surface stays honest about a published product
- **B4** all four proposals survive with their decisions and attribution —
  `title` `EDITED`, `description` `ACCEPTED`, `category` `ACCEPTED`,
  `materials` `REJECTED`
- **B5** a decided proposal stays decided after the restart
- **B6** `PUBLISHED` is still not assignable by a generic state write
- **B7** returning to review, editing, and publishing again creates version 2
  and the history holds both

### 3. Focused composition/review tests

Run as part of `pnpm verify` §1 rather than as separate invocations, because
that is how they were actually run; see the registration evidence there.
`review/composition.test.ts` exists, is registered in `scripts/verify.ps1`
line 68, and passed. API TypeScript passed (`pnpm verify` step 3).

### 4. Adversarial review

The final adversarial review of the finished diff found no Critical and no
High findings. That is a review outcome, not a passing command, and it is
recorded as such. The changed-file inspection that accompanies it produced the
deviations above.

### Not claimed

- **graphify was not updated.** `graphify-out/graph.json` still reflects the
  state before this slice's final edits; the graph is stale with respect to
  the current working tree. No `graphify update .` was run, here or in the
  slice.
- **Nothing was committed, pushed, deployed, or published.** The repository
  has no commits yet (`git log` → "your current branch 'master' does not have
  any commits yet"); the whole tree is untracked.
- **No real external AI provider, no moderation workflow, no client-side
  review-action queue** — all out of scope by the Non-Goals above, and none
  is claimed.
- **The non-atomic readiness→approval window is not fixed**, only recorded.
  See Risks.
