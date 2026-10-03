# Artisan Marketplace — Agent Operating Contract

## 1. Project Purpose

Build a production-grade, cross-device, offline-first marketplace for marginalized artisans.

The first validated product journey is:

artisan captures photo + voice
→ saves draft offline
→ syncs when connected
→ uploads media
→ AI-assisted catalog draft
→ artisan corrects/confirms
→ publishes
→ buyer searches/discovers
→ buyer sends inquiry

Do not expand the product surface before this vertical slice is understood and working.

---

## 1A. Rule Precedence

When instructions overlap, resolve them in this order:

1. Safety, security, privacy, and data-loss prevention requirements
2. Explicit user requirements for the current task
3. This `AGENTS.md`
4. Approved project specifications, ADRs, and contracts
5. Task-specific skill instructions
6. Generic examples, recipes, templates, and defaults inside skills

Generic skill examples are reference material, not project architecture.

Never import example technologies, database patterns, authentication models, APIs, or UI architecture merely because a skill demonstrates them.

When two applicable instructions genuinely conflict:
- stop
- identify the conflict
- preserve the higher-priority constraint
- ask for clarification when the conflict cannot be resolved safely

---

## 2. Current Phase

PHASE: Engineering foundation

The repository is intentionally starting clean.

Before substantial product implementation:
1. establish product/spec documents
2. establish architecture decisions
3. establish data/state contracts
4. establish failure and permission behavior
5. then implement the smallest verified slice

Do not jump directly into building many screens.

---

## 3. Engineering Principles

### Think before coding
State assumptions.
Detect ambiguity.
Identify the smallest safe change.
Define verification before implementation.

### Simplicity first
Prefer:
- existing project code
- standard library
- existing dependency
- native platform capability
- smallest necessary implementation

Do not introduce abstractions without a demonstrated need.

Minimal does NOT mean removing:
- security
- validation
- accessibility
- data-loss protection
- failure handling
- authorization
- observability required to operate the feature

### Surgical changes
Change only what the task requires.

Do not perform unrelated refactors, renames, dependency upgrades, formatting sweeps, or architecture rewrites.

### Goal-driven execution
Every implementation task must have:
- observable goal
- acceptance criteria
- verification
- known risks

### Incremental implementation
Prefer thin, independently verifiable slices.

Large multi-system changes must be decomposed before implementation.

---

## 4. Skill Routing

Do NOT invoke every installed skill for every task.

Use skills according to the task.

Typical new feature flow:

context-engineering
→ spec-driven-development
→ planning-and-task-breakdown
→ incremental-implementation
→ test-driven-development
→ code-review-and-quality

Security is a cross-cutting constraint from the beginning of every task involving:
- authentication
- authorization
- user input
- uploads/media
- external integrations
- AI output
- personal data
- secrets
- persistence
- privileged operations

Use security-and-hardening during planning/design and again during implementation/review for applicable tasks. It is not a final-stage-only activity.

Use source-driven-development when implementation depends on framework/library/provider behavior.

Use doubt-driven-development when:
- requirements are ambiguous
- architecture has meaningful tradeoffs
- security/data-loss risk is high
- an irreversible operation is proposed

Use frontend-ui-engineering for product UI.

For animation/motion work use the Emil skills only when motion is relevant:
- animate-expo
- animation-vocabulary
- find-animation-opportunities
- improve-animations
- review-animations
- emil-design-eng

Motion must communicate state or interaction. Do not add animation merely for decoration.

---

## 5. Product Architecture Invariants

### Offline first
The client must remain useful under:
- weak network
- no network
- interrupted uploads
- retries
- duplicate operations
- permission denial
- app restarts
- low-end devices

### Sources of truth

Local device:
- unsynced drafts
- pending operations

PostgreSQL:
- canonical product/catalog/user/inquiry/approval state

R2:
- media objects

Queue:
- transport for asynchronous work only
- never the authoritative source of product state

AI provider:
- generates proposals only
- never owns canonical product state

### AI trust boundary

AI output is untrusted input.

