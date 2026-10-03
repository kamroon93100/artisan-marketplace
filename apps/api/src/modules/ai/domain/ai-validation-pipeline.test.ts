import assert from 'node:assert/strict';
import type { AiProposalField } from '@artisan-marketplace/contracts';
import {
  PUBLISH_BLOCKING_PROPOSAL_FIELDS,
  LOW_CONFIDENCE_THRESHOLD,
  normalizeField,
  normalizeMaterials,
  normalizeText,
  readConfidence,
  runValidationPipeline,
} from './ai-validation-pipeline.js';
import {
  PUBLISH_REQUIRED_FIELDS,
} from '../../catalog/domain/catalog-publish.js';

const FIELD_CONFIDENCES = new Map<AiProposalField, unknown>([
  ['title', 0.9],
  ['description', 0.8],
  ['category', 0.55],
  ['materials', 0.75],
]);

function confidences(
  overrides: Partial<Record<AiProposalField, unknown>> = {},
): Map<AiProposalField, unknown> {
  const merged = new Map<AiProposalField, unknown>(FIELD_CONFIDENCES);

  for (const [field, value] of Object.entries(overrides)) {
    merged.set(field as AiProposalField, value);
  }

  return merged;
}

function testNonObjectOutputIsRejected(): void {
  for (const raw of [null, 'text', 42, [1, 2]]) {
    const outcome = runValidationPipeline(raw, new Map());

    assert.equal(
      outcome.kind,
      'rejected',
      'a non-object answer has nothing to review.',
    );
    assert.equal(
      outcome.failure.code,
      'PROVIDER_OUTPUT_SCHEMA_INVALID',
      'the failure is a schema failure.',
    );
    assert.ok(
      !outcome.failure.retryable,
      'malformed output is not worth retrying.',
    );
  }
}

function testEmptyObjectIsRejected(): void {
  const outcome = runValidationPipeline({}, new Map());

  assert.equal(outcome.kind, 'rejected', 'no usable fields means rejection.');
  assert.ok(
    outcome.issues.some((issue) => issue.includes('no usable field')),
  );
}

function testCompleteOutputNormalized(): void {
  const outcome = runValidationPipeline(
    {
      title: '  Handwoven   Basket  ',
      description: '  Made  from strips.\n\n  Bamboo.  ',
      category: 'Basketry',
      materials: ['bamboo', 'Bamboo', '  Palm '],
    },
    confidences(),
  );

  assert.equal(outcome.kind, 'complete');
  assert.equal(outcome.drafts.length, 4);

  const title = outcome.drafts.find((draft) => draft.field === 'title');
  assert.equal(title?.value, 'Handwoven Basket', 'whitespace is collapsed.');
  assert.equal(title?.validationStatus, 'VALID');
  assert.equal(title?.confidence, 0.9);
  assert.deepEqual(title?.riskReasons, [], '0.9 title carries no risk.');
  assert.equal(title?.riskLevel, 'NONE');

  const materials = outcome.drafts.find(
    (draft) => draft.field === 'materials',
  );
  assert.deepEqual(
    materials?.value,
    ['bamboo', 'Palm'],
    'duplicates are deduped keeping the first spelling.',
  );

  const category = outcome.drafts.find(
    (draft) => draft.field === 'category',
  );
  assert.equal(
    category?.riskLevel,
    'NONE',
    'category is not publish-blocking, so low confidence is not a risk flag.',
  );
  assert.equal(category?.confidence, 0.55, 'its confidence is still recorded.');
}

function testLowConfidenceOnPublishBlockingField(): void {
  const outcome = runValidationPipeline(
    {
      title: 'Basket',
      description: 'A real description.',
    },
    confidences({ description: 0.5 }),
  );

  assert.equal(outcome.kind, 'complete');

  const description = outcome.drafts.find(
    (draft) => draft.field === 'description',
  );
  assert.deepEqual(description?.riskReasons, ['LOW_CONFIDENCE']);
  assert.equal(description?.riskLevel, 'LOW');
}

