/**
 * Argon2id execution over precompiled WebAssembly modules.
 *
 * Cloudflare Workers do not permit runtime WebAssembly code generation:
 * `WebAssembly.compile(bytes)` and `new WebAssembly.Module(bytes)` both fail
 * with `CompileError: Wasm code generation disallowed by embedder`. Wrangler
 * precompiles `.wasm` files at build time and hands the Worker a ready
 * `WebAssembly.Module` through a static import, which it may instantiate as
 * many times as it likes. This file owns that execution:
 *
 * - callers supply the two modules, it returns hashes;
 * - every hash instantiates its own wasm instances, so concurrent requests
 *   never share mutable wasm state;
 * - no environment detail (bindings, fetch, process) is referenced here, so
 *   the same code runs under the Worker and under Node in the test suite.
 *
 * The algorithm, parameters and PHC encoding are the M8 Q5.1 approved ones:
 * Argon2id v=19, m=19456 KiB, t=2, p=1, 16-byte salt, 32-byte output.
 *
 * The control flow (init-vector construction, the BLAKE2b H0 chain, the
 * memory block fill, and the final tag derivation) is transcribed from the
 * reference driver used by `hash-wasm` 4.12.0 (MIT), and the two
 * `WebAssembly.Module`s are the very binaries that library embeds, extracted
 * verbatim into this repository as `argon2.wasm` and `blake2b.wasm`. The two
 * implementations agree byte for byte, which is what keeps hashes written by
 * the previous implementation verifiable.
 */

/** hash-wasm's per-update transfer ceiling; the wasm has a fixed 16 KiB window. */
const MAX_HEAP = 16 * 1024;
/** Argon2 version 1.3 is `0x13` on the wire and `v=19` in a PHC string. */
const ARGON2_VERSION = 0x13;
/** Argon2id: 0 = d, 1 = i, 2 = id. */
const ARGON2_TYPE_ID = 2;
/** A compressed Argon2 block is always 1 KiB, and H0 is 64 bytes. */
const ARGON2_BLOCK_BYTES = 1024;
const ARGON2_HASH_BLOCK_BYTES = 32;

/**
 * Ceiling on the memory cost a stored hash may ask for, in KiB.
 *
 * The approved baseline is 19456 KiB. Parameters are a deployment
 * decision, not an input, so a stored string asking for far more is either
 * tampering or a foreign hash; it is refused here instead of being allowed
 * to grow the arena to a size that would terminate the whole isolate, not
 * just the request. The ceiling is generous enough to allow a deliberate,
 * reviewed parameter increase without a code change of this kind.
 */
const MAX_ARGON2_MEMORY_KIB = 65536;

export type Argon2PrecompiledModules = {
  readonly argon2: WebAssembly.Module;
  readonly blake2b: WebAssembly.Module;
};

export type Argon2idRunOptions = {
  readonly password: string | Uint8Array;
  readonly salt: string | Uint8Array;
  readonly secret?: string | Uint8Array;
  readonly iterations: number;
  readonly parallelism: number;
  /** Memory cost in KiB. */
  readonly memorySize: number;
  /** Tag length in bytes. */
  readonly hashLength: number;
  readonly outputType?: 'binary' | 'encoded';
};

export type Argon2idRunner = (options: Argon2idRunOptions) => Promise<string | Uint8Array>;

type Argon2Exports = {
  memory: WebAssembly.Memory;
  Hash_SetMemorySize(totalSize: number): void;
  Hash_GetBuffer(): number;
  Hash_Calculate(length: number, initParam: number, digestParam: number | null): void;
};

type Blake2bExports = {
  memory: WebAssembly.Memory;
  Hash_GetBuffer(): number;
  Hash_Init(bits: number): void;
  Hash_Update(length: number): void;
  Hash_Final(padding: number | null): void;
};

/**
 * One Argon2 instance: a fresh `WebAssembly.Instance` per hash. The wasm has
 * no imports, so an empty import object is correct.
 */
class Argon2Instance {
  private readonly exports: Argon2Exports;
  /** The arena view; rebound (and re-anchored) by `setMemorySize`. */
  private view: Uint8Array | null = null;

  constructor(module: WebAssembly.Module) {
    this.exports = new WebAssembly.Instance(module, {}).exports as unknown as Argon2Exports;
    // The first Hash_GetBuffer() call *is* the arena allocator: it grows the
    // wasm memory to its initial heap and returns the arena base. Skipping it
    // leaves the arena pointer at 0, so every later write lands on wasm
    // static data and the fill pass faults on out-of-bounds memory. Bind the
    // initial window here, exactly once, before the arena is sized.
    this.view = this.bindHeap(MAX_HEAP);
  }

