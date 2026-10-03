# Task Contract: M4 AI-Assisted Catalog Pipeline (first slice)

## Goal

Prove the AI-assisted catalog pipeline end to end against a deterministic
local provider: a queued AI job runs through a provider adapter and four
ordered validation stages, produces auditable proposal artifacts with
explicit failure/retry/partial/dead-letter states, and can only reach
canonical catalog state through an explicit human decision.

## Gap analysis (existing vs missing)

Existing:

- `packages/contracts` — `ProductState`, catalog/media response contracts.
  No AI job states, proposal contracts, or provider boundary types.
- `apps/api/src/modules/catalog` — product domain, lifecycle, publish and
  catalog versioning (M3, verified).
- `apps/api/src/modules/media` — upload authorization and verification (M2B).
- `apps/api/src/shared` — PostgreSQL database + transactions, connection
  resolution, `AppError`, session authentication, request context, rate
  limits, object storage.
- Migrations `001`–`005` — `catalog_products`, `media_attachments`,
  idempotency, media verification, `catalog_versions`.
- Test harness — `tests/mN-*/`, `scripts/verify.ps1` (service-free fast
  path), `scripts/verify-m3-postgres.ps1` (real PostgreSQL + restart).

Missing (the whole of M4):

- `apps/api/src/modules/ai/` contains only a placeholder `README.md`. No
  domain, application, infrastructure, provider adapter, or HTTP.
- No AI job persistence (`ai_jobs`) and no proposal persistence.
- No provider abstraction of any kind, deterministic or otherwise.
- No schema / semantic validation, normalization, or confidence-risk
  assessment.
- No retry, partial-result, or dead-letter behavior.
- No human review of a proposal, therefore no path from AI output to a
  catalog value at all.
- No `AI_JOB_STATES`, proposal, or failure-taxonomy contracts.

## Scope

1. `packages/contracts/src/ai/ai.ts` — AI job states, job types, proposal
   fields/sources/decisions, risk levels, normalized failure codes, provider
   request/response boundary types, version constants, API responses.
2. `apps/api/src/modules/ai/domain/` — job state machine and retry policy;
   provider capability interface; normalized error taxonomy; the four-stage
   validation pipeline as pure functions.
3. `apps/api/src/modules/ai/application/` — `AiPipelineService`
   (enqueue + execute) and `AiReviewService` (accept / edit / reject) behind
   a narrow catalog port.
4. `apps/api/src/modules/ai/infrastructure/` — in-memory repository, PostgreSQL
   repository, deterministic local provider, composition root.
5. `infra/migrations/006_ai_jobs_and_proposals.sql` — `ai_jobs`,
   `ai_proposals`, decision-freeze trigger.
6. `apps/api/src/modules/ai/http.ts` + wiring in `apps/api/src/index.ts`.
7. Focused tests, a real-PostgreSQL two-phase runtime proof with restart, and
   registration in `scripts/verify.ps1` plus `scripts/verify-m4-postgres.ps1`.
8. `docs/architecture/ai-contract.md` — record the decisions M4 makes.

## Non-Goals

- M2B media upload, M2C PostgreSQL binding/persistence, M3 catalog
  lifecycle/versioning. The Catalog module is read and called only through
  its existing public service; it is not modified.
- The transactional outbox and queue transport (ADR-008). ADR-008 is honoured
  as a constraint — every job carries `event`-shaped causation and
  idempotency identity — but the outbox table, dispatcher, and Cloudflare
  Queues binding are a separate slice. The explicit `run` endpoint is the
  worker seam a queue consumer would call.
- A real or paid AI provider, provider SDK, or outbound network call.
- Audio transcription, image analysis, embeddings, buyer matching. Only the
  catalog-field-generation capability is introduced, because introducing
  capability interfaces nothing implements would be speculative.
- The Review module's moderation decisions, mobile client work, discovery,
  and inquiry.

## Acceptance Criteria

- [x] A job is enqueued for an owned product with an `Idempotency-Key`;
      replaying the key returns the same job and creates no second row.
- [x] A queued job executes through the provider interface and reaches an
      explicit terminal state: `SUCCEEDED`, `PARTIAL_RESULT`, `FAILED`, or
      `DEAD_LETTERED`.
- [x] Structured provider output is schema-validated before any business
      rule runs; an unparseable response cannot become a proposal.
