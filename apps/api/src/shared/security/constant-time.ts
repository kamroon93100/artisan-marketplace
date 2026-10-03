/**
 * Length-independent, byte-independent comparison of two secret strings.
 *
 * A credential must not be discoverable from response timing: the loop
 * always runs `max(a, b)` iterations, differing bytes are folded into a
 * single accumulator, and a length difference participates in the same
 * accumulator so an early return cannot leak how much of a candidate was
 * correct.
 *
 * This lives in `shared/security` rather than in the auth or identity
 * module so both the static session check and the Identity session store
 * use one implementation instead of two copies that can drift.
 */
export function constantTimeEquals(
  presented: string,
  expected: string,
): boolean {
  const a = new TextEncoder().encode(presented);
  const b = new TextEncoder().encode(expected);

  const length = Math.max(a.length, b.length);

  let difference = a.length ^ b.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }

  return difference === 0;
}
