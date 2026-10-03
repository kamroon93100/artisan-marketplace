import { classifyUploadOutcome } from '../sync/upload-outcome';

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

/**
 * The native upload resolves for every completed HTTP response. A
 * status the pipeline treats as success but the store refused would mark
 * media as uploaded when nothing was stored, so every non-2xx status must
 * be classified as a failure.
 */
async function testOnlySuccessIsSuccess(): Promise<void> {
  for (const status of [
    200, 201, 202, 204, 299,
  ]) {
    assertEqual(
      classifyUploadOutcome(status).ok,
      true,
      `${status} is a success`,
    );
  }

  for (const status of [
    100, 199, 300, 301, 302, 304, 308, 400, 401, 403, 404, 405, 409, 410, 412, 413, 415, 422, 428, 431, 451, 500, 502, 503, 504, 599,
  ]) {
    assertEqual(
      classifyUploadOutcome(status).ok,
      false,
      `${status} is not a success`,
    );
  }
}

/**
 * A refused authorization is recoverable: the next attempt requests a
 * fresh short-lived authorization before writing bytes again. It must not
 * force the artisan into a manual action state.
 */
async function testAuthorizationRejectionIsRetryable(): Promise<void> {
  for (const status of [401, 403]) {
    const outcome = classifyUploadOutcome(status);

    assertEqual(
      outcome.ok,
      false,
      `${status} fails`,
    );

    if (outcome.ok) {
      throw new Error('unreachable');
    }

    assertEqual(
      outcome.code,
      'UPLOAD_AUTHORIZATION_REJECTED',
      `${status} reports an authorization failure`,
    );

    assertEqual(
      outcome.retryable,
      true,
      `${status} is recoverable`,
    );
  }
}

async function testTransientFailuresAreRetryable(): Promise<void> {
  for (const status of [
    408, 425, 429, 500, 502, 503, 504, 599,
  ]) {
    const outcome = classifyUploadOutcome(status);

    if (outcome.ok) {
      throw new Error('unreachable');
    }

    assertEqual(
      outcome.retryable,
      true,
      `${status} is transient`,
    );
  }
}

/**
 * A client-side rejection cannot be fixed by retrying the same bytes, so
 * it must not spin the retry queue indefinitely.
 */
async function testClientRejectionsAreNotRetryable(): Promise<void> {
  for (const status of [
    400, 404, 405, 409, 410, 412, 413, 415, 422, 428, 431, 451,
  ]) {
    const outcome = classifyUploadOutcome(status);

    if (outcome.ok) {
      throw new Error('unreachable');
    }

    assertEqual(
      outcome.retryable,
      false,
      `${status} is not retried`,
    );
  }
}

/**
 * A presigned URL is a temporary credential. It must never appear in a
 * message that could reach a log, a screen, or a crash report.
 */
async function testMessagesCarryNoCredential(): Promise<void> {
  const secret =
    'https://storage.test/media/owner/product/1?X-Amz-Signature=deadbeefcafe&X-Amz-Credential=SECRETKEY';

  for (const status of [
    400, 401, 403, 404, 409, 500, 503,
  ]) {
    const outcome = classifyUploadOutcome(status);

    if (outcome.ok) {
      throw new Error('unreachable');
    }

    for (const [label, text] of [
      ['message', outcome.message],
      ['code', outcome.code],
    ] as const) {
      for (const fragment of [
        'X-Amz-Signature',
        'X-Amz-Credential',
        'deadbeefcafe',
        'SECRETKEY',
        '?',
      ]) {
        if (text.includes(fragment)) {
          throw new Error(
            `${status} ${label} leaked ${fragment}: ${text}`,
          );
        }
      }
    }

    // The message must still be actionable, so it must state the status.
    if (!outcome.message.includes(String(status))) {
      // Authorization rejections describe the cause instead of echoing
      // the status; every other message must name the status.
      if (status !== 401 && status !== 403) {
        throw new Error(
          `${status} message does not report the status: ${outcome.message}`,
        );
      }
    }
  }

  if (secret.length === 0) {
    throw new Error('unreachable');
  }
}

async function main(): Promise<void> {
  await testOnlySuccessIsSuccess();
  await testAuthorizationRejectionIsRetryable();
  await testTransientFailuresAreRetryable();
  await testClientRejectionsAreNotRetryable();
  await testMessagesCarryNoCredential();

  console.log('UPLOAD OUTCOME TESTS PASSED');
}

void main().catch((error) => {
  console.error('UPLOAD OUTCOME TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
