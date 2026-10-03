# Architecture Baseline

Status: Baseline for the first vertical slice

## Architecture Principles
- Offline-first
- Simplest architecture that preserves correctness, security, privacy, accessibility, reliability, and observability
- No premature microservices
- No premature scale complexity
- AI is untrusted input
- Confidence is not approval
- Canonical state is separate from asynchronous job state

## Client
- React Native
- Expo
- TypeScript
- Expo Router
- TanStack Query
- Zustand where appropriate
- SQLite for durable offline state
- SecureStore for device secrets/tokens
- Reanimated
- gluestack UI where appropriate
- Project-owned semantic design tokens

## Backend
- Cloudflare Workers
- Hono
- PostgreSQL / Supabase
- Row-Level Security
- Cloudflare R2
- Cloudflare Queues
- Cloudflare AI Gateway where useful
- Hyperdrive where useful
- Modular monolith first

## Data Authority
- PostgreSQL = canonical synchronized business state
- R2 = media objects
- Queue = transport only
- AI provider = proposal generator only
- Graphify = engineering knowledge/context only

## AI Pipeline
capture → sync → queue → AI → schema validation → business validation → normalization → risk/quality → proposal → human confirmation → canonical state

AI must never directly mutate canonical product tables.

## Product States
LOCAL_DRAFT
PENDING_SYNC
SYNCED
REVIEW_REQUIRED
APPROVED
PUBLISHED
ARCHIVED
CONFLICT
ACTION_REQUIRED

## AI Job States
QUEUED
RUNNING
RETRYING
PARTIAL_RESULT
SUCCEEDED
FAILED
DEAD_LETTERED

## Async Reliability
- Durable operations
- Idempotent retries
- Duplicate delivery safe
- Transactional outbox
- Correlation ID
- Causation ID
- Idempotency key

## Media
- Prefer direct R2 uploads
- Authorized upload targets
- Retryable uploads
- Interrupted upload recovery

## Search
- PostgreSQL + pgvector when semantic retrieval is actually required
- No separate vector database for the first slice

## Open Decisions
- SQLite schema
- Sync wire contract
- Conflict resolution
- R2 upload contract
- Authentication/session model
- RLS policies
- AI provider(s)
- AI proposal schema
- Risk thresholds
- Search contract
- Inquiry schema
- Retention/deletion policy
- Event catalog

## First-Slice Boundary
local capture → local persistence → sync → authenticated write → media upload → outbox → queue → AI job → validated proposal → human correction → catalog version → publish → buyer discovery → inquiry