Pipeline:

capture
→ offline draft
→ sync
→ queue
→ AI
→ schema validation
→ semantic/business validation
→ normalization
→ quality/risk assessment
→ retry / partial result / human review
→ catalog version
→ publish

AI must never directly mutate canonical product tables.

Confidence is NOT approval.

An artisan-confirmed value must never be silently overwritten by later AI output.

---

## 6. State Separation

Product/catalog state and AI-job state are separate.

Example product states:

LOCAL_DRAFT
PENDING_SYNC
SYNCED
REVIEW_REQUIRED
APPROVED
PUBLISHED
ARCHIVED
CONFLICT
ACTION_REQUIRED

Example AI job states:

QUEUED
RUNNING
RETRYING
PARTIAL_RESULT
SUCCEEDED
FAILED
DEAD_LETTERED

Do not combine business state and infrastructure/job state into one enum.

---

## 7. Sync and Events

All important mutations must be designed for idempotency.

Events should carry sufficient causation/context information, including where applicable:

event_id
event_type
event_version
aggregate_id
producer
occurred_at
correlation_id
causation_id
idempotency_key
payload

Use transactional outbox semantics when introducing asynchronous domain events:

database transaction
→ state mutation + outbox event
→ dispatcher
→ queue

The queue is not the source of truth.

---

## 8. Media

Use direct short-lived uploads to object storage.

Do not route large media payloads unnecessarily through application servers.

Uploads must tolerate:
- retry
- interruption
- duplicate requests
- expired upload credentials
- partial failure

---

## 9. Conflicts

Conflict policy:

media:
- merge distinct media
- flag probable duplicates

title/description:
- newest artisan-confirmed edit wins

AI metadata:
- never silently overwrite artisan-confirmed values

published listing changes:
- create a new catalog version when required

delete:
- use tombstone semantics before permanent purge where retention policy requires it

---

## 10. Review and Safety

Use risk-based review.

Normal catalog metadata:
- artisan review/confirmation

Manual correction/review when appropriate:
- low-confidence craft classification
- material
- price
- language
- generated description

Mandatory moderation where required:
- prohibited claims
- policy-sensitive content
- potential intellectual-property issue
- unsafe category
- fraud indicators
- repeated reports

Never treat model confidence alone as authorization to publish.

---

## 11. Security

Treat all external/user/AI data as untrusted.

Validate:
- schemas
- authorization
- ownership
- file metadata
- content boundaries
- external responses

Never log:
- passwords
- access tokens
- secret keys
- raw authorization headers
- unnecessary sensitive personal data

Use least privilege.

Security review is required for authentication, authorization, file uploads, external integrations, user-generated content, AI outputs, and personal data.

---

## 12. Observability

Production behavior must be diagnosable.

Where appropriate record:
- request/correlation IDs
- structured events
- job lifecycle
- retries
- failures
- latency
- provider/model identifiers
- audit events

Do not expose secrets or unnecessary personal data in logs.

---

## 13. UX Rules

The application must make system state understandable.

Important visible states include:

Saved on device
Waiting for connection
Uploading
Processing
Needs your review
Published
Action needed

Failure states must explain the next useful action.

Accessibility is a requirement, not a polish phase.

---

## 14. Database / Backend Direction

Target architecture:

Client:
React Native + Expo
TypeScript
Expo Router
TanStack Query
Zustand
SQLite
SecureStore
Reanimated
gluestack-ui
project-owned design tokens/components

Backend:
Cloudflare Workers + Hono
PostgreSQL / Supabase
RLS
pgvector
Cloudflare R2
Cloudflare Queues
AI Gateway
Hyperdrive

Start as a modular backend.

Do not introduce distributed microservices until validated usage or isolation requirements justify them.

Provider-specific AI infrastructure must sit behind application interfaces such as:

catalogAI.generate()
transcribeAudio()
analyzeImage()
generateEmbedding()
matchBuyer()

---

## 15. Data / AI Separation

pgvector is runtime semantic search infrastructure.

