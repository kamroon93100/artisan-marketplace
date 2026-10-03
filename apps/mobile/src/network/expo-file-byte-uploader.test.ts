import {
  ExpoFileByteUploader,
  type NativeUploadFile,
} from './expo-file-byte-uploader';
import { MediaSyncTransportError } from '../sync/media-sync-contract';

const UPLOAD_URL =
  'https://storage.test/media/a.jpg?X-Amz-Signature=TOPSECRETSIGNATURE';

function assertTrue(
  condition: boolean,
  label: string,
): void {
  if (!condition) {
    throw new Error(`${label}: expected true.`);
  }
}

async function expectTransportError(
  label: string,
  run: () => Promise<unknown>,
): Promise<MediaSyncTransportError> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof MediaSyncTransportError)) {
      throw new Error(
        `${label}: expected a transport error, received ${String(error)}.`,
      );
    }

    return error;
  }

  throw new Error(
    `${label}: expected a transport error, but none was raised.`,
  );
}

/**
 * The native layer rejects with a message that embeds the URL it was
 * given. That URL is a live write credential, so it must not survive
 * into the error the pipeline persists and shows to the artisan.
 */
async function testNativeRejectionIsRedacted(): Promise<void> {
  const uploadFile: NativeUploadFile = async () => {
    throw new Error(
      `Upload failed for ${UPLOAD_URL} with status 0`,
    );
  };

  const uploader = new ExpoFileByteUploader(uploadFile);

  const error = await expectTransportError(
    'a native rejection',
    () =>
      uploader.upload({
        uri: 'file:///media/a.jpg',
        url: UPLOAD_URL,
        method: 'PUT',
        headers: {},
      }),
  );

  assertTrue(
    !error.message.includes('TOPSECRETSIGNATURE'),
    'the signature does not survive a native rejection',
  );
  assertTrue(
    !error.message.includes('X-Amz-Signature'),
    'the credential parameter name does not survive',
  );

  // The failure is still diagnosable: the object and the code remain.
  assertTrue(
    error.message.includes('/media/a.jpg'),
    'the failing object stays identifiable',
  );
  assertTrue(
    error.code === 'UPLOAD_NETWORK_ERROR',
    'the transport classification is preserved',
  );
  assertTrue(
    error.retryable,
    'a native rejection stays retryable',
  );
}

/**
 * A non-Error rejection must still produce a usable, safe message.
 */
async function testNonErrorRejectionIsSafe(): Promise<void> {
  const uploadFile = (async () => {
    throw `raw string with ${UPLOAD_URL}`;
  }) as unknown as NativeUploadFile;

  const uploader = new ExpoFileByteUploader(uploadFile);

  const error = await expectTransportError(
    'a non-Error rejection',
    () =>
      uploader.upload({
        uri: 'file:///media/a.jpg',
        url: UPLOAD_URL,
        method: 'PUT',
        headers: {},
      }),
  );

  assertTrue(
    !error.message.includes('TOPSECRETSIGNATURE'),
    'a string rejection is redacted too',
  );
}

/**
 * A non-2xx response is a completed request rather than a rejection.
 * Object storage echoes the presigned URL back in its error bodies, so
 * the body must not be carried into the message that gets persisted.
 */
async function testResponseBodyIsNotCarriedForward(): Promise<void> {
  const uploadFile: NativeUploadFile = async () => ({
    status: 403,
    body: `SignatureDoesNotMatch for ${UPLOAD_URL}`,
  });

  const uploader = new ExpoFileByteUploader(uploadFile);

  const error = await expectTransportError(
    'a refused write',
    () =>
      uploader.upload({
        uri: 'file:///media/a.jpg',
        url: UPLOAD_URL,
        method: 'PUT',
        headers: {},
      }),
  );

  assertTrue(
    !error.message.includes('TOPSECRETSIGNATURE'),
    'a response body does not leak the signature',
  );
  assertTrue(
    !error.message.includes('SignatureDoesNotMatch'),
    'the raw response body is not carried into the message',
  );
  assertTrue(
    error.code === 'UPLOAD_AUTHORIZATION_REJECTED',
    'the outcome classification is preserved',
  );
  assertTrue(
    error.retryable,
    'a refused authorization stays retryable, because the next attempt re-authorizes',
  );
}

async function main(): Promise<void> {
  await testNativeRejectionIsRedacted();
  await testNonErrorRejectionIsSafe();
  await testResponseBodyIsNotCarriedForward();

  console.log('NATIVE UPLOADER TESTS PASSED');
}

void main().catch((error) => {
  console.error('NATIVE UPLOADER TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
