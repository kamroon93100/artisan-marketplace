-- AI jobs and AI proposals.
--
-- `ai_jobs` is durable AI work: what was asked, of which provider and
-- model version, under which prompt/schema/pipeline versions, and how far
-- it got. `ai_proposals` is what the model proposed, kept as evidence.
--
-- Neither table is a product. ADR-002 requires that AI output be untrusted
-- proposal data and never the canonical product record, so nothing here is
-- referenced by `catalog_products` and no write path connects the two. The
-- product is reached only when a recorded human decision is applied through
-- the Catalog module.
--
-- The lifecycle states are the seven the AI contract fixes. The `state`
-- constraint mirrors them, so an unknown state cannot be stored by any
-- writer, which is the same defence the catalog state check provides.

create table if not exists ai_jobs (
  id uuid primary key,

  product_id uuid not null
    references catalog_products(id)
    on delete restrict,

  owner_id uuid not null,

  job_type text not null,

  state text not null,

  -- Attribution. ADR-005 requires an execution to be attributable to the
  -- provider, the model, and the model version; the prompt, schema, and
  -- pipeline versions are the application-owned halves of the same identity.
  provider text not null,
  model text not null,
  model_version text,
  prompt_version text not null,
  schema_version text not null,
  pipeline_version text not null,

  -- The product values and media references as they stood when the job was
  -- enqueued. Storing the snapshot is what makes a proposal's staleness
  -- measurable after the fact rather than assumed away.
  input jsonb not null,
  input_hash text not null,

  attempt_count integer not null default 0,
  max_attempts integer not null default 3,

  -- Causal identity, as ADR-008 requires of anything that carries work
  -- across a boundary. The outbox itself is a separate slice; recording the
  -- identity here means the eventual dispatcher has what it needs without a
  -- retroactive change to this table.
  correlation_id text not null,
  causation_id text,
  idempotency_key text,

  -- Normalized failure category and the provider's own diagnostic. The
  -- category is the only thing the retry policy reads, and whether it is
  -- retryable is derived from the category rather than stored, so the two
  -- cannot disagree.
  failure_code text,
  failure_message text,
  failure_diagnostic text,

  next_attempt_at timestamptz,

  created_at timestamptz not null,
  updated_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,

  constraint ai_jobs_job_type_check
    check (job_type = 'CATALOG_FIELD_GENERATION'),

  constraint ai_jobs_state_check
    check (
      state in (
        'QUEUED',
        'RUNNING',
        'RETRYING',
        'PARTIAL_RESULT',
        'SUCCEEDED',
        'FAILED',
        'DEAD_LETTERED'
      )
    ),

  constraint ai_jobs_attempt_count_check
    check (attempt_count >= 0),

  constraint ai_jobs_max_attempts_check
    check (max_attempts >= 1),

  constraint ai_jobs_failure_code_check
    check (
      failure_code is null
      or failure_code in (
        'PROVIDER_TIMEOUT',
        'PROVIDER_UNAVAILABLE',
        'PROVIDER_RATE_LIMITED',
        'PROVIDER_AUTHENTICATION',
        'PROVIDER_OUTPUT_NOT_AN_OBJECT',
        'PROVIDER_OUTPUT_SCHEMA_INVALID',
        'PROVIDER_OUTPUT_EMPTY',
        'VALIDATION_REJECTED',
        'DEPENDENCY_FAILED',
        'JOB_STATE_CONFLICT'
      )
    ),

  -- A recorded failure is a coherent record or it is nothing: a code with no
  -- message, or a message with no code, would leave the retry policy with
  -- nothing to read.
  constraint ai_jobs_failure_pair_check
    check (
      (failure_code is null) = (failure_message is null)
    )
);

