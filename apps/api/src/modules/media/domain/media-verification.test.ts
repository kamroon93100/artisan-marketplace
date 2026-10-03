import { verifyStoredObject } from './media-verification.js';

const expected = {
  sizeBytes: 4096,
  contentType: 'image/jpeg',
};

function assertEqual(
  actual: unknown,
  expectedValue: unknown,
  label: string,
): void {
  if (actual !== expectedValue) {
    throw new Error(
      `${label}: expected ${String(expectedValue)}, received ${String(actual)}.`,
    );
  }
}

// A matching object verifies and reports what the server observed.
const verified = verifyStoredObject(expected, {
  contentLength: 4096,
  contentType: 'image/jpeg',
  etag: '"abc123"',
});

assertEqual(verified.verified, true, 'matching object verifies');
assertEqual(verified.failure, null, 'matching object has no failure');
assertEqual(
  verified.observedContentLength,
  4096,
  'observed length reported',
);
assertEqual(
  verified.observedEtag,
  '"abc123"',
  'observed etag reported',
);

// A missing object is an explicit repair state, never a silent pass.
const missing = verifyStoredObject(expected, null);

assertEqual(missing.verified, false, 'missing object does not verify');
assertEqual(
  missing.failure?.code,
  'OBJECT_NOT_FOUND',
  'missing object failure code',
);
assertEqual(
  missing.observedContentLength,
  null,
  'missing object has no observed length',
);

// A truncated upload must not pass as the declared size.
const truncated = verifyStoredObject(expected, {
  contentLength: 1024,
  contentType: 'image/jpeg',
  etag: '"partial"',
});

assertEqual(
  truncated.verified,
  false,
  'truncated object does not verify',
);
assertEqual(
  truncated.failure?.code,
  'OBJECT_SIZE_MISMATCH',
  'truncated object failure code',
);
assertEqual(
  truncated.observedContentLength,
  1024,
  'truncated object reports observed length',
);

// A swapped or mislabelled object must not pass as the declared type.
const wrongType = verifyStoredObject(expected, {
  contentLength: 4096,
  contentType: 'text/html',
  etag: '"html"',
});

assertEqual(
  wrongType.verified,
  false,
  'mismatched content type does not verify',
);
assertEqual(
  wrongType.failure?.code,
  'OBJECT_CONTENT_TYPE_MISMATCH',
  'mismatched content type failure code',
);

// An absent observed content type is a mismatch, not a pass.
const noType = verifyStoredObject(expected, {
  contentLength: 4096,
  contentType: null,
  etag: null,
});

assertEqual(
  noType.verified,
  false,
  'absent observed content type does not verify',
);

// Content type parameters and casing are not meaningful differences.
const withCharset = verifyStoredObject(expected, {
  contentLength: 4096,
  contentType: 'IMAGE/JPEG; charset=binary',
  etag: '"params"',
});

assertEqual(
  withCharset.verified,
  true,
  'content type parameters are normalized',
);

console.log('MEDIA VERIFICATION TESTS PASSED');
