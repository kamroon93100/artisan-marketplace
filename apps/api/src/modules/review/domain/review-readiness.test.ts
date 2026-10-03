import assert from 'node:assert/strict';
import type {
  CatalogProductResponse,
  ProductState,
  ReviewSuggestion,
} from '@artisan-marketplace/contracts';
import {
  PUBLISH_REQUIRED_FIELDS,
  assertApprovableState,
} from '../../catalog/domain/catalog-publish.js';
import { CatalogService } from '../../catalog/application/catalog-service.js';
import { InMemoryCatalogRepository } from '../../catalog/infrastructure/in-memory-catalog-repository.js';
import { AppError } from '../../../shared/errors/app-error.js';
import {
  REVIEW_REQUIRED_FIELDS,
  currentValueFor,
  evaluateApprovalReadiness,
} from './review-readiness.js';
import type { ReviewProductSnapshot } from './review-readiness.js';
import { ReviewService } from '../application/review-service.js';
import { CatalogServiceReviewProductPort } from '../infrastructure/catalog-review-port.js';
import type {
  ReviewProductPort,
  ReviewSuggestionsPort,
} from '../application/review-port.js';

const PRODUCT_ID = '00000000-0000-4000-8000-0000000000a1';
const ARTISAN = 'artisan-1';
const OTHER = 'artisan-2';

function product(
  overrides: Partial<ReviewProductSnapshot> = {},
): ReviewProductSnapshot {
  return {
    id: PRODUCT_ID,
    ownerId: ARTISAN,
    title: 'Bamboo Basket',
    description: 'Handwoven storage basket.',
    category: 'basketry',
    materials: ['bamboo'],
    state: 'REVIEW_REQUIRED',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    publishedVersion: null,
    ...overrides,
  };
}

function suggestion(
  overrides: Partial<ReviewSuggestion> = {},
): ReviewSuggestion {
  return {
    proposalId: 'proposal-1',
    jobId: 'job-1',
    attempt: 1,
    field: 'title',
    proposedValue: 'Handwoven Bamboo Basket',
    currentValue: 'Bamboo Basket',
    confidence: 0.9,
    riskLevel: 'LOW',
    riskReasons: [],
    stale: false,
    provider: 'deterministic-local',
    model: 'deterministic-local-v1',
    modelVersion: null,
    promptVersion: 'prompt-v1',
    schemaVersion: 'schema-v1',
    pipelineVersion: 'pipeline-v1',
    ...overrides,
  };
}

async function expectAppError(
  operation: () => Promise<unknown>,
  code: string,
): Promise<AppError> {
  try {
    await operation();
  } catch (error) {
    assert.ok(
      error instanceof AppError,
      `Expected an AppError, got ${String(error)}.`,
    );
    assert.equal(error.code, code);

    return error;
  }

  throw new Error(
    `Expected ${code}, but the operation succeeded.`,
  );
}

/**
 * A suggestions port that returns what the test hands it, so the service is
 * exercised without the AI module in the way. Which suggestions exist is the
 * AI module's business; the tests for that projection live with the adapter.
 */
class FixedSuggestions implements ReviewSuggestionsPort {
  constructor(
    private readonly suggestions: readonly ReviewSuggestion[] = [],
  ) {}

  async listUndecided(): Promise<readonly ReviewSuggestion[]> {
    return this.suggestions;
  }
}

/**
 * A Catalog port that records the approve call, so a test can assert what the
 * Review module asked of the Catalog module and not only what came back.
 */
class RecordingCatalogPort implements ReviewProductPort {
  readonly approved: string[] = [];

  constructor(
    private readonly stored: ReviewProductSnapshot,
    private readonly changed = true,
  ) {}

  async readProduct(): Promise<ReviewProductSnapshot> {
    return this.stored;
  }

  async approve(
    productId: string,
    actorId: string,
  ): Promise<{
    product: ReviewProductSnapshot;
    changed: boolean;
  }> {
    this.approved.push(`${productId}:${actorId}`);

    return {
      product: this.changed
        ? { ...this.stored, state: 'APPROVED' }
        : this.stored,
      changed: this.changed,
    };
  }
}

