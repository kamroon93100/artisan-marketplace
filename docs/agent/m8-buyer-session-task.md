# Task Contract

## 1. Title

M8 — Buyer Session Authentication

## 2. Purpose

Unblock authenticated buyer discovery/inquiry without breaking the existing
artisan journey.

This document is a **task contract only**. It defines scope, invariants,
decision gates, acceptance criteria, verification, and risks for the M8
implementation slice. It does **not** implement authentication.

Gate A (credential/session mechanism, Section 5) is **CLOSED/CONFIRMED** by
explicit human decision dated 2026-10-01. Gate B (discovery posture,
Section 6) is **CLOSED/CONFIRMED as B-A — AUTHENTICATED DISCOVERY** by
explicit human decision dated 2026-10-01 ("YES — CONFIRM GATE B"). Both
gates are now recorded. M8 Q2A (account establishment, Section 6A) is
**RECORDED — CHOICE 1 — FIRST-PARTY REGISTRATION + LOGIN** by explicit
human decision dated 2026-10-01. M8 Q3 (registration/session HTTP surfaces,
primary identifier, initial role, registration policy, and login
protection, Section 6B) is **RECORDED — Q3.1 THROUGH Q3.5 AS STATED** by
explicit human decision recorded 2026-10-02. M8 Q4 was a **read-only
design/research pass** whose findings are the source material for the Q5
decisions. M8 Q5 (password KDF, username normalization, password policy,
registration session behavior, refresh/logout/replay, pre-auth login
throttling, Section 6C) is **RECORDED — Q5.1 THROUGH Q5.6 AS STATED** by
explicit human decision recorded 2026-10-02, resolving the six items the
Q4 pass left open. M8 Q6 (the auth HTTP contract for the four Q3.1
surfaces — request/response schemas, failure semantics, credential
transport, and refresh-replay detection, Section 6D) is **RECORDED —
CONFIRMED: P1 THROUGH P24 WITH THE P4 WORDING CORRECTION, PLUS REFRESH
REPLAY R-C** by explicit human decision recorded 2026-10-02, confirming
the read-only Q6 Decision Review Sheet's 24 proposals and selecting
durable refresh-grant history (R-C), which requires a future migration
009 and is recorded here without designing or creating it. Implementation
remains **NOT STARTED** and still requires separate explicit human
authorization (Section 13).

## 3. Current Verified State

Established by M7 Discovery (verified) and the read-only M8 discovery pass
(verified). Everything below was read from the repository, not inferred:

- **M7 Discovery is verified.** `GET /discovery/products` and
  `GET /discovery/products/:productId` serve the published projection, and
  the mobile discovery transport and screens exist and are covered by tests.
- **Current API authentication** is `apps/api/src/shared/auth/session.ts`
  (`requireActor`), which behaves as follows:
  - **(a) `SESSION_TOKEN` + `SESSION_ACTOR_ID` static session.** When both
    env values are set, a presented `Authorization: Bearer <token>` is
    compared against `SESSION_TOKEN` with a length-independent comparison,
    and a match resolves to the single configured `SESSION_ACTOR_ID`. Roles
    are always `[]`.
  - **(b) development/test `DEV_OWNER_ID` seam.** Only when no static
    session is configured *and* `APP_ENV` is `development` or `test`, the
    request resolves to `DEV_OWNER_ID` without any credential. The seam can
    never stand in for a configured provider and is unreachable outside
    development/test.
  - **(c) fail-closed behavior.** Missing/invalid credential on a configured
    session → `UNAUTHENTICATED`. No verifiable session outside
    development/test → `DEPENDENCY_FAILED`. There is no anonymous default
    actor.
- **No real Identity implementation exists.** There is no Identity module,
  no session lifecycle (issue/refresh/expire/revoke/logout), no provider
  adapter, and no account/recovery flow. `requireActor` is a static
  credential check, not an identity subsystem.
- **Buyer and artisan identities are not distinguishable in production.**
  Every valid credential resolves to the same `SESSION_ACTOR_ID`, and
  `ActorContext.roles` is always empty. There is no role enforcement
  anywhere in the API.
- **Mobile currently has no real session storage or authentication seam.**
  No secure credential storage, no token lifecycle, no Authorization header
  injection, no signed-out state.
- **M7 discovery transport intentionally sends no `Authorization` header.**
  `apps/mobile/src/network/discovery-transport.ts` sends no request headers,
  and `discovery-transport.test.ts` asserts `capturedHeaders === undefined`
  deliberately, so a header added later would fail a test rather than
  silently make buyer reads depend on a session the buyer does not have.
  The server-side discovery route still calls `requireActor` (documented in
  `apps/api/src/modules/discovery/http.ts` as a rate-limit-subject
  requirement, not a confidentiality requirement).
  **Gate B (B-A) now supersedes this headerless posture by decision** —
  the supersession is recorded here but **not yet implemented**; the
  headerless behavior remains the current repository state until the
  implementation slice runs.

## 4. Locked Invariants

These are not reopened by M8. Any implementation must preserve them
exactly:

1. **`requireActor` remains the business-module authentication boundary.**
   Catalog, Media, AI, Review, Discovery, and Inquiry resolve their actor
   through `requireActor` (or its delegated successor) before any handler
   runs. No business module parses provider-specific session details.
2. **Identity owns provider/session-specific implementation.** Per
   ADR-006, provider adapters, token verification, and session lifecycle
   live behind the Identity boundary. Business modules receive a trusted
   `ActorContext`, never raw client identity claims.
3. **The client never supplies trusted `actorId` or roles.** The buyer of
   an inquiry is the authenticated actor or nobody. No request body, query
   parameter, or header chosen by the client can assert identity or role.
4. **Authentication and authorization stay separate.** Authentication
   answers who the actor is; the owning module answers what that actor may
   do. M8 must not collapse the two.
5. **Existing artisan ownership behavior must continue working.** All
   existing artisan-side suites (catalog, media, AI, review, sync) must
   keep passing unchanged in behavior. The validated artisan journey does
   not regress.
6. **The existing development/test seam remains available and guarded
   exactly as today.** `DEV_OWNER_ID` continues to work only in
   `development`/`test`, only when no real session provider is configured,
   and never as a substitute for a configured provider. Its environment
   scoping and precedence tests in `apps/api/src/shared/auth/session.test.ts`
   remain the specification of that behavior.
7. **Fail closed outside development/test when no valid session exists.**
   No deployment outside development/test may serve a protected request it
   cannot authenticate. The refusal is a deployment fault, not a client one.
8. **Never expose secrets in logs, tests, or output.** No passwords, access
   tokens, refresh credentials, raw `Authorization` headers, session
   secrets, or `.dev.vars` contents appear in log lines, audit records,
   test fixtures, error messages, or any report produced by this work.
   Existing secret-redaction behavior is protected, not weakened.
9. **No RLS in M8 unless separately approved.** Row-level security remains
   the recorded, deferred ADR-007 gap. M8 does not add it silently and
   does not claim it.
10. **No unrelated business-module redesign.** M8 touches business modules
    only where the authentication boundary or the approved discovery
    posture requires it. It does not restructure Catalog, Media, AI,
    Review, Sync, Discovery, or Inquiry beyond that.

## 5. HUMAN DECISION GATE A — Credential/Session Mechanism

**Status: CLOSED / CONFIRMED — human decision recorded 2026-10-01.**

