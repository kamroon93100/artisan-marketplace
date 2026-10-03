import {
  redactSecrets,
  safeFailureMessage,
} from './redact-secrets';

function assertEqual(
  actual: string,
  expected: string,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertTrue(
  condition: boolean,
  label: string,
): void {
  if (!condition) {
    throw new Error(`${label}: expected true.`);
  }
}

/**
 * A signature must never survive redaction, in any of the shapes an
 * object store or HTTP library produces. A partial signature is still
 * treated as a leak.
 */
function testSignaturesAreRemoved(): void {
  const cases: [string, string][] = [
    [
      'https://storage.test/media/a.jpg?X-Amz-Signature=abc123&X-Amz-Date=20240101',
      'https://storage.test/media/a.jpg?X-Amz-Date=20240101',
    ],
    [
      'https://storage.test/media/a.jpg?signature=deadbeef',
      'https://storage.test/media/a.jpg?[redacted]',
    ],
    [
      'https://storage.test/media/a.jpg?X-Amz-Signature=abc&X-Amz-Credential=AKIA123',
      'https://storage.test/media/a.jpg?[redacted]',
    ],
  ];

  for (const [input, expected] of cases) {
    assertEqual(
      redactSecrets(input),
      expected,
      `redaction of ${input.slice(0, 40)}`,
    );
  }

  // A signature must be gone from the result, not merely shortened.
  const redacted = redactSecrets(
    'https://storage.test/m.jpg?X-Amz-Signature=supersecretvalue',
  );

  assertTrue(
    !redacted.includes('supersecretvalue'),
    'the signature value does not survive',
  );
}

/**
 * Native and HTTP libraries frequently report failures as bare
 * `key=value` text rather than as a URL.
 */
function testBareCredentialsAreRemoved(): void {
  const input =
    'Request failed: token=abcdef123456&retries=2 path=/media/a.jpg';

  const redacted = redactSecrets(input);

  assertTrue(
    !redacted.includes('abcdef123456'),
    'a bare token value does not survive',
  );
  assertTrue(
    redacted.includes('retries=2'),
    'non-sensitive parameters stay readable',
  );
  assertTrue(
    redacted.includes('/media/a.jpg'),
    'the failing object stays diagnosable',
  );
}

/**
 * A durable error record and an artisan-facing message are the same
 * string, so the failure path is proven through the function the
 * pipeline actually calls.
 */
function testFailureMessagesAreSafeToPersist(): void {
  const message = safeFailureMessage(
    new Error(
      'Upload failed for https://s3.test/k/1.jpg?X-Amz-Signature=SECRETVALUE',
    ),
    'fallback',
  );

  assertTrue(
    !message.includes('SECRETVALUE'),
    'a persisted failure message carries no signature',
  );

  // A non-Error rejection is still handled.
  assertEqual(
    safeFailureMessage('plain failure', 'fallback'),
    'plain failure',
    'a string rejection is preserved',
  );

  assertEqual(
    safeFailureMessage(undefined, 'fallback'),
    'fallback',
    'an undefined rejection uses the fallback',
  );

  assertEqual(
    safeFailureMessage(new Error('   '), 'fallback'),
    'fallback',
    'a blank rejection uses the fallback',
  );

  // The bound keeps a large body from filling a column.
  const long = safeFailureMessage(
    new Error('x'.repeat(5000)),
    'fallback',
    100,
  );

  if (long.length > 100) {
    throw new Error(
      `expected the message to be bounded, received ${long.length} characters.`,
    );
  }
}

/**
 * Redaction must not destroy ordinary diagnostics, or every failure
 * becomes unactionable for the artisan.
 */
function testDiagnosticsSurviveRedaction(): void {
  const input =
    'Network request failed: timeout after 30000ms while uploading media/1.jpg';

  assertEqual(
    redactSecrets(input),
    input,
    'an ordinary failure is unchanged',
  );
}

testSignaturesAreRemoved();
testBareCredentialsAreRemoved();
testFailureMessagesAreSafeToPersist();
testDiagnosticsSurviveRedaction();

console.log('REDACTION TESTS PASSED');
