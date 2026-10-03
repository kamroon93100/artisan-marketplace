# ADR-006: Authentication, Authorization, and Session Boundary

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision Update — M8 Gate A (2026-10-01)

Named, deliberate decision update. The M8 Gate A human decision
("YES — CONFIRM GATE A") selects the credential/session mechanism this ADR
previously left open. Authoritative verbatim record of all eight
sub-decisions: `docs/agent/m8-buyer-session-task.md`, Section 5.

- **Mechanism:** A2 — server-issued opaque sessions (random token stored
  server-side).
- **Provider:** none / first-party. No external authentication provider in M8.
  The Identity-boundary rule above ("provider-specific implementation details
  remain behind the Identity boundary") stays in force and applies unchanged
  if a provider is ever adopted later.
- **Credentials:** opaque `Authorization: Bearer` access token and separate
  refresh credential, both unpadded base64url of 32 cryptographically random
  bytes (256-bit entropy); the client stores and echoes them verbatim and
  never parses them.
- **Lifetimes:** 15-minute access token; 30-day absolute, single-use rotating
  refresh credential (refresh cannot extend the 30-day maximum).
- **Refresh:** proactive at <=2 minutes remaining; exactly one refresh attempt
  and one retry on an expiry/race 401; coalesced concurrent refresh; invalid
  refresh → sign out and clear credentials; transient network failure during
  refresh → no sign-out, local state preserved, connectivity failure
  surfaced/retried; no indefinite retry.
- **Logout/revocation:** logout immediately revokes the current server-side
  refresh session using live session state; the access token is not
  denylisted and may remain valid until its natural 15-minute expiry;
  access-token revocation is not checked per request in M8; logout clears
  client credentials/session state but never deletes local drafts, pending
  sync operations, inquiry drafts, or other offline data; current
  device/session only, global logout deferred.
- **Account recovery:** none in M8; deferred to M12; no invented recovery
  mechanism; local offline data remains intact if credentials are lost.
- **Roles:** server-stored (Choice A), assigned by the Identity module,
  authoritative roles returned in `ActorContext`; minimum BUYER and ARTISAN;
  client-supplied roles never trusted; no client role-assignment endpoint.
- **Client persistence:** access token, refresh token, and minimal auth
  metadata only in platform secure storage (SecureStore); tokens never in
  SQLite, AsyncStorage, logs, URLs, or state persistence; no credential
  backup/export.

Not changed by this update (at Gate A time):

- **Gate B (discovery posture) was still OPEN** at Gate A — no discovery
  posture was selected then, implicitly or otherwise. It has since been
  closed separately by the named Gate B decision update below.
- This ADR's boundary rules (Identity ownership, authentication vs
  authorization separation, failure states, audit, ownership) are unchanged.
- No implementation code, migration, dependency, or configuration is changed
  by this update; the M8 implementation slice remains a separate, future task
  requiring explicit human authorization.

## Decision Update — M8 Gate B (2026-10-01)

Named, deliberate decision update. The M8 Gate B human confirmation
("YES — CONFIRM GATE B") selects the discovery posture this ADR (and the
Gate A update above) previously left open. Decision of record: **B-A —
AUTHENTICATED DISCOVERY**. Authoritative verbatim record of the five
mandatory consequences: `docs/agent/m8-buyer-session-task.md`, Section 6.

- **Authenticated session required:** `GET /discovery/products` and
  `GET /discovery/products/:productId` require a valid authenticated
  session.
- **Server-authoritative BUYER role:** discovery requires the BUYER role
  from `ActorContext`; client-supplied roles are never trusted (consistent
  with this ADR's rules and Gate A Q7).
- **401 on missing/invalid credentials:** `UNAUTHENTICATED`, consistently
  with every other protected route.
- **Deliberate supersession of M7 headerless discovery:** in-scope for the
  later implementation are `discovery-transport.test.ts`,
  `discovery-transport.ts`, `discovery/http.ts`, discovery route tests,
  `docs/architecture/auth-and-session-contract.md`, and this ADR if
  required by the decision update.
- **No silent header insertion:** the change is deliberate and reviewed;
  the discovery route rationale concerning authentication as a rate-limit
  subject must be reaffirmed or revised as part of that implementation.

Not changed by this update:

- This ADR's boundary rules (Identity ownership, authentication vs
  authorization separation, failure states, audit, ownership) are unchanged;
  Gate B reinforces them by requiring the server-authoritative BUYER role
  from `ActorContext`.
- No implementation code, test, migration, dependency, package file,
  config, `.dev.vars`, secret, or generated runtime artifact is changed by
  this update; the M8 implementation slice remains a separate, future task
  requiring explicit human authorization. The B-A supersession of the M7
  headerless assertion is decided but not yet applied.

## Decision Update — M8 Q6 (2026-10-02)

Named, deliberate decision update, explicitly authorized for this ADR
because it changes the durable session-replay design recorded against
this boundary. The M8 Q6 human decision confirms the auth HTTP contract
for the four Q3.1 surfaces — P1 through P24 exactly as proposed in the
Q6 Decision Review Sheet, with the P4 wording correction — and selects
refresh replay option **R-C — durable refresh-grant history**.
Authoritative verbatim record:
`docs/agent/m8-buyer-session-task.md`, Section 6D; contract record:
`docs/architecture/auth-and-session-contract.md`.

