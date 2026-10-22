import {
  INQUIRY_HISTORY_ROUTE,
  inquiryHistoryAction,
} from './inquiry-navigation';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`INQUIRY NAVIGATION TEST FAILED: ${message}`);
  }
}

/**
 * The Home screen offers exactly one way into the buyer's questions. It has to
 * open the real history screen — the route that renders `InquiryHistory` — and
 * not a placeholder, which is why the destination is asserted by value here.
 */
async function testActionOpensTheRealHistoryRoute(): Promise<void> {
  const action = inquiryHistoryAction();

  expect(
    action.href === '/inquiries',
    'the action opens the real /inquiries route',
  );
  expect(
    action.href === INQUIRY_HISTORY_ROUTE,
    'the action and the route constant agree',
  );
}

/**
 * The action is the buyer's only pointer to history, so it must be visible and
 * announce where it leads. An unlabelled control on the Home screen reads as
 * a dead end.
 */
async function testActionIsVisibleAndLabelled(): Promise<void> {
  const action = inquiryHistoryAction();

  expect(action.title.trim().length > 0, 'the action has a visible title');
  expect(
    action.subtitle.trim().length > 0,
    'the action explains what the buyer will find',
  );
  expect(
    action.accessibilityLabel.trim().length > 0,
    'the action is labelled for screen readers',
  );
}

async function main(): Promise<void> {
  await testActionOpensTheRealHistoryRoute();
  await testActionIsVisibleAndLabelled();

  console.log('INQUIRY NAVIGATION TESTS PASSED');
}

void main().catch((error) => {
  console.error('INQUIRY NAVIGATION TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
