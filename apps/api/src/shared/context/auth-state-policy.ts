/**
 * The environment shape that can authorize process-local authentication
 * state.
 *
 * `APP_ENV` is application configuration. `LOCAL_IN_MEMORY_AUTH_ENABLED` is
 * a separate, explicit local-development opt-in. Neither alone is enough:
 * a deployed Worker can carry a mistaken `APP_ENV`, and an opt-in copied
 * to a remote deployment must still not override the production build.
 */
export type LocalAuthStatePolicyEnv = {
  APP_ENV?: string;
  LOCAL_IN_MEMORY_AUTH_ENABLED?: string;
};

/**
 * The build mode Wrangler reports through the statically replaced
 * `process.env.NODE_ENV`.
 *
 * This is a build-context signal, not proof of where the Worker executes.
 * Wrangler defaults it to `development` for `wrangler dev` and
 * `production` for `wrangler deploy`/`wrangler build`, but it can be
 * overridden. The policy therefore uses it only as a deny gate: production
 * and unknown build modes can never enable process-local state.
 */
export type AuthStateBuildMode =
  | 'development'
  | 'test'
  | 'production'
  | 'unknown';

export function resolveAuthStateBuildMode(
  buildMode: string | undefined,
): AuthStateBuildMode {
  switch (buildMode) {
    case 'development':
    case 'test':
    case 'production':
      return buildMode;
    default:
      return 'unknown';
  }
}

/**
 * Whether process-local authentication rate limiting and in-memory
 * identity/session storage are allowed for one request environment.
 *
 * All of the following must be true:
 *
 * - the build mode is explicitly `development` or `test`;
 * - the match is exact: development app code under a development build,
 *   or test code under a test build;
 * - `LOCAL_IN_MEMORY_AUTH_ENABLED` is exactly `true`;
 * - `APP_ENV` names the same local mode.
 *
 * A production build always denies, even when the application variables
 * and the opt-in are all misleading. A missing or unknown build mode also
 * denies, so the default is fail closed.
 *
 * `buildMode` is a parameter so unit tests can prove each branch without
 * changing process-wide state. Production call sites omit it and therefore
 * use the real build-time value.
 */
export function allowsLocalInMemoryAuthState(
  env: LocalAuthStatePolicyEnv,
  buildMode: string | undefined = process.env.NODE_ENV,
): boolean {
  const resolvedBuildMode = resolveAuthStateBuildMode(buildMode);

  if (
    resolvedBuildMode !== 'development' &&
    resolvedBuildMode !== 'test'
  ) {
    return false;
  }

  if (env.LOCAL_IN_MEMORY_AUTH_ENABLED !== 'true') {
    return false;
  }

  return env.APP_ENV === resolvedBuildMode;
}