Gate A was answered by an explicit human decision session ("M8 HUMAN DECISION
INTERVIEW — EXPLICIT GATE A CONFIRMATION"), whose answer was **"YES — CONFIRM
GATE A"**. The eight sub-decisions below are reproduced from that confirmed
record. They are the decision of record: implementation planning must preserve
them exactly, without reinterpretation, narrowing, or expansion.

### Alternative disposition (as recorded at decision time)

| # | Alternative | Standing after Gate A |
|---|-------------|------------------------|
| A1 | **Provider-backed sessions** (external auth provider, e.g. a hosted identity service) | Not selected. |
| A2 | **Server-issued opaque sessions** (random token stored server-side) | **SELECTED — mechanism of record.** |
| A3 | **Signed tokens** (e.g. JWT-style signed assertions) | Not selected. |

- **Mechanism:** A2 — server-issued opaque sessions.
- **Provider:** none / first-party.

### Confirmed sub-decisions (all eight answered)

- [x] **Q1 — Mechanism / Provider**
      - Mechanism: A2 — Server-issued opaque sessions
      - Provider: none / first-party
- [x] **Q2 — Token format**
      - Scheme: `Authorization: Bearer <token>`
      - Encoding: unpadded base64url of 32 cryptographically random bytes
      - Entropy: 256 bits
      - Opaque: yes
      - Mobile stores and echoes the credential verbatim
      - Client never parses or decodes the credential
- [x] **Q3 — Session lifetime**
      - Access token lifetime: 15 minutes
      - Refresh credential: yes
      - Refresh lifetime: 30 days
      - Refresh encoding: unpadded base64url of 32 cryptographically random bytes
      - Refresh rotation: single-use / rotating
      - Successful refresh issues a new refresh credential and invalidates the previous one
      - Expiry policy: absolute
      - Refresh cannot extend the 30-day maximum
- [x] **Q4 — Refresh strategy**
      - Proactive refresh when access token has <=2 minutes remaining
      - If a request receives 401 because of expiry/race: exactly one refresh
        attempt, then retry the original request exactly once
      - Concurrent refresh attempts: coalesced into one in-flight refresh
      - Invalid/expired/revoked refresh: sign out and clear credentials
      - Transient network failure during refresh: do not sign out, preserve
        local state, surface/retry session-refresh connectivity failure
      - No indefinite retry
- [x] **Q5 — Logout / revocation**
      - Logout immediately revokes the entire current server-side refresh session
      - Current access token is NOT denylisted
      - Current access token may remain valid until its natural 15-minute expiry
      - Refresh revocation uses live server-side session state
      - Access-token revocation is NOT checked on every request in M8
      - Mobile logout clears: access token, refresh token, session metadata,
        in-memory authenticated session state
      - Logout MUST NOT delete or mutate: local drafts, pending sync operations,
        inquiry drafts, other offline data
      - Logout affects only the current device/session
      - Global logout is deferred
- [x] **Q6 — Account recovery**
      - NOT included in M8
      - Deferred to M12 — Account Recovery & Identity Recovery
      - No email recovery in M8; no SMS recovery in M8; no OTP recovery in M8;
        no social-login recovery in M8; no undocumented support-managed reset
      - If credentials are lost before M12: server access remains unavailable
        until a valid authentication/recovery path exists; local drafts/offline
        data remain intact; queued server-bound work remains stored locally
      - No invented recovery mechanism
- [x] **Q7 — Role storage / authorization**
      - Choice A — server-stored roles
      - Minimum roles: BUYER, ARTISAN
      - Roles are assigned and stored server-side by the Identity module
      - Server-side session resolution returns authoritative roles in ActorContext
      - Client-supplied role information is never trusted
      - No client role-assignment endpoint in M8
      - BUYER: buyer operations including inquiry; not artisan
        catalog/media/review operations
      - ARTISAN: existing artisan catalog/media/review operations; not
        buyer-only inquiry operations
      - Discovery posture remains OPEN pending Gate B
        (recorded at Gate A time; superseded — Gate B later CLOSED as B-A,
        Section 6)
      - If authenticated discovery is selected later: discovery requires
        authenticated BUYER role
      - If public discovery is selected later: discovery may remain unauthenticated
      - Inquiry create: authenticated BUYER + existing published-product checks
      - Inquiry list/get: authenticated BUYER + buyer ownership
      - Client-supplied buyerId is never trusted
- [x] **Q8 — Session persistence**
      - Access token: platform SecureStore
      - Refresh token: platform SecureStore
      - Minimal required authentication metadata: platform SecureStore
      - No non-sensitive persisted auth flag outside SecureStore
      - Roles are NOT treated as authoritative persisted client metadata
      - App restart: restore session from SecureStore if credentials are
        readable and valid/refreshable
      - Device reboot: same behavior as restart
      - Background/foreground: access token may remain in memory while active;
        reload/validate session credentials from SecureStore as needed on foreground
      - Offline: credentials may remain stored locally; server validity still
        follows 15-minute access / 30-day refresh absolute limits
      - If SecureStore is temporarily unavailable: do not destroy credentials or
        offline data; treat authenticated server operations as unavailable as
        required; preserve retryability
      - If credential loss is confirmed: signed-out state is used; local data
        remains untouched
      - Tokens MUST NEVER be stored in: SQLite, AsyncStorage, logs, console
        output, error reports, analytics, URLs, query parameters,
        Redux/state persistence, ordinary application files
      - Tokens are loaded into memory only as required by the centralized
        authentication/request seam
      - Refresh tokens are never exposed to ordinary UI components
      - Authentication credentials are NOT intentionally portable through
        app-data backup/restore
      - Restored app on another device requires re-authentication if secure
        credentials are unavailable
      - Local offline application data may restore independently and MUST
        remain intact
      - No session-credential backup/export in M8

**Gate A exit condition: MET.** All eight sub-decisions carry an explicit
human answer (Q6's deferral to M12 is itself the chosen answer), and the
mechanism choice has been written into the relevant architecture documents as
deliberate, named decision updates:

- `docs/architecture/auth-and-session-contract.md` — Authentication section
  and Open Decisions list updated (resolved decisions marked decided, still-open
  items retained).
- `docs/adr/006-authentication-authorization-boundary.md` — named
  "Decision Update — M8 Gate A" amendment.

**What Gate A closure does NOT authorize:**

- At Gate A time, Gate B (Section 6) remained **OPEN** and unselected.
  Gate B has since been closed separately as **B-A** (Section 6); neither
  gate authorizes implementation by itself.
- This record changes no code, migration, dependency, or config. The M8
  implementation slice remains a separate, future task and requires explicit
  human authorization to start (per Section 13).
- Schema need for server-side session storage (A2 consequence) and the
  `inquiries.buyer_id` identity foreign key remain separate decisions, each
  requiring its own new-migration approval.

## 6. HUMAN DECISION GATE B — Discovery Posture

**Status: CLOSED / CONFIRMED — B-A (AUTHENTICATED DISCOVERY), human
decision recorded 2026-10-01.**

Gate B was answered by an explicit human confirmation ("M8 GATE B — HUMAN
CONFIRMATION"), whose answer was **"YES — CONFIRM GATE B"**, recording the
decision as **B-A — AUTHENTICATED DISCOVERY**. The five mandatory
consequences below are reproduced exactly as confirmed. They are the
decision of record: the later implementation must preserve them exactly,
without reinterpretation, narrowing, or expansion.

### Five mandatory consequences (exactly as confirmed)

1. Discovery requires a valid authenticated session for:
   - GET /discovery/products
   - GET /discovery/products/:productId

2. Discovery requires the server-authoritative BUYER role from ActorContext. Client-supplied roles are never trusted.

3. Missing or invalid credentials return 401 / UNAUTHENTICATED.

4. M7 headerless discovery is deliberately superseded. The following are explicitly in-scope for the later implementation:
   - discovery-transport.test.ts
   - discovery-transport.ts
   - discovery/http.ts
   - discovery route tests
   - auth-and-session-contract.md
   - ADR-006 if required by the decision update

5. The change is deliberate and reviewed, not a silent Authorization-header insertion. The discovery route rationale concerning authentication as a rate-limit subject must be reaffirmed or revised as part of that implementation.

**Gate B exit condition: MET.** One option is selected in writing (B-A),
its mandatory consequences are accepted as scope (reproduced verbatim
above), and the affected tests and contract comments are named as in-scope
changes (consequence 4). Recorded as the named decision updates:

- `docs/architecture/auth-and-session-contract.md` — named M8 Gate B
  decision update (discovery posture resolved to B-A).
- `docs/adr/006-authentication-authorization-boundary.md` — named M8 Gate B
  decision update reflecting this named decision.

**What Gate B closure does NOT authorize:**

- Implementation remains **NOT STARTED**. This record changes no code,
  test, migration, dependency, package file, config, `.dev.vars`, secret,
  or generated runtime artifact. The M8 implementation slice remains a
  separate, future task requiring explicit human authorization
  (Section 13).
- The supersession of the M7 headerless assertion is decided but **not yet
  applied**; `discovery-transport.test.ts` still asserts
  `capturedHeaders === undefined` until the implementation slice changes it
  deliberately.

### Alternative disposition (as recorded at decision time)

| # | Alternative | Standing after Gate B |
|---|-------------|------------------------|
| B-A | **Authenticated discovery** | **SELECTED — posture of record.** |
| B-B | **Anonymous/public discovery** | Not selected. |

### Option B-A — Authenticated discovery (SELECTED)

The mandatory consequences of this option are recorded verbatim in the
"Five mandatory consequences" list above. For the avoidance of doubt, the
option text as originally framed is retained here:

- The M7 headerless assertion (`capturedHeaders === undefined` in
  `apps/mobile/src/network/discovery-transport.test.ts`) and the
  corresponding doc comments in `discovery-transport.ts` and
  `discovery/http.ts` are **deliberately superseded** — an explicit,
  reviewed change, not a silent header insertion.
- Discovery receives `Authorization` credentials through the centralized
  mobile auth seam (Section 7).
- A missing or invalid session on a discovery route returns **401**
  (`UNAUTHENTICATED`), consistently with every other protected route.
- The rationale recorded in `discovery/http.ts` (authentication buys a
  rate-limit *subject*, not confidentiality) must be re-affirmed or
  revised in the route documentation as part of the same change.

### Option B-B — Anonymous/public discovery (NOT SELECTED)

Retained for the record. Had this option been chosen, the following would
have been its mandatory consequences:

- The authentication dependency on discovery is **removed deliberately**:
  the `requireActor` middleware on `discoveryRoutes` is taken out as a
  reviewed change with its rationale updated, not left in place and
  bypassed.
- The **anonymous rate-limit subject/budget must be defined**: what keys
  the budget (the current limiter keys on `actorId`, which no longer
  exists for anonymous callers), what the budget size is, what happens when
  it is exhausted, and how one anonymous caller is prevented from
  exhausting discovery for everyone. The gap named in
  `apps/api/src/modules/discovery/http.ts` ("a real per-subject key that is
  not an actor identity") becomes a required design answer, not a comment.
- Discovery tests and the discovery/auth contract documentation are updated
  to match: the headerless mobile assertion either remains the documented
  truth (B-B) or is replaced (B-A), and the server-side expectation changes
  accordingly.

**Selection was explicit, not by default.** Leaving Gate B unanswered
while implementing authentication would have picked B-A implicitly (the
server already requires an actor), which is exactly the silent selection
this gate exists to prevent. The gate was instead answered by the explicit
human confirmation "YES — CONFIRM GATE B" recorded above, so B-A stands as
a deliberate, reviewed decision. Discovery-touching implementation still
requires the separate implementation-slice authorization (Section 13).

## 6A. HUMAN DECISION — M8 Q2A (Account Establishment)

**Status: RECORDED — CHOICE 1 — FIRST-PARTY REGISTRATION + LOGIN
(identifier + password/passphrase), human decision dated 2026-10-01.**

M8 Q2A was answered by an explicit human decision ("M8 Q2A HUMAN DECISION —
CHOICE 1"), selecting **CHOICE 1 — FIRST-PARTY REGISTRATION + LOGIN
(identifier + password/passphrase)**. Reproduced exactly as instructed.
These seven statements are the decision of record; implementation planning
must preserve them exactly, without reinterpretation, narrowing, or
expansion:

- actor establishment uses a first-party identifier + password/passphrase;
- server validates the password against a server-side salted strong-KDF hash;
- actor identity comes from the server-side account record;
- no external identity provider;
- no M8 account recovery;
- migration 008 must be designed to support the account/credential model;
- registration and login/establishment HTTP surfaces will be decided next.

### What this record does and does not authorize

- **Decision recorded only.** This record changes no application code, test,
  migration, dependency, package file, config, `.dev.vars`, secret, or
  generated runtime artifact.
- **Migration 008 is NOT created.** Design/review authorization for
  migration 008 was separately recorded as **Q1** (see the Unverified Items /
  Open Decisions list at the end of this document). Q2A adds the design
  *constraint* that 008 must be designed to support the account/credential
  model. Creation and application of migration 008 remain a separate,
  explicit approval boundary.
- No endpoints are added, no application code is edited, no dependencies are
  installed, no tests are run or changed, and no discovery/mobile file is
  modified by this record.
- No commit, push, PR, merge, deploy, or publish is authorized or performed.
- Q2A does **not** by itself settle: the identifier format/type, the concrete
  strong-KDF algorithm and parameters, the registration/login request and
  response schemas, failure/error semantics, duplicate-identifier behavior,
  or rate-limit/lockout posture. Those belong to the next decision named by
  Q2A itself: the registration and login/establishment HTTP surfaces.
- This record is consistent with and does not reopen Gate A Q6 (no M8
  account recovery; deferred to M12) or Gate A Q1 (provider none /
  first-party).
- Implementation remains **NOT STARTED** and still requires the separate
  explicit human authorization in Section 13.

## 6B. HUMAN DECISION — M8 Q3 (Auth Surfaces, Identifier, Initial Role, Registration Policy, Login Protection)

**Status: RECORDED — Q3.1 THROUGH Q3.5 AS STATED BELOW, human decision
recorded 2026-10-02.**

M8 Q3 was answered by explicit human decision and is reproduced here
exactly as instructed. These five sub-decisions are the decision of
record; implementation planning must preserve them exactly, without
reinterpretation, narrowing, or expansion.

### Q3.1 — Auth surfaces and versioning

- Inventory = 3.1-A
- Auth surfaces:
  - POST /v1/auth/register
  - POST /v1/auth/login
  - POST /v1/auth/refresh
  - POST /v1/auth/logout
- Versioning = V1

### Q3.2 — Identifier

- Identifier = 3.2-C
- Primary identifier = username/handle

### Q3.3 — Initial role

- Initial role = 3.3-A
- New registrations receive BUYER only.
- Role changes later in M8 = NO.
- No M8 client role-assignment/change endpoint.

### Q3.4 — Registration policy

- Registration policy = 3.4-A
- No verification in M8.
- Duplicate username/identifier = 409 CONFLICT.
- No email/SMS/OTP verification dependency.

### Q3.5 — Login protection

- Login protection = 3.5-C
- Throttle by trusted client IP + normalized identifier.
- No account lockout.
- Exact thresholds/windows remain for implementation-time security review.
- Do not use actorId as the pre-authentication throttle subject.

### What this record does and does not authorize

- **Decision recorded only.** This record changes no application code,
  test, migration, dependency, package file, config, `.dev.vars`, secret,
  or generated runtime artifact.
- **Migration 008 is NOT created or applied.** Creation and application of
  migration 008 remain behind the separate approval boundary recorded as
  **Q1** (design/review authorization only). Q3 adds no migration
  authority.
- **No auth endpoints are added to code.** The four surfaces named in Q3.1
  exist as a decision of record only; they are not implemented, routed, or
  registered by this record.
- No dependencies are installed, no tests are run or changed, and no
  discovery/mobile file is modified by this record.
- No commit, push, PR, merge, deploy, or publish is authorized or
  performed.
- Q3 does **not** by itself settle: the request/response schemas for the
  four surfaces, the concrete strong-KDF algorithm and parameters, the
  failure/error semantics beyond the Q3.4 duplicate-identifier
  `409 CONFLICT`, or the exact login-protection thresholds/windows — Q3.5
  explicitly defers those to implementation-time security review.
- This record is consistent with and does not reopen Gate A (Q1, Q6, Q7),
  Gate B (B-A), Q1, or Q2A. Q3.3 is consistent with Gate A Q7
  (server-stored roles; no client role-assignment endpoint) and narrows M8
  further: registrations receive BUYER only, and no role-assignment or
  role-change endpoint exists in M8.
- Implementation authorization is unchanged: this record authorizes no
  implementation, and the M8 implementation slice still requires the
  separate explicit human authorization in Section 13.
- **Later update (M8 Q5):** the items Q3 listed as unsettled are now
  partly settled by Q5 (Section 6C) — the concrete strong-KDF algorithm
  and parameters (Q5.1), the identifier format/normalization (Q5.2), the
  password policy (Q5.3), the registration session behavior (Q5.4), the
  refresh/logout/replay semantics (Q5.5), and the throttle subject (Q5.6).
  Still open from Q3: the request/response schemas for the four surfaces,
  the exact throttle thresholds/windows (implementation-time security
   review), and failure/error semantics beyond the Q3.4 duplicate-identifier
   `409 CONFLICT` and the Q5.5 / Option A error-contract mappings.
   **Later update (M8 Q6):** those remaining items are now settled by Q6
   (Section 6D).

## 6C. HUMAN DECISION — M8 Q5 (Password KDF, Username Normalization, Password Policy, Registration Session, Refresh/Logout/Replay, Pre-Auth Throttling)

**Status: RECORDED — Q5.1 THROUGH Q5.6 AS STATED BELOW, human decision
recorded 2026-10-02.**

M8 Q5 was answered by explicit human approval following the read-only M8
Q4 design/research pass, and is reproduced here exactly as instructed.
These six sub-decisions are the decision of record; implementation
planning must preserve them exactly, without reinterpretation, narrowing,
or expansion.

### Q5.1 — Password KDF

- Adopt Argon2id for first-party password storage.
- Baseline parameters:
  - memory = 19456 KiB
  - iterations = 2
  - parallelism = 1
  - salt = 16 random bytes
  - output/tag = 32 bytes
  - store the complete PHC-format encoded Argon2id string
- **Implementation constraint:** these are the approved design baseline,
  but implementation MUST perform the already-identified Cloudflare
  Workers resource/latency validation before production use. Do not
  silently increase or decrease the parameters without an explicit
  implementation-time security decision.
- The KDF dependency must remain an explicit implementation decision and
  approval at the implementation phase.

### Q5.2 — Username / handle normalization

- Use a normalized username/handle model.
- Canonical accepted format: `^[a-z0-9][a-z0-9_.-]{2,29}$`
  - minimum 3 characters
  - maximum 30 characters
  - lowercase canonical form
- Normalize input before uniqueness comparison.
- Persist the canonical normalized username in a dedicated uniquely
  constrained `username_normalized` column.
- Reserve a documented set of system/reserved names.
- Do not introduce full-Unicode handle semantics in M8.
- The normalized value is the identity used for uniqueness and for
  authentication throttling.

### Q5.3 — Password policy

- Adopt a 15-character minimum password length for M8.
- Do not introduce arbitrary composition rules such as mandatory
  uppercase/lowercase/digits/symbols.
- Allow long passphrases.
- The exact maximum accepted length must be chosen so that the
  implementation can safely process long inputs without truncation or
  denial-of-service behavior; do not silently choose a narrow legacy
  maximum inconsistent with the architecture.

### Q5.4 — Registration session behavior

- Registration MUST automatically establish the initial authenticated
  session.
- Endpoint: `POST /v1/auth/register`
- Successful result: create account → assign BUYER role server-side →
  create the first session → return the authenticated session payload.
- Do not require the client to perform a second login immediately after
  successful registration.
- There is no email/SMS/OTP verification in M8.
- Duplicate normalized username: return `409 CONFLICT` — this preserves
  the locked Q3.4 decision.

### Q5.5 — Refresh / logout / replay

- Preserve the locked Gate A token/session model:
  - server-issued opaque bearer tokens
  - access token lifetime = 15 minutes
  - refresh lifetime = 30 days absolute
  - refresh tokens are single-use and rotate successfully
- Refresh: a valid current refresh token mints replacement access + refresh
  credentials; the previous refresh credential is invalidated; the absolute
  refresh-session expiration is preserved; concurrent duplicate use of the
  old refresh token is not treated as a valid refresh.
- Replay: detection of an already-rotated/reused refresh token MUST revoke
  the affected refresh session rather than merely returning a report-only
  error; the resulting authentication failure is mapped using the existing
  authentication error contract (Option A). Use
  `details.reason = SESSION_EXPIRED` or `details.reason = SESSION_REVOKED`
  only where that contract permits it.
- Logout: requires the authenticated current session/refresh credential
  according to the final endpoint contract; revokes the current refresh
  session immediately; does not denylist access tokens; access credentials
  may naturally remain valid until their 15-minute expiry; logout is
  idempotent at the API contract level.

### Q5.6 — Pre-auth login throttling

- Use the trusted Cloudflare client IP plus normalized username as the
  pre-authentication throttle subject.
- Conceptual key: `(CF-Connecting-IP, username_normalized)`
- Do NOT use `actorId` before authentication.
- Do NOT implement account lockout.
- Do NOT create a durable throttle table in migration 008.
- M8 may use the existing in-memory limiter infrastructure.
- Exact thresholds/windows remain an implementation-time security review
  item.
- Production behavior must account for the fact that an in-memory
  per-isolate limiter is not globally distributed.
- Trusted-IP extraction must be implemented only from the Cloudflare
  edge-set request metadata under the deployment assumption already
  identified in Q4.

### Decision class

- **LOCKED (decision of record):** Q5.1 algorithm choice and baseline
  parameter values; Q5.2 format, length bounds, lowercase canonical form,
  uniqueness on the normalized value, dedicated unique
  `username_normalized` column, reserved-name requirement, no
  full-Unicode handles in M8; Q5.3 15-character minimum, no composition
  rules, long passphrases allowed; Q5.4 registration auto-establishes the
  first session and returns the authenticated payload, BUYER assigned
  server-side, no M8 verification, duplicate normalized username = 409;
  Q5.5 Gate A lifetimes/rotation preserved, refresh replay → session
  revocation (not report-only), logout revokes refresh session without
  access-token denylist, logout idempotent; Q5.6 throttle subject =
  trusted CF IP + normalized username, no `actorId`, no account lockout,
  no durable throttle table in 008.
- **Implementation-time validation items (not undecided design):** the
  Cloudflare Workers resource/latency validation of the Q5.1 parameters;
  the KDF dependency selection and approval; the exact Q5.6
  thresholds/windows; the Q5.3 exact maximum password length chosen within
  the stated safety constraint; the enumerated reserved-name list to be
  documented per Q5.2; production handling of the per-isolate in-memory
  limiter's lack of global distribution.
- **Explicitly deferred / still open:** request/response schemas for the
  four Q3.1 auth surfaces; migration 008 creation/application (design
  authorized by Q1 only); account recovery (Gate A Q6 → M12); global
  logout; RLS (ADR-007); reviewer assignment; privileged system credential
  mechanism; inquiry identity foreign key (separate migration approval).

### What this record does and does not authorize

- **Decision recorded only.** This record changes no application code,
  test, migration, dependency, package file, config, `.dev.vars`, secret,
  or generated runtime artifact.
- **Migration 008 is NOT created or applied.** Q5.2 (dedicated unique
  `username_normalized` column) and Q5.6 (no durable throttle table in
  008) are design *constraints* on the future migration 008, adding no
  migration authority; creation and application remain behind the Q1
  approval boundary.
- **No auth endpoints are added to code.** The four Q3.1 surfaces and the
  Q5.4 register behavior exist as decisions of record only.
- **No dependency is added.** The Argon2id KDF dependency is explicitly
  reserved for implementation-phase decision/approval (Q5.1).
- No tests are run or changed; no discovery/mobile file is modified by
  this record; no commit, push, PR, merge, deploy, or publish is
  authorized or performed.
- Q5 does **not** by itself settle: the request/response schemas for the
  four surfaces, the exact throttle thresholds/windows, the exact maximum
  password length, the concrete KDF dependency, or the outcome of the
  Workers resource/latency validation — each is an implementation-time
  item named above.
- This record does not reopen Gate A (any sub-decision), Gate B (B-A),
  Q1, Q2A, Q3, or the Option A authentication error contract. Q5.4
  preserves Q3.4 (409 CONFLICT); Q5.5 preserves the Gate A token/session
  lifetimes and logout posture and maps replay/logout failures through the
  existing Option A contract; Q5.6 preserves Q3.5 (throttle by trusted
  client IP + normalized identifier, no lockout, no `actorId` subject) and
  refines it with the explicit normalized key and infrastructure posture.
- Implementation authorization is unchanged: this record authorizes no
  implementation, and the M8 implementation slice still requires the
  separate explicit human authorization in Section 13.

## 6D. HUMAN DECISION — M8 Q6 (Auth HTTP Contract: P1–P24 Confirmed, Refresh Replay R-C)

**Status: RECORDED — CONFIRMED: P1 THROUGH P24 EXACTLY AS PROPOSED (WITH
THE P4 WORDING CORRECTION), PLUS REFRESH REPLAY R-C — DURABLE
REFRESH-GRANT HISTORY, human decision recorded 2026-10-02.**

M8 Q6 is the auth HTTP contract question for the four Q3.1 surfaces (it
is distinct from Gate A Q6, account recovery). It was preceded by a
read-only design pass that produced the **Q6 Decision Review Sheet**
containing 24 numbered proposals (P1–P24). The human decision ("M8 Q6 —
RECORD CONFIRMED CONTRACT DECISIONS") confirms all 24 exactly as
proposed, applies one wording correction (P4), and selects option R-C for
refresh-replay detection. The statements below are the decision of
record; implementation planning must preserve them exactly, without
reinterpretation, narrowing, or expansion.

### Confirmed proposals P1–P24 (as proposed; P4 corrected)

- [x] **P1 — Statuses:** register 201; login/refresh/logout 200.
- [x] **P2 — Payload conventions:** wrapper key `session`; camelCase;
      ISO-8601 UTC timestamps; no `tokenType`.
- [x] **P3 — Session metadata:** `sessionId`,
      `actor { actorId, username, roles }`, and both expiry timestamps.
- [x] **P4 — Shared response schema (CORRECTED WORDING — this wording is
      the contract and replaces the proposal's original phrasing
      everywhere):** Register, login, and refresh return the same
      response schema: identical field names, nesting, types, and
      optionality. Values and HTTP status may differ.
- [x] **P5 — Refresh credential transport:** the refresh credential is
      carried in the JSON request body (`refreshToken`); `Authorization`
      is not required on refresh or logout.
- [x] **P6 — Logout:** keyed on the body `refreshToken`; an
      already-expired refresh session → 200; a credential matching no
      session → 401 with no details (the always-200 and 401
      `SESSION_EXPIRED` alternatives were not selected).
- [x] **P7 — Uniform login failure:** one uniform failure response plus
      required timing equalization (executed at implementation-time
      security review).
- [x] **P8 — Validation envelope:** `details: { field }` on 400
      `VALIDATION_FAILED`.
- [x] **P9 — Strict auth request schemas:** unknown and
      identity-asserting fields are rejected with 400 `VALIDATION_FAILED`
      (the ignore-unknown alternative was not selected).
- [x] **P10 — Reserved username:** 400 `VALIDATION_FAILED` (not 409).
- [x] **P11 — Password handling:** byte-exact, no normalization.
- [x] **P12 — Password maximum:** placeholder 1024, explicitly within
      Q5.3's open implementation-time item and not a settlement of it.
- [x] **P13 — Login validation split:** username format is validated
      (400); the 15-character minimum is not enforced at login (uniform
      401); only the maximum is enforced.
- [x] **P14 — Throttle subjects:** register = `(CF-Connecting-IP,
      username_normalized)`; refresh/logout = per-IP budgets. The login
      subject is locked by Q3.5/Q5.6, not a proposal.
- [x] **P15 — Rate-limit response:** reuse the existing 429 envelope and
      headers.
- [x] **P16 — Persistence failure:** 503 `DEPENDENCY_FAILED`, fail closed.
- [x] **P17 — Missing refresh credential:** 401 `UNAUTHENTICATED` with no
      details (Option A), not 400.
- [x] **P18 — Independent sessions:** each successful login creates an
      independent session.
- [x] **P19 — No `Idempotency-Key`:** none on any of the four auth
      endpoints.
- [x] **P20 — Logout success response:** 200 with `{ "ok": true }` (the
      204 alternative was not selected).
- [x] **P21 — `Authorization` ignored:** on register, login, refresh, and
      logout it is never honored as identity or role.
- [x] **P22 — Ordering:** structural validation → throttle → credential
      verification.
- [x] **P23 — Canonical username:** the canonical value is persisted and
      returned in M8.
- [x] **P24 — No verification/pending/recovery fields** in any request or
      response (consequence of locked Q3.4).

### Explicitly reaffirmed by the confirmation

Restated because these carry the highest interpretation risk:

- **P4 corrected:** Register, login, and refresh return the same response
  schema — identical field names, nesting, types, and optionality. Values
  and HTTP status may differ.
- **Credential transport:** `refreshToken` is carried in the JSON request
  body; `Authorization` is the access-token mechanism only; refresh and
  logout do not require `Authorization`.
- **Logout semantics:** keyed by `refreshToken`; repeat logout is
  API-success/idempotent; the current access token is NOT denylisted;
  logout revokes only the current refresh session; no global logout.
- **Missing refresh credential:** 401 `UNAUTHENTICATED` with no details.
- **Strict auth request schemas:** unknown and identity-asserting fields →
  400 `VALIDATION_FAILED`.
- **Reserved username:** 400 `VALIDATION_FAILED`.
- **Uniform login failure:** 401 `UNAUTHENTICATED` with no details;
  username-not-found and wrong-password failures are indistinguishable at
  the HTTP contract. Timing equalization remains an implementation
  requirement.
- **Ordering:** structural validation → throttle → credential
  verification.
- **Persistence failure:** 503 `DEPENDENCY_FAILED`.
- **No `Idempotency-Key`** on the four auth endpoints.
- **Independent sessions:** each successful login creates one.
- **Logout success (P20):** 200 with `{ "ok": true }`.
- **Canonical username:** persisted and returned in M8 (P23).
- **No verification/pending/recovery fields** (P24).

### Refresh replay decision — R-C (new Q6 decision)

Selected: **R-C — durable refresh-grant history.** Intended behavior,
recorded explicitly:

- Refresh credentials remain opaque random bearer material.
- Every issued refresh credential is represented by a server-side digest
  record associated with the session.
- Rotation records consumption/lineage server-side.
- Replay of a previously rotated credential is detectable.
- Replay causes revocation of the affected refresh session and maps to
  401 `UNAUTHENTICATED` with `details.reason = SESSION_REVOKED`.
- The absolute 30-day refresh lifetime remains unchanged.
- No token values are stored.
- No token values are logged.
- This requires a FUTURE migration 009.
- Migration 008 MUST NOT be edited.
- Migration 009 MUST NOT be created, applied, or designed in this task.

**Override:** R-C being selected is a new Q6 decision and therefore
overrides the prior one-generation replay limitation for the future
durable implementation. Q5.5's replay → refresh-session-revocation
behavior and the Option A wire mapping are unchanged; what R-C changes is
the depth and durability of the server-side detection design.

### Decision class

- **LOCKED (decision of record):** all of P1–P24 as confirmed above (P4
  with its corrected wording), and R-C with the intended behavior stated
  above.
- **Implementation-time validation items (not undecided design):** the
  items already named by Q3/Q5/Q6 — exact throttle thresholds/windows;
  KDF dependency and Cloudflare Workers resource/latency validation; exact
  maximum password length; the enumerated reserved-name list; production
  handling of the per-isolate in-memory limiter; trusted-IP-absence
  handling; the token-digest algorithm for migration 008's hash columns;
  execution of timing equalization.
- **Explicitly deferred / still open:** design, creation, and application
  of migration 009 (each a separate authorization); account recovery
  (Gate A Q6 → M12); global logout; RLS (ADR-007); reviewer assignment;
  privileged system credential mechanism; inquiry identity foreign key
  (separate migration approval).

### What this record does and does not authorize

- **Decision recorded only.** This record changes no application source
  code, test, migration, dependency, package file, config, `.dev.vars`,
  secret, generated graph data, or script. Only this file and the named
  decision updates to `docs/architecture/auth-and-session-contract.md`
  and `docs/adr/006-authentication-authorization-boundary.md` are
  modified by this record.
- **Migration 008 is NOT edited. Migration 009 is NOT created, applied,
  or designed.** R-C records a future requirement only; the design,
  creation, and application of migration 009 each require their own
  separate, explicit authorization.
- **No auth endpoint is implemented; no durable refresh-grant storage is
  implemented; no mobile code is changed.** P1–P24 and R-C exist as
  decisions of record only.
- No code tests are run for this record — this is a documentation
  transition, reported as such rather than disguised as a passing check.
- No commit, push, PR, merge, deploy, or publish is authorized or
  performed.
- This record does not reopen Gate A (any sub-decision), Gate B (B-A), Q1,
  Q2A, Q3, Q5, or the Option A authentication error contract. It settles
  the request/response schemas and the remaining failure/error semantics
  that Q3 and Q5 named as still open, and it refines the replay-detection
  design behind Q5.5 without changing Q5.5's revocation behavior or
  Option A's wire mapping.
- Implementation authorization is unchanged: this record authorizes no
  implementation, and the M8 implementation slice still requires the
  separate explicit human authorization in Section 13.

## 7. Proposed Implementation Scope AFTER Approval

Both gates are now recorded (A: Section 5, B: Section 6), so this entire
section is unblocked for **planning** against the approved mechanism and
posture. Nothing in this section is authorized to
be *implemented* by this record: the implementation slice is a separate,
future task requiring explicit human authorization (Section 13). The scope
below is the *expected* shape of the slice, refined against the approved
mechanism and the confirmed B-A discovery posture.

### API

- **Identity module implementation** per `docs/architecture/module-boundaries.md`
  and ADR-006: session verification behind the Identity boundary, with
  business modules unchanged in how they obtain `ActorContext`.
- **Session lifecycle:** establish, verify, refresh, expire, revoke, and
  logout — each producing the explicit failure states ADR-006 requires
  (`unauthenticated`, `session expired`, `session revoked`), never a
  collapsed generic failure.
- **`requireActor` delegation:** `requireActor` remains the call site every
  business module uses; its internals delegate to the approved Identity
  mechanism. Signature and failure semantics stay compatible or the change
  is propagated to every call site with tests.
- **Distinct actor ids per credential:** two different valid credentials
  must resolve to two different `actorId`s. This is the core defect M8
  fixes; the single shared `SESSION_ACTOR_ID` cannot remain the production
  behavior of the approved mechanism.
- **Server-stored roles (Gate A Q7, Choice A):** roles are assigned and
  stored server-side by the Identity module and returned in `ActorContext`
  with a BUYER/ARTISAN minimum; client-supplied role information is never
  trusted; no client role-assignment endpoint in M8. Buyer operations
  (inquiry) and artisan operations (catalog/media/review) follow the split
  recorded in Q7; discovery requires the authenticated BUYER role per
  Gate B (B-A).
- **Relevant contracts:** deliberate updates to
  `docs/architecture/auth-and-session-contract.md` (its Open Decisions
  list), ADR-006 if superseded in part, and the security/observability
  contract if session events/audit rows are added.

### Mobile

- **Secure session/token storage** using platform-appropriate secure
  storage (per contract: SecureStore for device secrets/tokens). No
  plaintext credential storage.
- **Centralized `Authorization` header seam:** one place that attaches
  credentials to outbound API requests, so no individual transport
  hand-rolls headers and no transport silently omits them.
- **401 signed-out state:** an explicit, recoverable application state on
  `UNAUTHENTICATED`, distinguishable from network failure and from a
  server refusal, per ADR-006 Failure States and the UX rules in AGENTS.md.
- **Authenticated transport behavior:** per Gate B (B-A, confirmed) —
  discovery carries `Authorization` credentials through the centralized
  auth seam, and the M7 headerless assertion in
  `discovery-transport.test.ts` is superseded as a named, reviewed test
  change (not a silent header insertion).
- **Inquiry transport** once inquiry UI becomes reachable: creation and
  reads through the same auth seam, with the required `Idempotency-Key`
  preserved.

### Tests

- **Two credentials → two actor ids** (the isolation primitive).
- **Expired session** → refused, with the explicit expired state.
- **Revoked session** → refused after revocation.
- **Logout** → local state cleared and the credential unusable afterward.
- **Refresh** → renewal succeeds; refresh failure produces a recoverable
  signed-out state, not a hang.
- **Cross-buyer inquiry isolation** → buyer B cannot read, modify, or
  dedupe-into buyer A's inquiry; another buyer's inquiry is
  indistinguishable from one that does not exist.
- **Discovery posture** → the test asserts the B-A posture Gate B
  selected, and asserts it *deliberately* (`Authorization` header present;
  401 `UNAUTHENTICATED` without it or with an invalid session), replacing
  the M7 headerless assertion by named change.
- **Mobile auth header** → the centralized seam attaches exactly one
  correctly-formed `Authorization` header and never logs it.
- **Secret redaction** → no test output, log line, or error message
  contains a credential value; fixtures use obvious non-secret markers and
  assertions never print token contents.

## 8. Explicit Non-Goals

- **RLS.** Deferred to ADR-007 work; not added, not claimed.
- **Anonymous browsing redesign.** Gate B selected B-A, so anonymous/
  public discovery is **not** the posture of record; the B-B consequences
  in Section 6 do not become scope. (Had B-B been selected, it would have
  been in scope only to the extent of those consequences.)
- **Reviewer roles.** The REVIEWER role is out of scope; no reviewer
  assignment, moderation UI, or review-queue authorization.
- **Unrelated artisan auth redesign.** The artisan journey keeps working
  as-is; no reworking of artisan ownership rules, catalog/media/AI/review
  authorization, or sync auth behavior beyond keeping them passing.
- **New AI work.** No AI pipeline, provider, or proposal changes.
- **Recommendation/search relevance work.** Discovery query semantics are
  untouched.
- **Deployment.** No deploy, no environment cutover.
- **Production credential changes.** Existing production secrets/config
  are not rotated, replaced, or read as part of this task.
- **Schema changes** unless required by the approved identity mechanism —
  and then only under separate, explicit approval of a new migration.

## 9. Protected Files

The following must not be modified by this task. Modification requires
separate, explicit approval:

- **`apps/api/.dev.vars`** (and any `.dev.vars.*` / `.env` file): never
  read into output, never edited, never committed.
- **Existing ADRs and contracts** (`docs/adr/*`, `docs/architecture/*`)
  except where an approved named decision deliberately updates them —
  Gate A, Gate B (B-A), and M8 Q6 (Sections 5, 6, 6D). Decision updates
  are named changes, not incidental edits.
- **Existing artisan business modules** (`apps/api/src/modules/catalog`,
  `media`, `ai`, `review`, `sync`, and their tests): no behavior change.
- **`infra/migrations/001` through `007`**: immutable. Any schema need
  arising from the approved mechanism requires a *new* migration with its
  own approval.
- **Secret-redaction behavior**: existing redaction/never-log guarantees
  are only strengthened, never relaxed.
- **No `git commit`, `git push`, PR, merge, deploy, or publish** of any
  kind from this task.

## 10. Acceptance Criteria

### Phase 0 — Pre-implementation decision gates (blocking)

- [x] **Gate A recorded:** credential/session mechanism chosen in writing,
      with all eight sub-decisions (provider, token format, session
      lifetime, refresh strategy, logout/revocation, account recovery
      scope, role storage, session persistence) answered or explicitly
      deferred — **CLOSED/CONFIRMED 2026-10-01, Section 5.**
- [x] **Gate B recorded:** discovery posture chosen in writing —
      authenticated (B-A) or anonymous/public (B-B) — with its mandatory
      consequences accepted as scope. **CLOSED/CONFIRMED 2026-10-01 as
      B-A — AUTHENTICATED DISCOVERY; Section 6, five mandatory
      consequences recorded exactly.**
- [x] **No silent selection:** the Gate A mechanism was selected by explicit
      human decision ("YES — CONFIRM GATE A"), recorded verbatim in Section 5
      and propagated to `auth-and-session-contract.md` and ADR-006 as named
      decision edits. Gate B was selected by explicit human decision
      ("YES — CONFIRM GATE B") as B-A, recorded exactly in Section 6 and
      propagated to `auth-and-session-contract.md` and ADR-006 as named
      decision edits; both options and their mandatory consequences remain
      recorded in Section 6, and no posture was selected silently.
- [x] **Implementation not started:** no code, migration, dependency, or
      config change exists for M8; both gates are now recorded and none
      may exist before this record's file-hash baseline of `apps/`,
      `packages/`, `infra/`, `scripts/`, `tests/` (plus root package/config
      files) is re-checked after this decision record.
- [x] Where a gate decision supersedes a contract/ADR statement, the
      update is made as a named, deliberate decision edit — done for
      `docs/architecture/auth-and-session-contract.md` and ADR-006 for
      Gate A, and again for both files for the Gate B (B-A) decision.
- [x] **M8 Q3 recorded:** the auth-surface inventory and versioning, the
      primary identifier, the initial role, the registration policy, and the
      login-protection posture were chosen in writing — **RECORDED as
      Q3.1–Q3.5, Section 6B**, and propagated to
      `docs/architecture/auth-and-session-contract.md` as a named
      decision edit. No surface, identifier, role, verification
      dependency, lockout posture, or throttle subject was selected
      silently.
- [x] **M8 Q5 recorded:** the password KDF and baseline parameters, the
      username/handle normalization model, the password policy, the
      registration session behavior, the refresh/logout/replay semantics,
      and the pre-authentication throttle subject were chosen in writing —
      **RECORDED as Q5.1–Q5.6, Section 6C**, and propagated to
      `docs/architecture/auth-and-session-contract.md` as a named decision
      edit. Implementation-time validation items (Workers KDF
      resource/latency validation, KDF dependency approval, exact throttle
      thresholds/windows, exact maximum password length, reserved-name list,
      per-isolate limiter distribution) are named as such rather than left
      silently undecided. No KDF, handle format, password rule, session
      behavior, replay response, or throttle subject was selected silently,
      and no dependency, code, endpoint, or migration 008 was created.
- [x] **M8 Q6 recorded:** the request/response schemas, failure/error
      semantics, credential transport, and refresh-replay detection for
      the four Q3.1 auth surfaces were confirmed in writing —
      **RECORDED as CONFIRMED P1–P24 (P4 corrected) plus R-C, Section
      6D** — and propagated to
      `docs/architecture/auth-and-session-contract.md` and
      `docs/adr/006-authentication-authorization-boundary.md` as named
      decision updates. No schema, status, credential transport, failure
      mapping, or replay mechanism was selected silently; migration 008
      was not edited and migration 009 was not created, applied, or
      designed.

### Phase 1 — API identity (after Gate A)

- [ ] Two distinct valid credentials resolve to two distinct `actorId`s in
      a focused test.
- [ ] An expired credential is refused with the explicit expired state; a
      revoked credential is refused after revocation; neither collapses
      into a generic success or a silent failure.
- [ ] Logout makes the credential unusable server-side, and the test
      demonstrates it.
- [ ] Refresh succeeds while valid and produces a recoverable signed-out
      state on failure.
- [ ] Unauthenticated requests to protected routes receive 401
      (`UNAUTHENTICATED`); a deployment that cannot verify a session still
      fails closed (`DEPENDENCY_FAILED`) outside development/test.
- [ ] `requireActor` remains the single authentication boundary used by
      every business module; no business module parses session details.
- [ ] Client-supplied values still cannot set `actorId` or roles: an
      inquiry's `buyerId` comes only from the resolved actor.
- [ ] Roles are enforced per Gate A Q7 (server-stored BUYER/ARTISAN roles
      in `ActorContext`, client-supplied roles never trusted, no client
      role-assignment endpoint).
- [ ] The development/test `DEV_OWNER_ID` seam behaves exactly as
      `session.test.ts` specifies today: available in development/test,
      unreachable in production/staging/preview/undefined, never
      substituting for a configured provider.
- [ ] Existing artisan suites pass unchanged (catalog, media, AI, review,
      sync, inquiry).

### Phase 2 — Discovery posture (Gate B closed as B-A; implementation pending)

- [ ] B-A (the selected posture): discovery carries `Authorization`;
      missing/invalid session returns 401 (`UNAUTHENTICATED`); discovery
      requires the server-authoritative BUYER role from `ActorContext`;
      the M7 headerless assertion is superseded in a named, reviewed test
      change with updated rationale comments, and the rate-limit-subject
      rationale in `discovery/http.ts` is reaffirmed or revised.
- [ ] B-B is **not** selected and its criteria do not apply; no test
      asserts anonymous-discovery behavior.
- [ ] No test asserts a behavior the code no longer has.

### Phase 3 — Mobile

- [ ] Session material is stored only in platform secure storage; a test
      or code review confirms no plaintext credential persistence.
- [ ] Exactly one centralized seam attaches the `Authorization` header; no
      transport hand-rolls it.
- [ ] A 401 produces an explicit signed-out state the UI can render,
      distinguishable from network and server-refusal failures.
- [ ] The mobile auth-header test proves the header is present on
      discovery exactly as Gate B (B-A) decided, and proves the header
      value is never written to logs or test output.
- [ ] Inquiry transport (when inquiry UI becomes reachable) sends the
      required `Idempotency-Key` and credentials through the same seam.

### Phase 4 — Isolation and hygiene

- [ ] Cross-buyer inquiry isolation test: buyer B cannot read or alias
      buyer A's inquiry.
- [ ] Secret-redaction test: no credential value appears in any log,
      error, or test output produced by the new code.
- [ ] Full `scripts/verify.ps1` passes with 0 errors.
- [ ] `tsc --noEmit` passes for `apps/api`, `apps/mobile`,
      `packages/contracts`.
- [ ] No protected file (Section 9) was modified; no migration 001–007
      edited; no commit/push/deploy performed.

## 11. Verification Plan

### Focused tests (implementation slice, after gates)

- Identity/session lifecycle unit tests (issue/verify/expire/revoke/
  refresh/logout) — new suite(s) under the Identity module, registered in
  `scripts/verify.ps1`.
- `apps/api/src/shared/auth/session.test.ts` — re-run to prove the
  boundary semantics and the dev seam guards still hold after delegation.
- Discovery journey tests — updated per the Gate B outcome (B-A:
  authenticated discovery with server-authoritative BUYER role and 401 on
  missing/invalid credentials), re-run in both
  directions if the posture change touches shared middleware.
- Inquiry journey tests — re-run for cross-buyer isolation and unchanged
  artisan-side behavior.
- Mobile: auth-seam tests and updated
  `apps/mobile/src/network/discovery-transport.test.ts` per Gate B (B-A).

### Type/build/lint checks

- `tsc --noEmit` for `apps/api`, `apps/mobile`, `packages/contracts`.
- Mobile ESLint and API lint as configured in `scripts/verify.ps1`.

### Full repository verification

- `scripts/verify.ps1` — full run, 0 errors, after the slice is assembled.

### Runtime proof (once implementation exists)

- A real end-to-end proof against a running API: establish two sessions,
  show two distinct actor ids, show 401 without a credential, show logout
  revoking access, show the Gate B posture behavior (B-A: 401
  `UNAUTHENTICATED` on discovery without a valid BUYER session, and a
  successful authenticated discovery read with one) live. If the approved
  mechanism needs a database, apply any
  *new* migration to a local PostgreSQL instance and re-apply it to show
  idempotency — migrations 001–007 are not touched.
- Runtime proof is **"implemented but unverified"** until actually
  executed; it is not claimed by this document.

### Verification for this document (task contract authoring)

- Read the file back after writing.
- Confirm Gate A is recorded CLOSED/CONFIRMED with all eight sub-decisions
  answered verbatim, and that Gate B is recorded CLOSED/CONFIRMED as B-A
  with its five mandatory consequences reproduced exactly.
- Confirm no implementation file changed (file-modification baseline taken
  before authoring; re-checked after).
- Confirm no secrets appear anywhere in the document.

## 12. Risks

- **Current single shared production identity.** With
  `SESSION_TOKEN`/`SESSION_ACTOR_ID`, every valid credential resolves to
  one actor. Two different real users would read and write as the same
  identity — cross-user data bleed by construction. Until the Gate A
  mechanism is implemented, this is the production behavior.
- **Static non-expiring secret.** `SESSION_TOKEN` never rotates or
  expires; compromise is permanent until the value is changed by hand, and
  there is no revocation short of removing the configuration.
- **`DEV_OWNER_ID` deployment misconfiguration risk.** The seam is
  environment-scoped and tested, but a mis-set `APP_ENV` or a copy of dev
  config into a deployed environment remains a live authentication-bypass
  hazard; the fail-closed tests are the only guard.
- **No mobile credential storage.** The app cannot yet hold a session, so
  even after Gate A the mobile half is greenfield: secure storage,
  refresh handling, and 401 recovery are all unbuilt and unproven.
- **No role enforcement.** `roles` is always `[]`; any route reached by
  `requireActor` is reachable by every authenticated actor regardless of
  buyer/artisan standing.
- **`inquiries.buyer_id` has no identity FK.** The inquiry's buyer is a
  bare value with no foreign key to an identity/user table, so the
  database cannot validate that a buyer exists or constrain identity
  lifecycle (delete/rename/anonymize) effects. Creating that reference
  implies a schema change and therefore a new-migration decision.
- **No RLS.** Application-level `WHERE` scoping on inquiries remains the
  only isolation; the database is not a second enforcement boundary. This
  is the recorded ADR-007 gap and is unchanged by M8.
- **Discovery posture ambiguity was a live correctness hazard; the decision
  now exists, the fix does not.** The server requires an actor the client
  does not send; this only works via the dev seam. Gate B resolved the
  ambiguity to B-A by human decision (2026-10-01), but until the
  implementation slice lands, any deployment with a real session and no
  code change would break buyer discovery — the decision removes the
  ambiguity, not the mismatch.
- **Mechanism-induced dependency risk (Gate A, now concrete).** Gate A chose
  A2 with provider "none / first-party", so no provider SDK, provider outage,
  or provider lock-in enters the trust boundary. The remaining consequences
  are: server-side session storage and revocation state (a schema/table
  concern requiring its own new-migration approval), session store secrets,
  and 15-minute access / 30-day absolute refresh behavior that must land
  behind the Identity boundary without leaking into business modules.

## 13. Completion Rule

The **M8 task contract** is complete only when:

1. Gate A (credential/session mechanism) is explicit and recorded — now
   **CLOSED/CONFIRMED** with all eight sub-decisions answered by human
   decision (Section 5).
2. Gate B (discovery posture) is explicit and recorded — now
   **CLOSED/CONFIRMED as B-A (AUTHENTICATED DISCOVERY)** with the five
   mandatory consequences reproduced exactly (Section 6).
3. No credential mechanism was silently selected — the mechanism of record
   (A2, provider none/first-party) exists only because a human explicitly
   confirmed it, and it is recorded verbatim in Section 5 and propagated as
   named decision updates to `auth-and-session-contract.md` and ADR-006.
4. No discovery posture was silently selected — B-A exists only because a
   human explicitly confirmed it ("YES — CONFIRM GATE B"), the five
   mandatory consequences are recorded exactly in Section 6, the not-selected
   B-B option and its consequences remain recorded, and the decision is
   propagated as named decision updates to `auth-and-session-contract.md`
   and ADR-006.
5. Implementation remains a separate future step: no code, migration,
   dependency, package file, config, secret, or generated artifact is part
   of this record's delivery, and no implementation begins without explicit
   human authorization — including the discovery-touching work that Gate B
   (B-A) now scopes but does not authorize.

The **M8 implementation milestone** (a later task) is complete only when
the Phase 1–4 acceptance criteria in Section 10 pass and the verification
in Section 11 actually runs.

## Expected Changes

- Files/modules changed by **this document**: this file, plus the named
  Gate A and Gate B decision updates to
  `docs/architecture/auth-and-session-contract.md` and
  `docs/adr/006-authentication-authorization-boundary.md`, plus the named
  Q2A, Q3, and Q5 decision updates to
  `docs/architecture/auth-and-session-contract.md`, plus the named M8 Q6
  decision updates to both
  `docs/architecture/auth-and-session-contract.md` and
  `docs/adr/006-authentication-authorization-boundary.md`. ADR-006 is not
  edited for Q2A/Q3/Q5 — the recorded convention (Gate A, Gate B) treats
  ADR-006 edits as named amendments only; the M8 Q6 amendment to ADR-006
  is such a named decision update, explicitly authorized because R-C
  changes the durable replay-detection design recorded against the
  session boundary. No other file.
- Files/modules expected to change in the **future implementation slice**
  (indicative, refined against Gate A and the confirmed B-A posture;
  discovery-touching items are now scoped by Gate B but still require
  implementation-slice authorization):
  - `apps/api/src/shared/auth/session.ts` (delegation to Identity)
  - new Identity module files under `apps/api/src/modules/identity/**`
  - `apps/api/src/modules/discovery/http.ts` (per Gate B: BUYER-role
    requirement, 401 semantics, rate-limit-subject rationale reaffirmed
    or revised)
  - `apps/api/src/shared/auth/session.test.ts` and new identity suites
  - `apps/mobile/src/network/*` (auth seam + transport headers;
    `discovery-transport.ts` and `discovery-transport.test.ts` supersede
    the M7 headerless assertion per Gate B consequence 4)
  - `apps/mobile` secure-storage/session module and 401 state
  - `packages/contracts/src/*` (only if the mechanism changes a contract)
  - `docs/architecture/auth-and-session-contract.md`, ADR-006 — named by
    Gate B consequence 4 as explicitly in-scope for the later
    implementation; the Gate A and Gate B decision updates are already
    applied here, and any further updates must remain named decision
    edits
  - `scripts/verify.ps1` (register new suites)
  - a **new** migration only if the approved mechanism requires schema
- Dependencies expected: Gate A selected provider "none / first-party", so
  **no external auth provider SDK** is expected. Remaining dependency
  questions are server-side session storage (possible new migration, under
  separate approval) and the existing Expo/SecureStore capability on mobile.
- This document.

## Governing Context

- Relevant specification: `docs/specs/first-vertical-slice.md` (buyer
  discovery and inquiry within the validated journey).
- Relevant ADRs:
  - `006-authentication-authorization-boundary` — Identity ownership,
    authentication vs authorization separation, explicit failure states.
  - `001-modular-monolith-boundaries` — Identity as a module; no
    cross-module table reach-in.
  - `003-offline-first-sync-and-idempotency` — offline drafts are not
    authorization; server operations require a valid session.
  - `007-database-ownership-and-rls` — RLS deferred, not silently added.
  - `009-api-contract-and-versioning` — boundary validation with messages
    that name the fault (401 vs 400 vs 404 distinctions).
  - `010-verification-and-testing-strategy` — fast, service-free suites in
    the verification path.
- Relevant contracts:
  - `docs/architecture/auth-and-session-contract.md` (Open Decisions list;
    the Gate A, Gate B, and M8 Q6 decision updates have been applied
    there) and ADR-006 (named Gate A, Gate B, and M8 Q6 decision updates
    applied; further updates only per named decisions such as Gate B
    consequence 4).
  - `docs/architecture/security-privacy-observability-contract.md`
    (never log tokens/headers; audit without secrets).
  - `docs/architecture/module-boundaries.md` (Identity owns identity,
    roles, session context; Discovery and Inquiry own their rules).
  - `docs/architecture/data-and-rls-contract.md` (outstanding RLS gap).
- Relevant specialist skills: `security-and-hardening` (cross-cutting for
  the implementation slice), `spec-driven-development` and
  `planning-and-task-breakdown` (contract authoring),
  `supabase-postgres-best-practices` for the server-side session store that
  Gate A's A2 mechanism requires (any schema still needs its own new-migration
  approval), `expo-data-fetching` for the mobile auth seam.

## Assumptions

- The verified state in Section 3 reflects the repository as read during
  contract authoring; it is re-checked before implementation begins.
- "M7 Discovery is verified" and "the read-only M8 discovery pass is
  verified" are taken as given by the milestone record.
- Gate A and Gate B were permitted to be answered in one human decision
  session or separately; both have now been answered and recorded — Gate A
  and Gate B each by its own explicit human confirmation, both dated
  2026-10-01. Both gates being recorded still does not authorize
  implementation.
- The dev seam and static session remain in place until the approved
  mechanism replaces them — M8 does not remove them speculatively.

## Evidence Status

- `VERIFIED` — **for this task contract**: the document exists at
  `docs/agent/m8-buyer-session-task.md`, was read back after writing, Gate A
  is recorded CLOSED/CONFIRMED with all eight sub-decisions answered verbatim
  from the human decision record, Gate B is recorded CLOSED/CONFIRMED as
  B-A with its five mandatory consequences reproduced exactly, no
  implementation file was modified (file-hash baseline re-checked), and the
  document contains no secrets.
- `VERIFIED` — **for the M8 Q2A decision record (2026-10-01)**: Section 6A
  reproduces the seven statements of "CHOICE 1 — FIRST-PARTY REGISTRATION +
  LOGIN (identifier + password/passphrase)" exactly as instructed; the
  named decision update was also applied to
  `docs/architecture/auth-and-session-contract.md`; only those two
  documentation files were modified by this record; no code, test,
  migration, dependency, config, secret, or discovery/mobile file was
  touched; no tests were run for this record; no commit/push/deploy.
- `VERIFIED` — **for the M8 Q3 decision record (2026-10-02)**: Section 6B
  reproduces Q3.1–Q3.5 exactly as instructed (inventory 3.1-A with the four
  `/v1/auth/*` surfaces and versioning V1; identifier 3.2-C
  username/handle; initial role 3.3-A BUYER-only with no M8 role change and
  no client role-assignment/change endpoint; registration policy 3.4-A with
  no verification and duplicate identifier = 409 CONFLICT; login protection
  3.5-C throttling by trusted client IP + normalized identifier, no account
  lockout, thresholds deferred, actorId never the pre-authentication
  throttle subject); the named decision update was also applied to
  `docs/architecture/auth-and-session-contract.md`; only those two
  documentation files were modified by this record; no code, test,
  migration, dependency, config, secret, or discovery/mobile file was
  touched; no tests were run for this record; no commit/push/deploy.
- `VERIFIED` — **for the M8 Q5 decision record (2026-10-02)**: Section 6C
  reproduces Q5.1–Q5.6 exactly as instructed (Argon2id with the 19456 KiB /
  2 iterations / parallelism 1 / 16-byte salt / 32-byte tag PHC-encoded
  baseline plus the Workers resource/latency validation and explicit KDF
  dependency-approval constraints; normalized username model with
  `^[a-z0-9][a-z0-9_.-]{2,29}$`, lowercase canonical form, dedicated unique
  `username_normalized` column, reserved names, no full-Unicode handles in
  M8; 15-character minimum password with no composition rules and a safely
  chosen maximum; registration auto-establishing the first authenticated
  session at `POST /v1/auth/register` with server-side BUYER and 409 on
  duplicate normalized username; Gate A token/session model preserved with
  single-use rotating refresh, replay → refresh-session revocation mapped
  through the Option A error contract, and idempotent logout without access
  denylist; pre-auth throttle key `(CF-Connecting-IP, username_normalized)`
  with no `actorId`, no lockout, no durable throttle table in 008, existing
  in-memory limiter, thresholds deferred, per-isolate distribution caveat);
  the named decision update was also applied to
  `docs/architecture/auth-and-session-contract.md` (ADR-006 not edited,
  matching the Q2A/Q3 convention); only those two documentation files were
  modified by this record; no code, test, migration, dependency, config,
  secret, or discovery/mobile file was touched; migration 008 does not
  exist; no tests were run for this record (implementation not started);
  no commit/push/deploy.
- `VERIFIED` — **for the M8 Q6 decision record (2026-10-02)**: Section 6D
  records P1–P24 confirmed exactly as proposed in the Q6 Decision Review
  Sheet, with P4 corrected to "Register, login, and refresh return the
  same response schema: identical field names, nesting, types, and
  optionality. Values and HTTP status may differ."; it records the
  explicit confirmations (refresh/logout credential carried in the JSON
  body with no `Authorization` requirement; logout keyed on the refresh
  credential, idempotent, no access-token denylist, session-scoped only,
  no global logout; missing refresh credential = 401 `UNAUTHENTICATED`
  with no details; strict request schemas and reserved username = 400
  `VALIDATION_FAILED`; uniform 401 login failure with timing equalization
  still required at implementation; validation → throttle → verification
  ordering; persistence failure = 503 `DEPENDENCY_FAILED`; no
  `Idempotency-Key` on the four auth endpoints; an independent session per
  successful login; logout success = 200 `{ "ok": true }`; canonical
  username persisted and returned; no verification/pending/recovery
  fields); and it records R-C — durable refresh-grant history — with its
  full intended behavior, its override of the prior one-generation replay
  limitation for the future durable implementation, and its FUTURE
  migration 009 requirement. The named decision updates were also applied
  to `docs/architecture/auth-and-session-contract.md` and
  `docs/adr/006-authentication-authorization-boundary.md`; only those
  three documentation files were modified by this record; migration 008
  was not edited; migration 009 was not created, applied, or designed; no
  source code, test, dependency, package file, config, secret, script, or
  generated graph data was touched; no code tests were run (documentation
  transition, reported as such rather than disguised as a pass); no
  commit/push/deploy.
- The **M8 implementation itself** remains `NOT STARTED`. Both gates are
  closed, Q2A, Q3, Q5, and Q6 are recorded; this record explicitly
  authorizes no implementation; discovery-touching work is scoped by Gate
  B (B-A) but still requires the separate implementation-slice
  authorization.

## Unverified Items / Open Decisions

- Gate A: **CLOSED/CONFIRMED 2026-10-01** — mechanism A2 (server-issued
  opaque sessions), provider none/first-party, plus the seven remaining
  sub-decisions, all recorded verbatim in Section 5.
- Gate B: **CLOSED/CONFIRMED 2026-10-01 as B-A — AUTHENTICATED
  DISCOVERY** — five mandatory consequences recorded exactly in Section 6;
  B-B (anonymous/public discovery) not selected.
- Migration 008 design authorization — **Q1: YES — AUTHORIZE MIGRATION 008 DESIGN**
  (human-confirmed 2026-10-01). This authorizes **design/review only**; it
  does not authorize creation or application of migration 008. Applying any
  migration remains a separate approval boundary.
- M8 Q2A account establishment — **RECORDED: CHOICE 1 — FIRST-PARTY
  REGISTRATION + LOGIN (identifier + password/passphrase)**, human decision
  2026-10-01, reproduced exactly in Section 6A. First-party identifier +
  password/passphrase; server-side salted strong-KDF hash validation; actor
  identity from the server-side account record; no external identity
  provider; no M8 account recovery; migration 008 must be designed to
  support the account/credential model (design constraint only).
- Registration and login/establishment HTTP surfaces — **RECORDED: M8 Q3
  (Q3.1–Q3.5)**, human decision recorded 2026-10-02, reproduced exactly in
  Section 6B: inventory 3.1-A = `POST /v1/auth/register`,
  `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`
  with versioning V1; identifier 3.2-C with username/handle as the primary
  identifier; initial role 3.3-A = BUYER only on registration, no role
  changes in M8, no M8 client role-assignment/change endpoint; registration
  policy 3.4-A = no verification in M8, duplicate username/identifier =
  409 CONFLICT, no email/SMS/OTP verification dependency; login protection
  3.5-C = throttle by trusted client IP + normalized identifier, no account
  lockout, exact thresholds/windows deferred to implementation-time
  security review, actorId never the pre-authentication throttle subject.
  Still open from this item: the request/response schemas for the four
  surfaces and failure/error semantics beyond the Q3.4 duplicate-identifier
  409 CONFLICT (partly addressed by Q5.4/Q5.5 and the Option A error
  contract); the concrete strong-KDF algorithm and parameters were later
  decided by Q5.1, the identifier format/normalization by Q5.2, the
  password policy by Q5.3, the registration session behavior by Q5.4, the
  refresh/logout/replay semantics by Q5.5, and the throttle subject by
  Q5.6 (thresholds/windows remain an implementation-time security review
  item under Q5.6). The request/response schemas and the remaining
  failure/error semantics still open from this item were later decided by
  M8 Q6 (Section 6D).
- M8 Q5 credential/throttle decisions — **RECORDED: Q5.1 THROUGH Q5.6 AS
  STATED**, human decision recorded 2026-10-02, reproduced exactly in
  Section 6C: Q5.1 = Argon2id password KDF with the baseline 19456 KiB /
  2 iterations / parallelism 1 / 16-byte salt / 32-byte tag parameters,
  complete PHC-format string stored, subject to mandatory Cloudflare
  Workers resource/latency validation and an explicit implementation-time
  KDF dependency approval; Q5.2 = normalized username model,
  `^[a-z0-9][a-z0-9_.-]{2,29}$` (3–30 chars, lowercase canonical),
  normalized before uniqueness comparison, persisted in a dedicated unique
  `username_normalized` column, documented reserved-name set, no
  full-Unicode handles in M8; Q5.3 = 15-character minimum password, no
  composition rules, long passphrases allowed, exact maximum chosen for
  safe processing of long inputs; Q5.4 = registration auto-establishes the
  initial authenticated session at `POST /v1/auth/register` (server-side
  BUYER, first session created, authenticated payload returned, no second
  login, no M8 verification, duplicate normalized username = 409);
  Q5.5 = Gate A token/session model preserved (15-minute access, 30-day
  absolute single-use rotating refresh), refresh mints replacement
  credentials and invalidates the predecessor, replay of a rotated refresh
  token revokes the refresh session (not report-only) mapped through the
  Option A error contract, logout revokes the refresh session without an
  access denylist and is idempotent; Q5.6 = pre-auth throttle key
  `(CF-Connecting-IP, username_normalized)`, no `actorId`, no account
  lockout, no durable throttle table in migration 008, existing in-memory
  limiter, thresholds deferred, per-isolate non-distribution accounted
  for, trusted IP taken only from Cloudflare edge-set request metadata.
  Implementation-time validation items (not undecided): Workers KDF
  resource/latency validation, KDF dependency approval, exact throttle
  thresholds/windows, exact maximum password length, the enumerated
  reserved-name list, and per-isolate limiter distribution handling.
  Still open: request/response schemas for the four surfaces and migration
  008 creation/application. **Later update (M8 Q6):** the
  request/response schemas and the remaining failure/error semantics were
  settled by Q6 (Section 6D); migration 008 now exists in the repository
  and must not be edited.
- M8 Q6 auth HTTP contract — **RECORDED: CONFIRMED — P1 THROUGH P24
  EXACTLY AS PROPOSED (WITH THE P4 WORDING CORRECTION), PLUS REFRESH
  REPLAY R-C — DURABLE REFRESH-GRANT HISTORY**, human decision recorded
  2026-10-02, reproduced in Section 6D: statuses register 201 and
  login/refresh/logout 200; `session` wrapper, camelCase, ISO-8601 UTC,
  no `tokenType`; session metadata = `sessionId`,
  `actor { actorId, username, roles }`, both expiry timestamps; **P4
  corrected** — register, login, and refresh return the same response
  schema (identical field names, nesting, types, and optionality; values
  and HTTP status may differ); `refreshToken` carried in the JSON request
  body, `Authorization` is the access-token mechanism only, refresh and
  logout do not require `Authorization`, `Authorization` is ignored on all
  four surfaces; logout keyed by `refreshToken`, repeat logout
  API-success/idempotent (200 `{ "ok": true }`), access token not
  denylisted, only the current refresh session revoked, no global logout;
  missing refresh credential = 401 `UNAUTHENTICATED` with no details;
  unknown/identity-asserting fields and reserved usernames = 400
  `VALIDATION_FAILED` with `details: { field }`; uniform login failure =
  401 `UNAUTHENTICATED` with no details, username-not-found and
  wrong-password indistinguishable at the HTTP contract, timing
  equalization an implementation requirement; ordering = structural
  validation → throttle → credential verification; persistence failure =
  503 `DEPENDENCY_FAILED`; no `Idempotency-Key` on the four endpoints;
  each successful login creates an independent session; canonical
  username persisted and returned; no verification/pending/recovery
  fields; register/refresh/logout throttle subjects per P14 with the
  existing 429 envelope reused. **Refresh replay = R-C:** opaque random
  bearer refresh material, a server-side digest record per issued refresh
  credential associated with the session, rotation consumption/lineage
  recorded server-side, replay detectable, replay revokes the affected
  refresh session and maps to 401 `UNAUTHENTICATED` with
  `details.reason = SESSION_REVOKED`, absolute 30-day lifetime unchanged,
  no token values stored and none logged; **R-C is a new Q6 decision and
  overrides the prior one-generation replay limitation for the future
  durable implementation**; R-C requires a FUTURE migration 009 —
  migration 008 MUST NOT be edited, and migration 009 MUST NOT be
  created, applied, or designed. Named decision updates applied to
  `docs/architecture/auth-and-session-contract.md` and
  `docs/adr/006-authentication-authorization-boundary.md`.
- Migration 009 (durable refresh-grant history per M8 Q6 R-C) —
  **REQUIRED BY DECISION, NOT AUTHORIZED:** the design, creation, and
  application of migration 009 each require their own separate, explicit
  approval; migration 008 must not be edited; no design work for 009
  occurred in the Q6 recording task.
- Whether the approved mechanism requires schema (new migration) — design authorized
  (Q1) and now scoped by Q2A (account/credential model), Q5.2 (dedicated
  unique `username_normalized` column), and Q5.6 (no durable throttle table
  in 008); creation/application still requires the separate migration boundary.
- Whether inquiry gains an identity foreign key — open, downstream of
  Gate A and a separate migration approval.
