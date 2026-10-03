import {
  DISCOVERY_PAGE_SIZE_DEFAULT,
  DISCOVERY_PAGE_SIZE_MAX,
  DISCOVERY_SEARCH_MAX_LENGTH,
} from '@artisan-marketplace/contracts';
import {
  DiscoveryQueryError,
  parseDiscoveryQuery,
} from './discovery-query.js';

function expect(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

function expectRejected(
  input: Parameters<typeof parseDiscoveryQuery>[0],
  field: string,
  because: string,
): void {
  try {
    parseDiscoveryQuery(input);
  } catch (error) {
    if (!(error instanceof DiscoveryQueryError)) {
      throw new Error(
        `TEST FAILED: ${because} is reported as a domain validation error, got ${String(error)}.`,
      );
    }

    expect(
      error.field === field,
      `${because} names ${field}, got ${error.field}.`,
    );
    return;
  }

  throw new Error(
    `TEST FAILED: ${because} was accepted.`,
  );
}

/**
 * An absent search and a blank one are the same request.
 *
 * A buyer who has cleared the search box sends an empty value, and treating
 * that as a literal search for whitespace would return an empty catalog
 * behind a field that looks filled in.
 */
function testBlankSearchIsNoSearch(): void {
  const omitted = parseDiscoveryQuery({});
  const blank = parseDiscoveryQuery({ search: '   ' });
  const empty = parseDiscoveryQuery({ search: '' });

  expect(
    omitted.search === undefined,
    'An omitted search is no search.',
  );
  expect(
    blank.search === undefined,
    'A whitespace-only search is no search.',
  );
  expect(
    empty.search === undefined,
    'An empty search is no search.',
  );
  expect(
    omitted.limit === DISCOVERY_PAGE_SIZE_DEFAULT &&
      omitted.offset === 0,
    'Defaults apply when nothing is requested.',
  );
}

/**
 * Case-insensitivity is decided once, here, rather than being a `lower()`
 * repeated in a query string a later edit could forget.
 */
function testSearchIsNormalized(): void {
  const parsed = parseDiscoveryQuery({
    search: '  Bamboo BASKET  ',
  });

  expect(
    parsed.search === 'bamboo basket',
    `Search is trimmed and lower-cased, got ${String(parsed.search)}.`,
  );
}

function testSearchLengthIsBounded(): void {
  expectRejected(
    {
      search: 'a'.repeat(DISCOVERY_SEARCH_MAX_LENGTH + 1),
    },
    'search',
    'An over-long search',
  );

  const atLimit = parseDiscoveryQuery({
    search: 'a'.repeat(DISCOVERY_SEARCH_MAX_LENGTH),
  });

  expect(
    atLimit.search?.length === DISCOVERY_SEARCH_MAX_LENGTH,
    'A search exactly at the limit is accepted.',
  );
}

/**
 * Page bounds are refused rather than adjusted.
 *
 * Clamping a limit hands back a page the client did not ask for with no
 * indication that its number was ignored, and rounding an offset moves the
 * page boundary. Both would be silent lies, so an out-of-range value is an
 * error the client can see.
 */
function testPageBoundsAreEnforced(): void {
  expectRejected(
    { limit: '0' },
    'limit',
    'A limit of zero',
  );
  expectRejected(
    { limit: String(DISCOVERY_PAGE_SIZE_MAX + 1) },
    'limit',
    'A limit above the ceiling',
  );
  expectRejected(
    { limit: '2.5' },
    'limit',
    'A fractional limit',
  );
  expectRejected(
    { limit: 'many' },
    'limit',
    'A non-numeric limit',
  );
  expectRejected(
    { limit: '' },
    'limit',
    'An empty limit',
  );
  expectRejected(
    { limit: ' ' },
    'limit',
    'A whitespace limit',
  );
  expectRejected(
    { offset: '-1' },
    'offset',
    'A negative offset',
  );
  expectRejected(
    { offset: '2.5' },
    'offset',
    'A fractional offset',
  );
  expectRejected(
    { limit: 10 },
    'limit',
    'A non-string limit',
  );

  const atCeiling = parseDiscoveryQuery({
    limit: String(DISCOVERY_PAGE_SIZE_MAX),
  });

  expect(
    atCeiling.limit === DISCOVERY_PAGE_SIZE_MAX,
    'A limit exactly at the ceiling is accepted.',
  );

  const highOffset = parseDiscoveryQuery({
    offset: '1000000',
  });

  expect(
    highOffset.offset === 1_000_000,
    'A large offset is accepted; the total bounds the page, not the offset.',
  );
}

/**
 * A repeated parameter must not be silently resolved to one of its values.
 */
function testNonStringSearchIsRejected(): void {
  expectRejected(
    { search: ['bamboo', 'basket'] },
    'search',
    'A repeated search parameter',
  );
}

async function main(): Promise<void> {
  testBlankSearchIsNoSearch();
  testSearchIsNormalized();
  testSearchLengthIsBounded();
  testPageBoundsAreEnforced();
  testNonStringSearchIsRejected();

  console.log('DISCOVERY QUERY TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
