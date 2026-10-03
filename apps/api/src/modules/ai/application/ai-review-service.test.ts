import assert from 'node:assert/strict';
import type { CatalogProductSnapshot } from './catalog-product-port.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { AiPipelineService } from './ai-pipeline-service.js';
import { AiReviewService } from './ai-review-service.js';
import type { ProposalDecisionInput } from './ai-review-service.js';
import { InMemoryAiRepository } from '../infrastructure/in-memory-ai-repository.js';
import { DeterministicCatalogAiProvider } from '../infrastructure/deterministic-catalog-ai-provider.js';
import { MemoryCatalogPort } from './catalog-product-port.test-double.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_PRODUCT_ID = '00000000-0000-4000-8000-000000000002';
const ARTISAN = 'artisan-1';
const OTHER = 'artisan-2';

function snapshot(
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

type Rigs = {
  repository: InMemoryAiRepository;
  catalog: MemoryCatalogPort;
  pipeline: AiPipelineService;
  review: AiReviewService;
};

async function runToProposals(
  rigs: Rigs,
  options: {
    overrides?: Partial<CatalogProductSnapshot>;
    key?: string;
  } = {},
): Promise<
  Awaited<ReturnType<AiPipelineService['run']>>
> {
  if (options.overrides) {
    rigs.catalog.setProduct(
      snapshot(options.overrides),
    );
  }

  const { job } = await rigs.pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: options.key ?? 'key-1',
    correlationId: 'corr-1',
    transcription: 'A genuinely distinct description.',
  });

  const run = await rigs.pipeline.run(job.id, ARTISAN);
  assert.equal(run.job.state, 'SUCCEEDED');

  return run;
}

