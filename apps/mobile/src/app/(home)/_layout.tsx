import { Stack } from 'expo-router/stack';

/**
 * The Home tab's Stack.
 *
 * Home holds the account block and the single way into the buyer's inquiry
 * history, so the two live in one stack: the account screen lists the entry
 * and the history is a pushed screen above it. NativeTabs render no headers,
 * and this app's screens carry their own back affordances, so the stack owns
 * the push/pop and the system back behaviour that comes with it rather than
 * rendering chrome of its own.
 */
export default function HomeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
