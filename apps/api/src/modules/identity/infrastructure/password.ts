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
 * Implementation MUST perform Cloudflare Workers resource/latency validation
 * before production use. Parameters must not be silently changed.
 */

import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id options matching the M8 Q5.1 approved baseline:
 * - memory = 19456 KiB (19 MiB)
 * - iterations = 2
 * - parallelism = 1
 * - saltLen = 16 bytes
 * - hashLen = 32 bytes
 * 
 * These are the approved design baseline. Implementation MUST perform
 * Cloudflare Workers resource/latency validation before production use.
 * Parameters must not be silently increased or decreased without an
 * explicit implementation-time security decision.
 */
const ARGON2ID_MEMORY_COST = 19456;     // KiB
const ARGON2ID_TIME_COST = 2;           // iterations
const ARGON2ID_PARALLELISM = 1;         // parallelism

/**
 * Hash a password using Argon2id with the approved baseline parameters.
 * Returns the complete PHC-format encoded string.
 * 
 * @param password - Plaintext password (byte-exact, no normalization per Q5.11)
 * @returns PHC-format Argon2id string (e.g., $argon2id$v=19$m=19456,t=2,p=1$...$...)
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: ARGON2ID_MEMORY_COST,
    timeCost: ARGON2ID_TIME_COST,
    parallelism: ARGON2ID_PARALLELISM,
  });
}

/**
 * Verify a password against a stored Argon2id hash.
 * Uses constant-time comparison to prevent timing attacks.
 * 
 * @param password - Plaintext password to verify (byte-exact)
 * @param hash - Stored PHC-format Argon2id hash
 * @returns true if password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await verify(hash, password);
  } catch {
    // verify() may throw if hash format is invalid
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