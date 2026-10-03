# Security, Privacy, and Observability Contract

Status: Draft for first vertical slice

## Trust Boundaries
- Client input is untrusted.
- Uploaded media is untrusted.
- Audio transcription is untrusted.
- Image analysis is untrusted.
- AI output is untrusted.
- External provider responses are untrusted.
- Queue messages are untrusted and may be duplicated.
- Client synchronization requests are untrusted.

## Security
- Authentication must be verified server-side.
- Authorization must be enforced server-side.
- RLS is a database security boundary.
- Upload targets must be authorized.
- Object access must be authorized.
- Privileged system operations must use a separate privileged path.
- Secrets must never be committed to the repository.
- Secrets must never appear in logs.

## AI Security
- Treat prompts and model output as untrusted data.
- Validate model output before persistence.
- Never execute model-generated commands as trusted instructions.
- Never let model output bypass authorization.
- Never let model output directly mutate canonical product data.

## Audit Events
Important security and business transitions should be auditable.

An audit record should support:
- actor
- action
- entity
- entity id
- previous state when appropriate
- resulting state
- timestamp
- correlation id
- causation id
- request/operation id
- outcome
- reason where applicable

Audit records must not contain:
- passwords
- access tokens
- refresh credentials
- raw authorization headers
- unnecessary sensitive personal data

## Observability
Important operations should expose enough information to answer:
- What happened?
- Who or what initiated it?
- Which aggregate was affected?
- Which operation or event caused it?
- What state transition occurred?
- Did it succeed, retry, partially succeed, or fail?
- Which provider/model was involved when relevant?

Core identifiers:
- correlation_id
- causation_id
- idempotency_key
- aggregate_id
- event_id
- operation_id

## Failure Visibility
Failures must have explicit categories rather than generic unknown errors.

Examples:
- authentication failure
- authorization failure
- validation failure
- upload failure
- synchronization conflict
- transient provider failure
- permanent provider failure
- AI schema failure
- review required
- action required

## Privacy
Retention and deletion policies must explicitly cover:
- photos
- voice recordings
- location information
- personal data
- AI outputs
- embeddings
- audit records

Data should be collected and retained only when required for the product or an explicitly approved operational purpose.

## Deletion
Deletion must define:
- user-visible behavior
- canonical state behavior
- media/object behavior
- tombstone behavior
- downstream event behavior
- retention/purge timing

Deletion must not silently break auditability or leave orphaned canonical references.

## Open Decisions
- observability backend
- tracing implementation
- metric names
- audit storage
- retention durations
- deletion workflow
- privacy request workflow
- incident alert thresholds

## Acceptance
A first-slice operation is not production-ready until its trust boundaries, audit behavior, failure visibility, and privacy/retention expectations are explicit.
