import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { CatalogService } from "../../apps/api/src/modules/catalog/application/catalog-service.ts";
import { PostgresAiRepository } from "../../apps/api/src/modules/ai/infrastructure/postgres-ai-repository.ts";
import { ReviewService } from "../../apps/api/src/modules/review/application/review-service.ts";
import { CatalogServiceReviewProductPort } from "../../apps/api/src/modules/review/infrastructure/catalog-review-port.ts";
import { AiRepositoryReviewSuggestionsPort } from "../../apps/api/src/modules/review/infrastructure/ai-suggestions-port.ts";
import { PostgresCatalogRepository } from "../../apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.ts";
import { PostgresDatabase } from "../../apps/api/src/shared/persistence/postgres-database.ts";
import { AppError } from "../../apps/api/src/shared/errors/app-error.ts";
import type { CatalogProduct } from "../../apps/api/src/modules/catalog/domain/catalog-product.ts";

/**
 * Real-PostgreSQL runtime proof for the M3 catalog lifecycle and
 * versioning slice.
 *
 * Everything else in the catalog suite runs against the in-memory
 * repository or a fake SQL database. That is the right level for the
 * business rules, but it leaves the parts most likely to be wrong
 * unverified: migration `005_catalog_versions.sql` (partial unique
 * indexes, check constraints, the immutability trigger), the two-write
 * publish transaction, and the `published_version` round trip through
 * node-postgres. This suite runs those against a real server.
 *
 * The `write` and `read` phases run in separate processes with a
 * PostgreSQL restart in between, so `read` proves the lifecycle and its
 * published history are canonical database state rather than anything
 * held in a live process.
 *
 * Requires a running server. It is deliberately NOT part of
 * `pnpm verify`, which is the service-free fast path; use
 * `scripts/verify-m3-postgres.ps1`.
 */

type Handoff = {
  ownerId: string;
  productId: string;
  firstVersionId: string;
  firstVersionTitle: string;
  secondVersionId: string;
  secondVersionTitle: string;
};

const connectionString = process.env.M3_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "M3_POSTGRES_URL must point at the project-local PostgreSQL instance. Use scripts/verify-m3-postgres.ps1, which reads it from the Hyperdrive binding in apps/api/wrangler.jsonc.",
  );
}

/**
 * A fresh database handle and service per phase.
 *
 * `PostgresDatabase` opens and closes a connection per operation, so
 * nothing is cached between calls, and a new repository/service pair is
 * what the `read` phase uses: there is no in-process object that could
 * answer a read from memory.
 */
function freshService(actorId: string): {
  service: CatalogService;
  repository: PostgresCatalogRepository;
  database: PostgresDatabase;
  review: ReviewService;
} {
  const database = PostgresDatabase.forActor(connectionString!, actorId);
  const repository = new PostgresCatalogRepository(database);
  const service = new CatalogService(repository);
  const review = new ReviewService(
    new CatalogServiceReviewProductPort(service),
    new AiRepositoryReviewSuggestionsPort(
      new PostgresAiRepository(database),
    ),
  );

  return {
    database,
    repository,
    service,
    review,
  };
}

async function advance(
  service: CatalogService,
  productId: string,
  ownerId: string,
  ...states: CatalogProduct["state"][]
): Promise<CatalogProduct> {
  let product: CatalogProduct | null = null;

  for (const state of states) {
    product = await service.transition(productId, state, ownerId);
  }

  return product!;
}

/**
 * The documented lifecycle, driven through the real state machine and
 * the real compare-and-set update. Every state a client can reach
 * before review is persisted by the same SQL the API uses.
 */
