# Domain Context

## Project

A production-grade, cross-device, offline-first market-linkage and smart-cataloging mobile application for marginalized artisans.

The product connects artisan-created products with buyers while reducing the burden of catalog creation through assisted capture, voice, image analysis, structured metadata generation, correction, publishing, search, discovery, and inquiry.

## Core User Journey

The first validated vertical slice is:

artisan captures photo + voice
→ saves draft offline
→ synchronizes when connected
→ uploads media
→ receives an AI-assisted catalog draft
→ artisan corrects the draft
→ publishes
→ buyer searches/discovers
→ buyer sends an inquiry

This journey is the current product-development anchor. Do not expand the screen inventory merely because additional ideas are available.

## Primary Actors

### Artisan

Creates and manages product information, captures media and voice, reviews AI-generated metadata, corrects information, resolves required actions, and publishes products.

### Buyer

Searches and discovers published products and can initiate an inquiry with the artisan.

### Reviewer / Moderator

Handles cases requiring human intervention because of safety, policy, fraud, prohibited claims, potential intellectual-property issues, or other elevated-risk conditions.

### System / AI Pipeline

Transports synchronization and asynchronous work, processes media and AI proposals, validates results, records state transitions, and exposes actionable progress or failure states.

## Core Domain Concepts

### Product

The canonical catalog entity representing an artisan's product.

AI-generated values are proposals. They never become canonical merely because an AI job succeeded.

### Product Draft

An artisan-owned working representation that can exist locally before synchronization and may contain incomplete or not-yet-confirmed information.

### Catalog Version

An immutable published representation of product information. Published changes create a new catalog version rather than silently mutating historical published state.

### Media

Product-associated photos, audio, and other captured assets.

Media has an upload lifecycle independent from catalog-state transitions.

### AI Proposal

A machine-generated suggestion for one or more product fields.

Each proposal must be distinguishable from artisan-confirmed information and must carry sufficient provenance to understand where it came from.

### Inquiry

A buyer-originated request connected to a published product.

### Sync Operation

A durable operation representing a local change that still needs to reach the server.

### AI Job

An asynchronous unit of AI processing with its own lifecycle, retry behavior, and failure state.

### Event

A versioned fact describing a state change or domain occurrence.

Events support asynchronous processing, observability, and downstream consumers. They are not the canonical source of product truth.

### Outbox Entry

A durable database record created transactionally with canonical state changes and later dispatched to the asynchronous queue.

### Review Decision

A human decision required when automated processing is insufficient or risk thresholds require human approval.

## Product States

Canonical product state and AI-job state are separate.

Product states:

- LOCAL_DRAFT
- PENDING_SYNC
- SYNCED
- REVIEW_REQUIRED
- APPROVED
- PUBLISHED
- ARCHIVED
- CONFLICT
- ACTION_REQUIRED

AI job states:

- QUEUED
- RUNNING
- RETRYING
- PARTIAL_RESULT
- SUCCEEDED
- FAILED
- DEAD_LETTERED

These states are user-visible through understandable progress language such as:

- Saved on device
- Waiting for connection
- Uploading
- Processing
- Needs your review
- Published
- Action needed

## AI Trust Model

AI is an untrusted proposal generator.

The AI layer may:

- generate structured catalog proposals
- transcribe voice
- analyze images
- generate embeddings
- assist semantic matching

The AI layer may not directly mutate canonical product tables.

Every AI result must pass:

1. schema validation
2. semantic/business validation
3. normalization
4. quality/risk assessment
5. retry or partial-result handling when necessary
6. human review where required

Confidence is routing evidence, not approval.

An AI provider failure must never prevent a valid product from being created or manually published when the rest of the required product workflow is complete.

## Provenance

Important generated or derived field values should retain provenance describing:

- value
- source
- source type
- generating system/provider
- model/version where applicable
- confidence where applicable
- confirmation actor
- confirmation timestamp

AI must never silently overwrite artisan-confirmed information.

## Review and Risk

Normal product creation allows artisan review and correction.

Elevated-risk cases may require manual intervention, including:

- prohibited claims
- policy-sensitive content
- potential intellectual-property issues
- unsafe product categories
- fraud indicators
- repeated buyer/report signals
- low-confidence important craft/material/price/language/description fields