- [x] Semantic/business validation, normalization, and confidence/risk
      assessment run in that order, and each stage's outcome is recorded.
- [x] Transient provider failures retry with recorded `attempt_count` and
      `next_attempt_at`; exhausting the budget dead-letters the job.
- [x] Permanent provider failures do not retry and leave the job `FAILED`.
- [x] A partial response produces `PARTIAL_RESULT` with the rejected fields
      named, and the valid fields still carried as proposals.
- [x] Every proposal records provider, model, model version, prompt version,
      schema version, pipeline version, confidence, validation status, and
      risk, so a stored value can be explained after the fact.
- [x] Executing a job to a terminal state does not change any canonical
      catalog field, proven against the real Catalog service and repository.
- [x] Only an explicit human accept/edit/reject reaches catalog, and a
      rejected or already-decided proposal cannot.
- [x] An edited proposal applies the artisan's value, not the AI's.
- [x] A decided proposal is immutable, enforced by the database.
- [x] The provider is replaceable: a second adapter implements the same
      interface with no change to the pipeline, service, or HTTP layer.
- [x] Job and proposal state survive a PostgreSQL restart in a new process.
- [x] `pnpm verify` and API/contracts typechecks pass.

## Expected Changes

- New: `packages/contracts/src/ai/ai.ts`
- New: `apps/api/src/modules/ai/{domain,application,infrastructure}/*`,
  `apps/api/src/modules/ai/{http,composition,index}.ts` and seven `*.test.ts`
  plus one shared test double (`catalog-product-port.test-double.ts`)
- New: `infra/migrations/006_ai_jobs_and_proposals.sql`
- New: `tests/m4-ai-pipeline/{ai-pipeline-postgres-runtime.test.ts,tsconfig.json}`
- New: `scripts/verify-m4-postgres.ps1`
- Modified: `packages/contracts/src/index.ts`, `apps/api/src/index.ts`,
  `apps/api/src/modules/ai/README.md`,
  `apps/api/src/shared/ratelimit/index.ts`, `scripts/verify.ps1`,
  `docs/architecture/ai-contract.md`
- Dependencies expected: none.

## Governing Context

- Specification: `docs/specs/first-vertical-slice.md` (AI Assistance, AI
  Validation, Human Correction, Required Failure Scenarios; acceptance
  criteria 6–9, 14, 15)
- ADRs: 002 (canonical state and AI proposal boundary), 005 (AI jobs and
  provider abstraction), 008 (events/outbox/queue boundary), 010 (verification
  strategy), 011 (repository layout)
- Contracts: `docs/architecture/ai-contract.md`,
  `docs/architecture/module-boundaries.md`
- Specialist skills: `incremental-implementation`, `test-driven-development`,
  `security-and-hardening`, `code-review-and-quality`, `karpathy-guidelines`

## Verification

- Focused tests: AI domain state machine, retry policy, validation pipeline
  and contract/schema validation, pipeline service, review service, PostgreSQL
  repository SQL shape, HTTP end to end.
- Real PostgreSQL: `scripts/verify-m4-postgres.ps1` — write phase, container
  restart, read phase in a new process.
- Type/build: `apps/api` tsc, `packages/contracts` tsc, `wrangler deploy --dry-run`.
- Full repository: `pnpm verify`.

## Assumptions

- A confidence threshold is a policy value. M4 fixes `0.70` for
  publish-blocking fields and records it on every proposal; ADR-005 requires it
  to be observable and versioned, so a change is a `PIPELINE_VERSION` change.
- Every proposal requires human review regardless of confidence, because
  ADR-002 states AI can never independently authorize anything. Confidence
  therefore drives risk flagging and ordering, never auto-approval.
- The deterministic provider is a development and test adapter, selected only
  in `development`/`test`, exactly as the in-memory repositories are.

## Risks

- A synchronous `run` endpoint stands in for a queue consumer; the job state
  machine and idempotency are what make that safe, but no queue transport is
  proven here.
- A proposal is a point-in-time suggestion. A job that finishes after the
  artisan has already edited a field produces a proposal based on stale input.
  The decision API reports staleness; it does not silently discard the
  proposal, because the documented conflict policy is newest confirmed edit
  wins.
- Risk assessment covers low confidence, absent publish-blocking fields, and
  fields carried forward despite failing semantic validation. It is not
  content moderation; that remains mandatory-moderation scope from
  `AGENTS.md` §10 and is not claimed as done.