function serviceWith(
  catalog: ReviewProductPort,
  suggestions: ReviewSuggestionsPort = new FixedSuggestions(),
): ReviewService {
  return new ReviewService(catalog, suggestions);
}

function testRequiredFieldsMatchPublication(): void {
  /**
   * The review surface keeps its own list of required fields rather than
   * importing the Catalog module's, so the two could drift. This is the
   * check that stops them: the list a review surface tells an artisan to
   * fill in has to be the list publication will actually enforce.
   */
  assert.deepEqual(
    [...REVIEW_REQUIRED_FIELDS].sort(),
    [...PUBLISH_REQUIRED_FIELDS].sort(),
    'the review surface reports the required fields publication enforces',
  );
}

function testApprovableStatesAgreeWithCatalog(): void {
  /**
   * Readiness keeps its own list of approvable states. The Catalog module's
   * own assertion is the authority, so rather than comparing two lists this
   * asks each state what the Catalog module would do and requires the review
   * surface to agree.
   *
   * `APPROVED` is the one deliberate divergence and is excluded here: the
   * domain precondition refuses it, because an already-approved product does
   * not need approving again, while `CatalogService.approve` returns before
   * reaching that precondition so a retry converges. Readiness follows the
   * service, not the assertion, because the retry is what a client actually
   * does. `testAlreadyApprovedConvergesOnTheRealService` is what holds that
   * two together.
   */
  const states: ProductState[] = [
    'LOCAL_DRAFT',
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
    'PUBLISHED',
    'ARCHIVED',
    'CONFLICT',
    'ACTION_REQUIRED',
  ];

  for (const state of states) {
    const catalogApproves = (() => {
      try {
        assertApprovableState(state);
        return true;
      } catch {
        return false;
      }
    })();

    const readiness = evaluateApprovalReadiness(
      product({ state }),
      [],
    );

    assert.equal(
      readiness.readyForApproval,
      catalogApproves,
      `review readiness and catalog approval disagree about ${state}`,
    );
  }
}

function testMissingFieldBlocks(): void {
  for (const field of REVIEW_REQUIRED_FIELDS) {
    const readiness = evaluateApprovalReadiness(
      product({ [field]: null }),
      [],
    );

    assert.equal(
      readiness.readyForApproval,
      false,
      `a product with no ${field} is not approvable`,
    );
    assert.ok(
      readiness.blocking.some(
        (entry) =>
          entry.reason === 'MISSING_PUBLISH_FIELD' &&
          entry.field === field,
      ),
      `a missing ${field} is reported as a missing field, not as an undecided suggestion`,
    );
  }

  assert.equal(
    evaluateApprovalReadiness(
      product({ title: '   ' }),
      [],
    ).readyForApproval,
    false,
    'whitespace is not a title',
  );
}

function testUndecidedProposalBlocks(): void {
  const readiness = evaluateApprovalReadiness(product(), [
    suggestion(),
  ]);

  assert.equal(readiness.readyForApproval, false);
  assert.ok(
    readiness.blocking.some(
      (entry) => entry.reason === 'UNDECIDED_PROPOSAL',
    ),
    'an undecided suggestion blocks approval',
  );
}

function testUndecidedProposalIsReportedOncePerField(): void {
  const readiness = evaluateApprovalReadiness(product(), [
    suggestion({ proposalId: 'p1', field: 'title' }),
    suggestion({ proposalId: 'p2', field: 'title' }),
  ]);

  assert.equal(
    readiness.blocking.filter((entry) => entry.field === 'title')
      .length,
    1,
    'two jobs proposing the same field is one field to decide, not two',
  );
}

function testConfidenceCannotResolveABlocker(): void {
  /**
   * ADR-002: confidence is routing information, not approval. A suggestion
   * the model is certain about is still a decision nobody has made.
   */
  const readiness = evaluateApprovalReadiness(product(), [
    suggestion({ confidence: 1 }),
  ]);

  assert.equal(
    readiness.readyForApproval,
    false,
    'a high-confidence suggestion still has to be decided',
  );
}

