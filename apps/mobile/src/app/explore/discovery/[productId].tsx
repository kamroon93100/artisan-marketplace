import { router, useLocalSearchParams } from 'expo-router';

import { ProductDetailScreen } from '@/features/discovery/ProductDetailScreen';
import { resolveInquiryTransport } from '@/features/inquiry/inquiry-transport-shared';

/**
 * Route: /explore/discovery/:productId
 *
 * A repeated parameter arrives as an array; a listing route without a usable
 * id is handed to the screen as an empty id, which the screen answers with
 * a local "not available" state rather than a request about the wrong thing.
 *
 * The inquiry composer is part of the listing view: a published product is
 * exactly what a buyer asks about, so the write surface travels with the
 * read surface rather than living behind another tap.
 */
export default function ProductDetailRoute() {
  const { productId } = useLocalSearchParams<{ productId: string }>();

  return (
    <ProductDetailScreen
      productId={typeof productId === 'string' ? productId : ''}
      onBack={() => router.back()}
      inquiryTransport={resolveInquiryTransport()}
    />
  );
}
