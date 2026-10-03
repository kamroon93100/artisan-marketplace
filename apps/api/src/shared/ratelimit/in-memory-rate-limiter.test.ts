import { InMemorySlidingWindowRateLimiter } from './in-memory-rate-limiter.js';

async function testAllowsWithinLimit(): Promise<void> {
  const limiter = new InMemorySlidingWindowRateLimiter(5, 60_000);

  for (let i = 0; i < 5; i++) {
    const result = await limiter.check('user:test');

    if (!result.allowed) {
      throw new Error(
        `Request ${i + 1} was rejected but should be within the limit.`,
      );
    }

    if (result.remaining !== 5 - i - 1) {
      throw new Error(
        `Request ${i + 1}: expected remaining ${5 - i - 1}, got ${result.remaining}.`,
      );
    }
  }
}

async function testRejectsBeyondLimit(): Promise<void> {
  const limiter = new InMemorySlidingWindowRateLimiter(3, 60_000);

  for (let i = 0; i < 3; i++) {
    const result = await limiter.check('user:burst');

    if (!result.allowed) {
      throw new Error(
        `Request ${i + 1} was rejected but should be within limit.`,
      );
    }
  }

  const exceeded = await limiter.check('user:burst');

  if (exceeded.allowed) {
    throw new Error(
      'Request beyond the limit must be rejected.',
    );
  }

  if (exceeded.remaining !== 0) {
    throw new Error(
      'Remaining must be 0 when rate limited.',
    );
  }
}

async function testDifferentKeysAreIndependent(): Promise<void> {
  const limiter = new InMemorySlidingWindowRateLimiter(2, 60_000);

  // Exhaust key A
  await limiter.check('user:A');
  await limiter.check('user:A');

  const aExceeded = await limiter.check('user:A');

  if (aExceeded.allowed) {
    throw new Error('Key A must be rate limited after 2 requests.');
  }

  // Key B must still have its full budget
  const b1 = await limiter.check('user:B');

  if (!b1.allowed || b1.remaining !== 1) {
    throw new Error(
      'Key B must have its own independent budget.',
    );
  }
}

async function testWindowSlidesAfterTimeout(): Promise<void> {
  const limiter = new InMemorySlidingWindowRateLimiter(1, 100);

  // Use the only slot
  const first = await limiter.check('user:slide');

  if (!first.allowed || first.remaining !== 0) {
    throw new Error('First request must be allowed.');
  }

  // Immediately rejected
  const rejected = await limiter.check('user:slide');

  if (rejected.allowed) {
    throw new Error('Second request must be rejected within the window.');
  }

  // Wait for the window to expire
  await new Promise((resolve) => setTimeout(resolve, 110));

  const afterWindow = await limiter.check('user:slide');

  if (!afterWindow.allowed) {
    throw new Error(
      'Request after the window expires must be allowed.',
    );
  }
}

async function testResetAt(): Promise<void> {
  const limiter = new InMemorySlidingWindowRateLimiter(1, 5_000);
  const before = Date.now();

  const result = await limiter.check('user:reset');

  if (!result.allowed) {
    throw new Error('First request must be allowed.');
  }

  // resetAt must be in the future
  if (result.resetAt <= before) {
    throw new Error('resetAt must be in the future.');
  }

  // resetAt must be approximately oldest_timestamp + window_ms
  const expectedMin = before + 5_000;

  if (result.resetAt < expectedMin - 10) {
    throw new Error(
      `resetAt ${result.resetAt} is too early; expected >= ${expectedMin}.`,
    );
  }
}

async function main(): Promise<void> {
  await testAllowsWithinLimit();
  await testRejectsBeyondLimit();
  await testDifferentKeysAreIndependent();
  await testWindowSlidesAfterTimeout();
  await testResetAt();

  console.log('RATE LIMITER TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});