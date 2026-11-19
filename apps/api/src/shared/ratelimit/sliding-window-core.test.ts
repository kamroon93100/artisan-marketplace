import {
  decideSlidingWindow,
  type SlidingWindowDecisionInput,
} from './sliding-window-core.js';

function assertEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

function assertRangeError(
  action: () => unknown,
  label: string,
): void {
  try {
    action();
  } catch (error) {
    if (error instanceof RangeError) {
      return;
    }

    throw new Error(
      `${label}: expected RangeError, received ${String(error)}.`,
    );
  }

  throw new Error(`${label}: expected RangeError, but no error was thrown.`);
}

function input(
  overrides: Partial<SlidingWindowDecisionInput>,
): SlidingWindowDecisionInput {
  return {
    activeTimestamps: [],
    limit: 3,
    windowMs: 1_000,
    now: 1_500,
    ...overrides,
  };
}

function testFewerThanLimitIsAllowed(): void {
  const decision = decideSlidingWindow(
    input({
      activeTimestamps: [1_000],
      limit: 3,
      now: 1_500,
    }),
  );

  assertEqual(decision.result.allowed, true, 'fewer than limit is allowed');
  assertEqual(decision.result.remaining, 1, 'fewer than limit remaining');
  assertEqual(decision.result.resetAt, 2_000, 'reset uses oldest attempt');
  assertEqual(
    decision.activeTimestamps.join(','),
    '1000,1500',
    'allowed attempt is appended to active state',
  );
}

function testExactlyAtLimitIsAllowed(): void {
  const decision = decideSlidingWindow(
    input({
      activeTimestamps: [1_000, 1_100],
      limit: 3,
      now: 1_200,
    }),
  );

  assertEqual(decision.result.allowed, true, 'limit-th attempt is allowed');
  assertEqual(decision.result.remaining, 0, 'limit-th attempt leaves no room');
  assertEqual(decision.result.resetAt, 2_000, 'reset remains oldest + window');
  assertEqual(
    decision.activeTimestamps.join(','),
    '1000,1100,1200',
    'limit-th attempt is stored',
  );
}

function testNextAttemptIsRejected(): void {
  const decision = decideSlidingWindow(
    input({
      activeTimestamps: [1_000, 1_100, 1_200],
      limit: 3,
      now: 1_300,
    }),
  );

  assertEqual(decision.result.allowed, false, 'attempt over limit is rejected');
  assertEqual(decision.result.remaining, 0, 'rejected attempt has no remaining');
  assertEqual(decision.result.resetAt, 2_000, 'rejected reset is oldest + window');
  assertEqual(
    decision.activeTimestamps.join(','),
    '1000,1100,1200',
    'rejected attempt is not stored',
  );
}

function testAttemptsExpireAtWindowBoundary(): void {
  const decision = decideSlidingWindow(
    input({
      activeTimestamps: [1_000],
      limit: 3,
      windowMs: 1_000,
      now: 2_000,
    }),
  );

  assertEqual(decision.result.allowed, true, 'boundary-expired attempt frees budget');
  assertEqual(decision.result.remaining, 2, 'expired attempt is not counted');
  assertEqual(decision.result.resetAt, 3_000, 'new window starts at now');
  assertEqual(
    decision.activeTimestamps.join(','),
    '2000',
    'expired attempt is pruned from stored state',
  );
}

function testRemainingAndResetAcrossWindow(): void {
  const first = decideSlidingWindow(
    input({
      activeTimestamps: [],
      limit: 2,
      windowMs: 10_000,
      now: 100_000,
    }),
  );
  const second = decideSlidingWindow(
    input({
      activeTimestamps: first.activeTimestamps,
      limit: 2,
      windowMs: 10_000,
      now: 102_000,
    }),
  );
  const third = decideSlidingWindow(
    input({
      activeTimestamps: second.activeTimestamps,
      limit: 2,
      windowMs: 10_000,
      now: 104_000,
    }),
  );

  assertEqual(first.result.remaining, 1, 'first attempt remaining');
  assertEqual(first.result.resetAt, 110_000, 'first attempt reset');
  assertEqual(second.result.remaining, 0, 'second attempt remaining');
  assertEqual(second.result.resetAt, 110_000, 'second attempt reset');
  assertEqual(third.result.allowed, false, 'third attempt rejected');
  assertEqual(third.result.remaining, 0, 'third attempt remaining');
  assertEqual(third.result.resetAt, 110_000, 'third attempt reset');
}

function testRejectedAttemptsDoNotGrowOrExtendState(): void {
  const activeTimestamps = [1_000, 1_100, 1_200];
  const firstRejection = decideSlidingWindow(
    input({
      activeTimestamps,
      now: 1_300,
    }),
  );
  const secondRejection = decideSlidingWindow(
    input({
      activeTimestamps: firstRejection.activeTimestamps,
      now: 1_400,
    }),
  );
  const thirdRejection = decideSlidingWindow(
    input({
      activeTimestamps: secondRejection.activeTimestamps,
      now: 1_500,
    }),
  );

  assertEqual(firstRejection.result.allowed, false, 'first rejection');
  assertEqual(secondRejection.result.allowed, false, 'second rejection');
  assertEqual(thirdRejection.result.allowed, false, 'third rejection');
  assertEqual(
    thirdRejection.activeTimestamps.length,
    activeTimestamps.length,
    'repeated rejections do not grow stored state',
  );
  assertEqual(
    thirdRejection.result.resetAt,
    firstRejection.result.resetAt,
    'repeated rejections do not extend the window',
  );
}

function testExpiredAttemptsArePrunedAndSorted(): void {
  const decision = decideSlidingWindow(
    input({
      activeTimestamps: [1_900, 1_000, 1_500, 900],
      limit: 4,
      windowMs: 1_000,
      now: 2_000,
    }),
  );

  assertEqual(
    decision.activeTimestamps.join(','),
    '1500,1900,2000',
    'active state is sorted and expired boundary attempts are removed',
  );
}

function testInputStateIsNotMutated(): void {
  const activeTimestamps = [1_000, 1_100];
  const before = activeTimestamps.join(',');

  decideSlidingWindow(
    input({
      activeTimestamps,
      now: 1_200,
    }),
  );

  assertEqual(
    activeTimestamps.join(','),
    before,
    'decision does not mutate the caller-owned timestamp array',
  );
}

function testInvalidLimitsAndWindowsAreRejected(): void {
  for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertRangeError(
      () => decideSlidingWindow(input({ limit })),
      `limit ${String(limit)}`,
    );
  }

  for (const windowMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertRangeError(
      () => decideSlidingWindow(input({ windowMs })),
      `window ${String(windowMs)}`,
    );
  }

  assertRangeError(
    () => decideSlidingWindow(input({ now: Number.NaN })),
    'now NaN',
  );
}

function main(): void {
  testFewerThanLimitIsAllowed();
  testExactlyAtLimitIsAllowed();
  testNextAttemptIsRejected();
  testAttemptsExpireAtWindowBoundary();
  testRemainingAndResetAcrossWindow();
  testRejectedAttemptsDoNotGrowOrExtendState();
  testExpiredAttemptsArePrunedAndSorted();
  testInputStateIsNotMutated();
  testInvalidLimitsAndWindowsAreRejected();

  console.log('SLIDING WINDOW CORE TESTS PASSED');
}

main();
