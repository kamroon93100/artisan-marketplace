import { resolvePostgresConnectionString } from './postgres-connection.js';

function expect(
  label: string,
  actual: string | undefined,
  expected: string | undefined,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

const CONNECTION_STRING =
  'postgresql://user:pass@127.0.0.1:55432/db';

/**
 * A deployed Worker receives a Hyperdrive binding, which is the shape
 * production depends on and must keep working. `wrangler dev` delivers
 * the same shape, configured with a `localConnectionString`, so this is
 * the shape every environment uses.
 */
function testHyperdriveBindingResolves(): void {
  expect(
    'binding',
    resolvePostgresConnectionString({
      HYPERDRIVE: { connectionString: CONNECTION_STRING },
    }),
    CONNECTION_STRING,
  );
}

/**
 * A plain connection string is still accepted so the resolver stays
 * usable outside the binding, but nothing in this repository configures
 * the database that way any more: one binding is the single source.
 */
function testDevelopmentVariableResolves(): void {
  expect(
    'string',
    resolvePostgresConnectionString({
      HYPERDRIVE: CONNECTION_STRING,
    }),
    CONNECTION_STRING,
  );
}

/**
 * Both schemes PostgreSQL accepts resolve unchanged, so an existing
 * local or Hyperdrive connection string is not invalidated by the
 * value-shape guard below.
 */
function testBothPostgresSchemesResolve(): void {
  for (const connectionString of [
    `postgres://user:pass@127.0.0.1:55432/db`,
    `postgresql://user:pass@127.0.0.1:55432/db`,
    `POSTGRES://user:pass@127.0.0.1:55432/db`,
  ]) {
    expect(
      `scheme ${connectionString.slice(0, 12)}`,
      resolvePostgresConnectionString({
        HYPERDRIVE: { connectionString },
      }),
      connectionString,
    );
  }
}

/**
 * Regression: a binding serialized into `.dev.vars` as JSON reaches the
 * Worker as a string, not as a binding. Passing that text through as a
 * connection string did not fail: node-postgres parsed it into a
 * connection target that is not the local database, the socket to that
 * target never resolved or errored inside the Workers runtime, and the
 * request was cancelled as hung. The value must resolve to nothing so
 * the caller's fail-closed guard refuses it instead.
 */
function testSerializedBindingTextIsRefused(): void {
  const serialized = JSON.stringify({
    connectionString: CONNECTION_STRING,
  });

  expect(
    'serialized binding as a variable',
    resolvePostgresConnectionString({
      HYPERDRIVE: serialized,
    }),
    undefined,
  );

  expect(
    'serialized binding in a variable object',
    resolvePostgresConnectionString({
      HYPERDRIVE: { connectionString: serialized } as never,
    }),
    undefined,
  );
}

/**
 * A value that carries no database connection is refused rather than
 * handed to the driver. Every one of these previously reached
 * node-postgres, which parsed each into some other target.
 */
function testNonUriValuesResolveToNothing(): void {
  for (const value of [
    'host=127.0.0.1 port=55432',
    '/var/run/postgresql',
    'artisan_marketplace_dev',
    'mysql://user:pass@127.0.0.1:3306/db',
    'http://127.0.0.1:55432',
  ]) {
    expect(
      `non-uri ${value}`,
      resolvePostgresConnectionString({ HYPERDRIVE: value }),
      undefined,
    );

    expect(
      `non-uri binding ${value}`,
      resolvePostgresConnectionString({
        HYPERDRIVE: { connectionString: value },
      }),
      undefined,
    );
  }
}

/**
 * Surrounding whitespace is an artefact of the file the value was
 * copied from, not part of the connection string.
 */
function testSurroundingWhitespaceIsTrimmed(): void {
  expect(
    'padded string',
    resolvePostgresConnectionString({
      HYPERDRIVE: `  ${CONNECTION_STRING}  `,
    }),
    CONNECTION_STRING,
  );

  expect(
    'padded binding',
    resolvePostgresConnectionString({
      HYPERDRIVE: { connectionString: ` ${CONNECTION_STRING} ` },
    }),
    CONNECTION_STRING,
  );
}

/**
 * An empty value is a misconfiguration, not an absent configuration.
 * It must resolve to nothing so the caller's fail-closed guard refuses
 * the deployment rather than selecting volatile storage.
 */
function testEmptyValuesResolveToNothing(): void {
  expect('absent', resolvePostgresConnectionString({}), undefined);

  expect(
    'empty string',
    resolvePostgresConnectionString({ HYPERDRIVE: '' }),
    undefined,
  );

  expect(
    'whitespace string',
    resolvePostgresConnectionString({ HYPERDRIVE: '   ' }),
    undefined,
  );

  expect(
    'empty binding',
    resolvePostgresConnectionString({
      HYPERDRIVE: { connectionString: '' },
    }),
    undefined,
  );

  expect(
    'whitespace binding',
    resolvePostgresConnectionString({
      HYPERDRIVE: { connectionString: '  ' },
    }),
    undefined,
  );
}

/**
 * An unrecognised value must not be coerced into a usable connection
 * string. Resolving to nothing keeps the guard authoritative.
 */
function testUnexpectedShapesResolveToNothing(): void {
  const cases: readonly unknown[] = [
    null,
    42,
    true,
    {},
    { host: '127.0.0.1' },
    [],
  ];

  for (const value of cases) {
    expect(
      `unexpected ${JSON.stringify(value) ?? 'undefined'}`,
      resolvePostgresConnectionString({
        HYPERDRIVE: value as never,
      }),
      undefined,
    );
  }
}

testHyperdriveBindingResolves();
testDevelopmentVariableResolves();
testBothPostgresSchemesResolve();
testSerializedBindingTextIsRefused();
testNonUriValuesResolveToNothing();
testSurroundingWhitespaceIsTrimmed();
testEmptyValuesResolveToNothing();
testUnexpectedShapesResolveToNothing();

console.log('POSTGRES CONNECTION TESTS PASSED');
