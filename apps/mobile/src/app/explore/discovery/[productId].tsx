import { router, useLocalSearchParams } from 'expo-router';

import { ProductDetailScreen } from '@/features/discovery/ProductDetailScreen';

/**
 * Route: /explore/discovery/:productId
 *
 * A repeated parameter arrives as an array; a listing route without a usable
 * id is handed to the screen as an empty id, which the screen answers with a
 * local "not available" state rather than a request about the wrong thing.
 */
export default function ProductDetailRoute() {
  const { productId } = useLocalSearchParams<{ productId: string }>();

  return (
    <ProductDetailScreen
      productId={typeof productId === 'string' ? productId : ''}
      onBack={() => router.back()}
    />
  );
}
