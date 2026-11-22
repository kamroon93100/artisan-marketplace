import { router, usePathname } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthGate } from '@/features/auth/session-provider';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { Colors, CraftRadii, Spacing } from '@/constants/theme';

const tabs = [
  { key: 'discover', label: 'Discover', icon: '\u2302', href: '/' },
  { key: 'search', label: 'Search', icon: '\u2315', href: '/search' },
  { key: 'questions', label: 'Questions', icon: '\u2709', href: '/inquiries' },
] as const;

function BottomNavigation() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  // Product detail and product creation need the full screen.
  const hidden =
    pathname.includes('/product/') ||
    pathname.endsWith('/create');

  if (hidden) return null;

  const activeKey =
    pathname.startsWith('/search')
      ? 'search'
      : pathname.startsWith('/inquiries')
        ? 'questions'
        : 'discover';

  const safeBottom = Math.max(insets.bottom, 8);

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bottomBar,
        {
          height: 64 + safeBottom,
          paddingBottom: safeBottom,
        },
      ]}>
      <View style={styles.tabsRow}>
        {tabs.map((tab) => {
          const selected = activeKey === tab.key;

          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              onPress={() => {
                if (!selected) router.replace(tab.href as any);
              }}
              style={({ pressed }) => [
                styles.tabButton,
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.iconWrap,
                  selected && styles.iconWrapSelected,
                ]}>
                <Text
                  style={[
                    styles.tabIcon,
                    selected && styles.tabIconSelected,
                  ]}>
                  {tab.icon}
                </Text>
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  selected && styles.tabLabelSelected,
                ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Create product"
          onPress={() => router.push('/create' as any)}
          style={({ pressed }) => [
            styles.tabButton,
            pressed && styles.pressed,
          ]}>
          <View style={[styles.iconWrap, styles.createIconWrap]}>
            <Text style={styles.createIcon}>+</Text>
          </View>
          <Text style={styles.tabLabel}>Create</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function HomeLayout() {
  return (
    <AuthGate signIn={<AuthScreen />}>
      <View style={styles.shell}>
        <View style={styles.stack}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
        <BottomNavigation />
      </View>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  stack: {
    flex: 1,
  },
  bottomBar: {
    backgroundColor: Colors.light.background,
    borderTopColor: Colors.light.backgroundSelected,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 12,
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 2,
  },
  iconWrap: {
    minWidth: 48,
    minHeight: 28,
    borderRadius: CraftRadii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: {
    backgroundColor: Colors.light.backgroundSelected,
  },
  tabIcon: {
    color: Colors.light.textSecondary,
    fontSize: 22,
    lineHeight: 26,
  },
  tabIconSelected: {
    color: Colors.light.text,
  },
  createIconWrap: {
    backgroundColor: Colors.light.text,
  },
  createIcon: {
    color: Colors.light.background,
    fontSize: 24,
    lineHeight: 27,
    fontWeight: '600',
  },
  tabLabel: {
    color: Colors.light.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  tabLabelSelected: {
    color: Colors.light.text,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.65,
  },
});