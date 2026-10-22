import { router } from 'expo-router';

import { DiscoveryScreen } from '@/features/discovery/DiscoveryScreen';

/**
 * Route: /explore — the Explore tab.
 *
 * This tab *is* product discovery. The buyer opens it to see what artisans
 * have published, so the real discovery list renders here directly rather
 * than behind an extra screen: one list implementation, one search, one
 * empty state, shared with the pushed `/explore/discovery` route.
 *
 * There is no back affordance because this is a tab root — there is nothing
 * above it in this stack. Opening a listing pushes the detail route on top.
 */
export default function ExploreTabScreen() {
  return (
    <DiscoveryScreen
      onOpenProduct={(productId) =>
        router.push(`/explore/discovery/${encodeURIComponent(productId)}`)
      }
    />
  );
}
