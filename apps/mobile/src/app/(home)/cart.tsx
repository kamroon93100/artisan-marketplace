import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, CraftRadii } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CraftPressButton } from '@/components/craft-motion';

export default function CartScreen() {
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="headlineLgMobile" themeColor="text" style={styles.title}>
          Artisan Basket
        </ThemedText>
      </View>

      <ThemedView type="surfaceContainerLow" style={styles.emptyState}>
        <ThemedText type="headlineMd" themeColor="textSecondary" style={styles.emptyIcon}>
          🛍
        </ThemedText>
        <ThemedText type="headlineSm" themeColor="text" style={styles.emptyTitle}>
          Your basket is empty
        </ThemedText>
        <ThemedText type="bodyMd" themeColor="textSecondary" style={styles.emptyDesc}>
          Discover handmade treasures and add them here
        </ThemedText>
        <CraftPressButton
          label="Start Exploring"
          variant="primary"
          style={styles.exploreButton}
          onPress={() => router.back()}
        />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: Spacing.margin,
    paddingVertical: Spacing.lg,
    paddingTop: Spacing['2xl'],
  },
  title: {
    // Font handled by ThemedText type="headlineLgMobile"
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    margin: Spacing.margin,
    borderRadius: CraftRadii.xl,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    // Font handled by ThemedText type="headlineSm"
    textAlign: 'center',
  },
  emptyDesc: {
    // Font handled by ThemedText type="bodyMd"
    textAlign: 'center',
  },
  exploreButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: CraftRadii.pill,
  },
});