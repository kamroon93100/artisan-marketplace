# ADR-005: AI Jobs and Provider Abstraction

Status: Accepted for first vertical slice
Date: 2026-09-25

## Decision
AI capabilities are exposed through an internal provider-agnostic interface.

The application domain depends on capability contracts rather than a specific AI vendor, model, SDK, or endpoint.

Initial capability boundaries may include:
- image analysis
- audio transcription
- catalog field generation
- translation
- embedding generation

Providers are implemented behind adapters.

## AI Job Boundary
AI work is asynchronous.

An AI job has an explicit lifecycle:
- QUEUED
- RUNNING
- RETRYING
- PARTIAL_RESULT
- SUCCEEDED
- FAILED
- DEAD_LETTERED

AI job state is separate from canonical Catalog state.

Workers may produce proposal artifacts, validation results, confidence metadata, and failure information.

Workers must not directly mutate canonical product state.

## Versioning
An AI execution must be attributable to the relevant:
- provider
- model identifier
- model version where available
- prompt version
- schema version
- pipeline version
- input identity

These values participate in reproducibility and cache identity where applicable.

## Idempotency and Caching
AI jobs must have deterministic logical identities for retry handling.

Where caching is safe, the cache identity should incorporate the input identity and relevant model/prompt/schema/pipeline versions.

Changing a versioned AI dependency must not silently reuse an incompatible result.

## Validation
AI output first passes schema validation.

Applicable semantic and business validation runs after schema validation.

Invalid or incomplete output becomes an explicit partial/failure state and may be retried or routed to human correction.

AI-generated values are proposals until an authorized workflow confirms them.

## Confidence
Confidence is routing and review information.

Confidence must not be interpreted as automatic approval.

Low-confidence or high-risk outputs may require additional validation or human review.

Confidence thresholds are configuration/policy decisions and must be observable and versioned when they affect workflow behavior.

## Provider Failures
A provider outage must not make the Catalog unavailable.

Provider failures are represented in AI-job state and surfaced to the workflow as actionable conditions.

Where a manual path exists, users may continue without successful AI generation.

Provider-specific errors must be normalized into internal error categories without discarding the underlying diagnostic information required for operations.

## Security
Provider credentials remain server-side.

Untrusted model output is never executed as code or treated as trusted instructions.

Sensitive input sent to a provider must follow the application's privacy and data-sharing policy.

## Consequences
Positive:
- Provider portability
- Testable AI boundaries
- Reproducible AI executions
- Explicit retries and failures
- Human fallback remains possible
- AI outages are isolated from core catalog state

Negative:
- Additional adapter and job abstractions
- Version metadata must be maintained
- AI workflows require asynchronous orchestration

## Rejected Alternative
Call a specific AI SDK directly from Catalog business logic.

Reason: it would couple the domain to one provider, weaken testability, and make provider/model changes harder to audit and roll back.