function build(): Rigs {
  const repository = new InMemoryAiRepository();
  const provider = new DeterministicCatalogAiProvider();
  const catalog = new MemoryCatalogPort(
    new Map([
      [PRODUCT_ID, snapshot()],
      [
        OTHER_PRODUCT_ID,
        snapshot({
          id: OTHER_PRODUCT_ID,
          title: 'A Different Basket',
        }),
      ],
    ]),
  );

  return {
    repository,
    catalog,
    pipeline: new AiPipelineService(
      repository,
      provider,
      catalog,
    ),
    review: new AiReviewService(repository, catalog),
  };
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

function oneField(
  proposal: { id: string },
  decision: ProposalDecisionInput['decision'],
  value?: string | readonly string[],
): ProposalDecisionInput {
  return {
    proposalId: proposal.id,
    decision,
    ...(decision === 'EDITED' ? { value } : {}),
  };
}

async function testAcceptAppliesTheModelsValue(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const title = run.proposals.find(
    (proposal) => proposal.field === 'title',
  );
  assert.ok(title);

  const result = await rigs.review.applyDecisions(
    PRODUCT_ID,
    ARTISAN,
    [oneField(title, 'ACCEPTED')],
  );

  assert.deepEqual(result.applied, ['title']);
  assert.deepEqual(result.staleFields, []);
  assert.equal(
    result.product.title,
    title.value,
    'the accepted proposal value reaches the product.',
  );
  assert.equal(
    rigs.catalog.writes.length,
    1,
    'the accepted field is written once.',
  );
  assert.equal(rigs.catalog.writes[0]?.title, title.value);

  const recorded = await rigs.repository.getProposal(title.id);
  assert.equal(recorded?.decision, 'ACCEPTED');
  assert.equal(recorded?.decidedBy, ARTISAN);
  assert.equal(recorded?.appliedValue, title.value);
}

async function testAcceptAllProposalsWritesTheFullListing(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const result = await rigs.review.applyDecisions(
    PRODUCT_ID,
    ARTISAN,
    run.proposals.map((proposal) =>
      oneField(proposal, 'ACCEPTED'),
    ),
  );

  assert.equal(result.applied.length, 4);
  assert.equal(result.product.category, 'basketry');
  assert.deepEqual(result.product.materials, ['bamboo']);
  assert.equal(rigs.catalog.writes.length, 1);

  for (const proposal of run.proposals) {
    const recorded = await rigs.repository.getProposal(proposal.id);
    assert.equal(recorded?.decision, 'ACCEPTED', `${proposal.field} accepted.`);
  }
}

async function testEditWritesTheArtisansValue(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const description = run.proposals.find(
    (proposal) => proposal.field === 'description',
  );
  assert.ok(description);

  const result = await rigs.review.applyDecisions(
    PRODUCT_ID,
    ARTISAN,
    [
      oneField(
        description,
        'EDITED',
        '  My   own words.  ',
      ),
    ],
  );

  assert.equal(
    result.product.description,
    'My own words.',
    'the edited value is normalized before it is applied.',
  );
  assert.notEqual(
    result.product.description,
    description.value,
    'an edit is not the model value.',
  );

  const recorded = await rigs.repository.getProposal(description.id);
  assert.equal(recorded?.decision, 'EDITED');
  assert.equal(recorded?.appliedValue, 'My own words.');
}

async function testEditRequiresAValue(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const title = run.proposals.find(
    (proposal) => proposal.field === 'title',
  );
  assert.ok(title);

  await expectAppError(
    'editing without the artisans value',
    'VALIDATION_FAILED',
    () =>
      rigs.review.applyDecisions(PRODUCT_ID, ARTISAN, [
        oneField(title, 'EDITED'),
      ]),
  );
}

async function testRejectWritesNothing(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const title = run.proposals.find(
    (proposal) => proposal.field === 'title',
  );
  assert.ok(title);

  const before = (await rigs.catalog.readProduct(PRODUCT_ID))?.title;

  const result = await rigs.review.applyDecisions(
    PRODUCT_ID,
    ARTISAN,
    [oneField(title, 'REJECTED')],
  );

  assert.deepEqual(result.applied, [], 'nothing is applied.');
  assert.equal(rigs.catalog.writes.length, 0, 'no write reaches the catalog.');
  assert.equal(result.product.title, before);

  const recorded = await rigs.repository.getProposal(title.id);
  assert.equal(recorded?.decision, 'REJECTED');
  assert.equal(recorded?.appliedValue, null);
}

async function testRejectedBatchStillRecordsDecisions(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const result = await rigs.review.applyDecisions(
    PRODUCT_ID,
    ARTISAN,
    run.proposals.map((proposal) => oneField(proposal, 'REJECTED')),
  );

  assert.deepEqual(result.applied, []);
  assert.equal(rigs.catalog.writes.length, 0);

  for (const proposal of run.proposals) {
    const recorded = await rigs.repository.getProposal(proposal.id);
    assert.equal(
      recorded?.decision,
      'REJECTED',
      `${proposal.field} is recorded as rejected.`,
    );
  }
}

async function testDuplicateProposalInOneRequestIsRefused(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const title = run.proposals.find(
    (proposal) => proposal.field === 'title',
  );
  assert.ok(title);

  await expectAppError(
    'deciding the same proposal twice',
    'VALIDATION_FAILED',
    () =>
      rigs.review.applyDecisions(PRODUCT_ID, ARTISAN, [
        oneField(title, 'ACCEPTED'),
        oneField(title, 'REJECTED'),
      ]),
  );
}

async function testDecidingAnAlreadyDecidedProposalConflicts(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const title = run.proposals.find(
    (proposal) => proposal.field === 'title',
  );
  assert.ok(title);

  await rigs.review.applyDecisions(PRODUCT_ID, ARTISAN, [
    oneField(title, 'ACCEPTED'),
  ]);

  await expectAppError(
    'deciding a proposal twice across requests',
    'CONFLICT',
    () =>
      rigs.review.applyDecisions(PRODUCT_ID, ARTISAN, [
        oneField(title, 'REJECTED'),
      ]),
  );
}

async function testAnotherArtisanCannotApplyDecisions(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const title = run.proposals.find(
    (proposal) => proposal.field === 'title',
  );
  assert.ok(title);

  await expectAppError(
    'applying decisions to another artisans job',
    'FORBIDDEN',
    () =>
      rigs.review.applyDecisions(PRODUCT_ID, OTHER, [
        oneField(title, 'ACCEPTED'),
      ]),
  );
}

async function testProposalForAnotherProductIsRefused(): Promise<void> {
  const rigs = build();
  const run = await runToProposals(rigs);

  const title = run.proposals.find(
    (proposal) => proposal.field === 'title',
  );
  assert.ok(title);

  await expectAppError(
    'deciding a proposal against the wrong product id',
    'VALIDATION_FAILED',
    () =>
      rigs.review.applyDecisions(OTHER_PRODUCT_ID, ARTISAN, [
        oneField(title, 'ACCEPTED'),
      ]),
  );
}

async function testStaleProposalIsReportedNotDiscarded(): Promise<void> {
  const rigs = build();

  const run = await runToProposals(rigs, {
    overrides: { title: 'Bamboo Basket' },
  });

  const title = run.proposals.find(
    (proposal) => proposal.field === 'title',
  );
  assert.ok(title);

  rigs.catalog.setProduct(
    snapshot({ title: 'Renamed To Something New' }),
  );

  const result = await rigs.review.applyDecisions(
    PRODUCT_ID,
    ARTISAN,
    [oneField(title, 'ACCEPTED')],
  );

  assert.deepEqual(
    result.staleFields,
    ['title'],
    'the staleness is reported…',
  );
  assert.deepEqual(
    result.applied,
    ['title'],
    '…and the newest confirmed edit still wins.',
  );
  assert.equal(
    result.product.title,
    title.value,
    'the artisan chose the proposal, so the proposal value is applied.',
  );
}

async function testUndecidableJobStateRefusesDecisions(): Promise<void> {
  const rigs = build();

  const { job } = await rigs.pipeline.enqueue({
    productId: PRODUCT_ID,
    actorId: ARTISAN,
    idempotencyKey: 'key-1',
    correlationId: 'corr-1',
  });

  const running = await rigs.repository.beginAttempt({
    id: job.id,
    expectedState: job.state,
    attemptCount: 1,
  });

  const proposals = await rigs.repository.saveProposals({
    job: running,
    attempt: 1,
    drafts: [
      {
        field: 'title' as const,
        value: 'Bamboo Basket',
        confidence: 0.9,
        validationStatus: 'VALID' as const,
        validationIssues: [],
        riskLevel: 'NONE' as const,
        riskReasons: [],
      },
    ],
  });

  await expectAppError(
    'deciding a proposal while the job is RUNNING',
    'CONFLICT',
    () =>
      rigs.review.applyDecisions(PRODUCT_ID, ARTISAN, [
        oneField(proposals[0]!, 'ACCEPTED'),
      ]),
  );
}

async function testTwoWritesForOneFieldInOneRequestAreRefused(): Promise<void> {
  const rigs = build();

  // A real run moves the job to SUCCEEDED, so the job is decidable.
  const run = await runToProposals(rigs);

  const draft = {
    field: 'title' as const,
    value: 'Bamboo Basket',
    confidence: 0.9,
    validationStatus: 'VALID' as const,
    validationIssues: [],
    riskLevel: 'NONE' as const,
    riskReasons: [],
  };

  // A second PENDING proposal for the same field on a later attempt: both
  // are valid and both are PENDING, so the only thing refusing the batch is
  // the write-field guard, and nothing may be recorded before it fires.
  const second = await rigs.repository.saveProposals({
    job: run.job,
    attempt: 2,
    drafts: [draft],
  });

  const secondProposal = await rigs.repository.getProposal(second[0]!.id);

  await expectAppError(
    'two decisions writing the same field',
    'VALIDATION_FAILED',
    () =>
      rigs.review.applyDecisions(PRODUCT_ID, ARTISAN, [
        oneField(
          run.proposals.find((p) => p.field === 'title')!,
          'ACCEPTED',
        ),
        oneField(second[0]!, 'ACCEPTED'),
      ]),
  );

  assert.equal(
    secondProposal?.decision,
    'PENDING',
    'a refused batch records nothing.',
  );
  assert.equal(
    rigs.catalog.writes.length,
    0,
    'a refused batch writes nothing.',
  );
}

async function main(): Promise<void> {
  await testAcceptAppliesTheModelsValue();
  await testAcceptAllProposalsWritesTheFullListing();
  await testEditWritesTheArtisansValue();
  await testEditRequiresAValue();
  await testRejectWritesNothing();
  await testRejectedBatchStillRecordsDecisions();
  await testDuplicateProposalInOneRequestIsRefused();
  await testDecidingAnAlreadyDecidedProposalConflicts();
  await testAnotherArtisanCannotApplyDecisions();
  await testProposalForAnotherProductIsRefused();
  await testStaleProposalIsReportedNotDiscarded();
  await testUndecidableJobStateRefusesDecisions();
  await testTwoWritesForOneFieldInOneRequestAreRefused();

  console.log('AI REVIEW SERVICE TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});