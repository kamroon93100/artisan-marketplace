import {
  describeDiscoveryFailure,
  formatPublishedAt,
  showsBackAffordance,
} from './discovery-display';
import {
  DISCOVERY_PAGE_SIZE_DEFAULT,
  DISCOVERY_PAGE_SIZE_MAX,
  DISCOVERY_SEARCH_MAX_LENGTH,
  DiscoveryTransportError,
} from '../../network/discovery-transport';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`DISCOVERY DISPLAY TEST FAILED: ${message}`);
  }
}

/**
 * The Explore tab renders discovery directly. Its root has no screen above
 * it, so the back affordance must be absent there while remaining on the
 * pushed route — one list implementation, two presentations.
 */
async function testBackAffordanceFollowsTheScreen(): Promise<void> {
  expect(
    showsBackAffordance({ onBack: () => {} }) === true,
    'a pushed route renders the back affordance',
  );
  expect(
    showsBackAffordance({ onBack: undefined }) === false,
    'the tab root renders no back affordance',
  );
  expect(
    showsBackAffordance({}) === false,
    'a screen with no handler renders no back affordance',
  );
}

async function testFailuresKeepTheServersOwnWords(): Promise<void> {
  const refused = describeDiscoveryFailure(
    new DiscoveryTransportError(
      'The requested page size is not supported.',
      'INVALID_REQUEST',
      false,
    ),
  );

  expect(refused.message === 'The requested page size is not supported.', 'the server message is preserved');
  expect(refused.retryable === false, 'a refusal is not offered a retry');

  const unknown = describeDiscoveryFailure(new Error('socket hung up'));
  expect(unknown.retryable === true, 'an unknown failure is retryable');
  expect(
    unknown.message === 'socket hung up',
    'an unknown failure still explains itself',
  );
}

async function testPublishedAtIsReadable(): Promise<void> {
  const formatted = formatPublishedAt('2026-03-14T09:26:53.000Z');

  expect(
    /\d{4}/.test(formatted),
    'a parseable timestamp is shown as a date',
  );
  expect(
    formatPublishedAt('not-a-timestamp') === 'not-a-timestamp',
    'an unparseable value is shown raw rather than hidden',
  );
}

async function testBoundsMatchTheServerContract(): Promise<void> {
  expect(DISCOVERY_PAGE_SIZE_DEFAULT === 20, 'the default page size is the contract value');
  expect(DISCOVERY_PAGE_SIZE_MAX === 50, 'the page ceiling is the contract value');
  expect(
    DISCOVERY_SEARCH_MAX_LENGTH === 120,
    'the search ceiling is the contract value',
  );
  expect(
    DISCOVERY_PAGE_SIZE_DEFAULT <= DISCOVERY_PAGE_SIZE_MAX,
    'the default page must fit inside the ceiling',
  );
}

async function main(): Promise<void> {
  await testBackAffordanceFollowsTheScreen();
  await testFailuresKeepTheServersOwnWords();
  await testPublishedAtIsReadable();
  await testBoundsMatchTheServerContract();

  console.log('DISCOVERY DISPLAY TESTS PASSED');
}

void main().catch((error) => {
  console.error('DISCOVERY DISPLAY TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
