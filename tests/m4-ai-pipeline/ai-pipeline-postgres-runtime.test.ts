import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { CatalogService } from "../../apps/api/src/modules/catalog/application/catalog-service.ts";
import { PostgresCatalogRepository } from "../../apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.ts";
import { AiPipelineService } from "../../apps/api/src/modules/ai/application/ai-pipeline-service.ts";
import { AiReviewService } from "../../apps/api/src/modules/ai/application/ai-review-service.ts";
import {
  AiJobStateConflictError,
} from "../../apps/api/src/modules/ai/application/ai-repository.ts";
import { PostgresAiRepository } from "../../apps/api/src/modules/ai/infrastructure/postgres-ai-repository.ts";
import { CatalogServiceCatalogProductPort } from "../../apps/api/src/modules/ai/infrastructure/catalog-service-port.ts";
import { DeterministicCatalogAiProvider } from "../../apps/api/src/modules/ai/infrastructure/deterministic-catalog-ai-provider.ts";
import type {
  CatalogAiAttribution,
  CatalogAiProvider,
  CatalogAiResult,
} from "../../apps/api/src/modules/ai/domain/catalog-ai-provider.ts";
import { PostgresDatabase } from "../../apps/api/src/shared/persistence/postgres-database.ts";
import { AppError } from "../../apps/api/src/shared/errors/app-error.ts";

/**
 * Real-PostgreSQL runtime proof for the M4 AI-assisted catalog pipeline.
 *
 * Every other AI suite runs against the in-memory repository or a fake SQL
 * database, which is the right level for the business rules but leaves the
 * parts most likely to be wrong unverified: migration
 * `006_ai_jobs_and_proposals.sql` (the jsonb input snapshot, the text[]
 * validation and risk columns, the (owner, idempotency key) and
 * (job, attempt, field) unique indexes, the decision/applied-value check
 * constraints, and the proposal immutability trigger), the job
 * compare-and-set through node-postgres, and the one path on which an
 * AI-derived value can reach canonical product state.
 *
 * The `write` and `read` phases run in separate processes with a PostgreSQL
 * restart in between, so `read` proves the decisions and the value they
 * authorized are canonical database state rather than anything a live
 * process was still holding.
 *
 * The deterministic provider is used as the test fixture it is. It is
 * constructed directly here rather than selected by the composition root,
 * which refuses it outside development and test.
 *
 * Requires a running server. It is deliberately NOT part of `pnpm verify`,
 * which is the service-free fast path; use `scripts/verify-m4-postgres.ps1`.
 */

type Handoff = {
  ownerId: string;
  productId: string;
  jobId: string;
  failedJobId: string;
  acceptedTitle: string;
  editedTitle: string;
  proposedDescription: string;
  titleProposalId: string;
  descriptionProposalId: string;
  categoryProposalId: string;
  materialsProposalId: string;
};

/**
 * An adapter whose model answered with prose instead of the requested object.
 *
 * It is the `unknown` return type made concrete: the adapter completed its
 * call and returned something the application cannot use. It is a second,
 * independent implementation of the provider contract, so this proof also
 * exercises the pipeline through an adapter the composition root never builds.
 */
class UnusableProvider implements CatalogAiProvider {
  readonly attribution: CatalogAiAttribution = {
    provider: "unusable-local",
    model: "unusable-fixture",
    modelVersion: "1",
  };

  async generateCatalogDraft(): Promise<CatalogAiResult> {
    return "Certainly! Here is a description of your lovely basket.";
  }
}

const connectionString = process.env.M4_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "M4_POSTGRES_URL must point at the project-local PostgreSQL instance. Use scripts/verify-m4-postgres.ps1, which reads it from the Hyperdrive binding in apps/api/wrangler.jsonc.",
  );
}

/**
 * A fresh database handle and service set per phase.
 *
 * `PostgresDatabase` opens and closes a connection per operation, so nothing
 * is cached between calls, and the `read` phase builds its own services:
 * there is no in-process object that could answer a read from memory.
 */
