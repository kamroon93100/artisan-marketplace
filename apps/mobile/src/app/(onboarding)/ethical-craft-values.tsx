import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CraftPressButton, CraftEntrance, CraftStatusPill } from '@/components/craft-motion';
import { Colors, CraftRadii, Fonts, Spacing, Typography } from '@/constants/theme';
import { useOnboarding } from '@/features/onboarding/onboarding-context';
import { useTheme } from '@/hooks/use-theme';

/**
 * Screen 06: Ethical Craft Values
 *
 * Based on Stitch: 06-ethical-craft-values.html
 * - Headline "Shop by Values That Matter"
 * - 5 value cards with toggle switches (3 active by default, 2 inactive)
 * - Plastic-Free Packaging, Fair Direct Payouts, Heritage Craft Preservation (active)
 * - Slow & Small Batch, Locally Sourced Raw Materials (inactive)
 * - Artisan Verified Collective pledge banner
 * - Progress indicator (Step 5 of 6)
 * - "Save Values & Continue" CTA
 */
export default function EthicalCraftValuesScreen() {
  const theme = useTheme();
  const { nextStep, updateProgress, progress } = useOnboarding();

  // Animation values
  const badgeOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0.8);
  const headlineOpacity = useSharedValue(0);
  const headlineTranslateY = useSharedValue(20);
  const cardsOpacity = useSharedValue(0);
  const cardsTranslateY = useSharedValue(30);
  const bannerOpacity = useSharedValue(0);
  const bannerTranslateY = useSharedValue(20);
  const ctaOpacity = useSharedValue(0);
  const ctaTranslateY = useSharedValue(20);

  React.useEffect(() => {
    badgeOpacity.value = withDelay(100, withTiming(1, { duration: 300 }));
    badgeScale.value = withDelay(100, withSpring(1, { damping: 18, stiffness: 200 }));

    headlineOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
    headlineTranslateY.value = withDelay(200, withSpring(0, { damping: 20, stiffness: 200 }));

    cardsOpacity.value = withDelay(300, withTiming(1, { duration: 500 }));
    cardsTranslateY.value = withDelay(300, withSpring(0, { damping: 20, stiffness: 200 }));

    bannerOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    bannerTranslateY.value = withDelay(500, withSpring(0, { damping: 20, stiffness: 200 }));

    ctaOpacity.value = withDelay(600, withTiming(1, { duration: 400 }));
    ctaTranslateY.value = withDelay(600, withSpring(0, { damping: 20, stiffness: 200 }));
  }, []);

  const badgeAnimStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [{ scale: badgeScale.value }],
  }));

  const headlineAnimStyle = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ translateY: headlineTranslateY.value }],
  }));

  const cardsAnimStyle = useAnimatedStyle(() => ({
    opacity: cardsOpacity.value,
    transform: [{ translateY: cardsTranslateY.value }],
  }));

  const bannerAnimStyle = useAnimatedStyle(() => ({
    opacity: bannerOpacity.value,
    transform: [{ translateY: bannerTranslateY.value }],
  }));

  const ctaAnimStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }));

  const values = [
    {
      id: 'plastic-free',
      label: 'Plastic-Free Packaging',
      description: 'Recyclable, compostable paper & plant-based wraps with zero non-biodegradable plastics.',
      icon: '📦',
      iconColor: '#E05A2B',
      defaultActive: true,
    },
    {
      id: 'fair-payouts',
      label: 'Fair Direct Payouts',
      description: 'Artisans receive 85%+ of item retail value without predatory middleman deductions.',
      icon: '🤝',
      iconColor: '#9E3D00',
      defaultActive: true,
    },
    {
      id: 'heritage',
      label: 'Heritage Craft Preservation',
      description: 'Supporting multi-generational & endangered artisanal hand-looming, pottery, and metallurgy techniques.',
      icon: '🏛',
      iconColor: '#E65C00',
      defaultActive: true,
    },
    {
      id: 'slow-batch',
      label: 'Slow & Small Batch',
      description: 'Zero mass industrial lines. Limited edition seasonal studio runs focused on mindful durability.',
      icon: '⏳',
      iconColor: '#72594E',
      defaultActive: false,
    },
    {
      id: 'local-materials',
      label: 'Locally Sourced Raw Materials',
      description: 'Clays, wild harvest plant dyes, fibers & reclaimed timber responsibly sourced within 50 miles.',
      icon: '🌱',
      iconColor: '#CA4A1C',
      defaultActive: false,
    },
  ];

  const handleValuePress = (valueId: string) => {
    updateProgress((prev) => {
      const selected = prev.selectedValues.includes(valueId)
        ? prev.selectedValues.filter((id) => id !== valueId)
        : [...prev.selectedValues, valueId];
      return { ...prev, selectedValues: selected };
    });
  };

  const handleContinue = () => {
    nextStep();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.contentWrapper}>
        {/* Animated Badge */}
        <CraftEntrance delayMs={100} style={styles.badgeWrapper}>
          <Animated.View style={badgeAnimStyle}>
            <CraftStatusPill text="Step 5 of 6" tone="neutral" />
          </Animated.View>
        </CraftEntrance>

        {/* Headline */}
        <Animated.View style={[styles.headlineWrapper, headlineAnimStyle]}>
          <Text style={[
            Typography.headlineXlMobile,
            { color: theme.text, textAlign: 'center' },
          ]}>
            Shop by Values That Matter
          </Text>

          <Text style={[
            Typography.bodyMd,
            { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
          ]}>
            Choose the craft standards you want highlighted across your curated feed
          </Text>

          {/* Decorative prompt pill */}
          <View style={styles.promptPill}>
            <Text style={{ fontSize: 16 }}>🌿</Text>
            <Text style={[
              Typography.labelSm,
              { color: theme.onSecondaryContainer },
            ]}>
              Curating {progress.selectedValues?.length ?? 3} standards for your feed
            </Text>
          </View>
        </Animated.View>

        {/* Value Cards */}
        <Animated.View style={[styles.valuesWrapper, cardsAnimStyle]}>
          <View style={styles.valuesList}>
            {values.map((value, index) => (
              <Pressable
                key={value.id}
                onPress={() => handleValuePress(value.id)}
                style={({ pressed }) => [
                  styles.valueCard,
                  {
                    backgroundColor:
                      progress.selectedValues?.includes(value.id)
                        ? theme.backgroundElement
                        : theme.surfaceContainerLow + 'B3',
                    borderColor:
                      progress.selectedValues?.includes(value.id)
                        ? theme.primary + '33'
                        : 'transparent',
                    borderWidth: progress.selectedValues?.includes(value.id) ? 1 : 0,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
                  },
                ]}
                android_ripple={{
                  color: theme.primary + '33',
                  borderless: false,
                }}>
                <View style={styles.valueCardContent}>
                  <View style={[
                    styles.valueIcon,
                    { backgroundColor: value.iconColor + '20' },
                  ]}>
                    <Text style={{ fontSize: 24 }}>{value.icon}</Text>
                  </View>
                  <View style={styles.valueText}>
                    <Text style={[
                      Typography.headlineSm,
                      { color: theme.text },
                    ]}>
                      {value.label}
                    </Text>
                    <Text style={[
                      Typography.bodySm,
                      { color: theme.textSecondary, marginTop: Spacing.xs },
                    ]}>
                      {value.description}
                    </Text>
                  </View>
                </View>
                <View style={[
                  styles.toggleTrack,
                  progress.selectedValues?.includes(value.id)
                    ? styles.toggleTrackActive
                    : styles.toggleTrackInactive,
                ]}>
                  <Animated.View
                    style={[
                      styles.toggleThumb,
                      progress.selectedValues?.includes(value.id)
                        ? styles.toggleThumbActive
                        : styles.toggleThumbInactive,
                    ]}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Artisan Verified Collective Banner */}
        <Animated.View style={[styles.banner, bannerAnimStyle]}>
          <View style={styles.bannerHeader}>
            <Text style={{ fontSize: 20 }}>✓</Text>
            <Text style={[
              Typography.labelLg,
              { color: theme.text },
            ]}>
              Artisan Verified Collective
            </Text>
          </View>
          <Text style={[
            Typography.bodySm,
            { color: theme.textSecondary, marginTop: Spacing.sm },
          ]}>
            Every maker in our collective pledges adherence to verified ethical
            craftsmanship standards, site visits, and community transparency.
          </Text>

          {/* Visual craft stamp accent */}
          <View style={styles.stampRow}>
            <View style={styles.stampGroup}>
              <View style={styles.stamp}>
                <Text style={[
                  Typography.labelSm,
                  { color: theme.primary, fontWeight: '700' },
                ]}>
                  98%
                </Text>
              </View>
              <View style={[
                styles.stamp,
                { backgroundColor: theme.primaryFixed },
              ]}>
                <Text style={[
                  { color: theme.onPrimaryFixedVariant, fontSize: 12 },
                ]}>
                  ♻
                </Text>
              </View>
              <View style={[
                styles.stamp,
                { backgroundColor: theme.tertiaryFixed },
              ]}>
                <Text style={[
                  { color: theme.onTertiaryFixedVariant, fontSize: 12 },
                ]}>
                  ♡
                </Text>
              </View>
            </View>
            <Text style={[
              Typography.labelSm,
              { color: theme.primary, fontWeight: '600', marginLeft: Spacing.sm },
            ]}>
              Audited independently
            </Text>
          </View>
        </Animated.View>

        {/* CTA Button */}
        <Animated.View style={[styles.ctaWrapper, ctaAnimStyle]}>
          <CraftPressButton
            label="Save Values & Continue"
            variant="primary"
            onPress={handleContinue}
            style={styles.ctaButton}
            textStyle={[
              Typography.labelLg,
              { color: theme.onPrimary, letterSpacing: 0.5 },
            ]}
          />

          <Text style={[
            Typography.labelSm,
            { color: theme.textSecondary, marginTop: Spacing.md, textAlign: 'center' },
          ]}>
            You can fine-tune your ethical craft filters anytime in Profile
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: Spacing.margin,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  badgeWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headlineWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  promptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: CraftRadii.pill,
    backgroundColor: Colors.light.secondaryContainer + '66',
  },
  valuesWrapper: {
    flex: 1,
    marginBottom: Spacing.lg,
  },
  valuesList: {
    gap: Spacing.md,
  },
  valueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: CraftRadii.xl,
    borderWidth: 1,
  },
  valueCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minWidth: 0,
  },
  valueIcon: {
    width: 48,
    height: 48,
    borderRadius: CraftRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    flex: 1,
    minWidth: 0,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: CraftRadii.pill,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: Colors.light.primary,
  },
  toggleTrackInactive: {
    backgroundColor: Colors.light.surfaceContainerHighest,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: CraftRadii.pill,
    backgroundColor: Colors.light.background,
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  toggleThumbInactive: {
    transform: [{ translateX: 0 }],
  },
  banner: {
    backgroundColor: Colors.light.secondaryContainer + '4D',
    borderRadius: CraftRadii.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    color: Colors.light.primary,
  },
  stampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  stampGroup: {
    flexDirection: 'row',
  },
  stamp: {
    width: 28,
    height: 28,
    borderRadius: CraftRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    borderWidth: 2,
    borderColor: Colors.light.background,
  },
  ctaWrapper: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
  },
  ctaButton: {
    minHeight: 52,
    borderRadius: CraftRadii.pill,
    paddingHorizontal: Spacing.xl,
    width: '100%',
  },
});