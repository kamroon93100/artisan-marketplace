import { Stack } from 'expo-router/stack';

/**
 * The buyer's Stack inside the Explore tab.
 *
 * NativeTabs render no headers, and this app's screens carry their own back
 * affordances, so the stack exists to own the push/pop of the discovery
 * screens (list → listing) and the system back behaviour that comes with it,
 * not to render chrome of its own.
 */
export default function ExploreLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
