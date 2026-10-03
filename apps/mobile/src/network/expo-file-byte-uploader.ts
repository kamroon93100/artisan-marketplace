import {
  File,
  UploadType,
} from 'expo-file-system';
import type {
  ByteUploader,
  ByteUploadRequest,
} from '../sync/byte-uploader';
import { MediaSyncTransportError } from '../sync/media-sync-contract';
import { classifyUploadOutcome } from '../sync/upload-outcome';
import { safeFailureMessage } from '../security/redact-secrets';

export type NativeUploadResult = {
  status: number;
  body: string;
};

export type NativeUploadFile = (
  uri: string,
  url: string,
  options: {
    httpMethod: 'PUT';
    uploadType: UploadType;
    headers: Record<string, string>;
    onProgress?: (progress: {
      bytesSent: number;
      totalBytes: number;
    }) => void;
  },
) => Promise<NativeUploadResult>;

/**
 * Streams the file from the device filesystem to object storage.
 *
 * The bytes never pass through the JavaScript heap as a single value
 * and never pass through the application server.
 *
 * A presigned URL is a temporary credential, so it is never included in
 * an error message or thrown error detail.
 */
async function uploadWithFileSystem(
  uri: string,
  url: string,
  options: Parameters<NativeUploadFile>[2],
): Promise<NativeUploadResult> {
  const file = new File(uri);
  const result = await file.upload(url, options);

  return {
    status: result.status,
    body: result.body,
  };
}

export class ExpoFileByteUploader implements ByteUploader {
  constructor(
    private readonly uploadFile: NativeUploadFile =
      uploadWithFileSystem,
  ) {}

  async upload(
    request: ByteUploadRequest,
  ): Promise<void> {
    let result: NativeUploadResult;

    try {
      result = await this.uploadFile(
        request.uri,
        request.url,
        {
          httpMethod: request.method,
          uploadType: UploadType.BINARY_CONTENT,
          headers: request.headers,
          onProgress: request.onProgress,
        },
      );
    } catch (error) {
      // The native upload rejects when the file cannot be read, the
      // request fails, or the transfer is cancelled. Those are
      // transport conditions a later attempt may recover from.
      //
      // The rejection text is untrusted and commonly embeds the URL it
      // was given, so it is redacted here. This is the narrowest point
      // that covers every caller of the native uploader.
      throw new MediaSyncTransportError(
        safeFailureMessage(
          error,
          'The media upload could not be completed.',
        ),
        'UPLOAD_NETWORK_ERROR',
        true,
      );
    }

    // The native upload resolves for any completed HTTP response,
    // including non-2xx, so the status must be classified explicitly. A
    // refused write must never reach the pipeline as a success.
    const outcome = classifyUploadOutcome(
      result.status,
    );

    if (!outcome.ok) {
      // The classification message is derived from the status alone:
      // the response body is deliberately not carried forward, because
      // object storage echoes the presigned URL back in its errors.
      throw new MediaSyncTransportError(
        outcome.message,
        outcome.code,
        outcome.retryable,
      );
    }
  }
}
