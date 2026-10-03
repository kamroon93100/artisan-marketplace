import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { CatalogService } from "../../apps/api/src/modules/catalog/application/catalog-service.ts";
import { PostgresCatalogRepository } from "../../apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.ts";
import { AiPipelineService } from "../../apps/api/src/modules/ai/application/ai-pipeline-service.ts";
import { AiReviewService } from "../../apps/api/src/modules/ai/application/ai-review-service.ts";
import { PostgresAiRepository } from "../../apps/api/src/modules/ai/infrastructure/postgres-ai-repository.ts";
import { CatalogServiceCatalogProductPort } from "../../apps/api/src/modules/ai/infrastructure/catalog-service-port.ts";
import { DeterministicCatalogAiProvider } from "../../apps/api/src/modules/ai/infrastructure/deterministic-catalog-ai-provider.ts";
import { ReviewService } from "../../apps/api/src/modules/review/application/review-service.ts";
import { CatalogServiceReviewProductPort } from "../../apps/api/src/modules/review/infrastructure/catalog-review-port.ts";
import { AiRepositoryReviewSuggestionsPort } from "../../apps/api/src/modules/review/infrastructure/ai-suggestions-port.ts";
import { PostgresDatabase } from "../../apps/api/src/shared/persistence/postgres-database.ts";
import { AppError } from "../../apps/api/src/shared/errors/app-error.ts";
import type { AiProposalField } from "@artisan-marketplace/contracts";

/**
 * Real-PostgreSQL runtime proof for M5 human review -> correction -> publish.
 *
 * The in-memory and fake-SQL suites prove the rules; this proves the whole
 * chain survives a real database, which is the only way to show the facts are
 * durable rather than reconstructed per request.
 *
 * The chain exercised, end to end:
 *
 *   AI proposals -> a review surface a human reads -> a decision through the
 *   AI module's decision API -> approval through the Review module ->
 *   publication through Catalog -> an immutable catalog version -> all of it
 *   still there in a new process after a PostgreSQL restart.
 *
 * The `write` and `read` phases run in separate processes with a restart in
 * between, so `read` proves the decisions, the applied values, the approval
 * and the version are canonical database state rather than anything a live
 * process was still holding.
 *
 * The deterministic provider is the test fixture it was in M4. It is
 * constructed directly here rather than selected by the composition root,
 * which refuses it outside development and test.
 *
 * Requires a running server. It is deliberately NOT part of `pnpm verify`,
 * which is the service-free fast path; use `scripts/verify-m5-postgres.ps1`.
 */

type Handoff = {
  ownerId: string;
  otherOwnerId: string;
  productId: string;
  jobId: string;
  secondJobId: string;
  titleProposalId: string;
  descriptionProposalId: string;
  categoryProposalId: string;
  materialsProposalId: string;
  acceptedCategory: string;
  acceptedDescription: string;
  editedTitle: string;
  publishedVersion: number;
  idempotencyKey: string;
  approvedUpdatedAt: string;
};

const connectionString = process.env.M5_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "M5_POSTGRES_URL must point at the project-local PostgreSQL instance. Use scripts/verify-m5-postgres.ps1, which reads it from the Hyperdrive binding in apps/api/wrangler.jsonc.",
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
  pipeline: AiPipelineService;
  aiReview: AiReviewService;
  review: ReviewService;
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
    pipeline: new AiPipelineService(
      aiRepository,
      new DeterministicCatalogAiProvider(),
      catalogPort,
    ),
    aiReview: new AiReviewService(aiRepository, catalogPort),
    review: new ReviewService(
      new CatalogServiceReviewProductPort(catalogService),
      new AiRepositoryReviewSuggestionsPort(aiRepository),
    ),
  };
}

function byField(
  suggestions: readonly { field: AiProposalField }[],
): Map<AiProposalField, { proposalId: string }> {
  return new Map(
    suggestions.map((entry) => [entry.field, entry]),
  ) as Map<AiProposalField, { proposalId: string }>;
}

