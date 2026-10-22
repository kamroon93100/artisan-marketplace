import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { resolvePostgresConnectionString } from './src/shared/persistence/postgres-connection.js';

const API_ROOT = new URL('./', import.meta.url);
const WRANGLER_CONFIG = new URL(
  'wrangler.jsonc',
  API_ROOT,
);
const DEV_VARS = new URL('.dev.vars', API_ROOT);

function fail(message: string): never {
  throw new Error(`WRANGLER CONFIG TESTS: ${message}`);
}

/**
 * `wrangler.jsonc` is JSON with line comments. Only the comment syntax
 * is removed here, and only outside string literals, so a connection
 * string keeps its own `//` scheme separator.
 */
function readJsonc(url: URL): Record<string, unknown> {
  const source = readFileSync(fileURLToPath(url), 'utf8');

  let stripped = '';
  let inString = false;
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (inString) {
      if (character === '\\') {
        stripped += source.slice(index, index + 2);
        index += 2;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      stripped += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      stripped += character;
      index += 1;
      continue;
    }

    if (
      character === '/' &&
      source[index + 1] === '/'
    ) {
      while (
        index < source.length &&
        source[index] !== '\n'
      ) {
        index += 1;
      }

      continue;
    }

    stripped += character;
    index += 1;
  }

  return JSON.parse(stripped) as Record<string, unknown>;
}

type HyperdriveConfig = {
  binding?: unknown;
  id?: unknown;
  localConnectionString?: unknown;
};

function hyperdriveConfigs(
  config: Record<string, unknown>,
): readonly HyperdriveConfig[] {
  const hyperdrive = config.hyperdrive;

  if (!Array.isArray(hyperdrive)) {
    fail('wrangler.jsonc does not declare a hyperdrive binding.');
  }

  return hyperdrive as readonly HyperdriveConfig[];
}

/**
 * The Worker reaches PostgreSQL only through the `HYPERDRIVE` binding.
 * A deployed Worker receives the real Hyperdrive configuration, and
 * `wrangler dev` connects through that same binding via
 * `localConnectionString`, so one binding serves both and the
 * repository code needs no development-specific database setting.
 *
 * This is the configuration regression guard. While the local database
 * was configured as a `HYPERDRIVE` entry in `.dev.vars`, Wrangler read
 * it as plain text, the Worker received the JSON text of a binding
 * rather than a binding, and node-postgres was pointed at a target that
 * is not the local database. The request then hung until the Workers
 * runtime cancelled it.
 */
function testHyperdriveBindingIsConfigured(): void {
  const config = readJsonc(WRANGLER_CONFIG);
  const binding = hyperdriveConfigs(config).find(
    (candidate) => candidate.binding === 'HYPERDRIVE',
  );

  if (!binding) {
    fail('no hyperdrive binding named HYPERDRIVE.');
  }

  if (typeof binding.id !== 'string' || !binding.id) {
    fail('the HYPERDRIVE binding declares no configuration id.');
  }

  if (
    typeof binding.localConnectionString !== 'string' ||
    !binding.localConnectionString
  ) {
    fail(
      'the HYPERDRIVE binding declares no localConnectionString, so wrangler dev has no local database to connect to.',
    );
  }
}

/**
 * The local connection string must survive the resolver. A binding
 * whose `localConnectionString` the resolver discards leaves `wrangler
 * dev` with no database, which then falls back to volatile in-memory
 * storage and looks healthy while losing every write.
 */
function testLocalConnectionStringReachesTheResolver(): void {
  const config = readJsonc(WRANGLER_CONFIG);
  const binding = hyperdriveConfigs(config).find(
    (candidate) => candidate.binding === 'HYPERDRIVE',
  );

  const resolved = resolvePostgresConnectionString({
    HYPERDRIVE: {
      connectionString:
        binding?.localConnectionString as string,
    },
  });

  if (resolved !== binding?.localConnectionString) {
    fail(
      `the configured local connection string did not resolve, received ${String(resolved)}.`,
    );
  }
}

/**
 * One binding is the single source of the local database. A
 * `HYPERDRIVE` entry in `.dev.vars` cannot reproduce a binding because
 * Wrangler reads that file as plain text, and a variable of the same
 * name competes with the binding for the same environment key.
 */
function testDevVarsDoNotRedefineTheBinding(): void {
  let source: string;

  try {
    source = readFileSync(fileURLToPath(DEV_VARS), 'utf8');
  } catch {
    // .dev.vars is git-ignored and absent in a clean checkout, which
    // is already the state this test requires.
    return;
  }

  if (/^\s*HYPERDRIVE\s*=/m.test(source)) {
    fail(
      '.dev.vars defines HYPERDRIVE; the local database belongs in the wrangler.jsonc hyperdrive binding.',
    );
  }
}

/**
 * The Worker entry must be the worker-only shell, and that shell must be
 * what wires the precompiled Argon2 modules.
 *
 * Cloudflare Workers forbid runtime WebAssembly code generation, so the
 * Argon2 binaries are precompiled at build time and handed to the Worker
 * through the static `.wasm` imports in `src/worker.ts`. If `main` ever
 * points back at the shared app, those imports leave the bundle graph: the
 * Worker still builds and every unit suite still passes, but at runtime
 * nothing registers the modules, `hashPassword` falls through to the
 * Node-only disk path inside workerd, and the whole public auth surface
 * answers 503 while the build is green. Pointing `main` at the app also
 * silently drops the `/health` registration-order fix.
 */
function testWorkerEntryIsTheWorkerShell(): void {
  const config = readJsonc(WRANGLER_CONFIG);

  if (config.main !== 'src/worker.ts') {
    fail(
      `wrangler.jsonc main must be the worker-only entry src/worker.ts (statically imports the precompiled Argon2 modules and registers them before serving), received ${String(config.main)}.`,
    );
  }

  const entry = readFileSync(
    fileURLToPath(new URL('src/worker.ts', API_ROOT)),
    'utf8',
  );

  for (const required of [
    "from './modules/identity/infrastructure/argon2.wasm'",
    "from './modules/identity/infrastructure/blake2b.wasm'",
    "registerPrecompiledArgon2Modules",
  ]) {
    if (!entry.includes(required)) {
      fail(`src/worker.ts no longer contains ${required}.`);
    }
  }

  // The registration must run before the app can serve a request, which in
  // an ES module means it is a top-level statement ahead of the default
  // export, not inside a handler or after an await.
  if (entry.indexOf('registerPrecompiledArgon2Modules') > entry.indexOf('export default')) {
    fail(
      'src/worker.ts must call registerPrecompiledArgon2Modules before exporting the app.',
    );
  }
}

testHyperdriveBindingIsConfigured();
testLocalConnectionStringReachesTheResolver();
testDevVarsDoNotRedefineTheBinding();
testWorkerEntryIsTheWorkerShell();

console.log('WRANGLER CONFIG TESTS PASSED');