Engineering knowledge/context graphs are separate infrastructure.

Do not turn the engineering graph into the product database.

Analytics/evaluation infrastructure is separate from transactional product storage.

---

## 16. Verification Contract

Before declaring implementation work complete:

1. inspect the relevant code
2. state assumptions
3. identify ambiguity
4. implement the smallest safe change
5. run focused tests
6. run relevant type/build checks
7. inspect the diff
8. check for unintended files
9. report remaining risks

For security-sensitive, irreversible, or otherwise high-risk work, also complete the applicable security review/approval gates before completion.

Never claim verification that was not actually performed.

If a check cannot run:
- report the exact limitation
- do not disguise an unavailable check as a pass
- distinguish "implemented but unverified" from "verified"

A task may only be called complete when its applicable acceptance criteria and required verification gates have passed or an explicitly accepted human decision records why an exception is allowed.

---

## 16A. Agent Execution Protocol

For substantial implementation work, use `docs/agent/execution-protocol.md` as the
operational companion to this file.

The durable workflow is:

1. define a task contract
2. select only the relevant context
3. identify applicable specifications, ADRs, and contracts
4. implement the smallest safe slice
5. run focused verification
6. run full repository verification
7. review the completed slice
8. record implementation evidence
9. finish under explicit human control

Use:

- `docs/agent/task-template.md` for substantial task contracts
- `docs/agent/review-template.md` for task-scoped reviews
- `docs/agent/evidence-template.md` for verification/evidence records

The protocol does not override `AGENTS.md`, approved specifications, ADRs,
contracts, security requirements, or explicit user requirements.

Agents must not commit, push, open pull requests, merge, deploy, or mutate
external production systems without explicit human authorization.

---
## 17. Git Discipline

Keep commits small and meaningful.

Do not commit:
- secrets
- credentials
- generated temporary files
- local machine state
- unnecessary build output

Prefer atomic changes that can be reviewed and reverted independently.

---

## 18. Current AI Agent Policy

Primary tested model:
opencode/big-pickle

Fallback tested model:
opencode/nemotron-3-ultra-free

opencode/mimo-v2.6-flash-free:
use selectively when deeper investigation is useful; it is not the default.

Model choice does not override project rules.

The agent must optimize for correctness, safety, maintainability, and verification rather than maximum output or maximum code generation.

---

## 19. Definition of Done

A task is not complete merely because code exists.

It is complete when:
- the intended behavior is implemented
- acceptance criteria are satisfied
- relevant tests/checks pass
- security and failure behavior are considered
- the diff is understood
- no unrelated changes were introduced
- remaining risks are explicit

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Design Governance

Design skills are specialist inputs, not project authority. The precedence defined above remains in force:

1. Safety, security, privacy, and data-loss constraints.
2. Explicit user requirements.
3. This AGENTS.md.
4. Approved product specs, ADRs, contracts, and durable project decisions.
5. Relevant specialist skills.
6. Generic examples, recipes, templates, and aesthetic defaults.

### Design-skill roles

