# ADR-010: Verification and Testing Strategy

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision
Verification is layered and follows the risk of each boundary.

The first vertical slice must be verified from domain rules through the real user workflow.

## Test Layers
### Domain and Unit
Test pure business rules, state transitions, validation, normalization, conflict rules, and permission decisions without external services.

### Contract
Test API request/response schemas, event schemas, idempotency behavior, and module interfaces.

### Integration
Test PostgreSQL, RLS, transactional outbox behavior, object-storage lifecycle, queue consumers, authentication integration, and provider adapters against controlled test environments.

### End-to-End
Test the complete first vertical slice:
capture photo and voice -> save draft offline -> reconnect -> sync -> upload -> AI processing -> review/correction -> publish -> buyer discovery -> inquiry.

### Failure and Recovery
Explicitly test:
- interrupted network
- duplicate requests
- duplicate queue delivery
- interrupted uploads
- expired sessions
- permission denial
- malformed media
- AI timeout
- AI partial result
- provider outage
- stale local state
- conflict recovery

### Security
Test authentication, authorization, RLS isolation, input validation, upload authorization, rate limits, secret handling, and audit behavior.

### AI Evaluation
AI behavior is evaluated separately from deterministic application correctness.

Evaluation covers schema validity, extraction quality, confidence behavior, routing, safety checks, and regression against representative fixtures.

Model quality must not be used as a substitute for business validation.

## Definition of Done
A change is not complete merely because the code compiles.

For applicable changes, completion requires:
- relevant automated tests
- successful type/static checks
- validation of affected contracts
- explicit verification of failure behavior
- security checks for changed trust boundaries
- documentation or ADR updates when an architectural decision changes

High-risk changes require human review before being considered complete.

## Determinism
Tests that validate business behavior should use deterministic fixtures and controlled dependencies.

External AI providers are mocked or fixture-backed for deterministic application tests.

Provider-specific behavior is covered separately by integration or evaluation tests.

## Observability During Verification
Tests should preserve correlation identifiers and useful failure diagnostics so failures can be traced across API, database, queue, worker, and external dependency boundaries.

## Consequences
Positive:
- Failure-oriented confidence rather than happy-path confidence
- Safer refactoring
- Explicit verification of offline and distributed behavior
- AI quality separated from deterministic business correctness

Negative:
- More test infrastructure
- Some end-to-end tests are slower
- Representative AI evaluation fixtures require maintenance

## Rejected Alternative
Rely primarily on manual testing of the happy path.

Reason: the core product depends on synchronization, asynchronous processing, authorization, media uploads, and probabilistic AI behavior that manual happy-path testing cannot adequately cover.