  private bindHeap(length: number): Uint8Array {
    const offset = this.exports.Hash_GetBuffer();
    return new Uint8Array(this.exports.memory.buffer, offset, length);
  }

  setMemorySize(totalSize: number): void {
    this.exports.Hash_SetMemorySize(totalSize);
    this.view = this.bindHeap(totalSize);
  }

  writeMemory(data: Uint8Array, offset: number): void {
    if (this.view === null) {
      throw new Error('Argon2 memory was never sized before writeMemory.');
    }
    this.view.set(data, offset);
  }

  /**
   * Runs the fill/compression pass with an empty input and returns the 1 KiB
   * compressed block. `hash-wasm` reads it back as hex and re-parses it; the
   * bytes are identical either way, so this reads them directly.
   */
  compress(memorySize: number): Uint8Array {
    if (this.view === null) {
      throw new Error('Argon2 memory was never sized before compress.');
    }
    this.exports.Hash_Calculate(0, memorySize, null);
    return this.view.slice(0, ARGON2_BLOCK_BYTES);
  }
}

/** One BLAKE2b instance at a fixed output size, reusable across updates. */
class Blake2bInstance {
  private readonly exports: Blake2bExports;
  private readonly outputBits: number;
  private readonly view: Uint8Array;

  constructor(module: WebAssembly.Module, outputBits: number) {
    this.exports = new WebAssembly.Instance(module, {}).exports as unknown as Blake2bExports;
    this.outputBits = outputBits;
    const offset = this.exports.Hash_GetBuffer();
    this.view = new Uint8Array(this.exports.memory.buffer, offset, MAX_HEAP);
    this.exports.Hash_Init(outputBits);
  }

  init(): void {
    this.exports.Hash_Init(this.outputBits);
  }

  update(data: Uint8Array): void {
    let read = 0;
    while (read < data.length) {
      const chunk = data.subarray(read, read + MAX_HEAP);
      read += chunk.length;
      this.view.set(chunk);
      this.exports.Hash_Update(chunk.length);
    }
  }

  digestBinary(): Uint8Array {
    this.exports.Hash_Final(null);
    return this.view.slice(0, this.outputBits / 8);
  }
}

const uint32View = new DataView(new ArrayBuffer(4));
function int32LE(value: number): Uint8Array {
  uint32View.setInt32(0, value, true);
  return new Uint8Array(uint32View.buffer);
}

const textEncoder = new TextEncoder();
function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? textEncoder.encode(value) : value;
}

/**
 * The Argon2 variable-length hash H, driven the way the reference driver
 * drives it: BLAKE2b with output length `len` for short requests, and an
 * extended BLAKE2b chain for long ones.
 */
async function hashFunc(
  blake512: Blake2bInstance,
  blake2bModule: WebAssembly.Module,
  buf: Uint8Array,
  len: number,
): Promise<Uint8Array> {
  if (len <= 64) {
    const blake = new Blake2bInstance(blake2bModule, len * 8);
    blake.update(int32LE(len));
    blake.update(buf);
    return blake.digestBinary();
  }

  const r = Math.ceil(len / ARGON2_HASH_BLOCK_BYTES) - 2;
  const ret = new Uint8Array(len);

  blake512.init();
  blake512.update(int32LE(len));
  blake512.update(buf);
  let vp = blake512.digestBinary();
  ret.set(vp.subarray(0, ARGON2_HASH_BLOCK_BYTES), 0);

  for (let i = 1; i < r; i++) {
    blake512.init();
    blake512.update(vp);
    vp = blake512.digestBinary();
    ret.set(vp.subarray(0, ARGON2_HASH_BLOCK_BYTES), i * ARGON2_HASH_BLOCK_BYTES);
  }

  const partialBytesNeeded = len - ARGON2_HASH_BLOCK_BYTES * r;
  let blakeSmall: Blake2bInstance;
  if (partialBytesNeeded === 64) {
    blakeSmall = blake512;
    blakeSmall.init();
  } else {
    blakeSmall = new Blake2bInstance(blake2bModule, partialBytesNeeded * 8);
  }

  blakeSmall.update(vp);
  vp = blakeSmall.digestBinary();
  ret.set(vp.subarray(0, partialBytesNeeded), ARGON2_HASH_BLOCK_BYTES * r);

  return ret;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // PHC strings use the standard alphabet with optional padding; the
  // approved shape here stores the unpadded form.
  return btoa(binary).replace(/=+$/, '');
}

function encodeResult(salt: Uint8Array, options: Argon2idRunOptions, res: Uint8Array): string {
  const parameters = [
    `m=${options.memorySize}`,
    `t=${options.iterations}`,
    `p=${options.parallelism}`,
  ].join(',');

  return `$argon2id$v=19$${parameters}$${encodeBase64(salt)}$${encodeBase64(res)}`;
}

