export type PresignedUpload = {
  url: string;
  headers: {
    'content-type': string;
  };
  expiresInSeconds: number;
};

export type StoredObjectMetadata = {
  contentLength: number;
  contentType: string | null;
  etag: string | null;
};

export interface ObjectStorage {
  createPresignedPutUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload>;

  headObject(
    objectKey: string,
  ): Promise<StoredObjectMetadata | null>;
}
