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

testHyperdriveBindingIsConfigured();
testLocalConnectionStringReachesTheResolver();
testDevVarsDoNotRedefineTheBinding();

console.log('WRANGLER CONFIG TESTS PASSED');
