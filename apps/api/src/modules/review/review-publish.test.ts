import assert from 'node:assert/strict';
import type {
  CatalogProductResponse,
  GetProductReviewResponse,
} from '@artisan-marketplace/contracts';
import { CatalogService } from '../catalog/application/catalog-service.js';
import { InMemoryCatalogRepository } from '../catalog/infrastructure/in-memory-catalog-repository.js';
import { AiPipelineService } from '../ai/application/ai-pipeline-service.js';
import { AiReviewService } from '../ai/application/ai-review-service.js';
import { InMemoryAiRepository } from '../ai/infrastructure/in-memory-ai-repository.js';
import { DeterministicCatalogAiProvider } from '../ai/infrastructure/deterministic-catalog-ai-provider.js';
import { CatalogServiceCatalogProductPort } from '../ai/infrastructure/catalog-service-port.js';
import { ReviewService } from './application/review-service.js';
import { CatalogServiceReviewProductPort } from './infrastructure/catalog-review-port.js';
import { AiRepositoryReviewSuggestionsPort } from './infrastructure/ai-suggestions-port.js';

const ARTISAN = 'artisan-1';
const OTHER = 'artisan-2';

/**
 * The whole M5 journey wired the way the composition root wires it, over real
 * modules and real in-memory storage.
 *
 * The fakes in the other review tests exist to isolate one rule each. This
 * one deliberately does not, because the journey's whole risk is in the
 * seams between the modules: proposals come from AI, the product lives in
 * Catalog, and approval is only meaningful if it read the same suggestions
 * the artisan just decided. A test that mocked either side would pass while
 * the real path was broken.
 */
type Journey = {
  catalog: CatalogService;
  review: ReviewService;
  ai: AiReviewService;
  pipeline: AiPipelineService;
  productId: string;
};

function buildJourney(): Journey {
  const catalog = new CatalogService(
    new InMemoryCatalogRepository(),
  );
  const repository = new InMemoryAiRepository();
  const catalogPort = new CatalogServiceCatalogProductPort(
    catalog,
  );

  return {
    catalog,
    review: new ReviewService(
      new CatalogServiceReviewProductPort(catalog),
      new AiRepositoryReviewSuggestionsPort(repository),
    ),
    ai: new AiReviewService(repository, catalogPort),
    pipeline: new AiPipelineService(
      repository,
      new DeterministicCatalogAiProvider(),
      catalogPort,
    ),
    productId: '',
  };
}

/**
 * A product that has finished syncing, which is the state AI work may be
 * started from and the state approval may be reached from.
 */
async function syncedProduct(
  journey: Journey,
  overrides: {
    title?: string;
    description?: string;
  } = {},
): Promise<string> {
  const draft = (
    await journey.catalog.createDraft({
      ownerId: ARTISAN,
      title: overrides.title ?? 'Basket',
      description: overrides.description ?? '',
    })
  ).product;

  for (const state of [
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
  ] as const) {
    await journey.catalog.transition(draft.id, state, ARTISAN);
  }

  return draft.id;
}

async function runAi(
  journey: Journey,
  productId: string,
  key: string,
): Promise<readonly { field: string; id: string }[]> {
  const { job } = await journey.pipeline.enqueue({
    productId,
    actorId: ARTISAN,
    idempotencyKey: key,
    correlationId: 'corr-1',
    transcription:
      'A basket woven by hand from local bamboo.',
  });

  const run = await journey.pipeline.run(job.id, ARTISAN);

  assert.equal(
    run.job.state,
    'SUCCEEDED',
    'the scripted provider answers, so the journey reaches proposals',
  );

  return run.proposals.map((proposal) => ({
    field: proposal.field,
    id: proposal.id,
  }));
}

function fieldsOf(
  proposals: readonly { field: string }[],
): string[] {
  return proposals.map((proposal) => proposal.field).sort();
}

function reviewOf(
  review: GetProductReviewResponse,
  field: string,
) {
  const match = review.suggestions.find(
    (suggestion) => suggestion.field === field,
  );

  assert.ok(
    match,
    `the review surface reports the outstanding ${field} suggestion`,
  );

  return match;
}

