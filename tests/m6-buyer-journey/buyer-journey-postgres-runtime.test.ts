import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { CatalogService } from "../../apps/api/src/modules/catalog/application/catalog-service.ts";
import { PostgresCatalogRepository } from "../../apps/api/src/modules/catalog/infrastructure/postgres-catalog-repository.ts";
import { DiscoveryService } from "../../apps/api/src/modules/discovery/application/discovery-service.ts";
import { CatalogServicePublishedCatalogReadPort } from "../../apps/api/src/modules/discovery/infrastructure/catalog-published-port.ts";
import { parseDiscoveryQuery } from "../../apps/api/src/modules/discovery/domain/discovery-query.ts";
import { InquiryService } from "../../apps/api/src/modules/inquiry/application/inquiry-service.ts";
import { PostgresInquiryRepository } from "../../apps/api/src/modules/inquiry/infrastructure/postgres-inquiry-repository.ts";
import { CatalogServicePublishedProductPort } from "../../apps/api/src/modules/inquiry/infrastructure/catalog-published-port.ts";
import { PostgresDatabase } from "../../apps/api/src/shared/persistence/postgres-database.ts";
import { AppError } from "../../apps/api/src/shared/errors/app-error.ts";
import { INQUIRY_MESSAGE_MAX_LENGTH } from "../../packages/contracts/src/index.ts";

/**
 * Real-PostgreSQL runtime proof for the M6 buyer journey.
 *
 * The in-memory and fake-SQL suites prove the rules of discovery and inquiry.
 * This proves the whole buyer path survives a real database, which is the
 * only way to show the buyer-visible facts are durable rather than
 * reconstructed per request.
 *
 * The journey exercised, end to end:
 *
 *   an artisan publishes -> a buyer discovers the listing by search -> the
 *   buyer opens the listing -> the buyer sends an inquiry -> the inquiry is
 *   attributed to the authenticated buyer and pinned to the published
 *   version -> all of it is still there in a new process after a PostgreSQL
 *   restart.
 *
 * And the four boundaries that make it a buyer surface rather than a catalog
 * dump, each proven against real rows rather than asserted as SQL text:
 *
 *   unpublished work is invisible; the published snapshot is authoritative
 *   over a later draft edit; an inquiry requires published state; and a
 *   repeated Idempotency-Key converges on one inquiry.
 *
 * The `write` and `read` phases run in separate processes with a restart in
 * between, so `read` proves the discovery results and the inquiry are
 * canonical database state rather than anything a live process was still
 * holding.
 *
 * ### Isolation from whatever is already in the local database
 *
 * Every artifact this proof creates belongs to a fresh random owner, and
 * every search assertion is scoped by a per-run random token that no
 * pre-existing row can contain. The local development database accumulates
 * rows from earlier milestone runs, and this proof must be right because the
 * database behaved correctly, not because a previous run happened to leave
 * the catalog empty. Search totals are therefore always asserted against a
 * token that only this run can match.
 *
 * Fixtures are not deleted afterwards, which is what the M3, M4 and M5
 * runners do. `catalog_versions` rows are immutable published snapshots and
 * the database refuses to delete them by design, so a cleanup that removed
 * this run's products would have to remove the record of what buyers were
 * shown. Isolation, not deletion, is what keeps the proof repeatable.
 *
 * Requires a running server. It is deliberately NOT part of `pnpm verify`,
 * which is the service-free fast path; use `scripts/verify-m6-postgres.ps1`.
 */

type Handoff = {
  ownerId: string;
  buyerId: string;
  otherBuyerId: string;
  probeToken: string;
  materialToken: string;
  publishedProductId: string;
  wildcardProductId: string;
  draftProductId: string;
  archivedProductId: string;
  approvedProductId: string;
  publishedTitle: string;
  publishedDescription: string;
  editedDraftTitle: string;
  inquiryId: string;
  inquiryMessage: string;
  idempotencyKey: string;
  publishedVersion: number;
};

const connectionString = process.env.M6_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "M6_POSTGRES_URL must point at the project-local PostgreSQL instance. Use scripts/verify-m6-postgres.ps1, which reads it from the Hyperdrive binding in apps/api/wrangler.jsonc.",
  );
}

/**
 * A fresh database handle and service set per phase.
 *
 * `PostgresDatabase` opens and closes a connection per operation, so nothing
 * is cached between calls, and the `read` phase builds its own services:
 * there is no in-process object that could answer a read from memory.
 *
 * The services are the production ones and the adapters are the production
 * adapters, wired the same way `getDiscoveryService` and `getInquiryService`
 * wire them. Nothing here reaches past a module's public service into
 * another module's tables, so the proof also shows the boundaries hold
 * against a real database rather than only in review.
 */
