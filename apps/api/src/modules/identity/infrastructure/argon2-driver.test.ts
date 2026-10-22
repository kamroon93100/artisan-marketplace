import assert from 'node:assert/strict';
import { hash as nodeRsHash } from '@node-rs/argon2';
import { argon2id as hashWasmArgon2id } from 'hash-wasm';
import { createArgon2idRunner } from './argon2-driver.js';
import { getPrecompiledArgon2Modules } from './argon2-modules.js';

/**
 * Focused tests for the precompiled Argon2 driver.
 *
 * The point of this suite is byte-for-byte agreement with the reference
 * implementations this driver must remain interoperable with: hashes stored
 * by the previous `@node-rs/argon2` implementation and by the intermediate
 * `hash-wasm` migration have to keep verifying, and hashes produced here
 * have to verify under both of them. A single differing byte anywhere in
 * the H0 chain, block fill, or final tag derivation shows up here.
 */

const BASELINE = {
  iterations: 2,
  parallelism: 1,
  memorySize: 19456,
  hashLength: 32,
} as const;

const PASSWORD = 'correct horse battery staple';
/** Fixed 16-byte salt so every implementation hashes the identical input. */
const SALT = Uint8Array.from(
  '0123456789abcdef0123456789abcdef',
  (char) => char.charCodeAt(0),
);

async function withRunner<T>(body: (runner: ReturnType<typeof createArgon2idRunner>) => Promise<T>): Promise<T> {
  const modules = await getPrecompiledArgon2Modules();
  return body(createArgon2idRunner(modules));
}

function decodeSegment(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replace(/={1,2}$/, '')), (char) => char.charCodeAt(0));
}

async function testEncodedOutputMatchesReferenceImplementations(): Promise<void> {
  const ours = await withRunner((runner) =>
    runner({ ...BASELINE, password: PASSWORD, salt: SALT, outputType: 'encoded' }),
  );

  const viaHashWasm = await hashWasmArgon2id({
    password: PASSWORD,
    salt: SALT,
    iterations: BASELINE.iterations,
    parallelism: BASELINE.parallelism,
    memorySize: BASELINE.memorySize,
    hashLength: BASELINE.hashLength,
    outputType: 'encoded',
  });

  const viaNodeRs = await nodeRsHash(PASSWORD, {
    memoryCost: BASELINE.memorySize,
    timeCost: BASELINE.iterations,
    parallelism: BASELINE.parallelism,
    salt: SALT,
    outputLen: BASELINE.hashLength,
  });

  assert.equal(
    typeof ours === 'string',
    true,
    'encoded output must be a string',
  );
  assert.equal(
    ours,
    viaHashWasm,
    'encoded PHC must match the hash-wasm reference byte for byte',
  );
  assert.equal(
    ours,
    viaNodeRs,
    'encoded PHC must match the @node-rs/argon2 reference byte for byte',
  );
}

async function testBinaryOutputMatchesReference(): Promise<void> {
  const ours = await withRunner((runner) =>
    runner({ ...BASELINE, password: PASSWORD, salt: SALT, outputType: 'binary' }),
  );

  const viaHashWasm = await hashWasmArgon2id({
    password: PASSWORD,
    salt: SALT,
    iterations: BASELINE.iterations,
    parallelism: BASELINE.parallelism,
    memorySize: BASELINE.memorySize,
    hashLength: BASELINE.hashLength,
    outputType: 'binary',
  });

  assert.equal(ours instanceof Uint8Array, true, 'binary output must be a Uint8Array');
  assert.equal((ours as Uint8Array).length, BASELINE.hashLength, 'tag must be 32 bytes');
  assert.equal(
    Buffer.from(ours as Uint8Array).toString('hex'),
    Buffer.from(viaHashWasm).toString('hex'),
    'binary tag must match the reference implementation byte for byte',
  );
}

