import { router, useLocalSearchParams } from 'expo-router';

import { ProductDetailScreen } from '@/features/marketplace/product/ProductDetailScreen';

/**
 * Route: /product/:productId
 *
 * Marketplace product detail screen with rich UI matching Stitch design.
 * Navigated from MarketplaceHomeFeed when tapping a product card.
 */
export default function ProductDetailRoute() {
  const { productId } = useLocalSearchParams<{ productId: string }>();

  return (
    <ProductDetailScreen
      productId={typeof productId === 'string' ? productId : ''}
      onBack={() => router.back()}
      onAddToCart={(quantity, finish, size) => {
        // TODO: Add to cart logic
        console.log('Add to cart:', { productId: productId, quantity, finish, size });
      }}
      onToggleFavorite={() => {
        // TODO: Toggle favorite logic
        console.log('Toggle favorite:', productId);
      }}
      onShare={() => {
        // TODO: Share logic
        console.log('Share:', productId);
      }}
      onOpenArtisan={() => {
        // TODO: Navigate to artisan profile
        console.log('Open artisan for product:', productId);
      }}
      onOpenReviews={() => {
        // TODO: Navigate to reviews
        console.log('Open reviews for product:', productId);
      }}
    />
  );
}