async function writePhase(handoffPath: string): Promise<void> {
  const ownerId = randomUUID();
  const otherOwnerId = randomUUID();
  const { aiRepository, catalogService, pipeline, aiReview, review } =
    freshRigs();

  // A1: the realistic starting point. An artisan has a synced product with a
  // title and no description, and asks for help with the rest.
  const product = (
    await catalogService.createDraft({
      ownerId,
      title: "Bamboo Basket",
      materials: ["bamboo"],
      idempotencyKey: `m5-draft-${ownerId}`,
    })
  ).product;

  assert.equal(product.state, "LOCAL_DRAFT");

  for (const state of [
    "PENDING_SYNC",
    "SYNCED",
    "REVIEW_REQUIRED",
  ] as const) {
    await catalogService.transition(product.id, state, ownerId);
  }

  // A2: approval is refused while suggestions are outstanding, and the
  // refusal names them. This is the whole point of the slice: before M5 a
  // client could have assigned APPROVED and published this immediately.
  const blocked = await review.getReview(product.id, ownerId);

  assert.equal(
    blocked.suggestions.length,
    0,
    "no AI work has run yet, so there is nothing to decide",
  );
  assert.equal(
    blocked.readyForApproval,
    false,
    "a product missing its description is not approvable",
  );
  assert.deepEqual(
    blocked.blocking.map((entry) => entry.reason),
    ["MISSING_PUBLISH_FIELD"],
    "the missing description is what blocks it",
  );
  assert.equal(
    blocked.blocking[0].field,
    "description",
    "the blocking reason names the field",
  );

  await assert.rejects(
    () => review.approve(product.id, ownerId),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "CONFLICT" &&
      Array.isArray(
        (error.details as { blocking?: unknown } | undefined)?.blocking,
      ),
    "approval is refused, and the refusal carries the blocking reasons",
  );

  /**
   * The required-field rule belongs to the Review module, not to Catalog.
   *
   * `CatalogService.approve` deliberately checks state only. Enforcing the
   * publish-required fields there would make the Catalog module's approval
   * condition depend on the same list the review surface reports, and moving
   * the condition that makes this an authorized operation into the module
   * that owns the state is the shortcut ADR-002 rules out. So the catalog
   * operation accepts the incomplete product and leaves the field rule where
   * it is enforced.
   */
  const catalogApproval = await catalogService.approve(product.id, ownerId);

  assert.equal(
    catalogApproval.product.state,
    "APPROVED",
    "the catalog approval operation checks state only",
  );

  /**
   * And the incompleteness still blocks publication, which is what keeps the
   * two steps separately authorized rather than one standing in for the other.
   */
  await assert.rejects(
    () =>
      catalogService.publish(
        product.id,
        ownerId,
        `m5-publish-early-${ownerId}`,
      ),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_FAILED",
    "an approved product with no description still cannot be published",
  );

  /**
   * The probe approved the product, which is a legitimate state. It is
   * returned to REVIEW_REQUIRED so the rest of the chain runs from the state
   * an artisan reviews in, and so the return route is exercised on the way:
   * an approved product is not frozen the way a published one is.
   */
  await catalogService.transition(
    product.id,
    "REVIEW_REQUIRED",
    ownerId,
  );

  // A3: AI work produces real proposals against the real snapshot.
  const { job } = await pipeline.enqueue({
    productId: product.id,
    actorId: ownerId,
    idempotencyKey: `m5-job-${ownerId}`,
    transcription:
      "A tightly woven basket, made to keep bread and grain.",
    correlationId: `m5-corr-${ownerId}`,
  });

  await pipeline.run(job.id, ownerId, `m5-corr-${ownerId}`);

  // A4: the review surface now reports every proposal with the value it
  // would replace, and the canonical value is not yet the proposed one.
  const surface = await review.getReview(product.id, ownerId);

  assert.equal(
    surface.suggestions.length,
    4,
    "one suggestion per proposed field",
  );
  assert.equal(
    surface.readyForApproval,
    false,
    "outstanding suggestions block approval",
  );
  assert.ok(
    surface.blocking.some(
      (entry) =>
        entry.reason === "UNDECIDED_PROPOSAL" && entry.field === "category",
    ),
    "an undecided suggestion is reported by field",
  );

  const first = byField(surface.suggestions);
  const titleProposalId = first.get("title")!.proposalId;
  const descriptionProposalId = first.get("description")!.proposalId;
  const categoryProposalId = first.get("category")!.proposalId;
  const materialsProposalId = first.get("materials")!.proposalId;

  const categorySuggestion = surface.suggestions.find(
    (entry) => entry.field === "category",
  )!;

  assert.equal(
    categorySuggestion.currentValue,
    null,
    "an unset canonical field is reported as absent",
  );
  assert.equal(
    categorySuggestion.proposedValue,
    "basketry",
    "the proposed value is what the artisan is shown",
  );
  assert.equal(
    categorySuggestion.stale,
    false,
    "a suggestion generated from the current snapshot is not stale",
  );
  assert.ok(
    categorySuggestion.provider.length > 0 &&
      categorySuggestion.model.length > 0 &&
      categorySuggestion.promptVersion.length > 0 &&
      categorySuggestion.schemaVersion.length > 0 &&
      categorySuggestion.pipelineVersion.length > 0,
    "every suggestion carries its provenance",
  );

  // A5: a second run against the same product produces a second, independent
  // set of proposals. Both are outstanding, so both must be decided; a
  // surface that showed only the newest would leave the other permanently
  // blocking with no way to act on it.
  const second = await pipeline.enqueue({
    productId: product.id,
    actorId: ownerId,
    idempotencyKey: `m5-job-2-${ownerId}`,
    transcription: "Woven from river reed as well.",
    correlationId: `m5-corr-2-${ownerId}`,
  });

  await pipeline.run(second.job.id, ownerId, `m5-corr-2-${ownerId}`);

  const afterSecondRun = await review.getReview(product.id, ownerId);

  assert.equal(
    afterSecondRun.suggestions.length,
    8,
    "both runs' suggestions are outstanding across attempts and jobs",
  );
  assert.equal(
    new Set(
      afterSecondRun.suggestions
        .filter((entry) => entry.field === "category")
        .map((entry) => entry.proposalId),
    ).size,
    2,
    "the same field proposed by two jobs is two separate decisions",
  );

  // A6: the human decision, through the only route an AI-derived value may
  // take. Accept one, edit one, reject one, reject the other run's.
  const allByField = byField(afterSecondRun.suggestions);
  const editedTitle = "Bamboo Basket, Large";

  const decided = await aiReview.applyDecisions(product.id, ownerId, [
    { proposalId: titleProposalId, decision: "EDITED", value: editedTitle },
    { proposalId: descriptionProposalId, decision: "ACCEPTED" },
    { proposalId: categoryProposalId, decision: "ACCEPTED" },
    { proposalId: materialsProposalId, decision: "REJECTED" },
    { proposalId: allByField.get("title")!.proposalId, decision: "REJECTED" },
    {
      proposalId: allByField.get("description")!.proposalId,
      decision: "REJECTED",
    },
    {
      proposalId: allByField.get("category")!.proposalId,
      decision: "REJECTED",
    },
    {
      proposalId: allByField.get("materials")!.proposalId,
      decision: "REJECTED",
    },
  ]);

  /**
   * The accepted values are read back from the decision result rather than
   * written out as literals. The provider composes its description from the
   * transcription and the rest of the fixture, and this proof is about the
   * value a human accepted reaching the product — not about the exact text a
   * fixture happens to produce. Hard-coding it here would make the assertion
   * fail for a reason unrelated to what is being proven.
   */
  const acceptedDescription = decided.product.description!;
  const acceptedCategory = decided.product.category!;

  assert.equal(
    acceptedCategory,
    "basketry",
    "the accepted value reached the product",
  );
  assert.ok(
    acceptedDescription.trim().length > 0,
    "the accepted description reached the product",
  );
  assert.equal(
    decided.product.title,
    editedTitle,
    "the artisan's own value reached the product, not the model's",
  );

  // A7: nothing outstanding now, and the missing-description blocker is
  // gone because a decision supplied the value.
  const ready = await review.getReview(product.id, ownerId);

  assert.equal(ready.suggestions.length, 0, "every suggestion was decided");
  assert.deepEqual(
    ready.blocking,
    [],
    "an empty list exactly when nothing blocks",
  );
  assert.equal(ready.readyForApproval, true, "the product is approvable");

  // A8: the artisan's view is their own. Another artisan is refused, and the
  // refusal changes nothing.
  await assert.rejects(
    () => review.getReview(product.id, otherOwnerId),
    (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    "another artisan cannot read the review surface",
  );

  await assert.rejects(
    () => review.approve(product.id, otherOwnerId),
    (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    "another artisan cannot approve the product",
  );

  // A9: approval, through the authorized operation rather than a state
  // assignment.
  const approval = await review.approve(product.id, ownerId);

  assert.equal(approval.deduplicated, false, "the first approval changed it");
  assert.equal(approval.product.state, "APPROVED");

  // A10: approval converges on a retry rather than conflicting with the state
  // the first approval legitimately established.
  const retry = await review.approve(product.id, ownerId);

  assert.equal(retry.deduplicated, true, "a repeat approval converges");
  assert.equal(retry.product.state, "APPROVED");

  // A11: the generic state write cannot be used as a shortcut around the
  // operation, through the real repository and the real state machine.
  await assert.rejects(
    () => catalogService.transition(product.id, "PUBLISHED", ownerId),
    (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    "PUBLISHED is not assignable",
  );

  // A12: publication, which requires APPROVED and writes exactly one
  // immutable version.
  const idempotencyKey = `m5-publish-${ownerId}`;

  const published = await catalogService.publish(
    product.id,
    ownerId,
    idempotencyKey,
  );

  assert.equal(published.created, true, "the first publish creates a version");
  assert.equal(published.product.state, "PUBLISHED");
  assert.equal(published.version.versionNumber, 1, "the first version is 1");
  assert.equal(
    published.version.publishedBy,
    ownerId,
    "who authorized publication is recorded",
  );
  assert.equal(
    published.version.title,
    editedTitle,
    "the published listing carries the corrected value",
  );
  assert.equal(
    published.version.description,
    acceptedDescription,
    "the published listing carries the value a human accepted, not the raw transcription",
  );

  // A13: publish is idempotent, so a retry after a dropped response does not
  // create a second version.
  const replay = await catalogService.publish(
    product.id,
    ownerId,
    idempotencyKey,
  );

  assert.equal(replay.created, false, "a replayed publish creates nothing");
  assert.equal(
    replay.version.versionNumber,
    1,
    "a replayed publish converges on the same version",
  );

  const approvedUpdatedAt = (await catalogService.getById(product.id))
    .updatedAt;

  writeFileSync(
    handoffPath,
    JSON.stringify(
      {
        ownerId,
        otherOwnerId,
        productId: product.id,
        jobId: job.id,
        secondJobId: second.job.id,
        titleProposalId,
        descriptionProposalId,
        categoryProposalId,
        materialsProposalId,
        acceptedCategory,
        acceptedDescription,
        editedTitle,
        publishedVersion: 1,
        idempotencyKey,
        approvedUpdatedAt,
      } satisfies Handoff,
      null,
      2,
    ),
  );

  assert.equal(
    (await aiRepository.getJob(job.id))?.state,
    "SUCCEEDED",
    "the job is terminal",
  );

  console.log("M5 REVIEW PUBLISH POSTGRES WRITE PHASE PASSED");
}

async function readPhase(handoffPath: string): Promise<void> {
  const handoff = JSON.parse(
    readFileSync(handoffPath, "utf8"),
  ) as Handoff;
  const { database, aiRepository, catalogService, aiReview, review } =
    freshRigs();

  // B1: the published listing is buyer-visible and still exactly what was
  // authorized. Nothing in the read process was holding any of this.
  const product = await catalogService.getById(handoff.productId);

  assert.equal(product.state, "PUBLISHED", "the product is still published");
  assert.equal(product.title, handoff.editedTitle, "the corrected title survived");
  assert.equal(
    product.description,
    handoff.acceptedDescription,
    "the accepted description survived",
  );
  assert.equal(
    product.category,
    handoff.acceptedCategory,
    "the accepted category survived",
  );
  assert.equal(
    product.publishedVersion,
    handoff.publishedVersion,
    "the published version is still recorded on the product",
  );

  // B2: the immutable version is durable, and the publish history is
  // unchanged by the restart.
  const versions = await catalogService.listVersions(
    handoff.productId,
    handoff.ownerId,
  );

  assert.equal(versions.length, 1, "exactly one version exists");
  assert.equal(versions[0].versionNumber, handoff.publishedVersion);
  assert.equal(versions[0].publishedBy, handoff.ownerId, "attribution survived");
  assert.equal(versions[0].title, handoff.editedTitle, "the version is not rewritten");

  const rows = await database.query<{
    id: string;
    version_number: number;
    published_by: string;
  }>(
    "select id, version_number, published_by from catalog_versions where product_id = $1 order by version_number asc",
    [handoff.productId],
  );

  assert.equal(rows.length, 1, "the version is one durable row");
  assert.equal(rows[0].version_number, 1);
  assert.equal(rows[0].published_by, handoff.ownerId);

  // B3: the review surface is honest about a published product. It is not
  // blocked by having succeeded — the suggestions are all decided and there
  // is no missing field — but it is also not "ready to be approved", because
  // a published product must return to REVIEW_REQUIRED before it can change.
  // Reporting it as approvable would offer an action the Catalog module
  // refuses.
  const surface = await review.getReview(handoff.productId, handoff.ownerId);

  assert.equal(
    surface.suggestions.length,
    0,
    "no suggestion is outstanding",
  );
  assert.equal(
    surface.blocking.length,
    1,
    "a published product reports exactly one blocker",
  );
  assert.equal(
    surface.blocking[0].reason,
    "PRODUCT_NOT_APPROVABLE",
    "the blocker is about the state, not about anything AI proposed",
  );
  assert.equal(
    surface.blocking[0].field,
    undefined,
    "a state blocker is about the product as a whole, so it names no field",
  );
  assert.equal(
    surface.readyForApproval,
    false,
    "a published product is not offered for approval",
  );
  assert.equal(
    surface.product.publishedVersion,
    handoff.publishedVersion,
    "the review surface reports the published version",
  );

  // And the refusal agrees with the Catalog module, rather than the two
  // surfaces disagreeing about the same product.
  await assert.rejects(
    () => review.approve(handoff.productId, handoff.ownerId),
    (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    "approving a published product is refused, with the reason attached",
  );

  // B4: the human decisions survived, with their attribution and their
  // applied values. This is the AI-boundary fact: what reached the product is
  // recorded as a decision, not as a model's output.
  const proposals = await aiRepository.listProposals(handoff.jobId);

  assert.equal(proposals.length, 4, "the first run's proposals are all there");

  const first = new Map(proposals.map((entry) => [entry.field, entry]));

  assert.equal(first.get("title")!.decision, "EDITED");
  assert.equal(first.get("title")!.decidedBy, handoff.ownerId);
  assert.equal(
    first.get("title")!.appliedValue,
    handoff.editedTitle,
    "what reached the product is still recorded as what reached it",
  );
  assert.equal(
    first.get("title")!.value,
    "Bamboo Basket",
    "the model's own value is retained beside the applied one",
  );
  assert.equal(first.get("description")!.decision, "ACCEPTED");
  assert.equal(first.get("category")!.decision, "ACCEPTED");
  assert.equal(first.get("materials")!.decision, "REJECTED");
  assert.equal(
    first.get("materials")!.appliedValue,
    null,
    "a rejection still records no applied value",
  );

  const secondRun = await aiRepository.listProposals(handoff.secondJobId);

  assert.equal(
    secondRun.length,
    4,
    "the second run's proposals are all there",
  );
  assert.ok(
    secondRun.every((entry) => entry.decision === "REJECTED"),
    "the second run's suggestions were all decided too",
  );

  // B5: a decided proposal stays decided. Nothing after the restart,
  // including a hand-written statement, may rewrite what a human authorized.
  await assert.rejects(
    () =>
      aiReview.applyDecisions(handoff.productId, handoff.ownerId, [
        { proposalId: handoff.categoryProposalId, decision: "REJECTED" },
      ]),
    (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    "a decision recorded before the restart must still stand",
  );

  await assert.rejects(
    () =>
      database.query(
        "update ai_proposals set decision = 'PENDING', decided_by = null, decided_at = null, applied_value = null where id = $1",
        [handoff.categoryProposalId],
      ),
    "a decided proposal must stay frozen even against a hand-written update",
  );

  // B6: the approval itself is not a record but a state, and the state is
  // still APPROVED-derived. The generic shortcut is still closed, so the
  // published precondition still means a human said yes.
  await assert.rejects(
    () =>
      catalogService.transition(handoff.productId, "PUBLISHED", handoff.ownerId),
    (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    "PUBLISHED is still not assignable after the restart",
  );

  await assert.rejects(
    () =>
      catalogService.approve(handoff.productId, handoff.ownerId),
    (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
    "a published product cannot be re-approved; it must return to review first",
  );

  // B7: returning to review and publishing again is the documented way to
  // change a published listing, and it creates a second version rather than
  // rewriting the first.
  await catalogService.transition(
    handoff.productId,
    "REVIEW_REQUIRED",
    handoff.ownerId,
  );
  await catalogService.update(handoff.productId, handoff.ownerId, {
    title: "Bamboo Basket, Extra Large",
  });
  await review.approve(handoff.productId, handoff.ownerId);

  const second = await catalogService.publish(
    handoff.productId,
    handoff.ownerId,
    `m5-publish-2-${handoff.ownerId}`,
  );

  assert.equal(second.created, true);
  assert.equal(second.version.versionNumber, 2, "a change creates a new version");

  const history = await database.query<{
    version_number: number;
    title: string;
  }>(
    "select version_number, title from catalog_versions where product_id = $1 order by version_number asc",
    [handoff.productId],
  );

  assert.equal(history.length, 2, "the history holds both versions");
  assert.equal(
    history[0].title,
    handoff.editedTitle,
    "the earlier version is not rewritten by a later publish",
  );
  assert.equal(
    history[1].title,
    "Bamboo Basket, Extra Large",
    "the new version carries the new value",
  );

  console.log("M5 REVIEW PUBLISH POSTGRES READ-AFTER-RESTART PHASE PASSED");
}

async function main(): Promise<void> {
  const [phase, handoffPath] = process.argv.slice(2);

  if (!phase || !handoffPath) {
    throw new Error(
      "Usage: review-publish-postgres-runtime.test.ts <write|read> <handoff-path>",
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
