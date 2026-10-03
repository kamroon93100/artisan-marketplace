import assert from 'node:assert/strict';
import type { CatalogProductSnapshot } from './catalog-product-port.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { AiPipelineService } from './ai-pipeline-service.js';
import { InMemoryAiRepository } from '../infrastructure/in-memory-ai-repository.js';
import { DeterministicCatalogAiProvider } from '../infrastructure/deterministic-catalog-ai-provider.js';
import { AiProviderError } from '../domain/ai-error.js';
import type {
  CatalogAiAttribution,
  CatalogAiProvider,
  CatalogAiRequest,
  CatalogAiResult,
} from '../domain/catalog-ai-provider.js';
import { MemoryCatalogPort } from './catalog-product-port.test-double.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const ARTISAN = 'artisan-1';
const OTHER = 'artisan-2';

function product(
  overrides: Partial<CatalogProductSnapshot> = {},
): CatalogProductSnapshot {
  return {
    id: PRODUCT_ID,
    ownerId: ARTISAN,
    state: 'LOCAL_DRAFT',
    title: 'Bamboo Basket',
    description: null,
    category: null,
    materials: ['bamboo'],
    ...overrides,
  };
}

function build(
  script: ConstructorParameters<typeof DeterministicCatalogAiProvider>[0] = [],
) {
  const repository = new InMemoryAiRepository();
  const provider = new DeterministicCatalogAiProvider(script);
  const catalog = new MemoryCatalogPort(
    new Map([[PRODUCT_ID, product()]]),
  );

  const pipeline = new AiPipelineService(
    repository,
    provider,
    catalog,
  );

  return { repository, provider, catalog, pipeline };
}

async function expectAppError(
  label: string,
  code: string,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(
      error instanceof AppError,
      `${label}: expected an AppError.`,
    );
    assert.equal(error.code, code, `${label}: expected ${code}.`);
    return;
  }

  throw new Error(`${label}: expected an AppError but nothing was raised.`);
}

async function testEnqueueRequiresIdempotencyKey(): Promise<void> {
  const { pipeline } = build();

  await expectAppError(
    'missing idempotency key',
    'VALIDATION_FAILED',
    () =>
      pipeline.enqueue({
        productId: PRODUCT_ID,
        actorId: ARTISAN,
        correlationId: 'corr-1',
      }),
  );
}

async function testEnqueueCapturesSnapshotAndIsIdempotent(): Promise<void> {
  const { pipeline } = build();

  const first = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  assert.ok(first.created, 'a new key must create a job.');
  assert.equal(first.job.state, 'QUEUED');
  assert.equal(first.job.productId, PRODUCT_ID);
  assert.equal(first.job.ownerId, ARTISAN);
  assert.equal(
    first.job.input.product.title,
    'Bamboo Basket',
    'the enqueue must capture the product snapshot.',
  );
  assert.ok(first.job.inputHash.length > 0, 'the input hash must be set.');
  assert.equal(
    first.job.provider,
    'deterministic-local',
    'the provider identity is recorded on the job.',
  );
  assert.equal(
    first.job.maxAttempts,
    3,
    'the default retry budget applies when none is given.',
  );

  const replayed = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-2',
  });

  assert.equal(replayed.created, false, 'a replayed key must not create.');
  assert.equal(
    replayed.job.id,
    first.job.id,
    'the replayed job is the existing one.',
  );

  const secondDedupe = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-2',
    correlationId: 'corr-3',
    maxAttempts: 5,
  });

  assert.equal(secondDedupe.job.maxAttempts, 5, 'the budget is honored.');
}

async function testEnqueueRefusesAnotherOwnersProduct(): Promise<void> {
  const { pipeline } = build();

  await expectAppError(
    'enqueueing another artisan product',
    'FORBIDDEN',
    () =>
      pipeline.enqueue({
        productId: PRODUCT_ID,
        actorId: OTHER,
        idempotencyKey: 'key-x',
        correlationId: 'corr-1',
      }),
  );
}

async function testEnqueueRefusesFrozenProductStates(): Promise<void> {
  const repository = new InMemoryAiRepository();
  const provider = new DeterministicCatalogAiProvider();
  const catalog = new MemoryCatalogPort(
    new Map([
      [
        PRODUCT_ID,
        product({ state: 'PUBLISHED', title: 'Shown' }),
      ],
    ]),
  );

  const pipeline = new AiPipelineService(
    repository,
    provider,
    catalog,
  );

  await expectAppError(
    'enqueueing a PUBLISHED product',
    'CONFLICT',
    () =>
      pipeline.enqueue({
        productId: PRODUCT_ID,
        actorId: ARTISAN,
        idempotencyKey: 'key-x',
        correlationId: 'corr-1',
      }),
  );
}