async function testSuggestionsBlockApproval(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey);

  const proposals = await runAi(journey, productId, 'key-1');

  assert.ok(
    proposals.length > 0,
    'the journey has suggestions to decide',
  );

  const review = await journey.review.getReview(
    productId,
    ARTISAN,
  );

  assert.equal(
    review.suggestions.length,
    proposals.length,
    'every outstanding proposal reaches the review surface',
  );
  assert.equal(
    review.readyForApproval,
    false,
    'an unreviewed product is not approvable',
  );
  assert.ok(
    review.blocking.some(
      (entry) => entry.reason === 'UNDECIDED_PROPOSAL',
    ),
    'the outstanding suggestions are named as the blocker',
  );
  assert.ok(
    review.blocking.some(
      (entry) => entry.reason === 'MISSING_PUBLISH_FIELD',
    ),
    'the empty description is named separately, because no decision fixes it',
  );

  await assert.rejects(
    () => journey.review.approve(productId, ARTISAN),
    /not ready to be approved/,
    'approval is refused while suggestions are outstanding',
  );

  const after = await journey.catalog.getById(productId);

  assert.equal(
    after.state,
    'REVIEW_REQUIRED',
    'a refused approval leaves the product where it was',
  );
}

async function testSuggestionsCarryProvenance(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey);

  await runAi(journey, productId, 'key-1');

  const review = await journey.review.getReview(
    productId,
    ARTISAN,
  );
  const title = reviewOf(review, 'title');

  assert.equal(
    title.provider,
    'deterministic-local',
    'a suggestion names the provider that produced it',
  );
  assert.ok(
    title.model.length > 0,
    'a suggestion names the model',
  );
  assert.ok(
    title.promptVersion.length > 0 &&
      title.schemaVersion.length > 0 &&
      title.pipelineVersion.length > 0,
    'a suggestion names the versions needed to reproduce it',
  );
  assert.equal(
    title.currentValue,
    'Basket',
    'a suggestion is reported against the value it would replace',
  );
  assert.equal(
    title.proposedValue,
    'Basket',
    'the provider echoes the existing title when there is one',
  );
}

async function testEditingTheProductMakesASuggestionStale(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey);

  await runAi(journey, productId, 'key-1');

  const before = await journey.review.getReview(
    productId,
    ARTISAN,
  );

  assert.equal(
    reviewOf(before, 'title').stale,
    false,
    'a suggestion made against the current value is current',
  );

  await journey.catalog.update(productId, ARTISAN, {
    title: 'Basket, Large',
  });

  const after = await journey.review.getReview(
    productId,
    ARTISAN,
  );

  assert.equal(
    reviewOf(after, 'title').stale,
    true,
    'a suggestion made against a value the product has moved on from is stale',
  );
  assert.equal(
    reviewOf(after, 'title').currentValue,
    'Basket, Large',
    'the stale suggestion still shows what it would now replace',
  );
}

async function testStalenessIsMeasuredPerJobSnapshot(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey);

  await runAi(journey, productId, 'key-1');

  await journey.catalog.update(productId, ARTISAN, {
    title: 'Basket, Large',
  });

  /**
   * A second run after the edit captures the new value, so its own proposal
   * is current even though the first run's proposal for the same field is
   * stale. Staleness is therefore per job, not per field, and collapsing the
   * two would let a stale suggestion look current because a newer one exists.
   */
  await runAi(journey, productId, 'key-2');

  const review = await journey.review.getReview(
    productId,
    ARTISAN,
  );
  const titles = review.suggestions.filter(
    (suggestion) => suggestion.field === 'title',
  );

  assert.equal(
    titles.length,
    2,
    'both runs’ title suggestions are outstanding decisions',
  );
  assert.deepEqual(
    titles.map((suggestion) => suggestion.stale).sort(),
    [false, true],
    'one is current against its own snapshot and one is stale',
  );
  assert.ok(
    review.blocking.some(
      (entry) =>
        entry.reason === 'UNDECIDED_PROPOSAL' &&
        entry.field === 'title',
    ),
    'a field with an outstanding suggestion is one decision, not two',
  );
}

