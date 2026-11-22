import { router, useLocalSearchParams } from 'expo-router';

import { ProductDetailScreen } from '@/features/discovery/ProductDetailScreen';
import { resolveInquiryTransport } from '@/features/inquiry/inquiry-transport-shared';

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