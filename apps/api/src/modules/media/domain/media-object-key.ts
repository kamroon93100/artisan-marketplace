/**
 * Object keys are generated inside the media ownership boundary so a
 * client can never choose where its bytes land, and so two logical media
 * records can never collide on one object.
 */
export function buildMediaObjectKey(
  ownerId: string,
  productId: string,
  mediaId: string,
): string {
  return `media/${ownerId}/${productId}/${mediaId}`;
}