async function testDecidedSuggestionsStopBlocking(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey);
  const proposals = await runAi(journey, productId, 'key-1');

  await journey.ai.applyDecisions(
    productId,
    ARTISAN,
    proposals.map((proposal) => ({
      proposalId: proposal.id,
      decision: 'REJECTED' as const,
    })),
  );

  const review = await journey.review.getReview(
    productId,
    ARTISAN,
  );

  assert.deepEqual(
    review.suggestions,
    [],
    'a decided suggestion is no longer outstanding',
  );
  assert.equal(
    review.blocking.some(
      (entry) => entry.reason === 'UNDECIDED_PROPOSAL',
    ),
    false,
    'nothing outstanding means nothing to decide',
  );
  assert.equal(
    review.blocking.some(
      (entry) => entry.reason === 'MISSING_PUBLISH_FIELD',
    ),
    true,
    'rejecting suggestions does not supply the missing description',
  );
}

async function testApproveThenPublish(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey);
  const proposals = await runAi(journey, productId, 'key-1');

  /**
   * The artisan corrects rather than accepts, which is the ordinary case and
   * the one that exercises the boundary: the value that reaches the product
   * is the artisan's, and the model's is kept only as evidence.
   */
  await journey.ai.applyDecisions(
    productId,
    ARTISAN,
    proposals.map((proposal) => ({
      proposalId: proposal.id,
      decision: 'EDITED' as const,
      value: `Edited ${proposal.field}`,
    })),
  );

  await journey.review.approve(productId, ARTISAN);

  const published = await journey.catalog.publish(
    productId,
    ARTISAN,
    'publish-key-1',
  );

  assert.equal(
    published.product.state,
    'PUBLISHED',
    'an approved product publishes',
  );
  assert.equal(
    published.version.versionNumber,
    1,
    'the first publish is version 1',
  );
  assert.equal(
    published.version.title,
    'Edited title',
    'the version snapshots the value the artisan confirmed',
  );
  assert.equal(
    published.version.publishedBy,
    ARTISAN,
    'the version records who authorized publication',
  );
}

async function testApprovalIsRefusedWithoutADescription(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey);

  await assert.rejects(
    () => journey.review.approve(productId, ARTISAN),
    /not ready to be approved/,
    'a product with no description is not approvable, however reviewed it is',
  );
}

async function testApprovalIsRefusedForAnotherArtisan(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey, {
    description: 'Handwoven storage basket.',
  });

  await assert.rejects(
    () => journey.review.getReview(productId, OTHER),
    /belongs to another artisan/,
  );
  await assert.rejects(
    () => journey.review.approve(productId, OTHER),
    /belongs to another artisan/,
  );

  const unchanged = await journey.catalog.getById(productId);

  assert.equal(
    unchanged.state,
    'REVIEW_REQUIRED',
    'another artisan’s refusal leaves the product where it was',
  );
}

async function testAlreadyApprovedProductIsReviewedButNotBlocked(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey, {
    description: 'Handwoven storage basket.',
  });

  await journey.review.approve(productId, ARTISAN);

  const review = await journey.review.getReview(
    productId,
    ARTISAN,
  );

  assert.equal(
    review.product.state,
    'APPROVED',
    'the review surface reports the state approval established',
  );
  assert.equal(
    review.readyForApproval,
    true,
    'an approved product is not blocked by having reached its goal',
  );

  const retry = await journey.review.approve(productId, ARTISAN);

  assert.equal(
    retry.deduplicated,
    true,
    'a retry converges rather than failing, so a dropped response is safe',
  );

  /**
   * The bound the Review module's known gap rests on, asserted through the
   * real services rather than in the AI module's own fixture: once approval
   * has happened, no new job can be created for the product, so no proposal
   * can appear after the check that produced the approval. Only a job
   * enqueued before it and still running remains.
   */
  await assert.rejects(
    () =>
      journey.pipeline.enqueue({
        productId,
        actorId: ARTISAN,
        idempotencyKey: 'key-after-approval',
        correlationId: 'corr-1',
      }),
    /not available for a product in state APPROVED/,
    'an approved product cannot start new AI work',
  );
}

