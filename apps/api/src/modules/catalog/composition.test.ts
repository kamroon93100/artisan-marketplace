import { getCatalogService } from './composition.js';
import { getMediaService } from '../media/composition.js';
import { AppError } from '../../shared/errors/app-error.js';

const CONFIGURED = {
  APP_ENV: 'production',
  HYPERDRIVE: {
    connectionString: 'postgresql://user:pass@127.0.0.1:5432/db',
  },
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_BUCKET: 'bucket',
};

function expectDependencyFailure(
  label: string,
  run: () => unknown,
  message?: string,
): void {
  try {
    run();
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      error.code !== 'DEPENDENCY_FAILED'
    ) {
      throw new Error(
        `${label}: expected AppError DEPENDENCY_FAILED, received ${String(error)}.`,
      );
    }

    // The media and catalog guards are proven separately, so the
    // message is asserted to identify which guard refused. Without it,
    // the catalog's own error would satisfy a media assertion.
    if (message && !error.message.includes(message)) {
      throw new Error(
        `${label}: expected a message containing ` +
          `"${message}", received "${error.message}".`,
      );
    }

    return;
  }

  throw new Error(
    `${label}: expected AppError DEPENDENCY_FAILED, but nothing was raised.`,
  );
}

/**
 * Volatile storage must never stand in for the canonical store. A
 * deployment that is missing its database configuration would otherwise
 * look healthy and lose every write.
 */
function testUnconfiguredDatabaseIsRefused(): void {
  for (const environment of [
    'production',
    'staging',
    'preview',
    undefined,
  ]) {
    expectDependencyFailure(
      `catalog in ${String(environment)}`,
      () =>
        getCatalogService({
          APP_ENV: environment,
        }),
    );

    expectDependencyFailure(
      `media in ${String(environment)}`,
      () => getMediaService({ APP_ENV: environment }),
      'Media storage is not configured',
    );
  }
}

/**
 * The media guard is proven on its own, not only as it happens to be
 * reached. Resolving the catalog first would raise the same error, so
 * a media composition that silently fell back could not be detected
 * this way.
 */
function testMediaRefusesIndependentlyOfTheCatalog(): void {
  for (const environment of [
    'production',
    'staging',
    'preview',
    undefined,
  ]) {
    expectDependencyFailure(
      `media alone in ${String(environment)}`,
      () => getMediaService({ APP_ENV: environment }),
      'Media storage is not configured',
    );
  }
}

/**
 * An empty connection string is a misconfiguration, not an absent
 * configuration, and must not quietly select volatile storage.
 */
function testEmptyConnectionStringIsRefused(): void {
  expectDependencyFailure(
    'catalog with an empty connection string',
    () =>
      getCatalogService({
        APP_ENV: 'production',
        HYPERDRIVE: { connectionString: '' },
      }),
  );

  expectDependencyFailure(
    'media with an empty connection string',
    () =>
      getMediaService({
        APP_ENV: 'production',
        HYPERDRIVE: { connectionString: '' },
        S3_ENDPOINT: 'http://127.0.0.1:9000',
        S3_REGION: 'us-east-1',
        S3_ACCESS_KEY_ID: 'key',
        S3_SECRET_ACCESS_KEY: 'secret',
        S3_BUCKET: 'bucket',
      }),
    'Media storage is not configured',
  );
}

/**
 * The local convenience is preserved where it is legitimate, and only
 * there.
 */
function testLocalEnvironmentsStillResolve(): void {
  for (const environment of ['development', 'test']) {
    const catalog = getCatalogService({
      APP_ENV: environment,
    });

    if (!catalog) {
      throw new Error(
        `Expected a catalog service in ${environment}.`,
      );
    }

    const media = getMediaService({ APP_ENV: environment });

    if (!media) {
      throw new Error(
        `Expected a media service in ${environment}.`,
      );
    }
  }
}

/**
 * A correctly configured environment resolves the PostgreSQL-backed
 * service, so the guard above is not simply refusing everything.
 */
function testConfiguredEnvironmentResolves(): void {
  for (const environment of [
    'production',
    'staging',
    'development',
  ]) {
    if (!getCatalogService({ ...CONFIGURED, APP_ENV: environment })) {
      throw new Error(
        `Expected a catalog service in ${environment}.`,
      );
    }

    if (!getMediaService({ ...CONFIGURED, APP_ENV: environment })) {
      throw new Error(
        `Expected a media service in ${environment}.`,
      );
    }
  }
}

/**
 * `wrangler dev` has no Hyperdrive configuration to bind, so the local
 * connection string arrives as a plain development variable rather than
 * as a binding object. Reading only the binding shape discarded it, and
 * development silently selected in-memory storage instead of the local
 * PostgreSQL database. Both modules must accept the value.
 */
function testDevelopmentVariableShapeResolves(): void {
  for (const environment of [
    'production',
    'development',
  ]) {
    const env = {
      APP_ENV: environment,
      HYPERDRIVE: CONFIGURED.HYPERDRIVE.connectionString,
      S3_ENDPOINT: CONFIGURED.S3_ENDPOINT,
      S3_REGION: CONFIGURED.S3_REGION,
      S3_ACCESS_KEY_ID: CONFIGURED.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: CONFIGURED.S3_SECRET_ACCESS_KEY,
      S3_BUCKET: CONFIGURED.S3_BUCKET,
    };

    if (!getCatalogService(env)) {
      throw new Error(
        `Expected a catalog service in ${environment}.`,
      );
    }

    if (!getMediaService(env)) {
      throw new Error(
        `Expected a media service in ${environment}.`,
      );
    }
  }
}

/**
 * Accepting the development variable shape must not become a way to
 * weaken the guard. A blank value carries no database either way, so a
 * non-development environment must still be refused.
 */
function testBlankDevelopmentVariableIsStillRefused(): void {
  expectDependencyFailure(
    'catalog with a blank development variable',
    () =>
      getCatalogService({
        APP_ENV: 'production',
        HYPERDRIVE: '   ',
      }),
  );

  expectDependencyFailure(
    'media with a blank development variable',
    () =>
      getMediaService({ APP_ENV: 'production', HYPERDRIVE: '   ' }),
    'Media storage is not configured',
  );
}

testUnconfiguredDatabaseIsRefused();
testMediaRefusesIndependentlyOfTheCatalog();
testEmptyConnectionStringIsRefused();
testLocalEnvironmentsStillResolve();
testConfiguredEnvironmentResolves();
testDevelopmentVariableShapeResolves();
testBlankDevelopmentVariableIsStillRefused();

console.log('COMPOSITION TESTS PASSED');