- Anthropic `frontend-design` is the foundational design philosophy: derive visual decisions from the real subject, audience, materials, task, and product context instead of generic AI patterns. Its web-specific implementation rules do not transfer automatically to React Native/Expo.
- Impeccable is a bounded design-planning, critique, audit, adaptation, animation, and polish specialist. It may improve UI quality but may not override product truth, architecture, native platform guarantees, accessibility, performance constraints, or explicit user requirements.
- Impeccable `shape` is appropriate for ambiguous UI/UX work before implementation.
- Impeccable native `audit`, `adapt`, and related native guidance may be used for React Native/Expo quality review.
- Impeccable `new-work` / concept-generation workflows are reserved for intentionally creating or replacing a visual world. Do not trigger them merely because a screen exists or needs a narrow implementation change.
- Impeccable must not create or rewrite durable project truth as a side effect of ordinary engineering work. `PRODUCT.md`, `DESIGN.md`, surface briefs, and other durable design artifacts are created or changed only when the task is actually in a design phase and the relevant decision is ready to be recorded.
- Impeccable's "go all out" and visual-polish guidance never overrides the project's simplicity, incremental-delivery, reliability, accessibility, or performance requirements.
- Native Expo/React Native work must preserve platform conventions. Do not import web navigation, hover behavior, web-shaped controls, or browser assumptions into the native app.
- iOS work must preserve system navigation, edge-swipe back, accessibility, Reduce Motion, Dynamic Type, safe areas, and native interaction expectations.
- Android work must preserve system Back/predictive Back, Material semantics where applicable, window insets, scalable text, dynamic/light/dark theme behavior, and adaptive navigation.
- `imagegen-frontend-mobile` generates visual references only. Generated images are inspiration/evidence, never implementation truth. The implementation must be translated into the project's real design tokens and native components.
- Emil animation skills are motion specialists. Use them when motion is materially relevant; prefer the official Expo animation guidance as the default framework source when there is overlap.
- Taste-style skills are optional aesthetic references. They never impose web/GSAP assumptions on the native application.
- UI UX Pro Max, when researched or introduced later, is design intelligence/research input only unless explicitly promoted by an approved project decision.
- `find-skills` may discover candidate skills when explicitly useful, but it must not automatically install, globally mutate, or promote a discovered skill into project authority.
- Do not add another design skill merely because it overlaps with an existing capability. Prefer the smallest specialist set that covers the task.
- During the current engineering-foundation phase, do not expand the product's screen inventory or visual system solely because design skills are available. Design work begins when the product/task requires it.

### Native design acceptance

For native UI, design quality includes function and platform trust, not visual polish alone. Review:

- Accessibility: labels/roles/state, text scaling, touch-target sizing, focus/order, and Reduce Motion.
- Performance: rendering/recomposition behavior, semantic tokens, image/media cost, and expensive effects.
- Native conformance: system navigation, gestures, platform controls, safe areas/insets, adaptive layouts, and platform-appropriate interaction patterns.
- Product clarity: the primary task, important states, content hierarchy, error/empty/loading behavior, localization needs, and realistic content ranges.
- Visual identity: distinctive and intentional, but subordinate to usability, product truth, and the chosen design system.

A design skill may identify a problem; it does not by itself authorize a redesign, dependency, architectural change, new visual system, or irreversible implementation.

## Canonical Skill Routing

`using-agent-skills` is the meta-router. It may select specialist skills, but specialist skills do not override `AGENTS.md`, approved specs/ADRs/contracts, or explicit user requirements.

Use the smallest sufficient skill set. Do not load overlapping skills merely because multiple descriptions match.

### Core engineering flow

1. `context-engineering` — establish relevant project context at session/task start.
2. `spec-driven-development` — create or clarify the specification when the change is new, significant, ambiguous, or crosses multiple capabilities.
3. `planning-and-task-breakdown` — turn an approved/clear specification into implementation tasks.
4. `incremental-implementation` — implement multi-file or otherwise substantial work in thin, verifiable slices.
5. `test-driven-development` — default implementation/behavior-change discipline where a suitable test seam exists.
6. `code-review-and-quality` — review before merge.
7. `git-workflow-and-versioning` — apply repository/version-control workflow when changing code or preparing a commit/PR/release.
8. `documentation-and-adrs` — record durable architectural decisions, public-interface changes, or important reasoning.

### Source and correctness

- `source-driven-development` is the default verification source for framework/library/provider behavior where official documentation exists.
- `research` is for broader research tasks and evidence collection; adapt its background-agent behavior to the available local workflow rather than assuming a hosted background agent.
- `doubt-driven-development` is a high-rigor escalation for ambiguity, unfamiliar code, irreversible operations, high-risk changes, or assumptions worth adversarial verification.
- `karpathy-guidelines` is a behavioral discipline: simplicity first, surgical changes, explicit assumptions, and verifiable success criteria.

### Expo / React Native routing

When Expo/EAS/Expo packages are involved, `expo-overview` is the first Expo skill.

Then select the narrowest specialist:

