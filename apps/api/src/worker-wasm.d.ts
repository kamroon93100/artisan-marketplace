/**
 * Wrangler compiles `.wasm` files at build time and exposes them as ready
 * `WebAssembly.Module`s through a default import. This declaration is only
 * meaningful for the Worker bundle: Node never evaluates these imports,
 * because `src/worker.ts` is the only file that references them.
 */
declare module '*.wasm' {
  const precompiled: WebAssembly.Module;
  export default precompiled;
}
