import {
  EditStateError,
  PUBLISH_REQUIRED_FIELDS,
  PublishFieldsError,
  PublishStateError,
  assertEditable,
  assertPublishableFields,
  assertPublishableState,
  nextCatalogVersionNumber,
} from './catalog-publish.js';
import type {
  CatalogProduct,
  ProductState,
} from './catalog-product.js';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

function expectThrows(
  run: () => unknown,
  kind: Function,
  message: string,
): void {
  try {
    run();
  } catch (error) {
    expect(
      error instanceof kind,
      `${message}: expected ${kind.name}, received ${String(error)}`,
    );
    return;
  }

  throw new Error(
    `TEST FAILED: ${message}: expected ${kind.name}, but nothing was raised.`,
  );
}

function product(
  overrides: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    id: 'product-1',
    ownerId: 'artisan-1',
    title: 'Bamboo Basket',
    description: 'Handwoven storage basket.',
    category: 'basketry',
    materials: ['bamboo'],
    state: 'APPROVED',
    createdAt: '2026-09-28T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z',
    publishedVersion: null,
    ...overrides,
  };
}

// ----- the review condition -----

// Only an already-approved product may be published. ADR-002 reserves
// APPROVED and PUBLISHED for authorized business workflows, so no other
// state may reach publication.
expect(
  assertPublishableState('APPROVED') === undefined,
  'APPROVED must be publishable',
);

const notPublishable: readonly ProductState[] = [
  'LOCAL_DRAFT',
  'PENDING_SYNC',
  'SYNCED',
  'REVIEW_REQUIRED',
  'PUBLISHED',
  'ARCHIVED',
  'CONFLICT',
  'ACTION_REQUIRED',
];

for (const state of notPublishable) {
  expectThrows(
    () => assertPublishableState(state),
    PublishStateError,
    `${state} must not be publishable`,
  );
}

// ----- the required-data condition -----

expect(
  PUBLISH_REQUIRED_FIELDS.length > 0,
  'publication must require at least one field',
);

assertPublishableFields(
  product({
    title: 'Bamboo Basket',
    description: 'Handwoven storage basket.',
  }),
);

for (const field of PUBLISH_REQUIRED_FIELDS) {
  expectThrows(
    () =>
      assertPublishableFields(
        product({ [field]: null }),
      ),
    PublishFieldsError,
    `a missing ${field} must block publication`,
  );

  expectThrows(
    () =>
      assertPublishableFields(
        product({ [field]: '   ' }),
      ),
    PublishFieldsError,
    `a blank ${field} must block publication`,
  );
}

// A blank field is reported as missing, which is the actionable message:
// the artisan is told what to fill in, not that publishing "failed".
try {
  assertPublishableFields(
    product({ title: null, description: null }),
  );
  throw new Error('TEST FAILED: expected PublishFieldsError.');
} catch (error) {
  if (error instanceof PublishFieldsError) {
    expect(
      error.missingFields.length ===
        PUBLISH_REQUIRED_FIELDS.length,
      'every missing required field must be reported',
    );
  } else {
    throw error;
  }
}

// Fields outside the required set do not block publication, because the
// specification still lists the required product fields as an open
// decision and inventing more would narrow publishing without a source.
assertPublishableFields(
  product({ category: null, materials: [] }),
);

// ----- the edit freeze -----

// A published product is buyer-visible, so editing it in place would
// rewrite the published listing without a new catalog version.
for (const state of ['PUBLISHED', 'ARCHIVED'] as const) {
  expectThrows(
    () => assertEditable(state),
    EditStateError,
    `${state} must not be editable`,
  );
}

for (const state of [
  'LOCAL_DRAFT',
  'PENDING_SYNC',
  'SYNCED',
  'REVIEW_REQUIRED',
  'APPROVED',
  'CONFLICT',
  'ACTION_REQUIRED',
] as const) {
  expect(
    assertEditable(state) === undefined,
    `${state} must remain editable`,
  );
}

// ----- version numbering -----

expect(
  nextCatalogVersionNumber(null) === 1,
  'a never-published product starts at version 1',
);

expect(
  nextCatalogVersionNumber(1) === 2,
  'a re-publish allocates the next version',
);

expect(
  nextCatalogVersionNumber(7) === 8,
  'version numbering is monotonic per product',
);

console.log('CATALOG PUBLISH DOMAIN TESTS PASSED');
