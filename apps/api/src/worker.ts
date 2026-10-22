/**
 * Worker entry.
 *
 * The app in `./index.ts` is shared with the Node test suite; this file is
 * the Worker-only shell around it. It exists for one reason: Cloudflare
 * Workers forbid runtime WebAssembly code generation, so the Argon2
 * binaries must be precompiled at build time. Wrangler does that for the
 * `.wasm` files it bundles — these imports yield ready
 * `WebAssembly.Module`s — and this entry instantiates them per hash by
 * registering them before the first request is served.
 *
 * The static import lives here, and not in the app, because the app's
 * modules are also loaded by Node, which cannot statically import a
 * `.wasm` module the way a Worker does. Node reaches the same binaries
 * through `argon2-modules.ts` instead.
 */

import app from './index.js';
import argon2Wasm from './modules/identity/infrastructure/argon2.wasm';
import blake2bWasm from './modules/identity/infrastructure/blake2b.wasm';
import { registerPrecompiledArgon2Modules } from './modules/identity/infrastructure/argon2-modules.js';

registerPrecompiledArgon2Modules({
  argon2: argon2Wasm,
  blake2b: blake2bWasm,
});

export default app;
