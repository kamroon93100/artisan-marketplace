import { validateQueueMessage } from './queue-message-validation.js';
import assert from 'node:assert/strict';

const VALID_MESSAGE: ReturnType<typeof validateQueueMessage> = {
  jobId: '00000000-0000-4000-8000-000000000001',
  productId: '00000000-0000-4000-8000-000000000002',
  ownerId: '00000000-0000-4000-8000-000000000003',
  correlationId: 'corr-1',
  causationId: null,
  idempotencyKey: 'key-1',
  attempt: 0,
  maxAttempts: 3,
  payloadVersion: 1,
};

async function testValidateQueueMessageAcceptsValidMessage(): Promise<void> {
  const result = validateQueueMessage(VALID_MESSAGE);
  assert.deepEqual(result, VALID_MESSAGE);
}

async function testValidateQueueMessageRejectsNull(): Promise<void> {
  try {
    validateQueueMessage(null);
    throw new Error('Expected validation to throw for null');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /must be an object/);
  }
}

async function testValidateQueueMessageRejectsNonObject(): Promise<void> {
  try {
    validateQueueMessage('not an object');
    throw new Error('Expected validation to throw for string');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /must be an object/);
  }
}

async function testValidateQueueMessageRejectsArray(): Promise<void> {
  try {
    validateQueueMessage([]);
    throw new Error('Expected validation to throw for array');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /missing required field: jobId/);
  }
}

async function testValidateQueueMessageRejectsMissingJobId(): Promise<void> {
  const { jobId, ...rest } = VALID_MESSAGE;
  try {
    validateQueueMessage(rest);
    throw new Error('Expected validation to throw for missing jobId');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /missing required field: jobId/);
  }
}

async function testValidateQueueMessageRejectsEmptyJobId(): Promise<void> {
  const message = { ...VALID_MESSAGE, jobId: '' };
  try {
    validateQueueMessage(message);
    throw new Error('Expected validation to throw for empty jobId');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /jobId must be a non-empty string/);
  }
}

async function testValidateQueueMessageRejectsMissingProductId(): Promise<void> {
  const { productId, ...rest } = VALID_MESSAGE;
  try {
    validateQueueMessage(rest);
    throw new Error('Expected validation to throw for missing productId');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /missing required field: productId/);
  }
}

async function testValidateQueueMessageRejectsMissingOwnerId(): Promise<void> {
  const { ownerId, ...rest } = VALID_MESSAGE;
  try {
    validateQueueMessage(rest);
    throw new Error('Expected validation to throw for missing ownerId');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /missing required field: ownerId/);
  }
}

async function testValidateQueueMessageRejectsMissingCorrelationId(): Promise<void> {
  const { correlationId, ...rest } = VALID_MESSAGE;
  try {
    validateQueueMessage(rest);
    throw new Error('Expected validation to throw for missing correlationId');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /missing required field: correlationId/);
  }
}

async function testValidateQueueMessageRejectsInvalidAttempt(): Promise<void> {
  const message = { ...VALID_MESSAGE, attempt: -1 };
  try {
    validateQueueMessage(message);
    throw new Error('Expected validation to throw for negative attempt');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /attempt must be a non-negative integer/);
  }
}

async function testValidateQueueMessageRejectsNonIntegerAttempt(): Promise<void> {
  const message = { ...VALID_MESSAGE, attempt: 1.5 };
  try {
    validateQueueMessage(message);
    throw new Error('Expected validation to throw for non-integer attempt');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /attempt must be a non-negative integer/);
  }
}

async function testValidateQueueMessageRejectsInvalidMaxAttempts(): Promise<void> {
  const message = { ...VALID_MESSAGE, maxAttempts: 0 };
  try {
    validateQueueMessage(message);
    throw new Error('Expected validation to throw for zero maxAttempts');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /maxAttempts must be a positive integer/);
  }
}

async function testValidateQueueMessageRejectsInvalidPayloadVersion(): Promise<void> {
  const message = { ...VALID_MESSAGE, payloadVersion: 0 };
  try {
    validateQueueMessage(message);
    throw new Error('Expected validation to throw for zero payloadVersion');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /payloadVersion must be a positive integer/);
  }
}

async function testValidateQueueMessageAcceptsNullCausationId(): Promise<void> {
  const message = { ...VALID_MESSAGE, causationId: null };
  const result = validateQueueMessage(message);
  assert.equal(result.causationId, null);
}

async function testValidateQueueMessageAcceptsUndefinedCausationId(): Promise<void> {
  const message = { ...VALID_MESSAGE, causationId: undefined };
  const result = validateQueueMessage(message);
  assert.equal(result.causationId, null);
}

async function testValidateQueueMessageRejectsNonStringCausationId(): Promise<void> {
  const message = { ...VALID_MESSAGE, causationId: 123 };
  try {
    validateQueueMessage(message);
    throw new Error('Expected validation to throw for non-string causationId');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /causationId must be a string or null/);
  }
}

async function testValidateQueueMessageAcceptsNullIdempotencyKey(): Promise<void> {
  const message = { ...VALID_MESSAGE, idempotencyKey: null };
  const result = validateQueueMessage(message);
  assert.equal(result.idempotencyKey, null);
}

async function testValidateQueueMessageAcceptsUndefinedIdempotencyKey(): Promise<void> {
  const message = { ...VALID_MESSAGE, idempotencyKey: undefined };
  const result = validateQueueMessage(message);
  assert.equal(result.idempotencyKey, null);
}

async function testValidateQueueMessageRejectsNonStringIdempotencyKey(): Promise<void> {
  const message = { ...VALID_MESSAGE, idempotencyKey: 123 };
  try {
    validateQueueMessage(message);
    throw new Error('Expected validation to throw for non-string idempotencyKey');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.match(error.message, /idempotencyKey must be a string or null/);
  }
}

async function main(): Promise<void> {
  await testValidateQueueMessageAcceptsValidMessage();
  await testValidateQueueMessageRejectsNull();
  await testValidateQueueMessageRejectsNonObject();
  await testValidateQueueMessageRejectsArray();
  await testValidateQueueMessageRejectsMissingJobId();
  await testValidateQueueMessageRejectsEmptyJobId();
  await testValidateQueueMessageRejectsMissingProductId();
  await testValidateQueueMessageRejectsMissingOwnerId();
  await testValidateQueueMessageRejectsMissingCorrelationId();
  await testValidateQueueMessageRejectsInvalidAttempt();
  await testValidateQueueMessageRejectsNonIntegerAttempt();
  await testValidateQueueMessageRejectsInvalidMaxAttempts();
  await testValidateQueueMessageRejectsInvalidPayloadVersion();
  await testValidateQueueMessageAcceptsNullCausationId();
  await testValidateQueueMessageAcceptsUndefinedCausationId();
  await testValidateQueueMessageRejectsNonStringCausationId();
  await testValidateQueueMessageAcceptsNullIdempotencyKey();
  await testValidateQueueMessageAcceptsUndefinedIdempotencyKey();
  await testValidateQueueMessageRejectsNonStringIdempotencyKey();

  console.log('QUEUE CONSUMER VALIDATION TESTS PASSED');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});