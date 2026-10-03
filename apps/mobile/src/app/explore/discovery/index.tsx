import { router } from 'expo-router';

import { DiscoveryScreen } from '@/features/discovery/DiscoveryScreen';

/**
 * Route: /explore/discovery
 *
 * The discovery list as a pushed screen of the Explore stack, so the buyer's
 * back gesture and the Android back button both return to Explore.
 */
export default function DiscoveryRoute() {
  return (
    <DiscoveryScreen
      onBack={() => router.back()}
      onOpenProduct={(productId) =>
        router.push(`/explore/discovery/${encodeURIComponent(productId)}`)
      }
    />
  );
}
