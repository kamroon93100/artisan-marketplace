import type { RateLimitResult } from './rate-limiter.js';
import {
  checkAndRecordRateLimit,
  type RateLimitSqlStorage,
} from './sqlite-rate-limit-store.js';

export const RATE_LIMIT_CHECK_PATH = '/check';
export const RATE_LIMIT_CHECK_URL =
  `https://rate-limiter.internal${RATE_LIMIT_CHECK_PATH}`;

export type RateLimitObjectRequest = {
  limit: number;
  windowMs: number;
  now: number;
};

type TransactionSync = <T>(closure: () => T) => T;

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function badRequest(): Response {
  return jsonResponse({ error: 'INVALID_REQUEST' }, 400);
}

/**
 * Parses and validates the internal Durable Object request body.
 *
 * Values are validated here, before any SQL runs, so a malformed request
 * cannot enter the storage path. The operation is internal-only, but it still
 * rejects unknown fields and non-finite values rather than trusting a caller.
 */
export function parseRateLimitObjectRequest(
  value: unknown,
): RateLimitObjectRequest | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const allowedFields = new Set(['limit', 'windowMs', 'now']);

  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) {
      return null;
    }
  }

  const { limit, windowMs, now } = body;

  if (!Number.isInteger(limit) || (limit as number) <= 0) {
    return null;
  }

  if (
    typeof windowMs !== 'number' ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0
  ) {
    return null;
  }

  if (typeof now !== 'number' || !Number.isFinite(now)) {
    return null;
  }

  return {
    limit: limit as number,
    windowMs,
    now,
  };
}

/**
 * Handles one internal rate-limit check without importing Cloudflare runtime
 * globals.
 *
 * The Durable Object wrapper supplies `ctx.storage.transactionSync` as the
 * transaction seam. Node tests supply a SQLite transaction. The storage
 * operation itself is the same in both cases.
 */
export async function handleRateLimitObjectRequest(
  request: Request,
  storage: RateLimitSqlStorage,
  transactionSync: TransactionSync,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname !== RATE_LIMIT_CHECK_PATH) {
    return jsonResponse({ error: 'NOT_FOUND' }, 404);
  }

  if (request.method !== 'POST') {
    const response = jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
    response.headers.set('allow', 'POST');
    return response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest();
  }

  const parsed = parseRateLimitObjectRequest(body);

  if (parsed === null) {
    return badRequest();
  }

  const result = transactionSync(() =>
    checkAndRecordRateLimit(
      storage,
      parsed.limit,
      parsed.windowMs,
      parsed.now,
    ),
  );

  return jsonResponse(result);
}

export type { RateLimitResult };