function testNoBlockersWhenReviewed(): void {
  const readiness = evaluateApprovalReadiness(product(), []);

  assert.equal(readiness.readyForApproval, true);
  assert.deepEqual(readiness.blocking, []);
}

function testNonApprovableStateBlocks(): void {
  const readiness = evaluateApprovalReadiness(
    product({ state: 'PUBLISHED' }),
    [],
  );

  assert.equal(readiness.readyForApproval, false);
  assert.ok(
    readiness.blocking.some(
      (entry) => entry.reason === 'PRODUCT_NOT_APPROVABLE',
    ),
    'a published product is reported as not approvable',
  );
}

function testCurrentValueDistinguishesAbsentFromEmpty(): void {
  assert.equal(
    currentValueFor(product({ title: null }), 'title'),
    null,
    'an unset field is nothing there yet',
  );
  assert.equal(
    currentValueFor(product({ title: '  ' }), 'title'),
    null,
    'a blank field is nothing there yet',
  );
  assert.equal(
    currentValueFor(product({ materials: [] }), 'materials'),
    null,
    'an empty material list is nothing there yet',
  );
  assert.deepEqual(
    currentValueFor(
      product({ materials: ['bamboo'] }),
      'materials',
    ),
    ['bamboo'],
  );
}

async function testGetReviewReportsCanonicalValues(): Promise<void> {
  const service = serviceWith(
    new RecordingCatalogPort(product()),
    new FixedSuggestions([
      suggestion({ proposedValue: 'Bamboo Basket, Large' }),
    ]),
  );

  const review = await service.getReview(PRODUCT_ID, ARTISAN);

  assert.equal(review.product.id, PRODUCT_ID);
  assert.equal(
    review.suggestions[0].currentValue,
    'Bamboo Basket',
    'a suggestion is reported against the value it would replace',
  );
  assert.equal(
    review.suggestions[0].proposedValue,
    'Bamboo Basket, Large',
  );
  assert.equal(
    review.suggestions[0].stale,
    false,
    'staleness is reported by the AI module and is not invented here',
  );
  assert.equal(review.readyForApproval, false);
}

async function testProductResponseIsNotFabricated(): Promise<void> {
  const stored = product({ publishedVersion: 2 });
  const service = serviceWith(
    new RecordingCatalogPort(stored),
  );

  const review = await service.getReview(PRODUCT_ID, ARTISAN);

  assert.equal(
    review.product.createdAt,
    stored.createdAt,
    'the review response reports the real creation time',
  );
  assert.equal(review.product.updatedAt, stored.updatedAt);
  assert.equal(
    review.product.publishedVersion,
    2,
    'a re-review of a published product still reports its version',
  );
}

async function testApproveSucceedsWhenNothingOutstanding(): Promise<void> {
  const catalog = new RecordingCatalogPort(product());
  const service = serviceWith(catalog);

  const result = await service.approve(PRODUCT_ID, ARTISAN);

  assert.deepEqual(
    catalog.approved,
    [`${PRODUCT_ID}:${ARTISAN}`],
    'approval is delegated to the Catalog module with the actor',
  );
  assert.equal(result.deduplicated, false);
  assert.equal(result.product.state, 'APPROVED');
}

async function testApproveRefusesOutstandingSuggestion(): Promise<void> {
  const catalog = new RecordingCatalogPort(product());
  const service = serviceWith(
    catalog,
    new FixedSuggestions([suggestion()]),
  );

  const error = await expectAppError(
    () => service.approve(PRODUCT_ID, ARTISAN),
    'CONFLICT',
  );

  assert.deepEqual(
    catalog.approved,
    [],
    'a refused approval must not reach the Catalog module at all',
  );
  assert.ok(
    Array.isArray(
      (error.details as { blocking?: unknown }).blocking,
    ),
    'the refusal says what is blocking, not only that something is',
  );
}

