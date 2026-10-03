# Authentication and Session Contract

Status: Draft for first vertical slice

Decision update: M8 Gate A credential/session decisions recorded 2026-10-01
(authoritative verbatim record: `docs/agent/m8-buyer-session-task.md`,
Section 5).

Decision update: M8 Gate B discovery posture recorded 2026-10-01 —
**B-A — AUTHENTICATED DISCOVERY** (authoritative verbatim record:
`docs/agent/m8-buyer-session-task.md`, Section 6, "Five mandatory
consequences"). This is a named decision update; it changes no code,
test, migration, dependency, config, or secret. Implementation remains
NOT STARTED.

Decision update: M8 error contract recorded 2026-10-01 — **A — KEEP
`UNAUTHENTICATED` AS THE WIRE ERROR CODE + OPTIONAL `details.reason`.**
Authorized `details.reason` values at the protected-route boundary are
exactly `SESSION_EXPIRED` and `SESSION_REVOKED`; generic
missing/unknown/invalid authentication has no `details.reason`. This is a
named contract decision for expired/revoked sessions: it changes no
`ErrorCode`, no HTTP status, and no error-middleware behavior. Full
statement: "Session Failure Error Contract (M8)" below.

Decision update: M8 Q2A account establishment recorded 2026-10-01 —
**CHOICE 1 — FIRST-PARTY REGISTRATION + LOGIN (identifier +
password/passphrase).** Actor establishment uses a first-party identifier +
password/passphrase; the server validates the password against a
server-side salted strong-KDF hash; actor identity comes from the
server-side account record; no external identity provider; no M8 account
recovery (unchanged from Gate A Q6 — deferred to M12); migration 008 must
be designed to support the account/credential model (design constraint
only — creation/application of migration 008 remains a separate approval);
registration and login/establishment HTTP surfaces are the next decision.
This is a named decision update: it changes no code, test, migration,
dependency, config, or secret, and implementation remains NOT STARTED.
Authoritative verbatim record: `docs/agent/m8-buyer-session-task.md`,
Section 6A.

Decision update: M8 Q3 registration/session HTTP surfaces recorded
2026-10-02 — **Q3.1 THROUGH Q3.5 AS STATED.** Q3.1 inventory = 3.1-A,
versioning = V1: `POST /v1/auth/register`, `POST /v1/auth/login`,
`POST /v1/auth/refresh`, `POST /v1/auth/logout`. Q3.2 identifier = 3.2-C,
primary identifier = username/handle. Q3.3 initial role = 3.3-A: new
registrations receive BUYER only; role changes later in M8 = NO; no M8
client role-assignment/change endpoint. Q3.4 registration policy = 3.4-A:
no verification in M8; duplicate username/identifier = 409 CONFLICT; no
email/SMS/OTP verification dependency. Q3.5 login protection = 3.5-C:
throttle by trusted client IP + normalized identifier; no account lockout;
exact thresholds/windows remain for implementation-time security review;
do not use actorId as the pre-authentication throttle subject. This is a
named decision update: it changes no code, test, migration, dependency,
config, or secret, adds no endpoint, creates no migration 008, and
implementation remains NOT STARTED. Authoritative verbatim record:
`docs/agent/m8-buyer-session-task.md`, Section 6B.

Decision update: M8 Q5 credential/throttle decisions recorded 2026-10-02 —
**Q5.1 THROUGH Q5.6 AS STATED.** Q5.1 password KDF = Argon2id with the
baseline parameters (memory 19456 KiB, iterations 2, parallelism 1, 16-byte
random salt, 32-byte tag, complete PHC-format encoded string stored),
subject to mandatory Cloudflare Workers resource/latency validation before
production use and to an explicit implementation-time KDF dependency
decision/approval; parameters must not be silently changed. Q5.2 username
normalization = normalized handle model, `^[a-z0-9][a-z0-9_.-]{2,29}$`
(3–30 characters, lowercase canonical), normalized before uniqueness
comparison, persisted in a dedicated uniquely constrained
`username_normalized` column, documented reserved-name set, no
full-Unicode handle semantics in M8; the normalized value is the identity
used for uniqueness and authentication throttling. Q5.3 password policy =
15-character minimum, no arbitrary composition rules, long passphrases
allowed, exact maximum chosen so long inputs are processed safely without
truncation or denial-of-service. Q5.4 registration session behavior =
`POST /v1/auth/register` automatically establishes the initial
authenticated session (create account → assign BUYER server-side → create
first session → return the authenticated session payload); no second login;
no email/SMS/OTP verification in M8; duplicate normalized username =
409 CONFLICT (preserves Q3.4). Q5.5 refresh/logout/replay = the Gate A
token/session model is preserved (opaque bearer tokens, 15-minute access,
30-day absolute single-use rotating refresh); a valid current refresh token
mints replacement credentials and invalidates the previous one without
extending the absolute expiration; concurrent duplicate use of the old
refresh token is not a valid refresh; detecting an already-rotated/reused
refresh token **revokes the affected refresh session** (not report-only)
with the failure mapped through the Option A authentication error contract
(`SESSION_EXPIRED` / `SESSION_REVOKED` only where that contract permits);
logout revokes the current refresh session immediately, does not denylist
access tokens (natural 15-minute expiry), and is idempotent at the API
contract level. Q5.6 pre-auth login throttling = throttle subject is the
trusted Cloudflare client IP plus normalized username
(`(CF-Connecting-IP, username_normalized)`); never `actorId` before
authentication; no account lockout; no durable throttle table in migration
008; M8 may use the existing in-memory limiter infrastructure; exact
thresholds/windows remain an implementation-time security review item;
production behavior must account for the in-memory per-isolate limiter not
being globally distributed; trusted-IP extraction comes only from
Cloudflare edge-set request metadata under the Q4 deployment assumption.
This is a named decision update: it changes no code, test, migration,
dependency, config, or secret, creates no migration 008, adds no endpoint,
adds no dependency, and implementation remains NOT STARTED. Authoritative
verbatim record: `docs/agent/m8-buyer-session-task.md`, Section 6C.

Decision update: M8 Q6 auth HTTP contract recorded 2026-10-02 —
**CONFIRMED: P1 THROUGH P24 EXACTLY AS PROPOSED (WITH THE P4 WORDING
CORRECTION), PLUS REFRESH REPLAY R-C — DURABLE REFRESH-GRANT HISTORY.**
Register, login, and refresh return the same response schema: identical
field names, nesting, types, and optionality; values and HTTP status may
differ. Statuses: register 201; login/refresh/logout 200. `refreshToken`
is carried in the JSON request body; `Authorization` is the access-token
mechanism only; refresh and logout do not require `Authorization`.
Logout is keyed by `refreshToken`, repeat logout is API-success/
idempotent, the current access token is NOT denylisted, only the current
refresh session is revoked, and there is no global logout. A missing
refresh credential is 401 `UNAUTHENTICATED` with no details. Unknown and
identity-asserting request fields and reserved usernames are 400
`VALIDATION_FAILED`. Every login failure is a uniform 401
`UNAUTHENTICATED` with no details — username-not-found and
wrong-password failures are indistinguishable at the HTTP contract — and
timing equalization remains an implementation requirement. Ordering is
structural validation → throttle → credential verification. Persistence
failure is 503 `DEPENDENCY_FAILED`. No `Idempotency-Key` on the four
auth endpoints. Each successful login creates an independent session.
Logout success is 200 with `{ "ok": true }`. The canonical username is
persisted and returned in M8. No verification/pending/recovery fields
appear in any request or response. Refresh replay is decided as **R-C**:
refresh credentials remain opaque random bearer material; every issued
refresh credential is represented by a server-side digest record
associated with the session; rotation records consumption/lineage
server-side; replay of a previously rotated credential is detectable;
replay causes revocation of the affected refresh session and maps to 401
`UNAUTHENTICATED` with `details.reason = SESSION_REVOKED`; the absolute
30-day refresh lifetime is unchanged; no token values are stored and none
are logged. R-C requires a FUTURE migration 009 — migration 008 MUST NOT
be edited, and migration 009 MUST NOT be created, applied, or designed
by this record. R-C is a new Q6 decision and therefore overrides the
prior one-generation replay limitation for the future durable
implementation. This is a named decision update: it changes no code, no
test, no migration, no dependency, no package file, no config, no secret,
and no generated graph data; it adds no endpoint; and implementation
remains NOT STARTED, still requiring the separate explicit human
authorization in `docs/agent/m8-buyer-session-task.md`, Section 13.
Authoritative verbatim record: `docs/agent/m8-buyer-session-task.md`,
Section 6D.

## Purpose
Define identity, session, role, and authorization context used by the client and backend.

## Identity
- Every authenticated user has a durable user identity.
- User identity is distinct from device identity.
- One user may use multiple devices.
- Device loss must not imply account ownership loss.

## Roles
- ARTISAN
- BUYER
- REVIEWER
- SYSTEM

Role assignment is server-controlled.

Client-provided role information is never trusted for authorization.

Role storage (M8 Gate A, Choice A): roles are stored server-side and assigned
by the Identity module; server-side session resolution returns authoritative
roles in `ActorContext`. Minimum roles: BUYER, ARTISAN. There is no client
role-assignment endpoint in M8.

Role assignment at registration (M8 Q3.3, human decision recorded
2026-10-02): new registrations receive BUYER only; role changes later in
M8 = NO; there is no M8 client role-assignment or role-change endpoint.
This narrows M8 without reopening Gate A Q7 (server-stored roles, minimum
BUYER/ARTISAN).

## Authentication
Mechanism of record (M8 Gate A, human-confirmed 2026-10-01):
- Mechanism: server-issued opaque sessions (random token stored server-side).
- Provider: none / first-party. No external authentication provider in M8.

Credentials:
- Access credential: `Authorization: Bearer <token>`; unpadded base64url of
  32 cryptographically random bytes (256 bits); opaque. The client stores and
  echoes it verbatim and never parses or decodes it.
- Refresh credential: same encoding (unpadded base64url of 32 cryptographically
  random bytes).

The chosen mechanism must support:
- secure login/session establishment
- token/session expiry
- token/session refresh
- explicit logout
- server-side identity verification
- account recovery — deferred to M12; none of email/SMS/OTP/social-login
  recovery or undocumented support-managed reset exists in M8

Account establishment (M8 Q2A, CHOICE 1 — FIRST-PARTY REGISTRATION + LOGIN,
human-confirmed 2026-10-01):
- Actor establishment uses a first-party identifier + password/passphrase.
- The server validates the password against a server-side salted strong-KDF
  hash. The plaintext password and the stored hash stay inside the server
  boundary and are never logged, returned, or included in any error detail.
- Actor identity comes from the server-side account record, never from a
  client-supplied value.
- No external identity provider.
- No M8 account recovery (unchanged from Gate A Q6; deferred to M12).
- Migration 008 must be designed to support the account/credential model.
  This is a design constraint only; creating or applying migration 008
  remains a separate, explicit approval.
- Registration and login/establishment HTTP surfaces are the next decision.
  The identifier format, endpoint inventory and schemas, failure/error
  semantics, duplicate-identifier behavior, rate-limit/lockout posture, and
  the concrete strong-KDF algorithm and parameters are not settled by Q2A.

Registration and login surfaces (M8 Q3 — Q3.1 THROUGH Q3.5 AS STATED,
human decision recorded 2026-10-02; verbatim record in
`docs/agent/m8-buyer-session-task.md`, Section 6B):

- **Q3.1 — auth surfaces and versioning.** Inventory = 3.1-A, versioning
  = V1:
  - `POST /v1/auth/register`
  - `POST /v1/auth/login`
  - `POST /v1/auth/refresh`
  - `POST /v1/auth/logout`
- **Q3.2 — identifier.** Identifier = 3.2-C; primary identifier =
  username/handle.
- **Q3.3 — initial role.** Initial role = 3.3-A; new registrations
  receive BUYER only; role changes later in M8 = NO; no M8 client
  role-assignment/change endpoint.
- **Q3.4 — registration policy.** Registration policy = 3.4-A; no
  verification in M8; duplicate username/identifier = 409 CONFLICT; no
  email/SMS/OTP verification dependency.
- **Q3.5 — login protection.** Login protection = 3.5-C; throttle by
  trusted client IP + normalized identifier; no account lockout; exact
  thresholds/windows remain for implementation-time security review; do
  not use actorId as the pre-authentication throttle subject.

Q3 settles the surface inventory, versioning, primary identifier, initial
role, registration policy, and login-protection posture only. It does not
settle the request/response schemas for the four surfaces, the concrete
strong-KDF algorithm and parameters, the exact throttle thresholds/windows
(explicitly deferred to implementation-time security review), or
failure/error semantics beyond the Q3.4 duplicate-identifier
`409 CONFLICT`. Migration 008 is neither created nor applied by Q3.
**Later update:** M8 Q5 now settles the strong-KDF algorithm and
parameters (Q5.1), the identifier format and normalization (Q5.2), the
password policy (Q5.3), the registration session behavior (Q5.4), the
refresh/logout/replay semantics (Q5.5), and the throttle subject (Q5.6);
the request/response schemas and the exact throttle thresholds/windows
remain open as described below.

Credential, handle, and throttle decisions (M8 Q5 — Q5.1 THROUGH Q5.6 AS
STATED, human decision recorded 2026-10-02; verbatim record in
`docs/agent/m8-buyer-session-task.md`, Section 6C):

- **Q5.1 — password KDF (LOCKED as design baseline).** Argon2id for
  first-party password storage. Baseline parameters: memory = 19456 KiB,
  iterations = 2, parallelism = 1, salt = 16 random bytes, output/tag = 32
  bytes; store the complete PHC-format encoded Argon2id string.
  Implementation constraint: these are the approved design baseline, but
  implementation MUST perform the already-identified Cloudflare Workers
  resource/latency validation before production use; parameters must not be
  silently increased or decreased without an explicit implementation-time
  security decision. The KDF dependency remains an explicit
  implementation-phase decision/approval.
- **Q5.2 — username/handle normalization (LOCKED).** Normalized
  username/handle model; canonical format `^[a-z0-9][a-z0-9_.-]{2,29}$`;
  minimum 3, maximum 30 characters; lowercase canonical form; normalize
  input before uniqueness comparison; persist the canonical value in a
  dedicated uniquely constrained `username_normalized` column; reserve a
  documented set of system/reserved names; no full-Unicode handle semantics
  in M8. The normalized value is the identity used for uniqueness and for
  authentication throttling.
- **Q5.3 — password policy (LOCKED).** 15-character minimum password length
  for M8; no arbitrary composition rules (no mandatory
  uppercase/lowercase/digit/symbol); long passphrases allowed; the exact
  maximum accepted length must be chosen so long inputs are processed
  safely without truncation or denial-of-service behavior — no narrow
  legacy maximum inconsistent with the architecture.
- **Q5.4 — registration session behavior (LOCKED).**
  `POST /v1/auth/register` MUST automatically establish the initial
  authenticated session: create account → assign BUYER server-side → create
  the first session → return the authenticated session payload. The client
  does not perform a second login after successful registration. No
  email/SMS/OTP verification in M8. Duplicate normalized username returns
  409 CONFLICT (preserves the locked Q3.4 decision).
- **Q5.5 — refresh / logout / replay (LOCKED; preserves Gate A and Option
  A).** Gate A token/session model preserved: server-issued opaque bearer
  tokens; access lifetime 15 minutes; refresh lifetime 30 days absolute;
  refresh tokens single-use with successful rotation. A valid current
  refresh token mints replacement access + refresh credentials, invalidates
  the previous refresh credential, and preserves the absolute refresh
  session expiration; concurrent duplicate use of the old refresh token is
  not a valid refresh. Detection of an already-rotated/reused refresh token
  MUST revoke the affected refresh session rather than return a
  report-only error, and the resulting authentication failure is mapped
  through the existing Option A authentication error contract using
  `details.reason = SESSION_EXPIRED` or `SESSION_REVOKED` only where that
  contract permits. Logout requires the authenticated current
  session/refresh credential per the final endpoint contract, revokes the
  current refresh session immediately, does not denylist access tokens
  (they may remain valid until their natural 15-minute expiry), and is
  idempotent at the API contract level.
- **Q5.6 — pre-auth login throttling (LOCKED as subject/posture).**
  Throttle subject = trusted Cloudflare client IP + normalized username;
  conceptual key `(CF-Connecting-IP, username_normalized)`. Never `actorId`
  before authentication; no account lockout; no durable throttle table in
  migration 008; M8 may use the existing in-memory limiter infrastructure;
  trusted-IP extraction only from Cloudflare edge-set request metadata
  under the Q4 deployment assumption. Implementation-time security review
  items: exact thresholds/windows, and production handling of the fact
  that an in-memory per-isolate limiter is not globally distributed.

## Session Handling
- Access credentials must not be treated as permanent.
- Access token lifetime: 15 minutes.
- Refresh credential exists; lifetime: 30 days, absolute — refresh cannot
  extend the 30-day maximum.
- Refresh rotation: single-use / rotating. A successful refresh issues a new
  refresh credential and invalidates the previous one.
- Refresh replay (M8 Q5.5): concurrent duplicate use of the old refresh
  token is not a valid refresh; detection of an already-rotated/reused
  refresh token revokes the affected refresh session (a state change, not a
  report-only error), and the resulting authentication failure is mapped
  through the Session Failure Error Contract (Option A) below.
- Refresh-replay detection design (M8 Q6 R-C, recorded 2026-10-02):
  durable refresh-grant history — every issued refresh credential is
  represented by a server-side digest record associated with the session,
  rotation consumption/lineage is recorded server-side, and replay of a
  previously rotated credential is detectable at any depth, not only
  one generation back. The wire mapping is unchanged (revocation → 401
  `UNAUTHENTICATED`, `details.reason = SESSION_REVOKED`), the absolute
  30-day lifetime is unchanged, and no token values are stored or logged.
  R-C requires a FUTURE migration 009: migration 008 MUST NOT be edited,
  and migration 009 MUST NOT be created, applied, or designed without
  separate explicit authorization.
- Logout is idempotent at the API contract level (M8 Q5.5) and requires the
  authenticated current session/refresh credential per the final endpoint
  contract.
- Refresh behavior: proactive refresh when the access token has <=2 minutes
  remaining; on a 401 caused by expiry/race, exactly one refresh attempt then
  exactly one retry of the original request; concurrent refresh attempts are
  coalesced into one in-flight refresh; no indefinite retry.
- Invalid/expired/revoked refresh: sign out and clear credentials.
- Transient network failure during refresh: do not sign out, preserve local
  state, surface/retry the session-refresh connectivity failure.
- Refresh/session credentials must be stored using platform-appropriate secure
  storage.
- Expired credentials must produce a recoverable authentication state.
- Logout must clear local authentication state (access token, refresh token,
  session metadata, in-memory authenticated session state) without deleting or
  mutating local drafts, pending sync operations, inquiry drafts, or other
  offline data.
- Logout immediately revokes the current server-side refresh session using
  live session state; it does not denylist the current access token, which may
  remain valid until its natural 15-minute expiry. Access-token revocation is
  not checked on every request in M8. Logout affects only the current
  device/session; global logout is deferred.
- Client session persistence (M8 Gate A): access token, refresh token, and the
  minimal required authentication metadata live only in platform secure storage
  (SecureStore). Tokens must never be stored in SQLite, AsyncStorage, logs,
  console output, error reports, analytics, URLs, query parameters, state
  persistence, or ordinary application files. Credentials are not
  intentionally portable through app-data backup/restore; a restored app on
  another device re-authenticates. Local offline data restores independently
  and remains intact if credentials are lost. No session-credential
  backup/export in M8.

## Session Failure Error Contract (M8)

Wire contract for an authentication failure at a protected route. Decided
by the human M8 error-contract decision (Option A) on 2026-10-01.

- The wire code stays `UNAUTHENTICATED` and its HTTP status stays 401.
  The `ErrorCode` union is unchanged; no new error code is introduced.
- `details` is optional and machine-readable. Its only authorized
  `reason` values at this boundary are `SESSION_EXPIRED` and
  `SESSION_REVOKED`, typed as `UnauthenticatedReason` in
  `apps/api/src/shared/errors/app-error.ts`.
- Generic missing, unknown, malformed, or otherwise invalid
  authentication returns no `details` and therefore no
  `details.reason`.
- A deployment that cannot verify a session still fails closed with
  `DEPENDENCY_FAILED`; it gains no `reason`.
- `details.reason` never contains a credential value, an authorization
  header, or any other client-presented secret.

| Condition | HTTP | `code` | `details` |
| --- | --- | --- | --- |
| Access credential expired | 401 | `UNAUTHENTICATED` | `{ "reason": "SESSION_EXPIRED" }` |
| Session revoked (logout / revocation) | 401 | `UNAUTHENTICATED` | `{ "reason": "SESSION_REVOKED" }` |
| Missing, unknown, or invalid credential | 401 | `UNAUTHENTICATED` | absent |
| No session verification configured | 503 | `DEPENDENCY_FAILED` | absent |

This keeps ADR-006's failure states explicit — `unauthenticated`, `session
expired`, and `session revoked` remain distinguishable to a client —
without splitting the authentication error code or changing status-code
mapping. Clients must not treat `details.reason` as authorization; the
server still decides every request.

## Auth HTTP Contract (M8 Q6 — confirmed 2026-10-02)

Confirmed decision of record for the four Q3.1 surfaces (`POST
/v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`,
`POST /v1/auth/logout`). Verbatim record:
`docs/agent/m8-buyer-session-task.md`, Section 6D. Documentation only —
no endpoint, storage, or client behavior is implemented by this record.

Shared:

- **Same response schema (P4, corrected wording):** register, login, and
  refresh return the same response schema: identical field names,
  nesting, types, and optionality. Values and HTTP status may differ.
- **Statuses (P1):** register 201; login/refresh/logout 200.
- **Payload conventions (P2, P3):** wrapper key `session`; camelCase;
  ISO-8601 UTC timestamps; no `tokenType`; session metadata =
  `sessionId`, `actor { actorId, username, roles }`, `accessExpiresAt`,
  and `refreshExpiresAt`. `actorId` and roles are response-only and are
  never accepted from a request.
- **Credential transport (P5, P6, P21):** `refreshToken` is carried in
  the JSON request body on refresh and logout; `Authorization: Bearer` is
  the access-token mechanism only; refresh and logout do not require
  `Authorization`; `Authorization` on any of the four surfaces is ignored
  and never honored as identity or role; no credential ever appears in a
  URL.
- **Validation (P8, P9, P10, P11, P12, P23):** 400 `VALIDATION_FAILED`
  with `details: { field }` (absent for unparsable bodies); unknown and
  identity-asserting request fields are rejected; reserved username is
  400 (duplicate normalized username remains 409 `CONFLICT` per locked
  Q3.4); passwords are byte-exact (no normalization); the password
  maximum remains Q5.3's open implementation-time item (placeholder 1024);
  the canonical username is persisted and returned.
- **Login failure (P7, P13, P18):** every credential failure is a uniform
  401 `UNAUTHENTICATED` with no `details` and no `details.reason`;
  username-not-found and wrong-password failures are indistinguishable at
  the HTTP contract; timing equalization remains an implementation
  requirement; username format is validated at login (400) but the
  15-character minimum is not (uniform 401); no account lockout; each
  successful login creates an independent session.
- **Missing refresh credential (P17):** 401 `UNAUTHENTICATED` with no
  details.
- **Ordering and throttling (P14, P15, P22):** structural validation →
  throttle → credential verification; the existing 429 envelope and
  headers are reused; register uses `(CF-Connecting-IP,
  username_normalized)`, login uses the locked Q3.5/Q5.6 subject, and
  refresh/logout use per-IP budgets; thresholds/windows remain
  implementation-time security review items; `actorId` is never a
  pre-authentication subject and no lockout exists (Q3.5/Q5.6).
- **Persistence failure (P16):** 503 `DEPENDENCY_FAILED`, fail closed.
- **Idempotency (P19):** no `Idempotency-Key` on any of the four
  surfaces.
- **Logout success (P20):** 200 with `{ "ok": true }`; repeat logout is
  API-success/idempotent; the current access token is not denylisted; only
  the current refresh session is revoked; no global logout (Gate A Q5 /
  Q5.5).
- **Never present (P24):** no verification, pending, or recovery fields
  in any request or response.

Refresh replay — **R-C, durable refresh-grant history (selected
2026-10-02):**

- Refresh credentials remain opaque random bearer material.
- Every issued refresh credential is represented by a server-side digest
  record associated with the session; rotation records consumption and
  lineage server-side.
- Replay of a previously rotated credential is detectable; replay causes
  revocation of the affected refresh session and maps to 401
  `UNAUTHENTICATED` with `details.reason = SESSION_REVOKED`.
- The absolute 30-day refresh lifetime is unchanged; no token values are
  stored; no token values are logged.
- **R-C is a new Q6 decision and therefore overrides the prior
  one-generation replay limitation for the future durable
  implementation.** Q5.5's revocation behavior and the Option A wire
  mapping above are unchanged.
- **Requires a FUTURE migration 009.** Migration 008 MUST NOT be edited;
  migration 009 MUST NOT be created, applied, or designed by this record —
  each step requires separate explicit authorization.

## Authorization Context
Every authenticated backend request must resolve:
- authenticated user id
- effective role
- relevant ownership relationships
- authorization scope required for the requested operation

## RLS
RLS remains the database enforcement boundary.

Frontend visibility rules are not security controls.

Service-level privileged operations must use a clearly separated privileged path.

## Artisan Authorization
An artisan may access only resources they own or are explicitly authorized to manage.

Ownership must be enforced server-side and at the database boundary.

## Buyer Authorization
A buyer may access published catalog information and authorized inquiry information.

Discovery (M8 Gate B, B-A, human-confirmed 2026-10-01):
- `GET /discovery/products` and `GET /discovery/products/:productId`
  require a valid authenticated session.
- Discovery requires the server-authoritative BUYER role from
  `ActorContext`. Client-supplied roles are never trusted.
- Missing or invalid credentials return 401 / `UNAUTHENTICATED`,
  consistently with every other protected route.
- The M7 headerless discovery posture is deliberately superseded by this
  decision — an explicit, reviewed change to the discovery transport,
  its tests, and the discovery route documentation, not a silent
  Authorization-header insertion.
- The discovery route rationale concerning authentication as a
  rate-limit subject (not confidentiality) must be reaffirmed or revised
  as part of that implementation.

Private drafts, private AI proposals, and internal review information remain inaccessible.

## Reviewer Authorization
Reviewer access must be explicit, role-based, and limited to authorized review/moderation records.

## System Authorization
System jobs may access only the resources required for the job.

System privileges must not be exposed through normal user credentials.

## Offline Interaction
Offline drafts may exist without a current network session.

Operations created offline become authorized server operations only after the server authenticates the user and validates ownership/scope.

## Security Requirements
- Never trust client-supplied user ids for ownership.
- Never trust client-supplied roles.
- Never store passwords in application logs.
- Never log access tokens or refresh credentials.
- Never use frontend checks as the only authorization mechanism.

## Open Decisions

Decided by M8 Gate A (human-confirmed 2026-10-01; verbatim record in
`docs/agent/m8-buyer-session-task.md`, Section 5):

- Authentication provider — **decided:** none / first-party; mechanism is
  server-issued opaque sessions (A2).
- Token format — **decided:** `Authorization: Bearer <token>`, unpadded
  base64url of 32 cryptographically random bytes (256-bit), opaque, echoed
  verbatim, never parsed by the client.
- Session lifetime — **decided:** 15-minute access token; 30-day absolute
  refresh credential with single-use rotation.
- Refresh strategy — **decided:** proactive at <=2 minutes remaining; one
  refresh + one retry on expiry/race 401; coalesced concurrent refresh;
  invalid refresh → sign out; transient refresh network failure → preserve
  state and retry; no indefinite retry.
- Account recovery flow — **decided for M8:** none; deferred to M12
  (Account Recovery & Identity Recovery); no invented recovery mechanism.
- Device/session revocation — **decided:** logout revokes the server-side
  refresh session immediately (live state); access token not denylisted;
  current device/session only; global logout deferred.
- Role storage — **decided:** server-stored roles (Choice A), minimum
  BUYER/ARTISAN, returned in `ActorContext`.
- Session persistence — **decided:** SecureStore-only for access token,
  refresh token, and minimal auth metadata; tokens never in SQLite,
  AsyncStorage, logs, URLs, or state persistence; no credential backup/export.

Decided by M8 Gate B (human-confirmed 2026-10-01 as "YES — CONFIRM GATE B";
verbatim record in `docs/agent/m8-buyer-session-task.md`, Section 6):

- Discovery posture — **decided: B-A — AUTHENTICATED DISCOVERY.** The five
  mandatory consequences of record are: (1) discovery requires a valid
  authenticated session for `GET /discovery/products` and
  `GET /discovery/products/:productId`; (2) discovery requires the
  server-authoritative BUYER role from `ActorContext`, and client-supplied
  roles are never trusted; (3) missing or invalid credentials return
  401 / `UNAUTHENTICATED`; (4) M7 headerless discovery is deliberately
  superseded, with `discovery-transport.test.ts`,
  `discovery-transport.ts`, `discovery/http.ts`, discovery route tests,
  this contract, and ADR-006 (if required by the decision update)
  explicitly in-scope for the later implementation; (5) the change is
  deliberate and reviewed, not a silent Authorization-header insertion,
  and the discovery route rationale concerning authentication as a
  rate-limit subject must be reaffirmed or revised as part of that
  implementation. Implementation remains NOT STARTED.

Decided by M8 Q3 (human decision recorded 2026-10-02; verbatim record in
`docs/agent/m8-buyer-session-task.md`, Section 6B):

- Registration/login HTTP surfaces — **decided:** inventory 3.1-A =
  `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`,
  `POST /v1/auth/logout`; versioning = V1.
- Primary identifier — **decided:** 3.2-C; username/handle.
- Initial role on registration — **decided:** 3.3-A; BUYER only; no role
  changes in M8; no M8 client role-assignment/change endpoint.
- Registration policy — **decided:** 3.4-A; no verification in M8;
  duplicate username/identifier = 409 CONFLICT; no email/SMS/OTP
  verification dependency.
- Login protection — **decided:** 3.5-C; throttle by trusted client IP +
  normalized identifier; no account lockout; exact thresholds/windows
  remain for implementation-time security review; actorId is never the
  pre-authentication throttle subject.

Decided by M8 Q5 (human decision recorded 2026-10-02; verbatim record in
`docs/agent/m8-buyer-session-task.md`, Section 6C):

- Password KDF — **decided:** Argon2id, baseline parameters 19456 KiB
  memory / 2 iterations / parallelism 1 / 16-byte salt / 32-byte tag,
  complete PHC string stored; implementation must run the identified
  Cloudflare Workers resource/latency validation before production use and
  must treat the KDF dependency as an explicit implementation-phase
  decision/approval.
- Username/handle normalization — **decided:** normalized model,
  `^[a-z0-9][a-z0-9_.-]{2,29}$`, 3–30 characters, lowercase canonical
  form, normalized before uniqueness comparison, dedicated unique
  `username_normalized` column, documented reserved-name set, no
  full-Unicode handles in M8; the normalized value is the uniqueness and
  throttling identity.
- Password policy — **decided:** 15-character minimum, no arbitrary
  composition rules, long passphrases allowed, exact maximum chosen for
  safe long-input processing.
- Registration session behavior — **decided:**
  `POST /v1/auth/register` automatically establishes the initial
  authenticated session (server-side BUYER, first session created,
  authenticated payload returned); no second login; no M8 verification;
  duplicate normalized username = 409 CONFLICT.
- Refresh/logout/replay — **decided:** Gate A lifetimes and single-use
  rotation preserved; replay of a rotated refresh token revokes the
  refresh session and maps through the Option A error contract; logout
  revokes the refresh session without an access-token denylist and is
  idempotent at the API contract level.
- Pre-auth login throttle subject — **decided:**
  `(CF-Connecting-IP, username_normalized)`; no `actorId`; no account
  lockout; no durable throttle table in migration 008; existing in-memory
  limiter infrastructure; trusted IP only from Cloudflare edge-set
  metadata.

Decided by M8 Q6 (human decision recorded 2026-10-02; verbatim record in
`docs/agent/m8-buyer-session-task.md`, Section 6D):

- Auth HTTP contract (P1–P24 confirmed) — **decided:** register 201 and
  login/refresh/logout 200; `session` wrapper, camelCase, ISO-8601 UTC
  timestamps, no `tokenType`; session metadata = `sessionId`,
  `actor { actorId, username, roles }`, both expiry timestamps; **P4
  corrected** — register, login, and refresh return the same response
  schema (identical field names, nesting, types, and optionality; values
  and HTTP status may differ); `refreshToken` in the JSON request body
  with no `Authorization` requirement on refresh/logout (`Authorization`
  is the access-token mechanism only and is ignored on all four surfaces);
  logout keyed by `refreshToken` with API-success/idempotent repeat
  logout (200 `{ "ok": true }`), no access-token denylist, only the
  current refresh session revoked, no global logout; missing refresh
  credential = 401 `UNAUTHENTICATED` with no details; unknown/
  identity-asserting fields and reserved usernames = 400
  `VALIDATION_FAILED`; uniform 401 `UNAUTHENTICATED` login failure with
  no details and required timing equalization at implementation;
  validation → throttle → verification ordering; persistence failure =
  503 `DEPENDENCY_FAILED`; no `Idempotency-Key`; an independent session
  per successful login; canonical username persisted and returned; no
  verification/pending/recovery fields; existing 429 envelope reused.
- Refresh-replay detection — **decided: R-C — durable refresh-grant
  history.** Opaque random bearer refresh material; a server-side digest
  record per issued refresh credential associated with the session;
  rotation consumption/lineage recorded server-side; replay detectable;
  replay revokes the affected refresh session and maps to 401
  `UNAUTHENTICATED` with `details.reason = SESSION_REVOKED`; absolute
  30-day lifetime unchanged; no token values stored or logged. R-C
  requires a FUTURE migration 009; migration 008 MUST NOT be edited;
  migration 009 MUST NOT be created, applied, or designed without
  separate explicit authorization. R-C is a new Q6 decision and overrides
  the prior one-generation replay limitation for the future durable
  implementation.

Still open:

- Reviewer assignment
- Privileged system credential mechanism
- Implementation-time validation items for M8 Q5/Q6 (decided in design,
  validated at implementation): Cloudflare Workers resource/latency
  validation of the Q5.1 parameters; the KDF dependency selection and
  approval; the exact Q5.6 throttle thresholds/windows; the exact Q5.3
  maximum password length chosen within the stated safety constraint; the
  enumerated Q5.2 reserved-name list; production handling of the
  in-memory per-isolate limiter's lack of global distribution;
  trusted-IP-absence handling; the token-digest algorithm for migration
  008's hash columns; execution of the Q6 P7 timing equalization
- Session-storage schema for the A2 mechanism and the account/credential
  schema Q2A requires, including the Q5.2 `username_normalized` column and
  the Q5.6 prohibition of a durable throttle table (migration 008 exists
  in the repository and MUST NOT be edited; any further migration —
  including migration 009 — requires separate explicit approval for its
  design, creation, and application)
- Migration 009 (durable refresh-grant history required by the M8 Q6 R-C
  decision) — **not designed, not created, not applied; each step requires
  separate explicit authorization**
- Whether inquiry gains an identity foreign key (separate migration approval)

## Acceptance
Every first-slice authenticated operation must have a server-side identity check, authorization decision, and database authorization boundary.