- `expo-project-structure` — new Expo project/folder structure only.
- `expo-router` — routes/navigation/filesystem routing.
- `expo-data-fetching` — network requests, React Query/data loading, offline fetch behavior.
- `expo-design-system` — tokens, shared UI primitives, theme/component-system work.
- `expo-examples` — canonical examples for third-party integrations.
- `expo-upgrade` — Expo SDK/version upgrades.
- `react-native-best-practices` — RN performance, rendering, memory, FPS, bundle/runtime issues.
- `upgrading-react-native` — RN version migrations.
- `expo-animation` — canonical Expo/RN animation implementation guidance.

Animation overlap rule:

- Prefer `expo-animation` as the default framework implementation skill.
- Use `animate-expo` only when Emil-specific motion/design guidance is materially useful or explicitly requested.
- `animation-vocabulary` is naming/reference only.
- `find-animation-opportunities` proposes opportunities and is read-only.
- `improve-animations` creates an improvement plan and is read-only.
- `review-animations` is an explicit specialist review gate, not a default implementation skill.
- Do not load multiple animation implementation/review skills unless the task explicitly requires each layer.

### Native UI / design routing

- `frontend-ui-engineering` — implement or modify production UI.
- Anthropic `frontend-design` — establish distinctive visual direction and avoid generic visual defaults.
- `impeccable` — shape, critique, audit, adapt, animate, polish, or otherwise review/improve UI.
- `imagegen-frontend-mobile` — visual reference generation only; never implementation authority.
- `emil-design-eng` — UI craft/micro-detail specialist when materially useful.
- UI/visual specialist skills may contribute ideas, but project design tokens, native platform rules, accessibility, product truth, and AGENTS.md remain authoritative.

Design overlap rule:

- Do not invoke `frontend-design`, `impeccable`, and `emil-design-eng` indiscriminately.
- For a new/ambiguous surface: use design discovery/shape first, then the minimum implementation skill set.
- For a narrow existing UI change: do not trigger a full visual-world redesign.
- `impeccable new-work` / concept-generation is reserved for intentionally creating or replacing a visual world.
- Native React Native/Expo UI must follow platform conventions; web-only affordances and browser assumptions are not imported into the app.
- Generated visual references never become product truth automatically.

### Debugging routing

- `debugging-and-error-recovery` — normal debugging/root-cause workflow.
- `diagnosing-bugs` — hard bugs and performance regressions requiring a tight, minimized, red-capable reproduction and falsifiable hypotheses.
- Do not use both by default; escalate from ordinary debugging to the specialized diagnosis workflow only when its stricter method is warranted.

### Backend / data routing

- `cloudflare` — Cloudflare product selection/architecture.
- `workers-best-practices` — Workers implementation/review.
- `wrangler` — Wrangler CLI/configuration/troubleshooting.
- `supabase` — any Supabase task.
- `supabase-postgres-best-practices` — anything touching Postgres schema, migrations, RLS, indexes, triggers, pgvector, queues, or query performance.
- `security-and-hardening` — cross-cutting security/privacy for auth, untrusted input, external integrations, personal data, storage, and privileged operations.
- `observability-and-instrumentation` — logs/metrics/traces/alerts.
- `performance-optimization` — performance investigation/optimization across system layers.

### Explicit specialist-only skills

These should not be treated as automatic global defaults:

- `grill-with-docs`
- `handoff`
- `review-animations`
- `impeccable` when used as an explicit command/specialist
- `imagegen-frontend-mobile`
- `prototype`
- `interview-me`
- `idea-refine`

Their trigger condition must actually be present in the task.

### Skill selection rule

Before invoking a specialist, state internally:

`task → primary skill → secondary skills only if needed → verification`

Never select a skill solely because its description contains a matching keyword. Prefer trigger intent, project constraints, and the smallest sufficient set.

If two skills conflict, keep the higher-precedence project rule and choose the skill with the narrower responsibility. If the conflict cannot be resolved safely, stop before implementation and surface the conflict for human clarification.