Human approval remains distinct from machine confidence.

## Offline-First Semantics

The device is authoritative for unsynchronized local work.

The server is authoritative for synchronized product/catalog/user/inquiry state.

A queue is a transport mechanism, not the system of record.

The first implementation must tolerate:

- weak connectivity
- interrupted uploads
- duplicate submissions
- retries
- low-end devices
- revoked or missing permissions
- incomplete AI output
- network transitions
- concurrent edits
- human corrections

## Conflict Semantics

Media conflicts are handled as distinct media candidates or explicit duplicates requiring review.

For field conflicts:

- newest artisan-confirmed value wins over AI-generated values
- AI must never silently overwrite a confirmed value
- published changes create a new catalog version
- deletion creates a tombstone before eventual purge according to retention policy

Conflict resolution must be explicit and observable.

## Event Semantics

Events contain:

- event_id
- event_type
- event_version
- aggregate_id
- producer
- occurred_at
- correlation_id
- causation_id
- idempotency_key
- payload

Events must be idempotent to safely tolerate retries and duplicate delivery.

Canonical state changes and their corresponding outbox records should be committed transactionally.

## Architecture Direction

The initial backend should remain a modular monolith rather than prematurely splitting into microservices.

Target platform direction:

- React Native + Expo
- Expo Router
- TypeScript
- TanStack Query
- Zustand where local client state is appropriate
- SQLite for offline persistence
- SecureStore for device secrets/tokens
- Reanimated for native motion
- gluestack UI as the native primitive foundation where appropriate
- own semantic design tokens and domain components

Backend direction:

- Cloudflare Workers + Hono
- PostgreSQL / Supabase
- Row-Level Security
- pgvector with HNSW where semantic retrieval requires it
- Cloudflare R2 for media
- Cloudflare Queues for asynchronous transport
- Cloudflare AI Gateway where appropriate
- Hyperdrive where appropriate for database connectivity
- provider-agnostic AI interfaces
- cloud-hosted inference rather than phone-side model execution

## Data and AI Separation

Runtime canonical product data belongs in PostgreSQL.

Semantic retrieval belongs in pgvector.

Engineering context knowledge belongs in the Graphify engineering graph.

Analytical and evaluation workloads may use Parquet/R2/Polars later.

These concerns must not be conflated into one generic storage layer.

## Media Rules

Large media should use direct object-storage upload paths rather than unnecessarily passing through application servers.

Upload workflows must tolerate retries, interrupted transfers, duplicate attempts, and authorization failures.

Media retention and deletion behavior must be explicit.

## Security and Privacy

AI, user input, uploads, external integrations, and persistence boundaries are untrusted surfaces.

Security review is required for:

- authentication
- authorization
- user-provided content
- uploads
- external integrations
- AI input/output
- personal data
- secrets
- privileged operations
- destructive actions

Never place passwords, tokens, raw authorization headers, or unnecessary sensitive personal data in audit logs.

Deletion, retention, privacy, and access rules must be explicit for:

- photos
- voice recordings
- location information
- user data
- AI outputs
- embeddings
- audit records

## Observability

Important operations must be traceable through correlation and causation identifiers.

Production diagnostics should make it possible to understand:

- what happened
- who or what initiated it
- which aggregate was affected
- which state transition occurred
- whether the operation succeeded, retried, partially succeeded, or failed
- which external provider or model was involved when relevant

## Simplicity Rule

The architecture must preserve a path to high scale without implementing high-scale operational complexity before validated usage.

Prefer:

- direct solutions over speculative abstractions
- existing project dependencies over new dependencies
- one queue before multiple queues
- one modular backend before microservices
- measured performance work before premature optimization
- validated requirements before generalized frameworks

Minimum means the smallest implementation that preserves safety, correctness, reliability, accessibility, and future evolvability.

## Current Phase

The current phase is engineering foundation and domain clarification.

No production screen inventory, backend implementation, or AI pipeline implementation should be treated as approved merely because a skill can generate it.

The next artifacts should establish:

- product requirements
- architectural decisions
- data model boundaries
- sync contract
- AI contract
- security/privacy boundaries
- observability contract
- first vertical slice acceptance criteria