async function testApproveRefusesMissingField(): Promise<void> {
  const catalog = new RecordingCatalogPort(
    product({ description: null }),
  );
  const service = serviceWith(catalog);

  await expectAppError(
    () => service.approve(PRODUCT_ID, ARTISAN),
    'CONFLICT',
  );

  assert.deepEqual(catalog.approved, []);
}

async function testGetReviewRefusesAnotherArtisansProduct(): Promise<void> {
  const service = serviceWith(new RecordingCatalogPort(product()));

  await expectAppError(
    () => service.getReview(PRODUCT_ID, OTHER),
    'FORBIDDEN',
  );
}

async function testApproveRefusesAnotherArtisansProduct(): Promise<void> {
  const catalog = new RecordingCatalogPort(product());
  const service = serviceWith(catalog);

  await expectAppError(
    () => service.approve(PRODUCT_ID, OTHER),
    'FORBIDDEN',
  );

  assert.deepEqual(
    catalog.approved,
    [],
    'ownership is refused before the Catalog module is asked to write',
  );
}

async function testMissingProductIsNotFound(): Promise<void> {
  const service = serviceWith({
    async readProduct() {
      return null;
    },
    async approve(): Promise<{
      product: CatalogProductResponse;
      changed: boolean;
    }> {
      throw new Error(
        'approve must not be reached for a missing product.',
      );
    },
  });

  await expectAppError(
    () => service.getReview(PRODUCT_ID, ARTISAN),
    'NOT_FOUND',
  );
}

/**
 * Drives a real product all the way to APPROVED through the real service, so
 * the convergence check below runs against the Catalog module rather than
 * against a port that was written to agree.
 */
async function realApprovedProduct(
  service: CatalogService,
): Promise<CatalogProductResponse> {
  const draft = (
    await service.createDraft({
      ownerId: ARTISAN,
      title: 'Bamboo Basket',
      description: 'Handwoven storage basket.',
    })
  ).product;

  for (const state of [
    'PENDING_SYNC',
    'SYNCED',
    'REVIEW_REQUIRED',
  ] as const) {
    await service.transition(draft.id, state, ARTISAN);
  }

  await service.approve(draft.id, ARTISAN);

  return service.getById(draft.id);
}

async function testAlreadyApprovedConvergesOnTheRealService(): Promise<void> {
  const service = new CatalogService(
    new InMemoryCatalogRepository(),
  );

  const approved = await realApprovedProduct(service);

  const review = serviceWith(
    new CatalogServiceReviewProductPort(service),
  );

  const readiness = await review.getReview(
    approved.id,
    ARTISAN,
  );

  assert.equal(
    readiness.readyForApproval,
    true,
    'an approved product is not blocked by having reached its goal',
  );

  const retry = await review.approve(approved.id, ARTISAN);

  assert.equal(
    retry.deduplicated,
    true,
    'a retry after a dropped response converges instead of failing',
  );
  assert.equal(retry.product.state, 'APPROVED');
}

async function main(): Promise<void> {
  const tests: (() => void | Promise<void>)[] = [
    testRequiredFieldsMatchPublication,
    testApprovableStatesAgreeWithCatalog,
    testMissingFieldBlocks,
    testUndecidedProposalBlocks,
    testUndecidedProposalIsReportedOncePerField,
    testConfidenceCannotResolveABlocker,
    testNoBlockersWhenReviewed,
    testNonApprovableStateBlocks,
    testCurrentValueDistinguishesAbsentFromEmpty,
    testGetReviewReportsCanonicalValues,
    testProductResponseIsNotFabricated,
    testApproveSucceedsWhenNothingOutstanding,
    testApproveRefusesOutstandingSuggestion,
    testApproveRefusesMissingField,
    testGetReviewRefusesAnotherArtisansProduct,
    testApproveRefusesAnotherArtisansProduct,
    testMissingProductIsNotFound,
    testAlreadyApprovedConvergesOnTheRealService,
  ];

  for (const test of tests) {
    await test();
  }

  console.log(
    'REVIEW READINESS AND SERVICE TESTS PASSED',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