/**
 * An approved product cannot start new AI work.
 *
 * This is the boundary that keeps the Review module's known gap bounded to
 * one interleaving. Approval says nothing was outstanding when it happened;
 * a job enqueued afterwards writes its proposals after that check, so the
 * product could be published carrying a suggestion no human decided on. With
 * `APPROVED` excluded here, only a job already in flight when the approval
 * happened can produce that interleaving.
 *
 * `REVIEW_REQUIRED` is asserted alongside it so the exclusion cannot later
 * widen into "AI is unavailable once a product has been through review".
 */
async function testEnqueueRefusesAnApprovedProduct(): Promise<void> {
  const repository = new InMemoryAiRepository();
  const provider = new DeterministicCatalogAiProvider();
  const catalog = new MemoryCatalogPort(
    new Map([[PRODUCT_ID, product({ state: 'APPROVED' })]]),
  );

  const pipeline = new AiPipelineService(
    repository,
    provider,
    catalog,
  );

  await expectAppError(
    'enqueueing an APPROVED product',
    'CONFLICT',
    () =>
      pipeline.enqueue({
        productId: PRODUCT_ID,
        actorId: ARTISAN,
        idempotencyKey: 'key-late',
        correlationId: 'corr-1',
      }),
  );

  assert.equal(
    (await repository.listJobsByProduct(PRODUCT_ID)).length,
    0,
    'a refused enqueue creates no job to propose later',
  );

  catalog.setProduct(product({ state: 'REVIEW_REQUIRED' }));

  const { created, job } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-review',
    correlationId: 'corr-2',
  });

  assert.equal(
    created,
    true,
    'a product still in review is where AI assistance belongs',
  );
  assert.equal(job.state, 'QUEUED');
}

async function testRunProducesACompleteResult(): Promise<void> {
  const { pipeline, provider } = build();

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
    transcription: 'Woven from strips of bamboo.',
  });

  const result = await pipeline.run(queued.id, ARTISAN);

  assert.equal(result.job.state, 'SUCCEEDED');
  assert.equal(result.job.attemptCount, 1);
  assert.ok(result.job.completedAt, 'a terminal job records completion.');
  assert.ok(result.job.startedAt, 'an attempt records a start.');
  assert.equal(provider.calls, 1);

  assert.equal(
    result.job.id,
    queued.id,
    'running must not replace the job.',
  );

  const title = result.proposals.find(
    (proposal) => proposal.field === 'title',
  );
  assert.equal(title?.value, 'Bamboo Basket');
  assert.equal(title?.validationStatus, 'VALID');
  assert.equal(title?.decision, 'PENDING');

  const description = result.proposals.find(
    (proposal) => proposal.field === 'description',
  );
  assert.ok(
    description?.value.includes('Woven from strips of bamboo.'),
    'the transcription becomes the description.',
  );

  const materials = result.proposals.find(
    (proposal) => proposal.field === 'materials',
  );
  assert.deepEqual(materials?.value, ['bamboo']);

  assert.equal(
    result.proposals.length,
    4,
    'the fixture derives all four fields.',
  );
}

async function testRunReportsARejectedProposalAsPartialResult(): Promise<void> {
  const { pipeline } = build([
    {
      kind: 'result',
      result: {
        title: 'Bamboo Basket',
        description: 'Bamboo Basket',
      },
    },
  ]);

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  const result = await pipeline.run(queued.id, ARTISAN);

  assert.equal(
    result.job.state,
    'PARTIAL_RESULT',
    'a refused field is reported, not dropped.',
  );

  const description = result.proposals.find(
    (proposal) => proposal.field === 'description',
  );
  assert.equal(description?.validationStatus, 'REJECTED');
  assert.ok(
    description?.riskReasons.includes('SEMANTIC_VALIDATION_REJECTED'),
  );
}

async function testRunPermanentFailureIsTerminal(): Promise<void> {
  const { pipeline } = build([
    {
      kind: 'failure',
      code: 'PROVIDER_AUTHENTICATION',
      diagnostic: 'bad credential fixture',
    },
  ]);

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  const result = await pipeline.run(queued.id, ARTISAN);

  assert.equal(result.job.state, 'FAILED');
  assert.equal(result.job.attemptCount, 1);
  assert.equal(result.job.failure?.code, 'PROVIDER_AUTHENTICATION');
  assert.equal(
    result.job.failure?.retryable,
    false,
    'a credential rejection is never retried.',
  );
  assert.ok(result.job.completedAt, 'a permanent failure ends the job.');
}