async function writePhase(handoffPath: string): Promise<void> {
  const ownerId = randomUUID();
  const { service, repository, database, review } = freshService(ownerId);

  // A1: a draft is canonical, durable state with no published version.
  const draft = (
    await service.createDraft({
      ownerId,
      title: "Bamboo Basket",
      description: "Handwoven storage basket.",
      category: "basketry",
      materials: ["bamboo"],
      idempotencyKey: `m3-draft-${ownerId}`,
    })
  ).product;

  assert.equal(draft.state, "LOCAL_DRAFT", "a new draft is LOCAL_DRAFT");
  assert.equal(
    draft.publishedVersion,
    null,
    "an unpublished product has no catalog version",
  );

  const reloaded = await service.getById(draft.id);
  assert.equal(
    reloaded.title,
    "Bamboo Basket",
    "the draft survives a read through a new connection",
  );

  // A2: the pre-review lifecycle persists.
  await advance(service, draft.id, ownerId, "PENDING_SYNC", "SYNCED", "REVIEW_REQUIRED");
  await review.approve(draft.id, ownerId);
  const approved = await service.getById(draft.id);
  assert.equal(approved.state, "APPROVED");

  // A3a: the compare-and-set is real. A stale expected state matches no
  // row, so the update must fail and leave the product where it was.
  await assert.rejects(
    () =>
      repository.transitionState(draft.id, "ARCHIVED", "LOCAL_DRAFT"),
    /Invalid catalog state transition/,
    "a stale compare-and-set must not transition the product",
  );
  assert.equal(
    (await service.getById(draft.id)).state,
    "APPROVED",
    "a lost compare-and-set leaves the state untouched",
  );

  // A4: publication writes the product pointer and its version in one
  // transaction, allocating the number from the row the update returned.
  const published = await service.publish(
    draft.id,
    ownerId,
    `m3-publish-${ownerId}-v1`,
  );

  assert.equal(published.created, true, "the first publish creates a version");
  assert.equal(published.product.state, "PUBLISHED");
  assert.equal(
    published.product.publishedVersion,
    1,
    "the product points at catalog version 1",
  );
  assert.equal(published.version.versionNumber, 1);
  assert.equal(
    published.version.publishedBy,
    ownerId,
    "the version records the authorizing actor",
  );
  assert.deepEqual([...published.version.materials], ["bamboo"]);

  // A5: a retried publish converges instead of allocating a second
  // version. The pre-check inside the transaction finds the version the
  // first attempt already committed.
  const retried = await service.publish(
    draft.id,
    ownerId,
    `m3-publish-${ownerId}-v1`,
  );

  assert.equal(
    retried.created,
    false,
    "a retried publish reports deduplication",
  );
  assert.equal(
    retried.version.id,
    published.version.id,
    "a retried publish returns the version it already created",
  );
  assert.equal(
    retried.product.publishedVersion,
    1,
    "a retried publish does not allocate another version",
  );

  // A6: a published product is frozen, so buyer-visible history cannot be
  // rewritten in place.
  await assert.rejects(
    () => service.update(draft.id, ownerId, { title: "Rewritten" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "CONFLICT",
    "a published product must refuse edits",
  );

  // A7: publication is the only route to PUBLISHED, so a second publish
  // under a fresh key is refused by the review precondition rather than
  // silently making another version.
  await assert.rejects(
    () => service.publish(draft.id, ownerId, `m3-publish-${ownerId}-x`),
    (error: unknown) =>
      error instanceof AppError && error.code === "CONFLICT",
    "a product already published cannot be published again",
  );

  assert.equal(
    (await service.listVersions(draft.id, ownerId)).length,
    1,
    "the refused second publish recorded no version",
  );

  // A8: the immutability guarantee is enforced by the database, not only
  // by application discipline, so it holds for every writer.
  await assert.rejects(
    () =>
      database.query(
        "update catalog_versions set title = $1 where id = $2",
        ["Rewritten", published.version.id],
      ),
    "the database must refuse to rewrite a published version",
  );

  await assert.rejects(
    () =>
      database.query("delete from catalog_versions where id = $1", [
        published.version.id,
      ]),
    "the database must refuse to delete a published version",
  );

  // A9: a change to a published product goes back through review, and the
  // further publish allocates the next version without touching the
  // version buyers were already shown.
  await advance(service, draft.id, ownerId, "REVIEW_REQUIRED");

  const edited = await service.update(draft.id, ownerId, {
    title: "Bamboo Basket, Large",
  });
  assert.equal(edited.title, "Bamboo Basket, Large");
  assert.equal(
    edited.description,
    approved.description,
    "an edit to one field leaves the others alone",
  );

  await review.approve(draft.id, ownerId);

  const republished = await service.publish(
    draft.id,
    ownerId,
    `m3-publish-${ownerId}-v2`,
  );

  assert.equal(
    republished.version.versionNumber,
    2,
    "a re-publish allocates the next catalog version",
  );
  assert.equal(
    republished.product.publishedVersion,
    2,
    "the product points at catalog version 2",
  );
  assert.equal(
    republished.version.title,
    "Bamboo Basket, Large",
    "the new version records the corrected title",
  );

  const history = await service.listVersions(draft.id, ownerId);
  assert.equal(history.length, 2, "both versions remain in history");
  assert.deepEqual(
    history.map((version) => version.versionNumber),
    [2, 1],
    "history is newest first",
  );
  assert.equal(
    history[1]!.title,
    "Bamboo Basket",
    "the earlier version still shows what buyers were shown",
  );
  assert.equal(
    history[1]!.id,
    published.version.id,
    "the earlier version is the same immutable record",
  );

  // A10: ownership is decided from the stored record, not from anything
  // the caller asserted.
  await assert.rejects(
    () => service.listVersions(draft.id, randomUUID()),
    (error: unknown) =>
      error instanceof AppError && error.code === "FORBIDDEN",
    "another artisan must not read the publish history",
  );

  const handoff: Handoff = {
    ownerId,
    productId: draft.id,
    firstVersionId: published.version.id,
    firstVersionTitle: published.version.title,
    secondVersionId: republished.version.id,
    secondVersionTitle: republished.version.title,
  };

  writeFileSync(handoffPath, JSON.stringify(handoff, null, 2));

  console.log(
    `CATALOG LIFECYCLE POSTGRES WRITE PHASE PASSED (product ${draft.id})`,
  );
}

/**
 * Runs in a new process, after PostgreSQL has restarted, against a
 * service that has never seen this product.
 */
async function readPhase(handoffPath: string): Promise<void> {
  const handoff = JSON.parse(
    readFileSync(handoffPath, "utf8"),
  ) as Handoff;

  const { service } = freshService(handoff.ownerId);

  const product = await service.getById(handoff.productId);

  assert.ok(product, "the published product survived the restart");
  assert.equal(
    product.state,
    "PUBLISHED",
    "the canonical state survived the restart",
  );
  assert.equal(
    product.publishedVersion,
    2,
    "the product still points at the latest catalog version",
  );
  assert.equal(
    product.title,
    handoff.secondVersionTitle,
    "the corrected working value survived the restart",
  );

  const history = await service.listVersions(
    handoff.productId,
    handoff.ownerId,
  );

  assert.equal(
    history.length,
    2,
    "the publish history survived the restart intact",
  );
  assert.deepEqual(
    history.map((version) => version.versionNumber),
    [2, 1],
    "history is still newest first",
  );
  assert.equal(
    history[0]!.id,
    handoff.secondVersionId,
    "the second version is the same record after the restart",
  );
  assert.equal(
    history[1]!.id,
    handoff.firstVersionId,
    "the first version is the same record after the restart",
  );
  assert.equal(
    history[1]!.title,
    handoff.firstVersionTitle,
    "the first version still shows what buyers were shown",
  );
  assert.equal(
    history[1]!.publishedBy,
    handoff.ownerId,
    "publish attribution survived the restart",
  );

  console.log(
    "CATALOG LIFECYCLE POSTGRES READ-AFTER-RESTART PHASE PASSED",
  );
}

async function main(): Promise<void> {
  const [phase, handoffPath] = process.argv.slice(2);

  if (!phase || !handoffPath) {
    throw new Error(
      "Usage: catalog-lifecycle-postgres-runtime.test.ts <write|read> <handoff-path>",
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
