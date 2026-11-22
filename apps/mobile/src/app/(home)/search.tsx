import { router } from 'expo-router';

import { DiscoveryScreen } from '@/features/discovery/DiscoveryScreen';

export default function SearchScreen() {
  return (
    <DiscoveryScreen
      onBack={() => router.back()}
      onOpenProduct={(productId) =>
        router.push({
          pathname: '/product/[productId]',
          params: { productId },
        } as any)
      }
    />
  );
}