async function testRepublishCreatesANewVersion(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey, {
    description: 'Handwoven storage basket.',
  });

  await journey.review.approve(productId, ARTISAN);

  const first = await journey.catalog.publish(
    productId,
    ARTISAN,
    'publish-key-1',
  );

  assert.equal(first.version.versionNumber, 1);

  await journey.catalog.transition(
    productId,
    'REVIEW_REQUIRED',
    ARTISAN,
  );
  await journey.catalog.update(productId, ARTISAN, {
    title: 'Basket, Large',
  });
  await journey.review.approve(productId, ARTISAN);

  const second = await journey.catalog.publish(
    productId,
    ARTISAN,
    'publish-key-2',
  );

  assert.equal(
    second.version.versionNumber,
    2,
    'a change to a published product creates a new version',
  );
  assert.equal(second.version.title, 'Basket, Large');

  const versions = await journey.catalog.listVersions(
    productId,
    ARTISAN,
  );

  assert.equal(
    versions.length,
    2,
    'the earlier version is history, not overwritten',
  );
  assert.deepEqual(
    versions.map((version) => version.versionNumber),
    [2, 1],
    'versions are listed newest first, in both implementations',
  );
  assert.equal(
    versions[1]!.title,
    'Basket',
    'the first version still says what buyers were first shown',
  );
  assert.notEqual(
    versions[0]!.id,
    versions[1]!.id,
    'each version is its own record rather than a row that was rewritten',
  );
}

async function testPublishIsRefusedForUnapprovedProduct(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey, {
    description: 'Handwoven storage basket.',
  });

  await assert.rejects(
    () =>
      journey.catalog.publish(
        productId,
        ARTISAN,
        'publish-key-1',
      ),
    /cannot be published/i,
    'publication still requires the approval step',
  );
}

async function testReviewReportsPublishedVersion(): Promise<void> {
  const journey = buildJourney();
  const productId = await syncedProduct(journey, {
    description: 'Handwoven storage basket.',
  });

  await journey.review.approve(productId, ARTISAN);
  await journey.catalog.publish(
    productId,
    ARTISAN,
    'publish-key-1',
  );

  await journey.catalog.transition(
    productId,
    'REVIEW_REQUIRED',
    ARTISAN,
  );

  const review = await journey.review.getReview(
    productId,
    ARTISAN,
  );

  assert.equal(
    (review.product as CatalogProductResponse)
      .publishedVersion,
    1,
    'a re-review still reports the version buyers are seeing',
  );
  assert.equal(
    review.blocking.some(
      (entry) => entry.reason === 'PRODUCT_NOT_APPROVABLE',
    ),
    false,
    'a product returned to review is approvable again, so its state is not a blocker',
  );
  assert.equal(
    review.readyForApproval,
    true,
    'a re-review of a corrected product can be approved without new suggestions',
  );
}

async function main(): Promise<void> {
  const tests = [
    testSuggestionsBlockApproval,
    testSuggestionsCarryProvenance,
    testEditingTheProductMakesASuggestionStale,
    testStalenessIsMeasuredPerJobSnapshot,
    testDecidedSuggestionsStopBlocking,
    testApproveThenPublish,
    testApprovalIsRefusedWithoutADescription,
    testApprovalIsRefusedForAnotherArtisan,
    testAlreadyApprovedProductIsReviewedButNotBlocked,
    testRepublishCreatesANewVersion,
    testPublishIsRefusedForUnapprovedProduct,
    testReviewReportsPublishedVersion,
  ];

  for (const test of tests) {
    await test();
  }

  console.log(
    'REVIEW TO PUBLISH JOURNEY TESTS PASSED',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
