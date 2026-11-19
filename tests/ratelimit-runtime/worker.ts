import {
  AuthRateLimiterDurableObject,
} from '../../apps/api/src/shared/ratelimit/auth-rate-limiter-durable-object.js';
import {
  DurableObjectRateLimiter,
  hashRateLimitSubject,
} from '../../apps/api/src/shared/ratelimit/durable-object-rate-limiter.js';
import {
  RATE_LIMIT_CHECK_URL,
} from '../../apps/api/src/shared/ratelimit/rate-limiter-operation.js';

export { AuthRateLimiterDurableObject };

type Env = {
  AUTH_RATE_LIMITER: DurableObjectNamespace;
};

type CheckRequest = {
  subject: string;
  limit: number;
  windowMs: number;
  now: number;
};

type RawDoRequest = {
  subject: string;
  body: unknown;
};

const MAX_SUBJECT_LENGTH = 512;
const MAX_LIMIT = 1_000_000;
const MAX_WINDOW_MS = 86_400_000;

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function hasOnlyFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);

  return Object.keys(value).every((field) => allowedSet.has(field));
}

function validSubject(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SUBJECT_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function parseCheckRequest(value: unknown): CheckRequest | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const body = value as Record<string, unknown>;

  if (!hasOnlyFields(body, ['subject', 'limit', 'windowMs', 'now'])) {
    return null;
  }

  const {
    subject,
    limit,
    windowMs,
    now,
  } = body;

  if (!validSubject(subject)) {
    return null;
  }

  if (
    !Number.isInteger(limit) ||
    (limit as number) <= 0 ||
    (limit as number) > MAX_LIMIT
  ) {
    return null;
  }

  if (
    typeof windowMs !== 'number' ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0 ||
    windowMs > MAX_WINDOW_MS
  ) {
    return null;
  }

  if (
    typeof now !== 'number' ||
    !Number.isSafeInteger(now)
  ) {
    return null;
  }

  return {
    subject,
    limit: limit as number,
    windowMs,
    now,
  };
}

function parseRawDoRequest(value: unknown): RawDoRequest | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const request = value as Record<string, unknown>;

  if (!hasOnlyFields(request, ['subject', 'body'])) {
    return null;
  }

  if (!validSubject(request.subject)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(request, 'body')) {
    return null;
  }

  return {
    subject: request.subject,
    body: request.body,
  };
}

async function readJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return {
      ok: true,
      value: await request.json(),
    };
  } catch {
    return { ok: false };
  }
}

async function handleCheck(
  request: Request,
  env: Env,
): Promise<Response> {
  const parsedBody = await readJson(request);

  if (!parsedBody.ok) {
    return jsonResponse({ error: 'INVALID_REQUEST' }, 400);
  }

  const parsed = parseCheckRequest(parsedBody.value);

  if (parsed === null) {
    return jsonResponse({ error: 'INVALID_REQUEST' }, 400);
  }

  try {
    const limiter = new DurableObjectRateLimiter(
      env.AUTH_RATE_LIMITER,
      parsed.limit,
      parsed.windowMs,
      () => parsed.now,
    );

    const result = await limiter.check(parsed.subject);

    return jsonResponse(result);
  } catch {
    return jsonResponse(
      { error: 'RATE_LIMIT_DEPENDENCY_FAILED' },
      503,
    );
  }
}

async function handleRawDoRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const parsedBody = await readJson(request);

  if (!parsedBody.ok) {
    return jsonResponse({ error: 'INVALID_REQUEST' }, 400);
  }

  const parsed = parseRawDoRequest(parsedBody.value);

  if (parsed === null) {
    return jsonResponse({ error: 'INVALID_REQUEST' }, 400);
  }

  try {
    const objectName = await hashRateLimitSubject(parsed.subject);
    const objectId = env.AUTH_RATE_LIMITER.idFromName(objectName);
    const stub = env.AUTH_RATE_LIMITER.get(objectId);
    const response = await stub.fetch(RATE_LIMIT_CHECK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.body),
    });
    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return jsonResponse(
      { error: 'RATE_LIMIT_DEPENDENCY_FAILED' },
      503,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/check') {
      return handleCheck(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/raw-do') {
      return handleRawDoRequest(request, env);
    }

    return jsonResponse({ error: 'NOT_FOUND' }, 404);
  },
} satisfies ExportedHandler<Env>;
