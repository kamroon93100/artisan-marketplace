import type { AiJobInput } from '@artisan-marketplace/contracts';

/**
 * A canonical, order-independent encoding of a job's input.
 *
 * The hash exists to give an execution a stable input identity, which
 * ADR-005 requires and which makes a redelivered or retried run recognisable
 * as the same work. It is not a cache: nothing in this slice reuses a result
 * on the basis of it, and `docs/architecture/ai-contract.md` keeps caching
 * conditional.
 *
 * Keys are sorted at every level so two structurally identical inputs hash
 * identically regardless of the order the caller happened to build them in.
 * `undefined` members are dropped for the same reason: an absent optional and
 * an explicit `undefined` describe the same input.
 */
function canonicalize(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(
      value as Record<string, unknown>,
    )
      .filter(([, member]) => member !== undefined)
      .sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      );

    return entries.map(([key, member]) => [
      key,
      canonicalize(member),
    ]);
  }

  return value;
}

export function canonicalInputJson(
  input: AiJobInput,
): string {
  return JSON.stringify(canonicalize(input));
}

/**
 * SHA-256 of the canonical input encoding, as lowercase hex.
 *
 * Web Crypto is used because it is the one digest implementation available
 * both in the Worker runtime and in the local Node-based verification
 * runtime, so the identity a job is recorded with does not depend on which
 * environment produced it.
 */
export async function computeAiInputHash(
  input: AiJobInput,
): Promise<string> {
  const encoded = new TextEncoder().encode(
    canonicalInputJson(input),
  );

  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoded,
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
