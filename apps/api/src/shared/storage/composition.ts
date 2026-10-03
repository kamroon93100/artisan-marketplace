import { AppError } from '../errors/app-error.js';
import { S3ObjectStorage } from './s3-object-storage.js';
import type { ObjectStorage } from './object-storage.js';

export type ObjectStorageBindingEnv = {
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_BUCKET?: string;
};

/**
 * Upload authorization must never silently degrade into a fake
 * success. When object storage is not configured, the media module
 * fails closed instead of handing the client a fabricated upload.
 */
class UnavailableObjectStorage implements ObjectStorage {
  async createPresignedPutUrl(): Promise<never> {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Object storage is not configured.',
    );
  }

  async headObject(): Promise<never> {
    throw new AppError(
      'DEPENDENCY_FAILED',
      'Object storage is not configured.',
    );
  }
}

const unavailable = new UnavailableObjectStorage();

export function isObjectStorageConfigured(
  env: ObjectStorageBindingEnv,
): boolean {
  return Boolean(
    env.S3_ENDPOINT &&
      env.S3_REGION &&
      env.S3_ACCESS_KEY_ID &&
      env.S3_SECRET_ACCESS_KEY &&
      env.S3_BUCKET,
  );
}

export function getObjectStorage(
  env: ObjectStorageBindingEnv,
): ObjectStorage {
  if (!isObjectStorageConfigured(env)) {
    return unavailable;
  }

  return new S3ObjectStorage({
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    bucket: env.S3_BUCKET!,
  });
}