create unique index if not exists ai_jobs_owner_idempotency_idx
  on ai_jobs(owner_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists ai_jobs_product_id_idx
  on ai_jobs(product_id, created_at desc);

create index if not exists ai_jobs_owner_id_idx
  on ai_jobs(owner_id);

-- The dispatcher reads runnable work. A partial index keeps the scan off
-- terminal jobs, which are the overwhelming majority over time.
create index if not exists ai_jobs_runnable_idx
  on ai_jobs(next_attempt_at, created_at)
  where state in ('QUEUED', 'RETRYING', 'PARTIAL_RESULT');

create index if not exists ai_jobs_failed_idx
  on ai_jobs(state, updated_at)
  where state in ('FAILED', 'DEAD_LETTERED');

comment on table ai_jobs is
  'Durable AI work with explicit lifecycle state. Never authoritative for product state; holds no canonical business value.';

comment on column ai_jobs.input is
  'Snapshot of the product values, media references, and transcription as they stood when the job was enqueued. The baseline for proposal staleness.';

comment on column ai_jobs.input_hash is
  'SHA-256 of the canonical encoding of `input`, giving the execution a stable input identity. Not a cache key; nothing reuses a result on the basis of it in this slice.';

comment on column ai_jobs.failure_diagnostic is
  'The provider''s own failure message, retained for operations and truncated by the application. Never contains a credential or a raw authorization header.';

comment on column ai_jobs.completed_at is
  'Set when the job reaches a terminal state (SUCCEEDED, FAILED, DEAD_LETTERED); null while it is still recoverable.';

-- Proposals.
--
-- One row per field per attempt. `attempt` exists because a retry is a new
-- attempt, not a correction of the old one: the earlier attempt's proposals
-- are what the model actually said and must remain readable after a later
-- attempt succeeds. The unique index is on (job, attempt, field), so a
-- repeated save of the same attempt converges instead of duplicating, while
-- a new attempt is free to disagree.
create table if not exists ai_proposals (
  id uuid primary key,

  job_id uuid not null
    references ai_jobs(id)
    on delete restrict,

  product_id uuid not null,

  attempt integer not null,

  field text not null,

  -- A JSON string for text fields and a JSON array for materials, so one
  -- column holds either shape without flattening a list into a string.
  value jsonb not null,

  source text not null,
  source_type text not null,

  provider text not null,
  model text not null,
  model_version text,
  prompt_version text not null,
  schema_version text not null,
  pipeline_version text not null,

  -- null means the provider did not report a usable confidence. That is
  -- stored as absent rather than as zero, because a stored zero reads as a
  -- measured lack of confidence and would suppress the flag its absence
  -- should raise.
  confidence numeric,

  validation_status text not null,
  validation_issues text[] not null default '{}',

  -- Routing information only. Risk never authorizes anything; a human
  -- decision does.
  risk_level text not null,
  risk_reasons text[] not null default '{}',

  decision text not null default 'PENDING',
  decided_by uuid,
  decided_at timestamptz,

  -- What actually reached the product: the artisan's value for an EDITED
  -- decision, the proposed value otherwise, and null for REJECTED.
  applied_value jsonb,

  created_at timestamptz not null,
  updated_at timestamptz not null,

  constraint ai_proposals_field_check
    check (
      field in (
        'title',
        'description',
        'category',
        'materials'
      )
    ),

  constraint ai_proposals_attempt_check
    check (attempt >= 1),

  constraint ai_proposals_source_check
    check (source = 'AI_GENERATED'),

  constraint ai_proposals_source_type_check
    check (source_type = 'CATALOG_FIELD_GENERATION'),

  constraint ai_proposals_validation_status_check
    check (
      validation_status in ('VALID', 'REJECTED')
    ),

  constraint ai_proposals_risk_level_check
    check (
      risk_level in ('NONE', 'LOW', 'MEDIUM', 'HIGH')
    ),

  constraint ai_proposals_risk_reason_check
    check (
      risk_reasons <@ array[
        'LOW_CONFIDENCE',
        'MISSING_PUBLISH_BLOCKING_FIELD',
        'SEMANTIC_VALIDATION_REJECTED'
      ]::text[]
    ),

  constraint ai_proposals_decision_check
    check (
      decision in ('PENDING', 'ACCEPTED', 'EDITED', 'REJECTED')
    ),

  constraint ai_proposals_confidence_check
    check (
      confidence is null
      or (confidence >= 0 and confidence <= 1)
    ),

  -- A decision and its attribution are one fact. A row that is decided
  -- without an actor and time, or that is pending while carrying one, is a
  -- record nobody could later act on or explain.
  constraint ai_proposals_decided_check
    check (
      (decision = 'PENDING' and decided_by is null and decided_at is null)
      or
      (decision <> 'PENDING' and decided_by is not null and decided_at is not null)
    ),

  -- An accepted or edited proposal is a value that reached a product, so it
  -- must carry the value that reached it. A rejected one must not: a value
  -- recorded against a rejection would read as something the artisan chose.
  constraint ai_proposals_applied_value_check
    check (
      (decision in ('PENDING', 'REJECTED') and applied_value is null)
      or
      (decision in ('ACCEPTED', 'EDITED') and applied_value is not null)
    )
);

create unique index if not exists ai_proposals_job_attempt_field_idx
  on ai_proposals(job_id, attempt, field);

create index if not exists ai_proposals_job_idx
  on ai_proposals(job_id, field, attempt desc);

create index if not exists ai_proposals_pending_idx
  on ai_proposals(product_id, job_id)
  where decision = 'PENDING';

comment on table ai_proposals is
  'Untrusted AI proposals, one row per field per attempt, with the provenance needed to explain a stored value. Never canonical product state.';

comment on column ai_proposals.attempt is
  'The job attempt that produced this proposal. A retry writes a new attempt rather than replacing an old one, so what an earlier attempt said stays readable.';

comment on column ai_proposals.applied_value is
  'The value actually written to the product by a recorded decision; the artisan''s value for EDITED. Null until a decision applies the proposal.';

-- Immutability of proposals.
--
-- Two rules, both enforced by the database rather than by application
-- discipline, so they hold for every writer including a future migration or
-- a manual fix.
--
-- 1. A decided row is frozen. It records what a human authorized; rewriting
--    it would make the audit trail a fiction.
--
-- 2. While a row is PENDING, the columns describing what the model said
--    cannot change. A retry must write a new attempt, not edit the evidence
--    of the previous one.
--
-- Deletion is refused unconditionally. A pending proposal is still the
-- record of what the model proposed, and dropping it would remove the
-- ability to explain a product that was never changed.
create or replace function ai_proposals_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'ai_proposals rows are not deletable; a proposal is the record of what the model proposed'
      using errcode = 'restrict_violation';
  end if;

  if old.decision <> 'PENDING' then
    raise exception
      'ai_proposals rows are immutable once a human decision is recorded; the decision is the audit record'
      using errcode = 'restrict_violation';
  end if;

  if new.job_id is distinct from old.job_id
    or new.product_id is distinct from old.product_id
    or new.attempt is distinct from old.attempt
    or new.field is distinct from old.field
    or new.value is distinct from old.value
    or new.source is distinct from old.source
    or new.source_type is distinct from old.source_type
    or new.provider is distinct from old.provider
    or new.model is distinct from old.model
    or new.model_version is distinct from old.model_version
    or new.prompt_version is distinct from old.prompt_version
    or new.schema_version is distinct from old.schema_version
    or new.pipeline_version is distinct from old.pipeline_version
    or new.confidence is distinct from old.confidence
    or new.validation_status is distinct from old.validation_status
    or new.validation_issues is distinct from old.validation_issues
    or new.risk_level is distinct from old.risk_level
    or new.risk_reasons is distinct from old.risk_reasons
  then
    raise exception
      'ai_proposals model-evidence columns are immutable; a retry writes a new attempt instead'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists ai_proposals_immutable on ai_proposals;

create trigger ai_proposals_immutable
  before update or delete on ai_proposals
  for each row
  execute function ai_proposals_reject_mutation();