function freshRigs(): {
  database: PostgresDatabase;
  aiRepository: PostgresAiRepository;
  catalogService: CatalogService;
  catalogPort: CatalogServiceCatalogProductPort;
  pipeline: AiPipelineService;
  review: AiReviewService;
} {
  const database = new PostgresDatabase(connectionString!);
  const aiRepository = new PostgresAiRepository(database);
  const catalogService = new CatalogService(
    new PostgresCatalogRepository(database),
  );
  const catalogPort = new CatalogServiceCatalogProductPort(
    catalogService,
  );

  return {
    database,
    aiRepository,
    catalogService,
    catalogPort,
    pipeline: new AiPipelineService(
      aiRepository,
      new DeterministicCatalogAiProvider(),
      catalogPort,
    ),
    review: new AiReviewService(aiRepository, catalogPort),
  };
}

async function writePhase(handoffPath: string): Promise<void> {
  const ownerId = randomUUID();
  const { database, aiRepository, catalogService, catalogPort, pipeline, review } =
    freshRigs();

  // A1: a draft is canonical state that AI work can target. It has a title
  // and no description, which is the realistic case an artisan is in when
  // they ask for help.
  const product = (
    await catalogService.createDraft({
      ownerId,
      title: "Bamboo Basket",
      materials: ["bamboo"],
      idempotencyKey: `m4-draft-${ownerId}`,
    })
  ).product;

  assert.equal(product.state, "LOCAL_DRAFT");
  assert.equal(product.description, null);

  // A2: enqueueing writes durable work with a snapshot of the product as it
  // stood, through the real insert and the real jsonb round trip.
  const { job, created } = await pipeline.enqueue({
    productId: product.id,
    actorId: ownerId,
    idempotencyKey: `m4-job-${ownerId}`,
    transcription:
      "A tightly woven basket, made to keep bread and grain.",
    correlationId: `m4-corr-${ownerId}`,
  });

  assert.equal(created, true, "the first enqueue creates the job");
  assert.equal(job.state, "QUEUED", "new work starts QUEUED");
  assert.equal(job.attemptCount, 0, "no attempt has run yet");

  const jobRows = await database.query<{
    input: { product: { title: string; description: string | null } };
    state: string;
    provider: string;
    model_version: string | null;
    idempotency_key: string;
  }>(
    "select input, state, provider, model_version, idempotency_key from ai_jobs where id = $1",
    [job.id],
  );

  assert.equal(jobRows.length, 1, "the job is one durable row");
  assert.equal(
    jobRows[0]!.input.product.title,
    "Bamboo Basket",
    "the input snapshot round-trips through jsonb",
  );
  assert.equal(
    jobRows[0]!.provider,
    "deterministic-local",
    "ADR-005 attribution is stored with the work",
  );
  assert.equal(
    jobRows[0]!.model_version,
    "1",
    "the model version is stored, not just the model name",
  );

  // A3: a retried enqueue converges on the same job rather than queueing the
  // work twice, even when the retry body differs.
  const retried = await pipeline.enqueue({
    productId: product.id,
    actorId: ownerId,
    idempotencyKey: `m4-job-${ownerId}`,
    transcription: "A different body entirely.",
    correlationId: `m4-corr-retry-${ownerId}`,
  });

  assert.equal(retried.created, false, "a retry reports deduplication");
  assert.equal(retried.job.id, job.id, "a retry returns the original job");

  const jobCount = await database.query<{ count: string }>(
    "select count(*)::text as count from ai_jobs where owner_id = $1 and idempotency_key = $2",
    [ownerId, `m4-job-${ownerId}`],
  );
  assert.equal(
    jobCount[0]!.count,
    "1",
    "the unique index keeps one job per owner and key",
  );

  // A4: the job compare-and-set is real. A stale expected state matches no
  // row, so the update must fail and report the state actually stored.
  await assert.rejects(
    () =>
      aiRepository.beginAttempt({
        id: job.id,
        expectedState: "RETRYING",
        attemptCount: 1,
      }),
    (error: unknown) =>
      error instanceof AiJobStateConflictError &&
      error.actualState === "QUEUED",
    "a stale job compare-and-set must not move the job",
  );

  assert.equal(
    (await aiRepository.getJob(job.id))?.state,
    "QUEUED",
    "a lost compare-and-set leaves the state untouched",
  );

  // A5: execution produces proposals, and the transition to the terminal
  // state is the same guarded write.
  const run = await pipeline.run(job.id, ownerId, `m4-corr-${ownerId}`);

  assert.equal(run.job.state, "SUCCEEDED", "the attempt succeeded");
  assert.equal(run.job.attemptCount, 1, "the attempt was counted once");
  assert.equal(run.job.completedAt !== null, true, "completion is recorded");
  assert.equal(
    run.job.failure,
    null,
    "a successful job records no failure category",
  );

  const title = run.proposals.find((entry) => entry.field === "title");
  const description = run.proposals.find(
    (entry) => entry.field === "description",
  );
  const category = run.proposals.find(
    (entry) => entry.field === "category",
  );
  const materials = run.proposals.find(
    (entry) => entry.field === "materials",
  );

  assert.ok(title && description && category && materials);
  assert.equal(title!.attempt, 1, "a proposal records its attempt");
  assert.equal(
    title!.decision,
    "PENDING",
    "a fresh proposal is nobody's decision",
  );
  assert.equal(
    title!.confidence,
    0.9,
    "the numeric confidence survives the driver as a number",
  );
  assert.deepEqual(
    [...materials!.value as string[]],
    ["bamboo"],
    "a normalized jsonb array round-trips as a list",
  );
  assert.deepEqual(
    [...title!.riskReasons],
    [],
    "a publish-blocking field above the threshold raises nothing",
  );
  assert.deepEqual(
    [...category!.riskReasons],
    [],
    "a sub-threshold confidence on a non-blocking field is not a risk",
  );
  assert.equal(
    category!.riskLevel,
    "NONE",
    "risk concentrates on the fields that block publication",
  );

  // A6: a job that reached a terminal state has still changed nothing a
  // buyer or the artisan can see. Proved against the real Catalog service
  // and the real repository, immediately after the run and before any
  // decision is recorded.
  const afterRun = await catalogService.getById(product.id);

  assert.equal(
    afterRun.title,
    product.title,
    "executing a job must not write a canonical field",
  );
  assert.equal(
    afterRun.description,
    null,
    "a proposed description must not reach the product unreviewed",
  );
  assert.equal(
    afterRun.category,
    product.category,
    "a proposed category must not reach the product unreviewed",
  );
  assert.deepEqual(
    [...afterRun.materials],
    [...product.materials],
    "proposed materials must not reach the product unreviewed",
  );
  assert.equal(
    afterRun.state,
    "LOCAL_DRAFT",
    "executing a job must not advance the product's lifecycle",
  );

  // A7: proposals cannot be duplicated inside one attempt. The unique
  // index is what makes a redelivered save converge.
  await assert.rejects(
    () =>
      database.query(
        `insert into ai_proposals (
           id, job_id, product_id, attempt, field, value, source,
           source_type, provider, model, prompt_version, schema_version,
           pipeline_version, validation_status, risk_level, created_at,
           updated_at
         ) values (
           gen_random_uuid(), $1, $2, 1, 'title', '"Rewritten"'::jsonb,
           'AI_GENERATED', 'CATALOG_FIELD_GENERATION', 'deterministic-local',
           'catalog-draft-fixture', 'p/1', 's/1', 'v/1', 'VALID', 'NONE',
           now(), now()
         )`,
        [job.id, product.id],
      ),
    "a second proposal for the same attempt and field must be refused",
  );

  // A8: the lifecycle states are constrained by the database, so no writer
  // can invent one.
  await assert.rejects(
    () =>
      database.query(
        `insert into ai_jobs (
           id, product_id, owner_id, job_type, state, provider, model,
           prompt_version, schema_version, pipeline_version, input,
           input_hash, correlation_id, created_at, updated_at
         ) values (
           gen_random_uuid(), $1, $2, 'CATALOG_FIELD_GENERATION',
           'DEFINITELY_PUBLISHED', 'deterministic-local', 'catalog-draft-fixture',
           'p/1', 's/1', 'v/1', '{}'::jsonb, 'hash', 'corr', now(), now()
         )`,
        [product.id, ownerId],
      ),
    "an unknown AI job state must be refused by the database",
  );

  await assert.rejects(
    () =>
      database.query(
        `insert into ai_proposals (
           id, job_id, product_id, attempt, field, value, source,
           source_type, provider, model, prompt_version, schema_version,
           pipeline_version, validation_status, risk_level, risk_reasons,
           created_at, updated_at
         ) values (
           gen_random_uuid(), $1, $2, 1, 'title', '"x"'::jsonb,
           'AI_GENERATED', 'CATALOG_FIELD_GENERATION', 'deterministic-local',
           'catalog-draft-fixture', 'p/1', 's/1', 'v/1', 'VALID', 'NONE',
           array['TRUSTED_BY_THE_MODEL'], now(), now()
         )`,
        [job.id, product.id],
      ),
    "a risk reason outside the contract must be refused",
  );

  // A9: the trust boundary is enforced by the database, not only by
  // application discipline. The evidence of what the model said is frozen
  // while a proposal is pending.
  await assert.rejects(
    () =>
      database.query(
        "update ai_proposals set value = $1::jsonb where id = $2",
        ['"Rewritten"', materials!.id],
      ),
    "the model evidence of a pending proposal must be immutable",
  );

  await assert.rejects(
    () =>
      database.query("delete from ai_proposals where id = $1", [
        materials!.id,
      ]),
    "a proposal must not be deletable",
  );

  // A10: the human decision. The title is EDITED, so what reaches the
  // product is the artisan's own value and not the model's; the description
  // is REJECTED, so nothing of it may reach the product at all.
  const decided = await review.applyDecisions(product.id, ownerId, [
    {
      proposalId: title!.id,
      decision: "EDITED",
      value: "Bamboo Basket, Large",
    },
    { proposalId: description!.id, decision: "REJECTED" },
    { proposalId: category!.id, decision: "ACCEPTED" },
    { proposalId: materials!.id, decision: "REJECTED" },
  ]);

  assert.deepEqual(
    [...decided.applied].sort(),
    ["category", "title"],
    "only the decided fields were written",
  );
  assert.equal(
    decided.product.title,
    "Bamboo Basket, Large",
    "the artisan's edited value is the product's value",
  );
  assert.equal(
    decided.product.description,
    null,
    "a rejected proposal leaves the product untouched",
  );
  assert.equal(
    decided.product.category,
    "basketry",
    "an accepted proposal still requires a human decision to reach the product",
  );
  assert.deepEqual(
    [...decided.product.materials],
    ["bamboo"],
    "a rejected materials proposal changes nothing",
  );
  assert.deepEqual(
    [...decided.staleFields],
    [],
    "nothing is stale when the product has not moved since the snapshot",
  );

  // A11: the recorded decision keeps the proposed value as evidence and
  // stores separately what actually reached the product.
  const decisionRows = await database.query<{
    field: string;
    value: unknown;
    decision: string;
    applied_value: unknown;
    decided_by: string;
  }>(
    "select field, value, decision, applied_value, decided_by from ai_proposals where job_id = $1 order by field asc",
    [job.id],
  );

  const recorded = new Map(decisionRows.map((row) => [row.field, row]));

  assert.equal(
    recorded.get("title")!.decision,
    "EDITED",
    "the decision is durable",
  );
  assert.equal(
    (recorded.get("title")!.value as string),
    "Bamboo Basket",
    "the model's own value is retained as evidence",
  );
  assert.equal(
    (recorded.get("title")!.applied_value as string),
    "Bamboo Basket, Large",
    "the applied value is the artisan's value, not the model's",
  );
  assert.equal(
    recorded.get("title")!.decided_by,
    ownerId,
    "the decision is attributed to the artisan",
  );
  assert.equal(
    recorded.get("description")!.decision,
    "REJECTED",
    "the rejection is durable",
  );
  assert.equal(
    recorded.get("description")!.applied_value,
    null,
    "a rejection must not record a value that reached the product",
  );

  // A12: once decided, the row is frozen, so a later reviewer or a later
  // attempt cannot rewrite what a human authorized.
  await assert.rejects(
    () =>
      database.query(
        "update ai_proposals set applied_value = $1::jsonb where id = $2",
        ['"Something Else"', title!.id],
      ),
    "a decided proposal must be immutable",
  );

  // A13: a second decision on the same proposal is refused rather than
  // overwriting the first. The service reads the recorded decision before
  // it writes, so an already-decided proposal is a conflict.
  await assert.rejects(
    () =>
      review.applyDecisions(product.id, ownerId, [
        { proposalId: title!.id, decision: "ACCEPTED" },
      ]),
    (error: unknown) =>
      error instanceof AppError && error.code === "CONFLICT",
    "a proposal decided twice must conflict",
  );

  // A14: the product now carries only what a human authorized, and the
  // canonical row is the Catalog module's, not the AI module's.
  const reloaded = await catalogService.getById(product.id);
  assert.equal(reloaded.title, "Bamboo Basket, Large");
  assert.equal(reloaded.description, null);
  assert.equal(reloaded.category, "basketry");
  assert.equal(reloaded.state, "LOCAL_DRAFT", "applying values does not change the lifecycle state");

  // A15: an unusable provider answer fails the job with its own category and
  // a usable diagnostic, records no proposal, and writes no product field.
  // This is the path that decides what operations get paged about, so the
  // category and the diagnostic are proved against the real schema rather
  // than against an in-memory object.
  const unusableProduct = (
    await catalogService.createDraft({
      ownerId,
      title: "Clay Bowl",
      materials: ["clay"],
      idempotencyKey: `m4-unusable-draft-${ownerId}`,
    })
  ).product;

  const unusablePipeline = new AiPipelineService(
    aiRepository,
    new UnusableProvider(),
    catalogPort,
  );

  const { job: unusableJob } = await unusablePipeline.enqueue({
    productId: unusableProduct.id,
    actorId: ownerId,
    idempotencyKey: `m4-unusable-job-${ownerId}`,
    correlationId: `m4-corr-unusable-${ownerId}`,
  });

  const unusableRun = await unusablePipeline.run(
    unusableJob.id,
    ownerId,
    `m4-corr-unusable-${ownerId}`,
  );

  assert.equal(
    unusableRun.job.state,
    "FAILED",
    "an unusable provider answer does not succeed the job",
  );
  assert.equal(unusableRun.proposals.length, 0, "and it proposes nothing");

  const unusableRows = await database.query<{
    state: string;
    attempt_count: number;
    failure_code: string | null;
    failure_message: string | null;
    failure_diagnostic: string | null;
    next_attempt_at: string | null;
  }>(
    `select state, attempt_count, failure_code, failure_message,
            failure_diagnostic, next_attempt_at
       from ai_jobs where id = $1`,
    [unusableJob.id],
  );

  assert.equal(unusableRows.length, 1, "the failed job is one durable row");
  assert.equal(unusableRows[0]!.state, "FAILED");
  assert.equal(
    unusableRows[0]!.failure_code,
    "PROVIDER_OUTPUT_SCHEMA_INVALID",
    "the schema category survives the real schema's check constraint, rather than being flattened to a generic dependency failure",
  );
  assert.equal(
    unusableRows[0]!.failure_code === null,
    unusableRows[0]!.failure_message === null,
    "a recorded failure carries a code and a message together",
  );
  assert.ok(
    unusableRows[0]!.failure_diagnostic?.includes("was not a JSON object"),
    `the stored diagnostic says what was actually wrong, got: ${String(
      unusableRows[0]!.failure_diagnostic,
    )}`,
  );
  assert.equal(
    unusableRows[0]!.next_attempt_at,
    null,
    "a permanent failure schedules no retry",
  );

  const unusableProposalCount = await database.query<{ count: string }>(
    "select count(*)::text as count from ai_proposals where job_id = $1",
    [unusableJob.id],
  );
  assert.equal(
    unusableProposalCount[0]!.count,
    "0",
    "an unusable answer leaves no evidence row to review",
  );

  const unusableAfter = await catalogService.getById(unusableProduct.id);
  assert.equal(
    unusableAfter.title,
    unusableProduct.title,
    "a failed job changes no canonical field",
  );
  assert.equal(
    unusableAfter.description,
    null,
    "a failed job invents no description",
  );

  const handoff: Handoff = {
    ownerId,
    productId: product.id,
    jobId: job.id,
    failedJobId: unusableJob.id,
    acceptedTitle: "Bamboo Basket, Large",
    editedTitle: "Bamboo Basket, Large",
    proposedDescription: "A tightly woven basket, made to keep bread and grain.",
    titleProposalId: title!.id,
    descriptionProposalId: description!.id,
    categoryProposalId: category!.id,
    materialsProposalId: materials!.id,
  };

  writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));

  console.log(
    `AI PIPELINE POSTGRES WRITE PHASE PASSED (job ${job.id}, product ${product.id})`,
  );
}

