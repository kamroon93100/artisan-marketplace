import {
  AI_FAILURE_CODES,
} from '@artisan-marketplace/contracts';
import type {
  AiFailure,
  AiFailureCode,
} from '@artisan-marketplace/contracts';

/**
 * A failure whose origin is outside the validation pipeline: the provider
 * could not be reached, or answered with something unusable.
 *
 * `diagnostic` is the provider's own message. It is retained because
 * ADR-005 requires a normalized category to be reported "without discarding
 * the underlying diagnostic information required for operations", and it is
 * truncated because a provider error page can carry anything. An adapter is
 * responsible for never placing a credential or a raw authorization header in
 * it.
 */
export class AiProviderError extends Error {
  constructor(
    public readonly code: AiFailureCode,
    message: string,
    public readonly diagnostic: string | null = null,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/**
 * Longest provider diagnostic that is retained. Anything beyond this is
 * truncated with a visible marker rather than dropped silently, so a reader
 * can tell the diagnostic was shortened.
 */
const MAX_DIAGNOSTIC_LENGTH = 2_000;

/**
 * Whether a failure is worth retrying.
 *
 * This is a property of the failure category rather than of the call site,
 * so the same category retries the same way whichever adapter reported it. A
 * timeout or a rate limit may succeed on a later attempt; a rejected
 * credential or malformed output will not, and retrying it would burn the
 * budget and delay the human who has to fix the configuration.
 */
const RETRYABLE: ReadonlySet<AiFailureCode> = new Set<AiFailureCode>([
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_RATE_LIMITED',
]);

export function isRetryableFailure(
  code: AiFailureCode,
): boolean {
  return RETRYABLE.has(code);
}

export function isAiFailureCode(
  value: unknown,
): value is AiFailureCode {
  return (
    typeof value === 'string' &&
    (AI_FAILURE_CODES as readonly string[]).includes(value)
  );
}

export function truncateDiagnostic(
  diagnostic: string,
): string {
  if (diagnostic.length <= MAX_DIAGNOSTIC_LENGTH) {
    return diagnostic;
  }

  return `${diagnostic.slice(0, MAX_DIAGNOSTIC_LENGTH)}[truncated]`;
}

/**
 * Normalizes anything thrown or returned by an adapter into the internal
 * failure shape.
 *
 * A failure that is already an `AiFailureCode` keeps its category; anything
 * else becomes `DEPENDENCY_FAILED` with the original message as the
 * diagnostic, so an unanticipated adapter bug is still diagnosable rather
 * than being flattened into a category that claims the provider was
 * unavailable.
 *
 * A value that is already a normalized failure is passed through unchanged.
 * The validation pipeline produces one for a schema rejection, and running it
 * back through this function would replace a specific category with
 * `DEPENDENCY_FAILED` and replace the message with an unusable
 * `[object Object]` diagnostic - the job would then record a schema problem as
 * an unknown provider fault.
 */
export function toAiFailure(error: unknown): AiFailure {
  if (error instanceof AiProviderError) {
    return {
      code: error.code,
      message: error.message,
      diagnostic: error.diagnostic
        ? truncateDiagnostic(error.diagnostic)
        : null,
      retryable: isRetryableFailure(error.code),
    };
  }

  if (isAiFailure(error)) {
    return error;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'AI provider failed for an unknown reason.';

  return {
    code: 'DEPENDENCY_FAILED',
    message: 'AI provider failed for an unknown reason.',
    diagnostic: truncateDiagnostic(message),
    retryable: false,
  };
}

/**
 * A value that is already a normalized failure.
 *
 * The code is checked against the contract rather than trusted, so an
 * arbitrary object with a `code` field cannot smuggle an unrecorded category
 * into a job row.
 */
function isAiFailure(
  value: unknown,
): value is AiFailure {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<AiFailure>;

  return (
    isAiFailureCode(candidate.code) &&
    typeof candidate.message === 'string' &&
    typeof candidate.retryable === 'boolean' &&
    (candidate.diagnostic === null ||
      typeof candidate.diagnostic === 'string')
  );
}

/**
 * The failure recorded when the provider answered with something that is not
 * usable at all, distinguished from one that answered with a valid object
 * whose fields are individually invalid. The first is an adapter or
 * integration fault; the second is a partial result.
 */
export function schemaFailure(
  message: string,
  diagnostic?: unknown,
): AiFailure {
  const code: AiFailureCode = 'PROVIDER_OUTPUT_SCHEMA_INVALID';

  return {
    code,
    message,
    diagnostic:
      diagnostic === undefined
        ? null
        : truncateDiagnostic(safeStringify(diagnostic)),
    retryable: isRetryableFailure(code),
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