async function testRunTransientFailureReschedules(): Promise<void> {
  const { pipeline } = build([
    {
      kind: 'failure',
      code: 'PROVIDER_UNAVAILABLE',
      diagnostic: 'fixture outage',
    },
    {
      kind: 'result',
      result: {
        title: 'Bamboo Basket',
        description: 'A real description that differs.',
        category: 'basketry',
        materials: ['bamboo'],
      },
    },
  ]);

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  const failed = await pipeline.run(queued.id, ARTISAN);

  assert.equal(
    failed.job.state,
    'RETRYING',
    'a transient failure with budget reschedules.',
  );
  assert.equal(failed.job.attemptCount, 1);
  assert.ok(
    failed.job.nextAttemptAt,
    'the retry carries its backoff time.',
  );

  await expectAppError(
    'running a job that is not due yet',
    'CONFLICT',
    () => pipeline.run(queued.id, ARTISAN),
  );

  await new Promise((resolve) => setTimeout(resolve, 1_150));

  const retried = await pipeline.run(queued.id, ARTISAN);

  assert.equal(
    retried.job.state,
    'SUCCEEDED',
    'the retry succeeds once due.',
  );
  assert.equal(retried.job.attemptCount, 2);
  assert.equal(retried.job.failure, null, 'the failure is cleared.');
}

async function testTransientBudgetExhaustionIsDeadLettered(): Promise<void> {
  const { pipeline } = build([
    {
      kind: 'failure',
      code: 'PROVIDER_TIMEOUT',
      diagnostic: 'fixture timeout',
    },
  ]);

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
    maxAttempts: 1,
  });

  const result = await pipeline.run(queued.id, ARTISAN);

  assert.equal(
    result.job.state,
    'DEAD_LETTERED',
    'transient exhaustion is a distinct terminal state.',
  );
  assert.equal(result.job.failure?.code, 'PROVIDER_TIMEOUT');
  assert.equal(result.job.failure?.retryable, true);
}

async function testRunRefusesTerminalJob(): Promise<void> {
  const { pipeline } = build();

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  await pipeline.run(queued.id, ARTISAN);

  await expectAppError(
    'running a SUCCEEDED job',
    'CONFLICT',
    () => pipeline.run(queued.id, ARTISAN),
  );
}

async function testRunRequiresOwnership(): Promise<void> {
  const { pipeline } = build();

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  await expectAppError(
    'running another artisan job',
    'FORBIDDEN',
    () => pipeline.run(queued.id, OTHER),
  );
}

async function testListAndHistory(): Promise<void> {
  const { pipeline } = build();

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  await pipeline.run(queued.id, ARTISAN);

  const jobs = await pipeline.listJobs(PRODUCT_ID, ARTISAN);
  assert.equal(jobs.length, 1);

  const history = await pipeline.listProposalHistory(
    queued.id,
    ARTISAN,
  );
  assert.equal(history.length, 4, 'one attempt produces four proposals.');

  const lookedUp = await pipeline.getJob(queued.id, ARTISAN);
  assert.equal(lookedUp.job.id, queued.id);
  assert.equal(lookedUp.proposals.length, 4);
}

/**
 * A second provider adapter, written to the interface and nothing else.
 *
 * It shares no code with the deterministic fixture, has its own attribution,
 * and knows nothing about the pipeline, the repository, or the catalog. If the
 * pipeline could only run one adapter, this could not be substituted without
 * changing it, which is the property ADR-005 asks for: the domain depends on a
 * capability contract, not on a vendor.
 */
class AlternativeProvider implements CatalogAiProvider {
  readonly attribution: CatalogAiAttribution = {
    provider: 'alternative-local',
    model: 'alternative-draft',
    modelVersion: '2026-09-01',
  };

  readonly requests: CatalogAiRequest[] = [];

  constructor(
    private readonly outcome: CatalogAiResult | Error,
  ) {}

  async generateCatalogDraft(
    request: CatalogAiRequest,
  ): Promise<CatalogAiResult> {
    this.requests.push(request);

    if (this.outcome instanceof Error) {
      throw this.outcome;
    }

    return this.outcome;
  }
}

function buildWithProvider(
  provider: CatalogAiProvider,
): {
  repository: InMemoryAiRepository;
  catalog: MemoryCatalogPort;
  pipeline: AiPipelineService;
} {
  const repository = new InMemoryAiRepository();
  const catalog = new MemoryCatalogPort(
    new Map([[PRODUCT_ID, product()]]),
  );

  return {
    repository,
    catalog,
    pipeline: new AiPipelineService(repository, provider, catalog),
  };
}