async function testReferenceHashesVerifyAgainstDriverOutput(): Promise<void> {
  const reference = await hashWasmArgon2id({
    password: PASSWORD,
    salt: SALT,
    iterations: BASELINE.iterations,
    parallelism: BASELINE.parallelism,
    memorySize: BASELINE.memorySize,
    hashLength: BASELINE.hashLength,
    outputType: 'encoded',
  });

  // Re-derive from the reference hash's own parameters and salt, exactly the
  // way password.verifyPassword does, and compare the tag.
  const segments = reference.split('$');
  const salt = decodeSegment(segments[4]!);
  const expected = decodeSegment(segments[5]!);

  const derived = await withRunner((runner) =>
    runner({
      password: PASSWORD,
      salt,
      memorySize: 19456,
      iterations: 2,
      parallelism: 1,
      hashLength: expected.length,
      outputType: 'binary',
    }),
  );

  assert.equal(
    Buffer.from(derived as Uint8Array).toString('hex'),
    Buffer.from(expected).toString('hex'),
    'a reference-stored hash must re-derive to the same tag through this driver',
  );
}

async function testDifferentPasswordsProduceDifferentTags(): Promise<void> {
  const [first, second] = await withRunner(async (runner) =>
    Promise.all(
      [PASSWORD, 'definitely-a-different-password'].map((password) =>
        runner({ ...BASELINE, password, salt: SALT, outputType: 'binary' }),
      ),
    ),
  );

  assert.notEqual(
    Buffer.from(first as Uint8Array).toString('hex'),
    Buffer.from(second as Uint8Array).toString('hex'),
    'different passwords must produce different tags',
  );
}

async function testInvalidOptionsAreRejected(): Promise<void> {
  await withRunner(async (runner) => {
    // Parity with the reference driver's validation: a malformed stored hash
    // must fail closed rather than drive the wasm with nonsense parameters.
    for (const bad of [
      { ...BASELINE, password: PASSWORD, salt: SALT, parallelism: 0 },
      { ...BASELINE, password: PASSWORD, salt: SALT, iterations: 0 },
      { ...BASELINE, password: PASSWORD, salt: SALT, memorySize: 1 },
      { ...BASELINE, password: PASSWORD, salt: new Uint8Array(4) },
      { ...BASELINE, password: PASSWORD, salt: SALT, hashLength: 2 },
      // A tampered stored hash must not be able to grow the wasm arena to a
      // size that terminates the isolate.
      { ...BASELINE, password: PASSWORD, salt: SALT, memorySize: 4194304 },
    ]) {
      await assert.rejects(
        () => runner({ ...bad, outputType: 'binary' }),
        TypeError,
        'invalid options must be rejected with a TypeError',
      );
    }
  });
}

/**
 * A hostile stored hash names its own parameters, so the ceiling must be
 * reachable end-to-end through the verifying caller: one oversized memory
 * cost is enough to terminate an isolate if it reaches the wasm.
 */
async function testVerifyRejectsOversizedStoredParameters(): Promise<void> {
  const digest = (bytes: Uint8Array): string =>
    Buffer.from(bytes).toString('base64').replace(/=+$/, '');
  const salt = digest(new Uint8Array(16).fill(9));
  const tag = digest(new Uint8Array(32).fill(4));
  const oversized = `$argon2id$v=19$m=4194304,t=2,p=1$${salt}$${tag}`;

  const { verifyPassword } = await import('./password.js');
  assert.equal(
    await verifyPassword(PASSWORD, oversized),
    false,
    'a stored hash demanding an oversized arena must fail verification closed',
  );
}

async function main(): Promise<void> {
  await testEncodedOutputMatchesReferenceImplementations();
  await testBinaryOutputMatchesReference();
  await testReferenceHashesVerifyAgainstDriverOutput();
  await testDifferentPasswordsProduceDifferentTags();
  await testInvalidOptionsAreRejected();
  await testVerifyRejectsOversizedStoredParameters();

  console.log('PRECOMPILED ARGON2 DRIVER TESTS PASSED');
}

void main().catch((error) => {
  console.error('PRECOMPILED ARGON2 DRIVER TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