/**
 * Runs in a new process, after PostgreSQL has restarted, against services
 * that have never seen this job.
 */
async function readPhase(handoffPath: string): Promise<void> {
  const handoff = JSON.parse(
    readFileSync(handoffPath, "utf8"),
  ) as Handoff;

  const { database, aiRepository, catalogService, pipeline, review } =
    freshRigs();

  // B7: a failed job is durable too, with the category and diagnostic that
  // explain it. An operator diagnosing a dead AI job after a restart reads
  // these columns, so their survival is part of the proof.
  const failed = await aiRepository.getJob(handoff.failedJobId);

  assert.ok(failed, "the failed job survived the restart");
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.provider, "unusable-local");
  assert.equal(
    failed.failure?.code,
    "PROVIDER_OUTPUT_SCHEMA_INVALID",
    "the failure category is still readable after the restart",
  );
  assert.equal(failed.failure?.retryable, false);
  assert.ok(
    failed.failure?.diagnostic?.includes("was not a JSON object"),
    `the diagnostic survives the restart, got: ${String(
      failed.failure?.diagnostic,
    )}`,
  );
  assert.equal(
    (await aiRepository.listProposalHistory(handoff.failedJobId)).length,
    0,
    "a failed job has no proposal history to reconstruct",
  );
  assert.equal(
    (await aiRepository.getJob(handoff.failedJobId))?.nextAttemptAt ?? null,
    null,
    "a dead job is not silently rescheduled after the restart",
  );

  // B1: the job survived the restart as canonical state, with its
  // attribution, its attempt count, and the input snapshot intact.
  const job = await aiRepository.getJob(handoff.jobId);

  assert.ok(job, "the AI job survived the restart");
  assert.equal(job.state, "SUCCEEDED");
  assert.equal(job.attemptCount, 1);
  assert.equal(job.provider, "deterministic-local");
  assert.equal(job.model, "catalog-draft-fixture");
  assert.equal(job.modelVersion, "1");
  assert.equal(job.input.product.title, "Bamboo Basket");
  assert.equal(
    job.input.transcription,
    handoff.proposedDescription,
    "the input snapshot is still the basis the proposal was made from",
  );
  assert.equal(job.failure, null, "a succeeded job has no failure recorded");

  // B2: the latest-attempt query still returns exactly one proposal per
  // field, and every one carries its decision.
  const proposals = await aiRepository.listProposals(handoff.jobId);

  assert.equal(
    proposals.length,
    4,
    "one proposal per field for the latest attempt",
  );
  assert.equal(
    new Set(proposals.map((entry) => entry.field)).size,
    4,
    "no field is proposed twice in the latest attempt",
  );

  const byField = new Map(proposals.map((entry) => [entry.field, entry]));

  const title = byField.get("title")!;
  const description = byField.get("description")!;
  const category = byField.get("category")!;

  assert.equal(title.id, handoff.titleProposalId, "the same title proposal");
  assert.equal(title.decision, "EDITED");
  assert.equal(title.decidedBy, handoff.ownerId, "attribution survived");
  assert.equal(
    title.appliedValue,
    handoff.editedTitle,
    "what reached the product is still recorded as what reached it",
  );
  assert.equal(
    title.value,
    "Bamboo Basket",
    "the model's value is retained beside the applied one",
  );
  assert.equal(description.decision, "REJECTED");
  assert.equal(
    description.appliedValue,
    null,
    "a rejection still records no applied value",
  );
  assert.equal(category.decision, "ACCEPTED");
  assert.equal(category.appliedValue, "basketry");
  assert.deepEqual(
    [...category.riskReasons],
    [],
    "the risk assessment is still readable after the decision",
  );

  // B3: the history is complete and every attempt is still there.
  const history = await aiRepository.listProposalHistory(handoff.jobId);
  assert.equal(
    history.length,
    4,
    "the attempt's proposals remain in history",
  );
  assert.ok(
    history.every((entry) => entry.attempt === 1),
    "history is the same single attempt",
  );

  // B4: the canonical product carries exactly the values a human
  // authorized.
  const product = await catalogService.getById(handoff.productId);
  assert.equal(product.title, handoff.acceptedTitle);
  assert.equal(product.description, null, "the rejected value is not in the product");
  assert.equal(product.category, "basketry");

  // B5: the recorded decisions are still frozen. Nothing after a restart,
  // including a later AI run, may rewrite what a human authorized.
  await assert.rejects(
    () =>
      review.applyDecisions(handoff.productId, handoff.ownerId, [
        { proposalId: handoff.titleProposalId, decision: "ACCEPTED" },
      ]),
    (error: unknown) =>
      error instanceof AppError && error.code === "CONFLICT",
    "a decision recorded before the restart must still stand",
  );

  await assert.rejects(
    () => pipeline.run(handoff.jobId, handoff.ownerId, "m4-rerun"),
    (error: unknown) =>
      error instanceof AppError && error.code === "CONFLICT",
    "a terminal job must not run again after the restart",
  );

  await assert.rejects(
    () =>
      database.query(
        "update ai_proposals set decision = 'PENDING', decided_by = null, decided_at = null, applied_value = null where id = $1",
        [handoff.categoryProposalId],
      ),
    "a decided proposal must stay frozen even against a hand-written update",
  );

  // B6: the rejected proposal is still recorded as a rejection, so the
  // evidence of what was proposed and refused is intact too.
  const descriptionAfter = await aiRepository.getProposal(
    handoff.descriptionProposalId,
  );
  assert.equal(descriptionAfter?.decision, "REJECTED");

  console.log(
    "AI PIPELINE POSTGRES READ-AFTER-RESTART PHASE PASSED",
  );
}

async function main(): Promise<void> {
  const [phase, handoffPath] = process.argv.slice(2);

  if (!phase || !handoffPath) {
    throw new Error(
      "Usage: ai-pipeline-postgres-runtime.test.ts <write|read> <handoff-path>",
    );
  }

  if (phase === "write") {
    await writePhase(handoffPath);
    return;
  }

  if (phase === "read") {
    await readPhase(handoffPath);
    return;
  }

  throw new Error(`Unknown phase: ${phase}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