async function testAnyAdapterCanBeSubstituted(): Promise<void> {
  const provider = new AlternativeProvider({
    title: 'River Reed Basket',
    description: 'Woven from river reed by one pair of hands.',
    category: 'basketry',
    materials: ['reed'],
    fieldConfidence: { title: 0.95 },
  });

  const { pipeline } = buildWithProvider(provider);

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  // The job records the substituted adapter's own attribution, because the
  // pipeline reads it from the interface.
  assert.equal(queued.provider, 'alternative-local');
  assert.equal(queued.model, 'alternative-draft');
  assert.equal(queued.modelVersion, '2026-09-01');

  const run = await pipeline.run(queued.id, ARTISAN);

  assert.equal(run.job.state, 'SUCCEEDED');
  assert.equal(
    provider.requests[0]?.jobId,
    queued.id,
    'the adapter is asked about the job it was asked to draft.',
  );
  assert.equal(
    provider.requests[0]?.promptVersion,
    queued.promptVersion,
    'the prompt version is supplied by the application, not the adapter.',
  );

  const title = run.proposals.find(
    (proposal) => proposal.field === 'title',
  );

  assert.equal(
    title?.value,
    'River Reed Basket',
    "the substituted adapter's answer is what reaches a proposal.",
  );
  assert.equal(
    title?.provider,
    'alternative-local',
    'each proposal carries the adapter that produced it.',
  );
  assert.equal(
    title?.modelVersion,
    '2026-09-01',
    'a model version is stored even when it is not "1".',
  );
}

async function testASubstitutedAdapterFailsTheSameWay(): Promise<void> {
  const provider = new AlternativeProvider(
    new AiProviderError(
      'PROVIDER_AUTHENTICATION',
      'The alternative adapter was refused.',
      'no credential for this model',
    ),
  );

  const { pipeline } = buildWithProvider(provider);

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  const run = await pipeline.run(queued.id, ARTISAN);

  assert.equal(
    run.job.state,
    'FAILED',
    'a permanent failure from any adapter is terminal.',
  );
  assert.equal(
    run.job.failure?.code,
    'PROVIDER_AUTHENTICATION',
    'the normalized taxonomy comes from the thrown error, not the adapter name.',
  );
  assert.equal(
    run.proposals.length,
    0,
    'a failed execution proposes nothing.',
  );
}

/**
 * A provider that answers with something that is not an object at all.
 *
 * This is the case the `unknown` return type exists for: the adapter made the
 * call and the model returned a string, a list, or null. It must fail as a
 * schema failure with a job state, never as a type error inside adapter code
 * and never as a proposal.
 */
async function testUnparseableProviderOutputBecomesAFailedJob(): Promise<void> {
  const provider = new AlternativeProvider('a plain sentence, not an object');

  const { pipeline } = buildWithProvider(provider);

  const { job: queued } = await pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  const run = await pipeline.run(queued.id, ARTISAN);

  assert.equal(
    run.job.state,
    'FAILED',
    'an unparseable response fails the job rather than succeeding it.',
  );
  assert.equal(
    run.job.failure?.code,
    'PROVIDER_OUTPUT_SCHEMA_INVALID',
    'the failure keeps the schema category instead of becoming DEPENDENCY_FAILED.',
  );
  assert.equal(
    run.proposals.length,
    0,
    'an unparseable response cannot become a proposal.',
  );
  assert.ok(
    run.job.failure?.diagnostic?.includes('was not a JSON object'),
    `the diagnostic must still say what was wrong, got: ${String(
      run.job.failure?.diagnostic,
    )}`,
  );

  const history = await pipeline.listProposalHistory(
    queued.id,
    ARTISAN,
  );
  assert.equal(
    history.length,
    0,
    'nothing is recorded as evidence when nothing was ever a proposal.',
  );
}

async function main(): Promise<void> {
  await testEnqueueRequiresIdempotencyKey();
  await testEnqueueCapturesSnapshotAndIsIdempotent();
  await testEnqueueRefusesAnotherOwnersProduct();
  await testEnqueueRefusesFrozenProductStates();
  await testEnqueueRefusesAnApprovedProduct();
  await testRunProducesACompleteResult();
  await testRunReportsARejectedProposalAsPartialResult();
  await testRunPermanentFailureIsTerminal();
  await testRunTransientFailureReschedules();
  await testTransientBudgetExhaustionIsDeadLettered();
  await testRunRefusesTerminalJob();
  await testRunRequiresOwnership();
  await testListAndHistory();
  await testAnyAdapterCanBeSubstituted();
  await testASubstitutedAdapterFailsTheSameWay();
  await testUnparseableProviderOutputBecomesAFailedJob();

  console.log('AI PIPELINE SERVICE TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});