function freshRigs(): {
  database: PostgresDatabase;
  catalog: CatalogService;
  discovery: DiscoveryService;
  inquiry: InquiryService;
} {
  const database = new PostgresDatabase(connectionString!);
  const catalog = new CatalogService(
    new PostgresCatalogRepository(database),
  );

  return {
    database,
    catalog,
    discovery: new DiscoveryService(
      new CatalogServicePublishedCatalogReadPort(catalog),
    ),
    inquiry: new InquiryService(
      new PostgresInquiryRepository(database),
      new CatalogServicePublishedProductPort(catalog),
    ),
  };
}

/**
 * A search term only this run can match.
 *
 * Lower-case hexadecimal, so it survives the boundary's lower-casing
 * unchanged, and it contains no `_` or `%` so that the escaping assertions
 * below have exactly one wildcard to introduce at a time.
 */
function runToken(): string {
  return `m6probe${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * A short random token, used where a shorter string reads better in an
 * assertion than a full UUID.
 */
function shortToken(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

/**
 * Drives a draft to APPROVED and then publishes it.
 *
 * Through the real state machine and the real compare-and-set, so a
 * published listing has to be the result of the operations a client can
 * actually call. `label` is carried in the description, which is what makes
 * every search assertion scoped to this run.
 */
async function publishFixture(
  catalog: CatalogService,
  ownerId: string,
  input: {
    title: string;
    description: string;
    category?: string;
    materials?: string[];
  },
  token: string,
): Promise<string> {
  const product = (
    await catalog.createDraft({
      ownerId,
      title: input.title,
      description: input.description,
      ...(input.category === undefined
        ? {}
        : { category: input.category }),
      ...(input.materials === undefined
        ? {}
        : { materials: input.materials }),
      idempotencyKey: `m6-draft-${token}-${shortToken()}`,
    })
  ).product;

  for (const state of [
    "PENDING_SYNC",
    "SYNCED",
    "REVIEW_REQUIRED",
  ] as const) {
    await catalog.transition(product.id, state, ownerId);
  }

  await catalog.approve(product.id, ownerId);
  await catalog.publish(
    product.id,
    ownerId,
    `m6-publish-${token}-${shortToken()}`,
  );

  return product.id;
}

async function writePhase(handoffPath: string): Promise<void> {
  const ownerId = randomUUID();
  const buyerId = randomUUID();
  const otherBuyerId = randomUUID();

  // One token scopes every search assertion in this run.
  const probeToken = runToken();
  const materialToken = `reed-${shortToken()}`;

  // A second token the two published fixtures share, so their relative order
  // can be asserted against each other.
  const pairToken = `pair-${shortToken()}`;

  const { database, catalog, discovery, inquiry } = freshRigs();

  // -------------------------------------------------------------------
  // A1: the published fixture an artisan can actually produce.
  // -------------------------------------------------------------------
  //
  // Its description carries the probe token, the shared pair token, and a
  // literal `_` next to the pair token so the escaping assertion below has
  // something concrete to escape.
  const publishedTitle = "Bamboo Basket";
  const publishedDescription =
    `Handwoven storage basket. probe ${probeToken} pair ${pairToken} wild_${pairToken}_card.`;

  const publishedProductId = await publishFixture(
    catalog,
    ownerId,
    {
      title: publishedTitle,
      description: publishedDescription,
      category: `basketry-${shortToken()}`,
      materials: ["bamboo", materialToken],
    },
    probeToken,
  );

  const published = await catalog.getById(publishedProductId);

  assert.equal(published.state, "PUBLISHED", "the fixture really is published");
  assert.equal(
    published.publishedVersion,
    1,
    "publishing allocated exactly one catalog version",
  );

  // A2: discovery finds it, and the buyer-facing projection is the published
  // version's values rather than the working draft's.
  const found = await discovery.search(
    parseDiscoveryQuery({ search: probeToken }),
  );

  assert.equal(
    found.products.length,
    1,
    "the token matches exactly one buyer-visible listing",
  );
  assert.equal(found.total, 1, "and the reported total agrees");
  assert.equal(found.limit, 20, "the applied limit is reported back");
  assert.equal(found.offset, 0, "the applied offset is reported back");
  assert.equal(found.hasMore, false, "a complete result set says so");

  const listed = found.products[0];

  assert.equal(listed.productId, publishedProductId);
  assert.equal(listed.versionNumber, 1, "the listing names the version it is");
  assert.equal(listed.title, publishedTitle, "the published title is shown");
  assert.equal(
    listed.description,
    publishedDescription,
    "the published description is shown",
  );
  assert.deepEqual(
    [...listed.materials].sort(),
    ["bamboo", materialToken].sort(),
    "materials are returned to the buyer",
  );
  assert.ok(
    Date.parse(listed.publishedAt) > 0,
    "the listing reports when it was published",
  );

  // -------------------------------------------------------------------
  // A3: the projection carries nothing a draft edit or an internal fact
  // could change.
  // -------------------------------------------------------------------
  //
  // Asserted on the keys rather than on the absence of one field, so a new
  // field added to the published read model fails here rather than quietly
  // shipping.
  assert.deepEqual(
    Object.keys(listed).sort(),
    [
      "category",
      "description",
      "materials",
      "productId",
      "publishedAt",
      "title",
      "versionNumber",
    ],
    "the buyer-facing listing is exactly the published projection",
  );

  const detail = await discovery.getPublishedProduct(publishedProductId);

  assert.deepEqual(
    detail,
    listed,
    "the single-listing route and the page return the same published facts",
  );

  // -------------------------------------------------------------------
  // A4: the other three products are real, and none of them is a draft or an
  // approved product.
  // -------------------------------------------------------------------
  //
  // All four carry the probe token, so one search answers the whole
  // visibility question: if any of them leaked, the total would be above 1.
  const draftProductId = (
    await catalog.createDraft({
      ownerId,
      title: "Clay Jug",
      description: `Wheel thrown and never published. probe ${probeToken}`,
      category: "pottery",
      materials: ["clay"],
      idempotencyKey: `m6-draft-only-${shortToken()}`,
    })
  ).product.id;

  const approvedProductId = (
    await catalog.createDraft({
      ownerId,
      title: "Reed Hat",
      description: `Approved but never published. probe ${probeToken}`,
      category: "millinery",
      materials: ["reed"],
      idempotencyKey: `m6-approved-${shortToken()}`,
    })
  ).product.id;

  for (const state of [
    "PENDING_SYNC",
    "SYNCED",
    "REVIEW_REQUIRED",
  ] as const) {
    await catalog.transition(approvedProductId, state, ownerId);
  }

  await catalog.approve(approvedProductId, ownerId);

  // A listing that was published and then withdrawn, which is the only thing
  // that hides a product that already has a version.
  const archivedProductId = await publishFixture(
    catalog,
    ownerId,
    {
      title: "Archived Bowl",
      description: `Published, then withdrawn. probe ${probeToken}`,
      category: "pottery",
      materials: ["stoneware"],
    },
    `${probeToken}-arch`,
  );

  await catalog.transition(archivedProductId, "ARCHIVED", ownerId);

  const narrowed = await discovery.search(
    parseDiscoveryQuery({ search: probeToken }),
  );

  assert.equal(
    narrowed.total,
    1,
    "only the published listing matches: a draft, an approved product, and an archived one are all invisible",
  );
  assert.equal(
    narrowed.products[0].productId,
    publishedProductId,
    "and the one that survives is the published one",
  );

  // -------------------------------------------------------------------
  // A5: the same invisibility holds on the single-listing route, and an
  // unpublished id is refused exactly like an id that does not exist.
  // -------------------------------------------------------------------
  for (const [label, productId] of [
    ["a never-published draft", draftProductId],
    ["an approved but unpublished product", approvedProductId],
    ["an archived listing", archivedProductId],
    ["an id that does not exist", randomUUID()],
  ] as const) {
    await assert.rejects(
      () => discovery.getPublishedProduct(productId),
      (error: unknown) =>
        error instanceof AppError && error.code === "NOT_FOUND",
      `${label} is not readable through discovery`,
    );
  }

  const nonexistent = await captureError(() =>
    discovery.getPublishedProduct(randomUUID()),
  );
  const draft = await captureError(() =>
    discovery.getPublishedProduct(draftProductId),
  );

  assert.equal(
    draft.message,
    nonexistent.message,
    "an unpublished product is refused identically to one that does not exist, so discovery is not an oracle for unpublished ids",
  );

  // -------------------------------------------------------------------
  // A6: the published snapshot stays authoritative over a later draft edit.
  // -------------------------------------------------------------------
  //
  // The artisan returns the product to review and changes the working title
  // and description. Neither the page nor the detail route may move: the
  // buyers were shown version 1, and only a publish can change that.
  const editedDraftTitle = "Bamboo Basket, Extra Large";

  await catalog.transition(
    publishedProductId,
    "REVIEW_REQUIRED",
    ownerId,
  );
  await catalog.update(publishedProductId, ownerId, {
    title: editedDraftTitle,
    description: `Rewritten working copy. probe ${probeToken}`,
  });

  const workingCopy = await catalog.getById(publishedProductId);

  assert.equal(
    workingCopy.title,
    editedDraftTitle,
    "the working draft really was edited",
  );
  assert.equal(
    workingCopy.publishedVersion,
    1,
    "a draft edit does not allocate a catalog version",
  );

  const afterEdit = await discovery.search(
    parseDiscoveryQuery({ search: probeToken }),
  );

  assert.equal(afterEdit.total, 1, "the listing is still the one that was published");
  assert.equal(
    afterEdit.products[0].title,
    publishedTitle,
    "the buyer still sees the published title, not the draft edit",
  );
  assert.equal(
    afterEdit.products[0].versionNumber,
    1,
    "still version 1: the edit did not publish anything",
  );
  assert.deepEqual(
    await discovery.getPublishedProduct(publishedProductId),
    listed,
    "the detail route is equally unaffected by the draft edit",
  );

  // The version table agrees: one version, and it is the one buyers saw.
  const versionRows = await database.query<{ version_number: number }>(
    "select version_number from catalog_versions where product_id = $1 order by version_number asc",
    [publishedProductId],
  );

  assert.equal(
    versionRows.length,
    1,
    "the draft edit wrote no version row",
  );
  assert.equal(versionRows[0].version_number, 1);

  // -------------------------------------------------------------------
  // A7: search is deterministic text search over the published version.
  // -------------------------------------------------------------------
  const caseInsensitive = await discovery.search(
    parseDiscoveryQuery({ search: probeToken.toUpperCase() }),
  );

  assert.equal(
    caseInsensitive.total,
    1,
    "search is case-insensitive in both directions",
  );

  const materialSearch = await discovery.search(
    parseDiscoveryQuery({ search: materialToken }),
  );

  assert.equal(
    materialSearch.total,
    0,
    "materials are not searched, so a materials edit cannot change a published listing's search result",
  );
  assert.ok(
    listed.materials.includes(materialToken),
    "the material is still shown to the buyer in the listing",
  );

  // A8: `LIKE` metacharacters in a search term are literals.
  const escapedUnderscore = await discovery.search(
    parseDiscoveryQuery({ search: `wild_${pairToken}_card` }),
  );

  assert.equal(
    escapedUnderscore.total,
    1,
    "an underscore matches a literal underscore rather than any character",
  );
  assert.equal(
    escapedUnderscore.products[0].productId,
    publishedProductId,
    "and it matched the listing that really contains that text",
  );

  // -------------------------------------------------------------------
  // A9: a second published listing, sharing the pair token, so the order
  // between two listings can be asserted.
  // -------------------------------------------------------------------
  const wildcardProductId = await publishFixture(
    catalog,
    ownerId,
    {
      title: "Reed Basket",
      description: `Second listing. pair ${pairToken} wildx${pairToken}xcard.`,
      category: "basketry",
      materials: ["reed"],
    },
    `${probeToken}-wild`,
  );

  const pairPage = await discovery.search(
    parseDiscoveryQuery({ search: pairToken }),
  );

  assert.equal(
    pairPage.total,
    2,
    "both published listings share the token and both are visible",
  );
  assert.ok(
    pairPage.products.some((entry) => entry.productId === publishedProductId),
    "the first fixture is in the page",
  );
  assert.ok(
    pairPage.products.some((entry) => entry.productId === wildcardProductId),
    "the second fixture is in the page",
  );

  // The control for that assertion is published below: a listing whose text
  // is the same with a literal `x` where the search had `_`. A pattern that
  // treated `_` as a wildcard would match both.
  const wildcardControl = await discovery.search(
    parseDiscoveryQuery({ search: `wildx${pairToken}xcard` }),
  );

  assert.equal(
    wildcardControl.total,
    1,
    "the literal-x search matches only the listing that contains it",
  );

  // A `%` in a search term is a literal too. Unescaped it would match every
  // visible listing in the database, including rows from earlier runs.
  const percentSearch = await discovery.search(
    parseDiscoveryQuery({ search: `%${probeToken}%` }),
  );

  assert.equal(
    percentSearch.total,
    0,
    "a percent sign is a literal, not a wildcard",
  );

  // A10: the order is total, so paging cannot drop or repeat a listing.
  const expectedOrder = [...pairPage.products].sort(
    (left, right) =>
      left.publishedAt === right.publishedAt
        ? left.productId < right.productId
          ? -1
          : 1
        : left.publishedAt < right.publishedAt
          ? 1
          : -1,
  );

  assert.deepEqual(
    pairPage.products.map((entry) => entry.productId),
    expectedOrder.map((entry) => entry.productId),
    "listings come back newest publication first, with the product id breaking a tie",
  );

  const firstPage = await discovery.search(
    parseDiscoveryQuery({ search: pairToken, limit: "1", offset: "0" }),
  );
  const secondPage = await discovery.search(
    parseDiscoveryQuery({ search: pairToken, limit: "1", offset: "1" }),
  );

  assert.equal(firstPage.total, 2, "the total does not depend on the page");
  assert.equal(secondPage.total, 2, "the total does not depend on the page");
  assert.equal(firstPage.hasMore, true, "the first of two pages says so");
  assert.equal(secondPage.hasMore, false, "the last of two pages says so");
  assert.equal(
    new Set([
      ...firstPage.products.map((entry) => entry.productId),
      ...secondPage.products.map((entry) => entry.productId),
    ]).size,
    2,
    "the two pages cover both listings exactly once",
  );

  // -------------------------------------------------------------------
  // A11: an inquiry can only be created against published state.
  // -------------------------------------------------------------------
  const inquiryMessage =
    "Is this basket still available, and what is the smallest size you make?";
  const idempotencyKey = `m6-inquiry-${shortToken()}`;

  for (const [label, productId] of [
    ["a never-published draft", draftProductId],
    ["an approved but unpublished product", approvedProductId],
    ["an archived listing", archivedProductId],
    ["an id that does not exist", randomUUID()],
  ] as const) {
    await assert.rejects(
      () =>
        inquiry.create({
          productId,
          message: inquiryMessage,
          idempotencyKey: `m6-refused-${shortToken()}`,
          buyerId,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "NOT_FOUND",
      `an inquiry against ${label} is refused`,
    );
  }

  // -------------------------------------------------------------------
  // A12: the inquiry the buyer could actually send.
  // -------------------------------------------------------------------
  const created = await inquiry.create({
    productId: publishedProductId,
    message: inquiryMessage,
    idempotencyKey,
    buyerId,
  });

  assert.equal(created.created, true, "the first send created an inquiry");
  assert.equal(created.inquiry.buyerId, buyerId, "it belongs to the buyer");
  assert.equal(
    created.inquiry.productId,
    publishedProductId,
    "it names the listing the buyer asked about",
  );
  assert.equal(
    created.inquiry.catalogVersion,
    1,
    "it is pinned to the published version that was current",
  );
  assert.equal(
    created.inquiry.message,
    inquiryMessage,
    "the stored message is what was validated",
  );
  assert.equal(
    created.inquiry.status,
    "NEW",
    "a new inquiry starts in the only status that exists",
  );

  // -------------------------------------------------------------------
  // A13: a retry converges, and converges on the original.
  // -------------------------------------------------------------------
  //
  // The retry carries a different body, which is what a client that never saw
  // the first response and rebuilt its request would produce. The original
  // must win: the buyer's message is what they sent first.
  const replayed = await inquiry.create({
    productId: publishedProductId,
    message: "Actually, I only wanted to ask about the price.",
    idempotencyKey,
    buyerId,
  });

  assert.equal(
    replayed.created,
    false,
    "a repeated Idempotency-Key creates nothing",
  );
  assert.equal(
    replayed.inquiry.id,
    created.inquiry.id,
    "the retry converges on the inquiry the first send created",
  );
  assert.equal(
    replayed.inquiry.message,
    inquiryMessage,
    "the original message is unchanged by the retry",
  );

  const inquiryRows = await database.query<{ count: string | number }>(
    "select count(*) as count from inquiries where buyer_id = $1 and idempotency_key = $2",
    [buyerId, idempotencyKey],
  );

  assert.equal(
    Number(inquiryRows[0].count),
    1,
    "the database holds exactly one inquiry for that buyer's key",
  );

  // The same key from a different buyer is a different intention.
  const otherBuyerInquiry = await inquiry.create({
    productId: publishedProductId,
    message: inquiryMessage,
    idempotencyKey,
    buyerId: otherBuyerId,
  });

  assert.equal(
    otherBuyerInquiry.created,
    true,
    "the same key from another buyer is a different inquiry",
  );
  assert.notEqual(
    otherBuyerInquiry.inquiry.id,
    created.inquiry.id,
    "and it is a different record",
  );

  // -------------------------------------------------------------------
  // A14: the buyer's inquiry list is the buyer's own.
  // -------------------------------------------------------------------
  const own = await inquiry.listOwn(buyerId, {});

  assert.equal(own.total, 1, "the buyer sees their own inquiry");
  assert.equal(own.limit, 20, "the applied limit is reported back");
  assert.equal(own.inquiries[0].id, created.inquiry.id);

  const otherOwn = await inquiry.listOwn(otherBuyerId, {});

  assert.equal(
    otherOwn.total,
    1,
    "the second buyer's own inquiry is visible to them",
  );

  // -------------------------------------------------------------------
  // A15: another actor cannot read the inquiry.
  // -------------------------------------------------------------------
  const thirdBuyerId = randomUUID();

  await assert.rejects(
    () => inquiry.getOwn(created.inquiry.id, thirdBuyerId),
    (error: unknown) =>
      error instanceof AppError && error.code === "NOT_FOUND",
    "another buyer's inquiry is not found rather than forbidden, so reading it discloses nothing",
  );

  const thirdList = await inquiry.listOwn(thirdBuyerId, {});

  assert.equal(
    thirdList.total,
    0,
    "and it does not appear in another buyer's list",
  );

  // -------------------------------------------------------------------
  // A16: the database constraints M6 depends on actually exist and hold,
  // against a real server rather than as asserted SQL text.
  // -------------------------------------------------------------------
  await assertSchema(database);

  // The foreign key is what stops an inquiry naming a version that was never
  // published, even from a writer that skipped the service.
  await assert.rejects(
    () =>
      database.query(
        `insert into inquiries (
           id, buyer_id, product_id, catalog_version, message, status,
           idempotency_key, created_at, updated_at
         )
         values (
           gen_random_uuid(), $1, $2, 99, 'written directly', 'NEW',
           $3, now(), now()
         )`,
        [buyerId, publishedProductId, `m6-fk-${shortToken()}`],
      ),
    "the database refuses an inquiry that names a version that does not exist",
  );

  // And the per-buyer uniqueness is the index, not a read-then-write in the
  // service, so a concurrent retry cannot slip past it.
  await assert.rejects(
    () =>
      database.query(
        `insert into inquiries (
           id, buyer_id, product_id, catalog_version, message, status,
           idempotency_key, created_at, updated_at
         )
         values (
           gen_random_uuid(), $1, $2, 1, 'written directly', 'NEW',
           $3, now(), now()
         )`,
        [buyerId, publishedProductId, idempotencyKey],
      ),
    "the database refuses a second row for the same buyer and key",
  );

  // The message bound is duplicated in the database on purpose, and the two
  // must be the same number: a limit that differs by layer makes the limit
  // depend on which layer noticed first.
  await assert.rejects(
    () =>
      database.query(
        `insert into inquiries (
           id, buyer_id, product_id, catalog_version, message, status,
           idempotency_key, created_at, updated_at
         )
         values (
           gen_random_uuid(), $1, $2, 1, $3, 'NEW', $4, now(), now()
         )`,
        [
          buyerId,
          publishedProductId,
          "x".repeat(INQUIRY_MESSAGE_MAX_LENGTH + 1),
          `m6-long-${shortToken()}`,
        ],
      ),
    "the database refuses an oversized message at the same bound the contract declares",
  );

  writeFileSync(
    handoffPath,
    JSON.stringify(
      {
        ownerId,
        buyerId,
        otherBuyerId,
        probeToken,
        materialToken,
        publishedProductId,
        wildcardProductId,
        draftProductId,
        archivedProductId,
        approvedProductId,
        publishedTitle,
        publishedDescription,
        editedDraftTitle,
        inquiryId: created.inquiry.id,
        inquiryMessage,
        idempotencyKey,
        publishedVersion: 1,
      } satisfies Handoff,
      null,
      2,
    ),
  );

  console.log("M6 BUYER JOURNEY POSTGRES WRITE PHASE PASSED");
}

async function readPhase(handoffPath: string): Promise<void> {
  const handoff = JSON.parse(
    readFileSync(handoffPath, "utf8"),
  ) as Handoff;
  const { database, catalog, discovery, inquiry } = freshRigs();

  // B1: the buyer journey still works, in a process that holds nothing.
  const found = await discovery.search(
    parseDiscoveryQuery({ search: handoff.probeToken }),
  );

  assert.equal(found.total, 1, "the published listing is still discoverable");
  assert.equal(
    found.products[0].productId,
    handoff.publishedProductId,
    "and it is the same listing",
  );
  assert.equal(
    found.products[0].title,
    handoff.publishedTitle,
    "still the published title, not the draft edit made before the restart",
  );
  assert.equal(
    found.products[0].versionNumber,
    handoff.publishedVersion,
    "still the published version number",
  );

  const detail = await discovery.getPublishedProduct(
    handoff.publishedProductId,
  );

  assert.deepEqual(
    detail,
    found.products[0],
    "the detail route agrees with the page after the restart",
  );

  // B2: invisibility is still invisibility, and it is still the same refusal.
  for (const [label, productId] of [
    ["a never-published draft", handoff.draftProductId],
    ["an approved but unpublished product", handoff.approvedProductId],
    ["an archived listing", handoff.archivedProductId],
    ["an id that does not exist", randomUUID()],
  ] as const) {
    await assert.rejects(
      () => discovery.getPublishedProduct(productId),
      (error: unknown) =>
        error instanceof AppError && error.code === "NOT_FOUND",
      `${label} is still not readable after the restart`,
    );
  }

  // B3: the published snapshot is still authoritative over the draft edit.
  const workingCopy = await catalog.getById(handoff.publishedProductId);

  assert.equal(
    workingCopy.title,
    handoff.editedDraftTitle,
    "the draft edit survived the restart",
  );
  assert.equal(
    workingCopy.state,
    "REVIEW_REQUIRED",
    "the product is still in review, not republished",
  );

  const versionRows = await database.query<{
    version_number: number;
    title: string;
  }>(
    "select version_number, title from catalog_versions where product_id = $1 order by version_number asc",
    [handoff.publishedProductId],
  );

  assert.equal(
    versionRows.length,
    1,
    "the draft edit still wrote no version",
  );
  assert.equal(
    versionRows[0].title,
    handoff.publishedTitle,
    "and the one version still records what buyers were shown",
  );

  // B4: the search rules are still the search rules, through the real index.
  const materialSearch = await discovery.search(
    parseDiscoveryQuery({ search: handoff.materialToken }),
  );

  assert.equal(materialSearch.total, 0, "materials are still not searched");

  const percentSearch = await discovery.search(
    parseDiscoveryQuery({ search: `%${handoff.probeToken}%` }),
  );

  assert.equal(
    percentSearch.total,
    0,
    "a percent sign is still a literal after the restart",
  );

  // B5: the inquiry survived, pinned to the version it was made against.
  const reloaded = await inquiry.getOwn(
    handoff.inquiryId,
    handoff.buyerId,
  );

  assert.equal(reloaded.buyerId, handoff.buyerId, "it still belongs to the buyer");
  assert.equal(
    reloaded.productId,
    handoff.publishedProductId,
    "it still names the listing the buyer asked about",
  );
  assert.equal(
    reloaded.catalogVersion,
    handoff.publishedVersion,
    "it is still pinned to the published version",
  );
  assert.equal(reloaded.message, handoff.inquiryMessage, "the message survived");
  assert.equal(reloaded.status, "NEW", "the status survived");

  // B6: the deduplication is durable, not in-process.
  const retried = await inquiry.create({
    productId: handoff.publishedProductId,
    message: "Sent again after a dropped response.",
    idempotencyKey: handoff.idempotencyKey,
    buyerId: handoff.buyerId,
  });

  assert.equal(
    retried.created,
    false,
    "a retry in a brand new process still converges",
  );
  assert.equal(
    retried.inquiry.id,
    handoff.inquiryId,
    "and it converges on the same inquiry",
  );
  assert.equal(
    retried.inquiry.message,
    handoff.inquiryMessage,
    "with the original message unchanged",
  );

  const rows = await database.query<{ count: string | number }>(
    "select count(*) as count from inquiries where buyer_id = $1 and idempotency_key = $2",
    [handoff.buyerId, handoff.idempotencyKey],
  );

  assert.equal(
    Number(rows[0].count),
    1,
    "still exactly one row for that buyer and key",
  );

  // B7: another actor still cannot read it.
  await assert.rejects(
    () => inquiry.getOwn(handoff.inquiryId, randomUUID()),
    (error: unknown) =>
      error instanceof AppError && error.code === "NOT_FOUND",
    "another buyer still cannot read the inquiry after the restart",
  );

  // B8: the second buyer's own inquiry is separate and still theirs.
  const otherList = await inquiry.listOwn(handoff.otherBuyerId, {});

  assert.equal(otherList.total, 1, "the other buyer still has their own inquiry");
  assert.notEqual(
    otherList.inquiries[0].id,
    handoff.inquiryId,
    "and it is not the first buyer's record",
  );

  // B9: the constraints survived the restart too.
  await assertSchema(database);

  await assert.rejects(
    () =>
      database.query(
        `insert into inquiries (
           id, buyer_id, product_id, catalog_version, message, status,
           idempotency_key, created_at, updated_at
         )
         values (
           gen_random_uuid(), $1, $2, 99, 'written directly', 'NEW',
           $3, now(), now()
         )`,
        [handoff.buyerId, handoff.publishedProductId, `m6-fk-post-${handoff.ownerId}`],
      ),
    "the published-version foreign key still refuses a version that does not exist",
  );

  console.log("M6 BUYER JOURNEY POSTGRES READ-AFTER-RESTART PHASE PASSED");
}

/**
 * Migration `007` and the catalog versioning it builds on, as the server
 * actually holds them.
 *
 * These are the objects M6's behavior depends on rather than merely prefers:
 * the trigram search index, which is what keeps the published search from
 * being a sequential scan; the published-at index, which is what makes
 * newest-first answerable without sorting the whole catalog; and the two
 * inquiry indexes, one of which is the deduplication guarantee. If any of
 * them is missing, the behavior above would still pass on a small database,
 * which is exactly why the shape is checked here as well.
 */
async function assertSchema(database: PostgresDatabase): Promise<void> {
  const extension = await database.query<{ extname: string }>(
    "select extname from pg_extension where extname = 'pg_trgm'",
  );

  assert.equal(
    extension.length,
    1,
    "pg_trgm is installed, so the search index has an operator class to use",
  );

  const indexes = await database.query<{ indexname: string; indexdef: string }>(
    `select indexname, indexdef
     from pg_indexes
     where schemaname = 'public'
       and indexname = any($1::text[])`,
    [
      [
        "catalog_versions_search_text_idx",
        "catalog_versions_published_at_idx",
        "catalog_products_published_version_idx",
        "inquiries_buyer_idempotency_idx",
        "inquiries_buyer_recent_idx",
      ],
    ],
  );

  const byName = new Map(
    indexes.map((entry) => [entry.indexname, entry.indexdef]),
  );

  const searchIndex = byName.get("catalog_versions_search_text_idx");

  assert.ok(searchIndex, "the published search index exists");
  assert.match(searchIndex, /using gin/i, "and it is a GIN index");
  assert.match(
    searchIndex,
    /gin_trgm_ops/i,
    "with the trigram operator class, not a btree default",
  );
  assert.match(
    searchIndex,
    /lower\(/i,
    "over the lower-cased search text, so case-insensitivity is in the index",
  );
  assert.match(
    searchIndex,
    /COALESCE\(title/i,
    "covering the published title",
  );
  assert.match(
    searchIndex,
    /COALESCE\(description/i,
    "covering the published description",
  );
  assert.match(
    searchIndex,
    /COALESCE\(category/i,
    "covering the published category",
  );
  assert.doesNotMatch(
    searchIndex,
    /material/i,
    "and not the materials, which cannot be in an immutable expression",
  );

  assert.match(
    byName.get("catalog_versions_published_at_idx") ?? "",
    /published_at DESC,\s*product_id/i,
    "the published read is ordered newest-first with a total tie-break",
  );
  assert.match(
    byName.get("catalog_products_published_version_idx") ?? "",
    /WHERE \(published_version IS NOT NULL\)/i,
    "the narrow published-visibility filter is partial, not a full scan of every product",
  );
  assert.match(
    byName.get("inquiries_buyer_idempotency_idx") ?? "",
    /CREATE UNIQUE INDEX/i,
    "the buyer's retry key is unique in the database, not only in the service",
  );
  assert.match(
    byName.get("inquiries_buyer_idempotency_idx") ?? "",
    /\(buyer_id, idempotency_key\)/i,
    "scoped per buyer, so two buyers may use the same key",
  );
  assert.match(
    byName.get("inquiries_buyer_recent_idx") ?? "",
    /buyer_id, created_at DESC, id/i,
    "the buyer's own list is ordered by a total order as well",
  );

  const constraints = await database.query<{
    conname: string;
    condef: string;
  }>(
    `select conname, pg_get_constraintdef(oid) as condef
     from pg_constraint
     where conrelid = 'inquiries'::regclass`,
  );

  const constraintByName = new Map(
    constraints.map((entry) => [entry.conname, entry.condef]),
  );

  assert.match(
    constraintByName.get("inquiries_published_version_fkey") ?? "",
    /FOREIGN KEY \(product_id, catalog_version\)/i,
    "an inquiry is constrained to a real catalog version row",
  );
  assert.match(
    constraintByName.get("inquiries_published_version_fkey") ?? "",
    /catalog_versions\(product_id, version_number\)/i,
    "referencing the version by product and version number",
  );
  assert.match(
    constraintByName.get("inquiries_status_check") ?? "",
    /status = 'NEW'/i,
    "the database accepts only the statuses the server can produce",
  );
  assert.match(
    constraintByName.get("inquiries_message_check") ?? "",
    new RegExp(
      `length\\(message\\) <= ${INQUIRY_MESSAGE_MAX_LENGTH}`,
      "i",
    ),
    "the database's message bound equals the contract's",
  );
  assert.match(
    constraintByName.get("inquiries_idempotency_check") ?? "",
    /TRIM\(BOTH FROM idempotency_key\)/i,
    "a blank retry key is refused by the database too",
  );
}

/**
 * The error a call raised, for comparing one refusal against another.
 */
async function captureError(
  operation: () => Promise<unknown>,
): Promise<AppError> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected the call to be refused, but it succeeded.");
}

async function main(): Promise<void> {
  const [phase, handoffPath] = process.argv.slice(2);

  if (!phase || !handoffPath) {
    throw new Error(
      "Usage: buyer-journey-postgres-runtime.test.ts <write|read> <handoff-path>",
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