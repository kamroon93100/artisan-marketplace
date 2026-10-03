import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HttpReviewTransport,
  defaultReviewTransport,
  resolveReviewTransport,
} from "../../apps/mobile/src/network/review-transport.ts";

/**
 * The review screen's render behaviour, without a renderer.
 *
 * The defect this covers was not a wrong request. It was an unbounded number
 * of them: the screen built its client during render, so every render
 * produced a different client, so the callback that loads the review was
 * different, so the effect that calls it ran again, so it set state, so it
 * rendered again. The artisan saw a spinner and a request that never stopped.
 *
 * The chain that makes it impossible has three links, and each is asserted
 * here — the first by behaviour, the other two because the only way to see
 * them is to read the source:
 *
 *   1. the default client is one object, so no render can change its identity;
 *   2. the callback that loads the review depends on that client, and nothing
 *      else that changes per render; and
 *   3. the effect that calls it depends on that callback.
 *
 * Break any one link and the loop returns: an unstable client (link 1), a
 * load callback that also closes over something per-render (link 2), or an
 * effect keyed on something other than the callback (link 3).
 *
 * There is no React renderer in this repository's test setup, and adding one
 * to prove a two-line identity invariant would be a large change for a small
 * fact. The second test therefore proves a weaker thing than the first, and is
 * written to be clear about it: it does not prove the screen renders, and it
 * does not need to. It proves the three ways this bug can come back are
 * absent from the file, which is the whole of what the fix consists of.
 */

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

const screenSource = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "apps",
    "mobile",
    "src",
    "features",
    "review",
    "ReviewProductScreen.tsx",
  ),
  "utf8",
);

async function testTheDefaultClientKeepsItsIdentity(): Promise<void> {
  const first = resolveReviewTransport();

  expect(
    first === defaultReviewTransport,
    "resolving the default client returns the module-level instance",
  );
  expect(
    first instanceof HttpReviewTransport,
    "the default client is the real transport",
  );

  /**
   * The order a screen produces, and the order a cache keyed on "the last
   * thing resolved" would get wrong: resolve the default, resolve something
   * else, resolve the default again. A resolver that remembered its last
   * argument rather than the module's client would hand back the injected one
   * on the second default resolution, which is how a default path ends up
   * rendering a test double — or a new client — in production.
   */
  const injected = { getReview: () => Promise.reject() } as never;

  expect(
    resolveReviewTransport(injected) === injected,
    "an injected client is used as given, so a test can substitute one",
  );
  expect(
    resolveReviewTransport() === first,
    "resolving the default after an injected one is unaffected by it",
  );
  expect(
    resolveReviewTransport() === first,
    "the default is the same object however often it is resolved",
  );
}

async function testTheScreenDoesNotBuildAClientWhileRendering(): Promise<void> {
  expect(
    !screenSource.includes("new HttpReviewTransport"),
    "the screen must not construct a client during render; use resolveReviewTransport instead, or the load callback and its effect re-run on every render",
  );
  expect(
    /const client = useMemo\([\s\S]*?resolveReviewTransport/.test(
      screenSource,
    ),
    "the screen resolves its client through the resolver inside a useMemo, so its identity is stable across renders",
  );
  expect(
    /\}, \[client, remoteProductId\]\);/.test(screenSource),
    "the load callback depends on the client and the product id, and on nothing that changes per render; this is the link that turns a stable client into a stable callback",
  );
  expect(
    /useEffect\([\s\S]*?void load\(\);[\s\S]*?\}, \[load\]\);/.test(
      screenSource,
    ),
    "the effect that loads the review depends on the load callback, so it runs once per client rather than once per render",
  );
}

async function main(): Promise<void> {
  await testTheDefaultClientKeepsItsIdentity();
  await testTheScreenDoesNotBuildAClientWhileRendering();

  console.log("REVIEW SCREEN TRANSPORT IDENTITY TESTS PASSED");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