- **Shared session schema (P4, corrected wording):** register, login, and
  refresh return the same response schema — identical field names,
  nesting, types, and optionality. Values and HTTP status may differ.
  Statuses: register 201; login/refresh/logout 200.
- **Credential transport:** `refreshToken` is carried in the JSON request
  body; `Authorization: Bearer` remains the access-token mechanism only;
  refresh and logout do not require `Authorization`; `Authorization` on
  any of the four surfaces is ignored, never honored as identity or role;
  no credential appears in a URL.
- **Logout semantics:** keyed by the refresh credential; repeat logout is
  API-success/idempotent — 200 with `{ "ok": true }`; the current access
  token is NOT denylisted and may remain valid until its natural
  15-minute expiry; only the current refresh session is revoked; there is
  no global logout.
- **Failure semantics:** missing refresh credential → 401
  `UNAUTHENTICATED` with no details; unknown and identity-asserting
  request fields and reserved usernames → 400 `VALIDATION_FAILED`; every
  login failure is a uniform 401 `UNAUTHENTICATED` with no details, with
  username-not-found and wrong-password indistinguishable at the HTTP
  contract (timing equalization remains an implementation requirement);
  ordering is structural validation → throttle → credential verification;
  persistence failure → 503 `DEPENDENCY_FAILED`; no `Idempotency-Key` on
  the four auth endpoints; each successful login creates an independent
  session; the canonical username is persisted and returned; no
  verification/pending/recovery fields exist.
- **Refresh replay — R-C (durable refresh-grant history):** refresh
  credentials remain opaque random bearer material; every issued refresh
  credential is represented by a server-side digest record associated
  with the session; rotation records consumption/lineage server-side;
  replay of a previously rotated credential is detectable; replay causes
  revocation of the affected refresh session and maps to 401
  `UNAUTHENTICATED` with `details.reason = SESSION_REVOKED`; the absolute
  30-day refresh lifetime is unchanged; no token values are stored; no
  token values are logged. **R-C is a new Q6 decision and therefore
  overrides the prior one-generation replay limitation for the future
  durable implementation.** This requires a FUTURE migration 009:
  migration 008 MUST NOT be edited, and migration 009 MUST NOT be
  created, applied, or designed by this record.

Not changed by this update:

- This ADR's boundary rules (Identity ownership, authentication vs
  authorization separation, failure states, audit, ownership) are
  unchanged, as are Gate A, Gate B (B-A), Q2A, Q3, Q5, and the Option A
  authentication error contract — Q6 refines the schema/failure-semantics
  items those records named as still open and refines the replay-detection
  design behind Q5.5 without changing its revocation behavior.
- No implementation code, test, migration, dependency, package file,
  config, `.dev.vars`, secret, generated graph data, or script is changed
  by this update; no auth endpoint is implemented; no durable
  refresh-grant storage is implemented; no mobile code is changed. The M8
  implementation slice remains a separate, future task requiring explicit
  human authorization.

## Decision
Identity and session management are centralized behind the Identity module.

Business modules do not implement their own authentication logic or parse provider-specific session details.

Authentication establishes who the actor is.

Authorization establishes what that actor is permitted to do.

These concerns remain separate.

## Identity
Identity owns:
- user identity
- role and permission context
- session context
- account lifecycle state
- authorization context exposed to other modules

The application may use an external authentication provider, but provider-specific implementation details remain behind the Identity boundary.

## Session
The client stores only the minimum credential/session material required for authenticated operation.

Sensitive credentials are stored using platform-appropriate secure storage.

Session expiration, revocation, refresh failure, and signed-out states are explicit application states.

Offline operation must not be interpreted as indefinite authorization.

Locally stored drafts may remain available for recovery while server-side operations still require valid authorization.

## Authorization
Authorization is enforced server-side for every protected business operation.

Client-side route guards and UI visibility are convenience layers and are never the security boundary.

Authorization checks must be based on authenticated identity and relevant resource ownership or permission rules.

Cross-module interfaces receive trusted actor context rather than raw client-supplied identity claims.

## Ownership
Identity determines actor context.

Each business module remains responsible for enforcing authorization rules specific to resources it owns.

For example:
- Catalog protects product ownership and catalog mutations.
- Media protects upload and media ownership operations.
- Review protects review and moderation transitions.
- Inquiry protects inquiry access and participant permissions.

Identity does not become the owner of every business authorization rule.

## Audit
Security-sensitive actions must produce audit records where required by the application's audit policy.

Audit records identify the actor and action without storing passwords, tokens, raw authorization headers, or unnecessary secrets.

## Failure States
The system must explicitly represent:
- unauthenticated
- session expired
- session revoked
- insufficient permission
- resource not found
- resource access denied

These states must not be collapsed into a generic success or silent failure.

## Consequences
Positive:
- Centralized identity handling
- Clear authorization ownership
- Provider portability
- Reduced credential leakage risk
- Consistent actor context across modules

Negative:
- Authorization policies must be designed at multiple module boundaries
- Session lifecycle handling is required on both client and server
- Offline UX must distinguish local availability from server authorization

## Rejected Alternative
Let each feature implement its own authentication and session handling.

Reason: duplicated identity logic creates inconsistent authorization behavior and increases the chance of security-sensitive implementation errors.