function testWrongTypedFieldIsDroppedNotFatal(): void {
  const outcome = runValidationPipeline(
    {
      title: 'Basket',
      description: 123,
    },
    confidences(),
  );

  assert.equal(outcome.kind, 'complete', 'one bad field is not a rejection.');

  assert.ok(
    outcome.issues.some((issue) =>
      issue.includes('description was a number rather than a string'),
    ),
    'the malformed field is recorded.',
  );

  const fields = outcome.drafts.map((draft) => draft.field);
  assert.deepEqual(fields, ['title'], 'only the usable field is drafted.');
}

function testSemanticRejectionProducesPartialResult(): void {
  const outcome = runValidationPipeline(
    {
      title: 'Bamboo Basket',
      description: 'Bamboo Basket',
    },
    confidences(),
  );

  assert.equal(
    outcome.kind,
    'partial',
    'a description that echoes the title is a refusal, not a success.',
  );

  const description = outcome.drafts.find(
    (draft) => draft.field === 'description',
  );
  assert.equal(description?.validationStatus, 'REJECTED');
  assert.ok(
    description?.riskReasons.includes('SEMANTIC_VALIDATION_REJECTED'),
  );
  assert.equal(description?.riskLevel, 'HIGH');
  assert.ok(
    description?.validationIssues[0].includes('carried no information'),
  );

  const title = outcome.drafts.find((draft) => draft.field === 'title');
  assert.equal(title?.validationStatus, 'VALID', 'the title is still reviewable.');
}

function testMissingPublishBlockingFieldRaisesSetRisk(): void {
  const outcome = runValidationPipeline(
    { title: 'Basket' },
    confidences(),
  );

  assert.equal(outcome.kind, 'complete', 'one field is still reviewable.');

  const title = outcome.drafts.find((draft) => draft.field === 'title');
  assert.equal(
    title?.riskLevel,
    'HIGH',
    'a missing publish-blocking field raises every proposal.',
  );
  assert.ok(
    title?.riskReasons.includes('MISSING_PUBLISH_BLOCKING_FIELD'),
  );
}

function testPublishBlockingFieldParity(): void {
  assert.deepEqual(
    [...PUBLISH_BLOCKING_PROPOSAL_FIELDS].sort(),
    [...PUBLISH_REQUIRED_FIELDS].sort(),
    'the proposal set and the catalog publish precondition must agree.',
  );
}

function testNormalizers(): void {
  assert.equal(
    normalizeText('  a\n  b\n\n\n  c  '),
    'a\nb\n\nc',
    'whitespace and blank-line runs are collapsed, paragraphs kept.',
  );
  assert.deepEqual(
    normalizeMaterials([' Bamboo ', 'BAMBOO', 'palm', '   ']),
    ['Bamboo', 'palm'],
    'entries are trimmed, deduped case-insensitively, blanks dropped.',
  );
  assert.deepEqual(
    normalizeField('materials', ['a', 'a']),
    ['a'],
  );
  assert.equal(normalizeField('title', '  x  '), 'x');
}

function testConfidenceReading(): void {
  assert.equal(readConfidence(0.7), 0.7);
  assert.equal(readConfidence(1), 1);
  assert.equal(readConfidence(0), 0);
  assert.equal(readConfidence('0.8'), null, 'strings are not measured.');
  assert.equal(readConfidence(-0.1), null, 'outside range is discarded.');
  assert.equal(readConfidence(1.1), null, 'above range is discarded.');
  assert.equal(readConfidence(NaN), null);
  assert.ok(
    LOW_CONFIDENCE_THRESHOLD >= 0 &&
      LOW_CONFIDENCE_THRESHOLD <= 1,
    'the threshold is a probability.',
  );
}

async function main(): Promise<void> {
  testNonObjectOutputIsRejected();
  testEmptyObjectIsRejected();
  testCompleteOutputNormalized();
  testLowConfidenceOnPublishBlockingField();
  testWrongTypedFieldIsDroppedNotFatal();
  testSemanticRejectionProducesPartialResult();
  testMissingPublishBlockingFieldRaisesSetRisk();
  testPublishBlockingFieldParity();
  testNormalizers();
  testConfidenceReading();

  console.log('AI VALIDATION PIPELINE TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});