# First Vertical Slice Specification

## Purpose

Validate the smallest end-to-end journey proving offline-first capture, synchronization, media upload, AI-assisted cataloging, human correction, publishing, buyer discovery, and inquiry.

## Journey

Artisan captures photo + voice
→ saves draft offline
→ synchronizes when connected
→ uploads media
→ queues AI processing
→ receives validated catalog proposal
→ corrects or confirms
→ publishes
→ buyer discovers product
→ buyer sends inquiry

## In Scope

### Artisan Capture
- Create a product draft.
- Capture one or more photos.
- Optionally capture voice.
- Generate a durable local draft identifier.
- Capture works without connectivity.

### Offline Persistence
- Draft survives app restart.
- Draft survives temporary network loss.
- Synchronization state is visible.

### Synchronization
- Durable sync operations.
- Safe retries.
- Interrupted-request recovery.
- Duplicate delivery is idempotent.
- No duplicate canonical records.

### Media
- Authorized upload.
- Retry after interruption.
- Direct object-storage upload where appropriate.
- Explicit upload success/failure state.

### AI Assistance
- Voice transcription.
- Image analysis.
- Structured catalog proposals.
- Embeddings only where required.
- AI output is proposal data, never canonical truth.

### AI Validation
Every result passes:
1. Schema validation
2. Semantic/business validation
3. Normalization
4. Quality/risk assessment

Incomplete or low-confidence results become explicit review/action states.

### Human Correction
- Artisan can accept, edit, reject, or leave a proposal unresolved.
- Artisan-confirmed values cannot be silently overwritten by AI.

### Publishing
- Required product data and review conditions must be satisfied.
- Published information has explicit published state.
- Published changes create a new catalog version.

### Buyer
- Buyer can discover a published product.
- Buyer can create an inquiry against the published product.

## Product States

- LOCAL_DRAFT
- PENDING_SYNC
- SYNCED
- REVIEW_REQUIRED
- APPROVED
- PUBLISHED
- ARCHIVED
- CONFLICT
- ACTION_REQUIRED

## AI Job States

- QUEUED
- RUNNING
- RETRYING
- PARTIAL_RESULT
- SUCCEEDED
- FAILED
- DEAD_LETTERED

## Client Progress States

- Saved on device
- Waiting for connection
- Uploading
- Processing
- Needs your review
- Published
- Action needed

## Required Failure Scenarios

### Offline creation
Draft remains available locally.

### Network unavailable
Synchronization waits safely and resumes later.

### Interrupted upload
Upload retries without creating duplicate records.

### AI unavailable
AI job enters retry/failure state while the product workflow remains recoverable.

### Partial AI output
User receives an explicit review/action state.

### Duplicate synchronization
Exactly one canonical result exists.

### Human correction during AI processing
Confirmed human values remain authoritative.

### Permission failure
Actionable error with no silent data loss.

## Acceptance Criteria

1. Capture works offline.
2. Draft survives restart.
3. Draft synchronizes after connectivity returns.
4. Interrupted media upload can recover.
5. Duplicate sync does not duplicate canonical records.
6. AI state is separate from product state.
7. AI output is schema-validated.
8. Artisan can correct AI output.
9. AI cannot silently overwrite confirmed values.
10. A valid product can be published.
11. Published data is distinct from draft data.
12. Buyer can discover a published product.
13. Buyer can create an inquiry.
14. Failure states are explicit and recoverable.
15. Important operations expose correlation/idempotency information.
16. Required security/privacy trust boundaries are verified.

## Out of Scope

- Full recommendation engine
- Production microservices
- Multiple queues
- Advanced analytics
- Full social/community system
- Real-time chat infrastructure
- Sophisticated fraud scoring
- Large-scale operational complexity before validated usage

## Open Decisions

- Required product fields
- SQLite schema
- Sync operation contract
- Conflict-resolution implementation
- R2 upload contract
- AI provider abstraction
- AI proposal schema
- Review/risk thresholds
- Authentication/session model
- RLS boundaries
- Initial search implementation
- Inquiry model
- Retention/deletion policy
- Observability event catalog

## Completion Rule

The slice is not complete when only the happy path works.

Offline behavior, retries, duplicate delivery, interrupted uploads, incomplete AI results, human correction, recovery, and required trust-boundary checks must all be demonstrated.
