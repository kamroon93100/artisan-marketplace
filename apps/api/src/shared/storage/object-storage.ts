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

  getObject?(objectKey: string): Promise<{ bytes: Uint8Array; contentType: string | null } | null>;

  headObject(
    objectKey: string,
  ): Promise<StoredObjectMetadata | null>;
}
