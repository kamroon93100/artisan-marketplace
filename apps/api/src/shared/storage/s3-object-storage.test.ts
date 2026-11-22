import assert from 'node:assert/strict';
import { test } from 'node:test';

import { S3ObjectStorage } from './s3-object-storage.js';

const config = {
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  bucket: 'artisan-marketplace-media',
};

test('presigned upload uses client-facing endpoint', async () => {
  const storage = new S3ObjectStorage({
    ...config,
    publicEndpoint: 'http://10.0.2.2:9000',
  });

  const result = await storage.createPresignedPutUrl({
    objectKey: 'media/owner/product/image',
    contentType: 'image/png',
  });

  const url = new URL(result.url);

  assert.equal(url.origin, 'http://10.0.2.2:9000');
  assert.equal(
    url.pathname,
    '/artisan-marketplace-media/media/owner/product/image',
  );
  assert.equal(result.headers['content-type'], 'image/png');
});

test('presigned upload falls back to internal endpoint', async () => {
  const storage = new S3ObjectStorage(config);

  const result = await storage.createPresignedPutUrl({
    objectKey: 'media/owner/product/image',
    contentType: 'image/png',
  });

  assert.equal(new URL(result.url).origin, 'http://127.0.0.1:9000');
});