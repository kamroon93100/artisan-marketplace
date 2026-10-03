import type {
  MediaFailure,
  MediaUploadVerification,
} from '@artisan-marketplace/contracts';
import type { StoredObjectMetadata } from '../../../shared/storage/object-storage.js';

export type ExpectedStoredObject = {
  sizeBytes: number;
  contentType: string;
};

/**
 * Compares declared media metadata against the object metadata the
 * server independently read back from object storage.
 *
 * The client's claim that an upload succeeded is never trusted. A media
 * record is only verifiable when the stored object itself agrees with
 * what the canonical metadata record expects.
 */
function normalizeContentType(
  contentType: string | null,
): string | null {
  if (contentType === null) {
    return null;
  }

  return contentType
    .split(';')[0]!
    .trim()
    .toLowerCase();
}

export function verifyStoredObject(
  expected: ExpectedStoredObject,
  observed: StoredObjectMetadata | null,
): MediaUploadVerification {
  const base = {
    observedContentLength: observed?.contentLength ?? null,
    observedContentType: observed?.contentType ?? null,
    observedEtag: observed?.etag ?? null,
  };

  if (!observed) {
    const failure: MediaFailure = {
      code: 'OBJECT_NOT_FOUND',
      message:
        'The uploaded object is not present in object storage.',
    };

    return {
      ...base,
      verified: false,
      failure,
    };
  }

  if (observed.contentLength !== expected.sizeBytes) {
    const failure: MediaFailure = {
      code: 'OBJECT_SIZE_MISMATCH',
      message: `The stored object is ${observed.contentLength} bytes but ${expected.sizeBytes} bytes were declared.`,
    };

    return {
      ...base,
      verified: false,
      failure,
    };
  }

  if (
    normalizeContentType(observed.contentType) !==
    normalizeContentType(expected.contentType)
  ) {
    const failure: MediaFailure = {
      code: 'OBJECT_CONTENT_TYPE_MISMATCH',
      message: `The stored object content type ${observed.contentType ?? 'is absent'} does not match the declared ${expected.contentType}.`,
    };

    return {
      ...base,
      verified: false,
      failure,
    };
  }

  return {
    ...base,
    verified: true,
    failure: null,
  };
}