## Evidence Status

- `VERIFIED`

All fifteen acceptance criteria are checked. Evidence, as actually run:

- `pnpm verify` (service-free fast path, includes all seven AI suites
  registered in `scripts/verify.ps1`) — `FULL FAST VERIFY PASSED`.
- `pnpm --filter @artisan-marketplace/api run typecheck` — exit 0.
- `pnpm --filter @artisan-marketplace/contracts run typecheck` — exit 0.
- `npx wrangler deploy --dry-run` — exit 0, worker bundles and Hyperdrive
  binding resolve.
- `pwsh -NoProfile -File scripts/verify-m4-postgres.ps1` — applies migration
  `006` idempotently, writes, restarts the container, then reads in a new
  process: `M4 AI PIPELINE POSTGRESQL PROOF PASSED`.

Criterion-by-criterion, in the layers they are actually proved:

- 1 idempotency — service suite + real `(owner_id, idempotency_key)` count.
- 2 terminal states — `SUCCEEDED`, `PARTIAL_RESULT`, `RETRYING`→terminal,
  `FAILED`, `DEAD_LETTERED` all asserted in the pipeline service suite.
- 3 schema before business rules — a non-object provider answer is proved to
  end as `FAILED` with zero proposals and zero proposal history, in the
  service suite and against the real database.
- 4 stage order — validation pipeline suite asserts schema → semantic →
  normalization → risk, and that a `REJECTED` draft is recorded but not
  reviewable.
- 5/6 retry and permanent failure — service suite; real `next_attempt_at is
  null` for a permanent failure proved against the database.
- 7 partial result — description echoing the title is semantically rejected
  while the other fields remain proposals.
- 8 proposal provenance — asserted in the service suite and read back after
  restart.
- 9 no canonical write — asserted against the real Catalog service before
  review, for both the succeeding and the failing job.
- 10/11 human decision only — review service suite plus the real write phase;
  `EDITED` applies the artisan's value, `REJECTED` writes nothing.
- 12 database immutability — the update/delete rejections are real, and the
  recorded constraint messages were confirmed by hand to be the immutability
  trigger and `ai_proposals_state_check`, not malformed SQL.
- 13 provider replaceable — `AlternativeProvider` in
  `ai-pipeline-service.test.ts` and `UnusableProvider` in the runtime proof
  are independent implementations of `CatalogAiProvider`; both run through
  the unchanged pipeline, and the substituted adapter's own attribution,
  values, and failure category are what get recorded.
- 14 restart durability — read phase builds fresh services and re-asserts
  job, proposals, decisions, applied values, risk, history, and the frozen
  decision, plus the failed job's category and diagnostic.
- 15 build gates — as listed above.

### Defect found and fixed during verification

`toAiFailure()` did not recognize an already-normalized `AiFailure`, so a
schema rejection was re-normalized into `DEPENDENCY_FAILED` with the generic
message "AI provider failed for an unknown reason." and a `[object Object]`
diagnostic. The job therefore recorded a schema problem as an unknown
provider fault, losing the normalized category operations read and the
diagnostic that explains it. `toAiFailure()` now passes a normalized failure
through unchanged, guarded by `isAiFailure()` so an arbitrary object with a
`code` field cannot smuggle an unrecorded category into a job row. This was
found by a test, not by inspection, and the database-level assertion was
confirmed red-capable by temporarily disabling the fix.

### Open contract decision (not a blocker; human decision required)

`AI_FAILURE_CODES` declares `PROVIDER_OUTPUT_NOT_AN_OBJECT` and
`PROVIDER_OUTPUT_EMPTY`, but `schemaFailure()` emits
`PROVIDER_OUTPUT_SCHEMA_INVALID` for every rejection. The two unused codes
are never produced, and migration `006` permits them. The detail is not lost:
the recorded message and diagnostic still say "was not a JSON object" versus
"contained no usable field". Emitting the specific code per case is a
contract-level refinement and was deliberately not made as a side effect of a
test fix. Recommended as a follow-up, decided by a human.

### Not claimed as done

- No queue transport or transactional outbox. `run` is the worker seam
  (ADR-008 constraint honoured, mechanism deferred to a separate slice).
- No real provider adapter, no outbound network call.
- No content moderation, and no transcription, image analysis, embeddings, or
  buyer matching.
- No mobile client work.
