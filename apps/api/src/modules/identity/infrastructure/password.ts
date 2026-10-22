/**
 * Password hashing and verification using Argon2id.
 *
 * Per M8 Q5.1 decision: Argon2id with baseline parameters:
 * - memory = 19456 KiB
 * - iterations = 2
 * - parallelism = 1
 * - salt = 16 random bytes
 * - output/tag = 32 bytes
 * - store complete PHC-format encoded string
 *
 * Parameters must not be silently changed.
 *
 * Implementation note (worker-runtime slice): Argon2id runs over
 * precompiled WebAssembly modules. Cloudflare Workers forbid runtime
 * WebAssembly code generation, so `WebAssembly.compile(bytes)` /
 * `new WebAssembly.Module(bytes)` fail there with
 * `CompileError: Wasm code generation disallowed by embedder`; the binaries
 * are therefore precompiled at build time and only instantiated
 * (`argon2-driver.ts`, registered by `src/worker.ts`). The previous
 * `@node-rs/argon2` implementation could not run in workerd at all, and the
 * `hash-wasm` migration that replaced it compiled wasm bytes at runtime,
 * which workerd rejects. Algorithm, parameters, PHC storage, and
 * verification semantics are unchanged; hashes stored by any of those
 * implementations verify here.
 */

import type { Argon2idRunOptions } from './argon2-driver.js';
import { createArgon2idRunner } from './argon2-driver.js';
import { getPrecompiledArgon2Modules } from './argon2-modules.js';

/**
 * The M8 Q5.1 approved baseline. Implementation MUST perform Cloudflare
 * Workers resource/latency validation before production use. Parameters must
 * not be silently increased or decreased without an explicit
 * implementation-time security decision.
 */
const ARGON2ID_MEMORY_COST = 19456; // KiB
const ARGON2ID_TIME_COST = 2; // iterations
const ARGON2ID_PARALLELISM = 1; // parallelism
const ARGON2ID_SALT_BYTES = 16;
const ARGON2ID_OUTPUT_BYTES = 32;
const APPROVED_PHC_VERSION = 19;

/**
 * PHC layout produced and consumed here:
 * $argon2id$v=19$m=19456,t=2,p=1$<base64-salt>$<base64-hash>
 * Base64 is the standard alphabet, padding optional (RFC 9106 / PHC string
 * format allow either encoding of the same bytes).
 */
const PHC_ARGON2ID_PATTERN =
  /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/;

/**
 * Runs Argon2id over the precompiled modules. One runner is built per call
 * from the (cached) modules; each call instantiates its own wasm instances,
 * so concurrent requests never share mutable wasm state.
 */
async function argon2id(options: Argon2idRunOptions): Promise<string | Uint8Array> {
  const modules = await getPrecompiledArgon2Modules();
  return createArgon2idRunner(modules)(options);
}

/**
 * Hash a password using Argon2id with the approved baseline parameters.
 * Returns the complete PHC-format encoded string.
 *
 * @param password - Plaintext password (byte-exact, no normalization per Q5.11)
 * @returns PHC-format Argon2id string (e.g., $argon2id$v=19$m=19456,t=2,p=1$...$...)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(ARGON2ID_SALT_BYTES));
  return (await argon2id({
    password,
    salt,
    iterations: ARGON2ID_TIME_COST,
    parallelism: ARGON2ID_PARALLELISM,
    memorySize: ARGON2ID_MEMORY_COST,
    hashLength: ARGON2ID_OUTPUT_BYTES,
    outputType: 'encoded' as const,
  })) as string;
}

/**
 * Verify a password against a stored Argon2id hash.
 * The stored parameters and salt drive re-derivation; the derived tag is
 * compared in constant time to prevent timing attacks. Malformed,
 * unsupported-version, or non-Argon2id input is treated as a failed
 * verification rather than an error.
 *
 * @param password - Plaintext password to verify (byte-exact)
 * @param hash - Stored PHC-format Argon2id hash
 * @returns true if password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const match = PHC_ARGON2ID_PATTERN.exec(hash);
    if (match === null) {
      return false;
    }

    const [, version, memory, timeCost, parallelism, saltBase64, expectedBase64] = match;
    if (Number(version) !== APPROVED_PHC_VERSION) {
      return false;
    }

    const salt = decodeBase64(saltBase64);
    const expected = decodeBase64(expectedBase64);
    if (salt.length === 0 || expected.length < 4) {
      return false;
    }

    const derived = await argon2id({
      password,
      salt,
      memorySize: Number(memory),
      iterations: Number(timeCost),
      parallelism: Number(parallelism),
      hashLength: expected.length,
      outputType: 'binary' as const,
    });

    return constantTimeEqual(derived as Uint8Array, expected);
  } catch {
    // Invalid parameter combinations or unreadable input fail verification.
    return false;
  }
}

/**
 * Validate that a stored hash uses the approved Argon2id parameters.
 * Used for defense-in-depth to reject hashes from weaker algorithms.
 *
 * @param hash - Stored PHC-format hash string
 * @returns true if hash uses Argon2id with approved parameters
 */
export function isApprovedArgon2idHash(hash: string): boolean {
  // Check for Argon2id algorithm identifier
  if (!hash.startsWith('$argon2id$')) {
    return false;
  }
  
  // Parse parameters from PHC string: $argon2id$v=19$m=19456,t=2,p=1$...
  const paramMatch = hash.match(/^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/);
  if (!paramMatch) {
    return false;
  }
  
  const memory = parseInt(paramMatch[1], 10);
  const iterations = parseInt(paramMatch[2], 10);
  const parallelism = parseInt(paramMatch[3], 10);
  
  // Verify against approved baseline
  return memory === 19456 && iterations === 2 && parallelism === 1;
}

function decodeBase64(value: string): Uint8Array {
  const unpadded = value.replace(/={1,2}$/, '');
  const binary = atob(unpadded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
