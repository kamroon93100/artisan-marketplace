/**
 * Byte upload port.
 *
 * Media bytes are written straight to object storage with a
 * short-lived, single-object authorization. They deliberately do not
 * pass through the application server.
 *
 * The port exists so the sync pipeline can be exercised without a
 * device filesystem, and so the sync logic never handles raw bytes.
 */
export type ByteUploadProgress = {
  bytesSent: number;
  totalBytes: number;
};

export type ByteUploadRequest = {
  /** Local file URI of the captured media. */
  uri: string;
  /** Short-lived presigned URL for exactly this one object. */
  url: string;
  method: 'PUT';
  /**
   * Headers required by the signed request, including the exact
   * content type the object was authorized with.
   */
  headers: Record<string, string>;
  onProgress?: (
    progress: ByteUploadProgress,
  ) => void;
};

export type ByteUploader = {
  upload(request: ByteUploadRequest): Promise<void>;
};
