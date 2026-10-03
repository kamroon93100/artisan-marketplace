/**
 * A real Hyperdrive binding, as delivered to a deployed Worker.
 */
export type HyperdriveBinding = {
  connectionString: string;
};

/**
 * The `HYPERDRIVE` environment value in either of its two supported
 * shapes.
 *
 * A deployed Worker receives a Hyperdrive binding object. `wrangler dev`
 * connects through that same binding, configured with a
 * `localConnectionString` in `wrangler.jsonc`, so both environments
 * deliver one shape and neither is a second source of truth.
 */
export type PostgresConnectionValue =
  | HyperdriveBinding
  | string;

export type PostgresConnectionEnv = {
  HYPERDRIVE?: PostgresConnectionValue;
};

/**
 * Both schemes PostgreSQL accepts, so an existing local or Hyperdrive
 * connection string keeps working unchanged.
 */
const POSTGRES_URI = /^postgres(ql)?:\/\//i;

function connectionUri(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();

  return trimmed && POSTGRES_URI.test(trimmed)
    ? trimmed
    : undefined;
}

function isHyperdriveBinding(
  value: unknown,
): value is HyperdriveBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'connectionString' in value
  );
}

/**
 * Resolves the canonical PostgreSQL connection string, or `undefined`
 * when no database is configured.
 *
 * Anything unusable resolves to `undefined` rather than to a best
 * guess. An unrecognised value must leave the caller's existing
 * fail-closed guard in charge, because that guard is what refuses to
 * serve a deployment that would otherwise lose every write.
 *
 * A value that is not a PostgreSQL URI is unusable in the only way
 * that matters. node-postgres does not reject it: it parses the text
 * into a connection target that is not the intended database, and the
 * socket to that target never resolves or errors inside the Workers
 * runtime, so the request handler never settles and the runtime cancels
 * it. Refusing the value here turns an undiagnosable hang into the
 * caller's fail-closed guard.
 */
export function resolvePostgresConnectionString(
  env: PostgresConnectionEnv,
): string | undefined {
  const value = env.HYPERDRIVE;

  if (typeof value === 'string') {
    return connectionUri(value);
  }

  if (isHyperdriveBinding(value)) {
    return connectionUri(value.connectionString);
  }

  return undefined;
}
