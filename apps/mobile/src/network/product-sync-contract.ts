export type CreateProductSyncRequest = {
  title: string | null;
  idempotencyKey: string;
};

export type CreateProductSyncResponse = {
  remoteProductId: string;
};

export type SyncableProductState = 'PENDING_SYNC' | 'SYNCED';

export type ProductSyncTransport = {
  createProduct(
    request: CreateProductSyncRequest,
  ): Promise<CreateProductSyncResponse>;
  transitionProduct(
    productId: string,
    state: SyncableProductState,
  ): Promise<void>;
};

export class ProductSyncTransportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProductSyncTransportError';
  }
}
