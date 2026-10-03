# AI Contract

Status: Draft for first vertical slice

## Purpose
Define the boundary between AI-generated proposals and canonical product data.

## Core Rule
AI is an untrusted proposal generator.

AI output must never directly mutate canonical product tables.

## Capabilities
- catalog generation
- audio transcription
- image analysis
- embedding generation
- buyer matching when required

## Logical Flow
capture → synchronized input → AI job → provider → schema validation → business validation → normalization → quality/risk assessment → proposal → human confirmation → canonical update

## AI Job
Each AI job has:
- job id
- job type
- input reference
- provider
- model
- model version
- prompt/version metadata where applicable
- schema version
- pipeline version
- status
- retry information
- timestamps

## Job States
- QUEUED
- RUNNING
- RETRYING
- PARTIAL_RESULT
- SUCCEEDED
- FAILED
- DEAD_LETTERED

## Proposal
A proposal may contain:
- proposed field value
- source
- source type
- provider
- model/version
- confidence
- validation result
- risk result
- confirmation state

## Human Authority
An artisan-confirmed value is authoritative over an AI-generated value.

AI must not silently replace a confirmed value.

## Confidence
Confidence is routing evidence.

Confidence is not approval.

Low-confidence important fields may require review or manual correction.

## Approval
Approval is an explicit human act, never a consequence of the pipeline.

`APPROVED` and `PUBLISHED` are established by named operations
(`approve`, `publish`) that check their preconditions and record who
authorized them. A generic state assignment is refused at both the
service and the HTTP boundary, so neither state can be reached by
naming it in a request body. The pure state machine still records the
edges; refusing the shortcut is the application's decision.

A product is approvable only when its review is clear:

- no valid proposal for the product is still awaiting a decision
- no publish-required field is blank
- the product is in a state approval can be reached from

The refusal reports every reason, so the artisan is told what to do
rather than that something failed. A proposal the validation pipeline
already rejected carries no suggestion and does not block, because there
is nothing to decide.

Deciding a suggestion and approving the product are two separate acts.
A human who accepts a suggestion has not thereby approved the product,
and an approval cannot substitute for a decision that was skipped.

An artisan who fills in every field themselves, with no AI work at all,
is approvable with an empty suggestion list. ADR-002 requires an AI
failure never to block manual product creation, so "reviewed" means
"nothing is outstanding" rather than "a human inspected model output".
The review surface distinguishes the two cases.

Known gap: the readiness check and the approval write are not one
atomic step. Closing it requires a guard spanning product state and
`ai_proposals`, which would make one module read the other's tables.
It is bounded — the AI module refuses to enqueue for a product outside its
working states, `APPROVED` is deliberately not one of them, and approval
and publication are separate operations — and is recorded in
`docs/agent/m5-review-publish-task.md`.

## Validation
AI output must pass:
1. Schema validation
2. Semantic/business validation
3. Normalization
4. Quality/risk assessment

Invalid output must become an explicit failure or partial-result state.

## Provider Failure
If an AI provider fails:
- retry according to policy
- expose explicit job state
- preserve input
- preserve already-confirmed human data
- allow a non-AI/manual path when business rules permit

## Caching
Where deterministic caching is introduced, the cache identity should account for:
- input hash
- model id
- model version
- prompt version
- schema version
- pipeline version

## Security
Treat prompts, media, transcription, model output, and provider responses as untrusted input.

Never place secrets or raw authorization headers in AI job records or audit logs.

## Open Decisions
- concrete provider
- exact proposal schema
- confidence thresholds
- risk thresholds
- retry/backoff policy
- timeout policy
- token/input limits
- content moderation boundary
- embedding model
- retention of raw AI output

## Acceptance
The AI contract is valid only when a provider failure or malformed model response cannot silently corrupt canonical product data.
