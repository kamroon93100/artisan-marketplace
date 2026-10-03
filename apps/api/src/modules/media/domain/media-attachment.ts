import type {
  MediaKind,
  MediaState,
} from '@artisan-marketplace/contracts';

export type { MediaKind, MediaState } from '@artisan-marketplace/contracts';

export type MediaAttachment = {
  id: string;
  productId: string;
  ownerId: string;
  kind: MediaKind;
  objectKey: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  state: MediaState;
  createdAt: string;
  updatedAt: string;
};
