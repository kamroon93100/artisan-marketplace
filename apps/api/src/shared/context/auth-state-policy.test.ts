import {
  allowsLocalInMemoryAuthState,
  resolveAuthStateBuildMode,
} from './auth-state-policy.js';

function assertEqual(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

function testBuildModeResolution(): void {
  assertEqual(
    resolveAuthStateBuildMode('development'),
    'development',
    'development build mode is recognized',
  );
  assertEqual(
    resolveAuthStateBuildMode('test'),
    'test',
    'test build mode is recognized',
  );
  assertEqual(
    resolveAuthStateBuildMode('production'),
    'production',
    'production build mode is recognized',
  );
  assertEqual(
    resolveAuthStateBuildMode(undefined),
    'unknown',
    'missing build mode is unknown',
  );
  assertEqual(
    resolveAuthStateBuildMode('staging'),
    'unknown',
    'unexpected build mode is unknown',
  );
}

function testInMemoryPolicyRequiresEveryCondition(): void {
  assertEqual(
    allowsLocalInMemoryAuthState(
      {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      'development',
    ),
    true,
    'development with opt-in and development build mode is allowed',
  );

  assertEqual(
    allowsLocalInMemoryAuthState(
      {
        APP_ENV: 'test',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      'test',
    ),
    true,
    'test with opt-in and test build mode is allowed',
  );

  assertEqual(
    allowsLocalInMemoryAuthState(
      {
        APP_ENV: 'development',
      },
      'development',
    ),
    false,
    'development without opt-in is denied',
  );

  assertEqual(
    allowsLocalInMemoryAuthState(
      {
        APP_ENV: 'test',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      'development',
    ),
    false,
    'test app environment under development build is denied',
  );

  assertEqual(
    allowsLocalInMemoryAuthState(
      {
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      'development',
    ),
    false,
    'missing APP_ENV is denied',
  );

  assertEqual(
    allowsLocalInMemoryAuthState(
      {
        APP_ENV: 'staging',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      'development',
    ),
    false,
    'unknown APP_ENV is denied',
  );

  assertEqual(
    allowsLocalInMemoryAuthState(
      {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'yes',
      },
      'development',
    ),
    false,
    'non-boolean opt-in value is denied',
  );
}

function testProductionBuildAlwaysDenies(): void {
  for (const environment of ['development', 'test']) {
    assertEqual(
      allowsLocalInMemoryAuthState(
        {
          APP_ENV: environment,
          LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
        },
        'production',
      ),
      false,
      `production build denies misleading ${environment} configuration`,
    );
  }

  assertEqual(
    allowsLocalInMemoryAuthState(
      {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      undefined,
    ),
    false,
    'missing build mode is denied',
  );

  assertEqual(
    allowsLocalInMemoryAuthState(
      {
        APP_ENV: 'development',
        LOCAL_IN_MEMORY_AUTH_ENABLED: 'true',
      },
      'staging',
    ),
    false,
    'unknown build mode is denied',
  );
}

function main(): void {
  testBuildModeResolution();
  testInMemoryPolicyRequiresEveryCondition();
  testProductionBuildAlwaysDenies();

  console.log('AUTH STATE POLICY TESTS PASSED');
}

try {
  main();
} catch (error) {
  console.error('AUTH STATE POLICY TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
}
