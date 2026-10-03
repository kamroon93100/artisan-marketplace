import {
  assertValidTransition,
  canTransition,
} from './catalog-state.js';
import type { ProductState } from './catalog-product.js';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

const valid: Array<[ProductState, ProductState]> = [
  ['LOCAL_DRAFT', 'PENDING_SYNC'],
  ['PENDING_SYNC', 'SYNCED'],
  ['SYNCED', 'REVIEW_REQUIRED'],
  ['REVIEW_REQUIRED', 'APPROVED'],
  ['APPROVED', 'PUBLISHED'],
  ['PUBLISHED', 'ARCHIVED'],
];

const invalid: Array<[ProductState, ProductState]> = [
  ['LOCAL_DRAFT', 'PUBLISHED'],
  ['PUBLISHED', 'APPROVED'],
  ['ARCHIVED', 'PUBLISHED'],
];

for (const [from, to] of valid) {
  expect(canTransition(from, to), `expected ${from} -> ${to} to be valid`);
  assertValidTransition(from, to);
}

for (const [from, to] of invalid) {
  expect(!canTransition(from, to), `expected ${from} -> ${to} to be invalid`);

  let threw = false;

  try {
    assertValidTransition(from, to);
  } catch {
    threw = true;
  }

  expect(threw, `expected ${from} -> ${to} to throw`);
}

console.log('CATALOG STATE TESTS PASSED');
