import assert from 'node:assert/strict';
import { hash as nodeRsHash, verify as nodeRsVerify } from '@node-rs/argon2';
import {
  hashPassword,
  isApprovedArgon2idHash,
  verifyPassword,
} from './password.js';

/** The exact approved M8 Q5.1 PHC shape: Argon2id, v=19, m=19456, t=2, p=1. */
const APPROVED_PHC =
  /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;

const BASELINE_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function decodedSegmentLength(base64Segment: string): number {
  return Uint8Array.from(atob(base64Segment.replace(/={1,2}$/, '')), (char) =>
    char.charCodeAt(0),
  ).length;
}

async function testHashProducesApprovedPhcString(): Promise<void> {
  const phc = await hashPassword('correct horse battery staple');
  assert.match(phc, APPROVED_PHC, 'hash must be the approved Argon2id PHC shape');
  assert.equal(isApprovedArgon2idHash(phc), true, 'hash must pass the PHC guard');

  const segments = phc.split('$');
  assert.equal(segments.length, 6, 'PHC string must have 6 segments');
  assert.equal(
    decodedSegmentLength(segments[4]!),
    16,
    'salt segment must decode to 16 bytes',
  );
  assert.equal(
    decodedSegmentLength(segments[5]!),
    32,
    'hash segment must decode to 32 bytes',
  );
}

async function testVerifyRoundTrip(): Promise<void> {
  const phc = await hashPassword('worker-proof-password');
  assert.equal(
    await verifyPassword('worker-proof-password', phc),
    true,
    'correct password must verify',
  );
  assert.equal(
    await verifyPassword('definitely-wrong-password', phc),
    false,
    'wrong password must not verify',
  );
}

async function testLegacyNodeRsHashesStillVerify(): Promise<void> {
  const legacy = await nodeRsHash('legacy-user-password', BASELINE_OPTIONS);
  assert.match(legacy, APPROVED_PHC, 'legacy hashes share the approved shape');
  assert.equal(
    await verifyPassword('legacy-user-password', legacy),
    true,
    'hashes stored by the previous implementation must keep verifying',
  );
  assert.equal(
    await verifyPassword('wrong-password', legacy),
    false,
    'legacy hash must still reject wrong passwords',
  );
}

async function testNewHashesInteroperateWithNodeRs(): Promise<void> {
  const phc = await hashPassword('interop-password');
  assert.equal(
    await nodeRsVerify(phc, 'interop-password'),
    true,
    'the reference Argon2id implementation must accept hashes we produce',
  );
  assert.equal(
    await nodeRsVerify(phc, 'wrong-password'),
    false,
    'reference verification must reject wrong passwords for our hashes',
  );
}

async function testInvalidInputsFailClosed(): Promise<void> {
  assert.equal(await verifyPassword('x', 'not-a-hash'), false, 'garbage input');
  assert.equal(await verifyPassword('x', ''), false, 'empty input');
  assert.equal(
    await verifyPassword('x', '$argon2i$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$ZGVhZGJlZWZkZWFkYmVlZmRlYWRiZWVm'),
    false,
    'non-id algorithm is rejected',
  );
  assert.equal(
    await verifyPassword('x', '$argon2id$v=16$m=19456,t=2,p=1$c2FsdHNhbHQ$ZGVhZGJlZWZkZWFkYmVlZmRlYWRiZWVm'),
    false,
    'unsupported PHC version is rejected',
  );

  const phc = await hashPassword('tamper-target');
  const segments = phc.split('$');
  segments[5] = 'A'.repeat(43); // same-length, same-shape, different tag
  assert.equal(
    await verifyPassword('tamper-target', segments.join('$')),
    false,
    'a tampered hash segment must not verify',
  );
}

async function testDistinctHashesForSamePassword(): Promise<void> {
  const first = await hashPassword('same-password');
  const second = await hashPassword('same-password');
  assert.notEqual(first, second, 'random salts must produce distinct hashes');
  assert.equal(await verifyPassword('same-password', first), true);
  assert.equal(await verifyPassword('same-password', second), true);
}

async function main(): Promise<void> {
  await testHashProducesApprovedPhcString();
  await testVerifyRoundTrip();
  await testLegacyNodeRsHashesStillVerify();
  await testNewHashesInteroperateWithNodeRs();
  await testInvalidInputsFailClosed();
  await testDistinctHashesForSamePassword();

  console.log('PASSWORD HASHING TESTS PASSED');
}

void main().catch((error) => {
  console.error('PASSWORD HASHING TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
