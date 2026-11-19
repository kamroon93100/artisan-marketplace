import type { AiJobQueueMessage } from '../../../worker.js';

/**
 * Validates an AI job queue message.
 * Returns the validated message or throws if invalid.
 */
export function validateQueueMessage(message: unknown): AiJobQueueMessage {
  if (
    typeof message !== 'object' ||
    message === null
  ) {
    throw new Error('Queue message body must be an object');
  }

  const body = message as Record<string, unknown>;

  const requiredFields: (keyof AiJobQueueMessage)[] = [
    'jobId',
    'productId',
    'ownerId',
    'correlationId',
    'attempt',
    'maxAttempts',
    'payloadVersion',
  ];

  for (const field of requiredFields) {
    if (!(field in body)) {
      throw new Error(`Queue message missing required field: ${field}`);
    }
  }

  const { jobId, productId, ownerId, correlationId, attempt, maxAttempts, payloadVersion } = body;

  if (typeof jobId !== 'string' || jobId.length === 0) {
    throw new Error('Queue message jobId must be a non-empty string');
  }
  if (typeof productId !== 'string' || productId.length === 0) {
    throw new Error('Queue message productId must be a non-empty string');
  }
  if (typeof ownerId !== 'string' || ownerId.length === 0) {
    throw new Error('Queue message ownerId must be a non-empty string');
  }
  if (typeof correlationId !== 'string' || correlationId.length === 0) {
    throw new Error('Queue message correlationId must be a non-empty string');
  }
  if (typeof attempt !== 'number' || !Number.isInteger(attempt) || attempt < 0) {
    throw new Error('Queue message attempt must be a non-negative integer');
  }
  if (typeof maxAttempts !== 'number' || !Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error('Queue message maxAttempts must be a positive integer');
  }
  if (typeof payloadVersion !== 'number' || !Number.isInteger(payloadVersion) || payloadVersion <= 0) {
    throw new Error('Queue message payloadVersion must be a positive integer');
  }

  const causationId = body.causationId;
  if (causationId !== null && causationId !== undefined && typeof causationId !== 'string') {
    throw new Error('Queue message causationId must be a string or null');
  }

  const idempotencyKey = body.idempotencyKey;
  if (idempotencyKey !== null && idempotencyKey !== undefined && typeof idempotencyKey !== 'string') {
    throw new Error('Queue message idempotencyKey must be a string or null');
  }

  return {
    jobId,
    productId,
    ownerId,
    correlationId,
    causationId: causationId ?? null,
    idempotencyKey: idempotencyKey ?? null,
    attempt,
    maxAttempts,
    payloadVersion,
  };
}