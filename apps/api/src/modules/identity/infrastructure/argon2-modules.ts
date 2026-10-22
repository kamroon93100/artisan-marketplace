/**
 * Where the precompiled Argon2 modules come from at runtime.
 *
 * There are exactly two sources, and they never overlap:
 *
 * 1. The Worker. Cloudflare forbids runtime WebAssembly code generation, so
 *    `src/worker.ts` imports the binaries as Wrangler CompiledWasm modules
 *    (statically precompiled at build time) and registers them here at
 *    entry. Registration happens before any request is served, so the
 *    worker never falls through to the Node path below.
 * 2. Node, which is where the test suite and the tsx proofs run. Node may
 *    compile wasm itself, so this file reads the same project-owned
 *    binaries from disk and constructs the modules directly.
 *
 * The binaries are one and the same: `./argon2.wasm` and `./blake2b.wasm`
 * next to this file.
 */

import type { Argon2PrecompiledModules } from './argon2-driver.js';

let registered: Argon2PrecompiledModules | null = null;
let diskLoad: Promise<Argon2PrecompiledModules> | null = null;

/**
 * Registered by the Worker entry with the build-time precompiled modules.
 * Always wins over the disk path; called once per isolate at startup.
 */
export function registerPrecompiledArgon2Modules(modules: Argon2PrecompiledModules): void {
  registered = modules;
}

export async function getPrecompiledArgon2Modules(): Promise<Argon2PrecompiledModules> {
  if (registered) {
    return registered;
  }

  diskLoad ??= loadFromDisk();
  return diskLoad;
}

function loadFromDisk(): Promise<Argon2PrecompiledModules> {
  // Node-only. Every specifier here is dynamic precisely so that bundling
  // the Worker never needs `node:*`, and the path is joined rather than
  // expressed as `new URL(..., import.meta.url)` so that no bundler treats
  // the wasm file as a static asset of this module.
  return (async () => {
    const [{ readFileSync }, { join }, { fileURLToPath }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('node:url'),
    ]);

    const directory = fileURLToPath(new URL('.', import.meta.url));
    const load = (name: string): WebAssembly.Module =>
      new WebAssembly.Module(readFileSync(join(directory, name)));

    return {
      argon2: load('argon2.wasm'),
      blake2b: load('blake2b.wasm'),
    };
  })();
}