/**
 * Mirrors the reference implementation's option validation so a malformed or
 * hostile stored hash is rejected instead of reaching the wasm with
 * nonsensical parameters. Rejecting with a `TypeError` keeps the
 * password-verifying caller's fail-closed contract intact.
 */
function validateRunOptions(options: Argon2idRunOptions): void {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Invalid options parameter. It requires an object.');
  }

  const { password, salt, iterations, parallelism, hashLength, memorySize } = options;
  if (password === undefined || toBytes(password).length < 1) {
    throw new TypeError('Password must be specified');
  }
  if (salt === undefined || toBytes(salt).length < 8) {
    throw new TypeError('Salt should be at least 8 bytes long');
  }
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new TypeError('Iterations should be a positive number');
  }
  if (!Number.isInteger(parallelism) || parallelism < 1) {
    throw new TypeError('Parallelism should be a positive number');
  }
  if (!Number.isInteger(hashLength) || hashLength < 4) {
    throw new TypeError('Hash length should be at least 4 bytes');
  }
  if (!Number.isInteger(memorySize)) {
    throw new TypeError('Memory size should be specified');
  }
  if (memorySize < 8 * options.parallelism) {
    throw new TypeError('Memory size should be at least 8 * parallelism');
  }
  if (memorySize > MAX_ARGON2_MEMORY_KIB) {
    throw new TypeError(
      `Memory size exceeds the ${MAX_ARGON2_MEMORY_KIB} KiB ceiling`,
    );
  }
}

/**
 * Creates an Argon2id runner over precompiled modules. The runner is
 * stateless; every call instantiates fresh wasm instances.
 */
export function createArgon2idRunner(modules: Argon2PrecompiledModules): Argon2idRunner {
  // The Worker gets these from Wrangler's CompiledWasm support; anything
  // else here means the wiring is wrong, and instantiating it would fail
  // anyway. Failing here keeps that mistake loud instead of silent.
  if (
    !(modules.argon2 instanceof WebAssembly.Module) ||
    !(modules.blake2b instanceof WebAssembly.Module)
  ) {
    throw new TypeError('createArgon2idRunner requires precompiled WebAssembly.Modules.');
  }

  return async (options: Argon2idRunOptions): Promise<string | Uint8Array> => {
    validateRunOptions(options);

    const { parallelism, iterations, hashLength, memorySize } = options;
    const password = toBytes(options.password);
    const salt = toBytes(options.salt);
    const secret = toBytes(options.secret ?? '');

    const argon2 = new Argon2Instance(modules.argon2);
    const blake512 = new Blake2bInstance(modules.blake2b, 512);

    // The last block of the arena stores the init vector.
    argon2.setMemorySize(memorySize * 1024 + 1024);

    const initVector = new Uint8Array(24);
    const initVectorView = new DataView(initVector.buffer);
    initVectorView.setInt32(0, parallelism, true);
    initVectorView.setInt32(4, hashLength, true);
    initVectorView.setInt32(8, memorySize, true);
    initVectorView.setInt32(12, iterations, true);
    initVectorView.setInt32(16, ARGON2_VERSION, true);
    initVectorView.setInt32(20, ARGON2_TYPE_ID, true);
    argon2.writeMemory(initVector, memorySize * 1024);

    blake512.init();
    blake512.update(initVector);
    blake512.update(int32LE(password.length));
    blake512.update(password);
    blake512.update(int32LE(salt.length));
    blake512.update(salt);
    blake512.update(int32LE(secret.length));
    blake512.update(secret);
    blake512.update(int32LE(0));
    const h0 = blake512.digestBinary();

    const segments = Math.floor(memorySize / (parallelism * 4));
    const lanes = segments * 4;

    const param = new Uint8Array(72);
    param.set(h0);

    for (let lane = 0; lane < parallelism; lane++) {
      param.set(int32LE(0), 64);
      param.set(int32LE(lane), 68);

      let position = lane * lanes;
      argon2.writeMemory(await hashFunc(blake512, modules.blake2b, param, ARGON2_BLOCK_BYTES), position * 1024);

      position += 1;
      param.set(int32LE(1), 64);
      argon2.writeMemory(await hashFunc(blake512, modules.blake2b, param, ARGON2_BLOCK_BYTES), position * 1024);
    }

    const c = argon2.compress(memorySize);
    const res = await hashFunc(blake512, modules.blake2b, c, hashLength);

    if (options.outputType === 'binary') {
      return res;
    }

    return encodeResult(salt, options, res);
  };
}
