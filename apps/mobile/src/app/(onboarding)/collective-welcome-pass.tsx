import React from 'react';
import {
  Image,
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
 * Screen 08: Collective Welcome Pass
 *
 * Based on Stitch: 08-collective-welcome-pass.html
 * - Hero member gift card (gradient background with Pass #8921)
 * - Welcome reward: $15 Off First Order
 * - Member details (name, member key)
 * - Tuned Feed Snapshot badges (3 interests, Wabi-Sabi Style, Plastic-Free Packaging)
 * - Direct Maker Perks grid (Direct Maker, Carbon Neutral)
 * - Artisan Guarantee strip
 * - Primary CTA: "Start Exploring Marketplace"
 * - Secondary: Copy Code WELCOME15 button
 * - This is the FINAL onboarding screen - completes onboarding
 */
export default function CollectiveWelcomePassScreen() {
  const theme = useTheme();
  const { completeStep, updateProgress, progress } = useOnboarding();

  // Animation values
  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(20);
  const passOpacity = useSharedValue(0);
  const passScale = useSharedValue(0.9);
  const passTranslateY = useSharedValue(30);
  const snapshotOpacity = useSharedValue(0);
  const snapshotTranslateY = useSharedValue(20);
  const perksOpacity = useSharedValue(0);
  const perksTranslateY = useSharedValue(20);
  const ctaOpacity = useSharedValue(0);
  const ctaTranslateY = useSharedValue(20);

  React.useEffect(() => {
    headerOpacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    headerTranslateY.value = withDelay(100, withSpring(0, { damping: 20, stiffness: 200 }));

    passOpacity.value = withDelay(200, withTiming(1, { duration: 500 }));
    passScale.value = withDelay(200, withSpring(1, { damping: 18, stiffness: 180 }));
    passTranslateY.value = withDelay(200, withSpring(0, { damping: 20, stiffness: 200 }));

    snapshotOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
    snapshotTranslateY.value = withDelay(400, withSpring(0, { damping: 20, stiffness: 200 }));

    perksOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    perksTranslateY.value = withDelay(500, withSpring(0, { damping: 20, stiffness: 200 }));

    ctaOpacity.value = withDelay(600, withTiming(1, { duration: 400 }));
    ctaTranslateY.value = withDelay(600, withSpring(0, { damping: 20, stiffness: 200 }));
  }, []);

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const passAnimStyle = useAnimatedStyle(() => ({
    opacity: passOpacity.value,
    transform: [
      { scale: passScale.value },
      { translateY: passTranslateY.value },
    ],
  }));

  const snapshotAnimStyle = useAnimatedStyle(() => ({
    opacity: snapshotOpacity.value,
    transform: [{ translateY: snapshotTranslateY.value }],
  }));

  const perksAnimStyle = useAnimatedStyle(() => ({
    opacity: perksOpacity.value,
    transform: [{ translateY: perksTranslateY.value }],
  }));

  const ctaAnimStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }));

  const handleCopyCode = () => {
    // In a real app, would use Clipboard API
    // For now, just show feedback
    updateProgress({ couponCopied: true });
  };

  const handleStartExploring = () => {
    // Complete onboarding and navigate to main app
    completeStep('collective-welcome-pass');
    // The onboarding context will handle marking as complete
    // The AuthGate in root layout will then show the main app
  };

  const handleMaybeLater = () => {
    // Allow skipping but still complete onboarding
    completeStep('collective-welcome-pass');
  };

  const interests = progress.selectedInterests?.length ?? 3;
  const style = progress.selectedStyle ?? 'wabi-sabi';

  const badges = [
    { icon: '🎨', label: `${interests} Interests Selected` },
    { icon: '🌿', label: style === 'wabi-sabi' ? 'Wabi-Sabi Style' : 'Bohemian Style' },
    { icon: '♻', label: 'Plastic-Free Packaging' },
  ];

  const perks = [
    { icon: '🏪', label: 'Direct Maker', description: 'Zero middlemen markup' },
    { icon: '🌍', label: 'Carbon Neutral', description: 'Earth-first transit' },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.contentWrapper}>
        {/* Subtle Ambient Header */}
        <Animated.View style={[styles.header, headerAnimStyle]}>
          <View style={styles.headerBadge}>
            <Text style={{ fontSize: 14 }}>⭐</Text>
            <Text style={[
              Typography.labelSm,
              { color: theme.onSecondaryContainer },
            ]}>
              Pass #8921 Activated
            </Text>
          </View>
          <Text style={[
            Typography.headlineXlMobile,
            { color: theme.text, textAlign: 'center', marginTop: Spacing.md },
          ]}>
            Welcome to the Collective
          </Text>
          <Text style={[
            Typography.bodyMd,
            { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.sm, maxWidth: 280 },
          ]}>
            Your personalized artisan feed has been tailored with your favorite
            crafts and ethical preferences.
          </Text>
        </Animated.View>

        {/* Hero Member Gift Card */}
        <Animated.View style={[styles.passCard, passAnimStyle]}>
          {/* Ambient glow overlays */}
          <View style={styles.passGlow1} pointerEvents="none" />
          <View style={styles.passGlow2} pointerEvents="none" />

          <View style={styles.passContent}>
            {/* Card Top: Emblem & Pass Type */}
            <View style={styles.passTop}>
              <View style={styles.passEmblem}>
                <View style={styles.emblemLogo}>
                  <Image
                    source={require('@/assets/images/logo-glow.png')}
                    style={styles.emblemImage}
                    resizeMode="contain"
                    accessibilityLabel="Artisan Marketplace Logo"
                  />
                </View>
                <View>
                  <Text style={[
                    Typography.labelSm,
                    { color: theme.primaryFixed, letterSpacing: 1.5, textTransform: 'uppercase' },
                  ]}>
                    Curator Privilege
                  </Text>
                  <Text style={[
                    Typography.headlineSm,
                    { color: theme.onPrimary, fontWeight: '600', marginTop: 2 },
                  ]}>
                    Artisan Pass
                  </Text>
                </View>
              </View>
              <View style={styles.vipBadge}>
                <Text style={[
                  Typography.labelSm,
                  { color: theme.primaryFixed, fontWeight: '600', letterSpacing: 1 },
                ]}>
                  VIP 2025
                </Text>
              </View>
            </View>

            {/* Card Center: Welcome Gift Voucher */}
            <View style={styles.passCenter}>
              <View style={styles.giftRow}>
                <View style={styles.giftIcon}>
                  <Text style={{ fontSize: 20 }}>🎁</Text>
                </View>
                <View>
                  <Text style={[
                    Typography.labelSm,
                    { color: theme.primaryFixed, opacity: 0.9 },
                  ]}>
                    Welcome Reward
                  </Text>
                  <Text style={[
                    Typography.headlineSm,
                    { color: theme.onPrimary, fontWeight: '700', marginTop: 2 },
                  ]}>
                    $15 Off First Order
                  </Text>
                </View>
              </View>
              <Text style={[
                { color: theme.primaryFixed, fontSize: 20 },
              ]}>
                ✓
              </Text>
            </View>

            {/* Card Bottom: Member Details */}
            <View style={styles.passBottom}>
              <View>
                <Text style={[
                  Typography.labelSm,
                  { color: theme.primaryFixed, opacity: 0.75, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
                ]}>
                  Passholder
                </Text>
                <Text style={[
                  Typography.headlineSm,
                  { color: theme.onPrimary, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
                ]}>
                  Maxwell Alex
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[
                  Typography.labelSm,
                  { color: theme.primaryFixed, opacity: 0.75, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
                ]}>
                  Member Key
                </Text>
                <Text style={[
                  Typography.labelMd,
                  { color: theme.primaryFixed, fontFamily: Fonts.web?.mono || Fonts.ios?.mono || 'monospace', letterSpacing: 2, marginTop: 2 },
                ]}>
                  #8921-ART
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Tailored Profile Preferences Summary */}
        <Animated.View style={[styles.snapshotCard, snapshotAnimStyle]}>
          <View style={styles.snapshotHeader}>
            <View style={styles.snapshotTitle}>
              <Text style={{ fontSize: 18, color: theme.primary }}>✦</Text>
              <Text style={[
                Typography.labelMd,
                { color: theme.text, fontWeight: '600' },
              ]}>
                Tuned Feed Snapshot
              </Text>
            </View>
            <CraftStatusPill text="Ready" tone="accent" />
          </View>

          {/* Badges Row */}
          <View style={styles.badgesRow}>
            {badges.map((badge, index) => (
              <View key={index} style={styles.badge}>
                <Text style={{ fontSize: 14 }}>{badge.icon}</Text>
                <Text style={[
                  Typography.labelMd,
                  { color: theme.onSecondaryContainer },
                ]}>
                  {badge.label}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Direct Maker Handcrafted Perks Grid */}
        <Animated.View style={[styles.perksWrapper, perksAnimStyle]}>
          <View style={styles.perksGrid}>
            {perks.map((perk, index) => (
              <View key={index} style={styles.perkCard}>
                <View style={styles.perkIcon}>
                  <Text style={{ fontSize: 18 }}>{perk.icon}</Text>
                </View>
                <View>
                  <Text style={[
                    Typography.labelMd,
                    { color: theme.text, fontWeight: '600' },
                  ]}>
                    {perk.label}
                  </Text>
                  <Text style={[
                    Typography.bodySm,
                    { color: theme.textSecondary, marginTop: 2 },
                  ]}>
                    {perk.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Artisan Guarantee Strip */}
        <Animated.View style={[styles.guaranteeStrip, perksAnimStyle]}>
          <Text style={{ fontSize: 16, color: theme.primary }}>✓</Text>
          <Text style={[
            Typography.bodySm,
            { color: theme.textSecondary, fontWeight: '500' },
          ]}>
            Guaranteed Safe Delivery • Direct Maker Support • Plastic-Free
          </Text>
        </Animated.View>

        {/* Primary CTA Area */}
        <Animated.View style={[styles.ctaWrapper, ctaAnimStyle]}>
          <CraftPressButton
            label="Start Exploring Marketplace"
            variant="primary"
            onPress={handleStartExploring}
            style={styles.ctaButton}
            textStyle={[
              Typography.labelLg,
              { color: theme.onPrimary, letterSpacing: 0.5 },
            ]}
          />

          <Pressable
            onPress={handleCopyCode}
            style={styles.copyButton}
            android_ripple={{ color: theme.primary + '33', borderless: false }}>
            <Text style={[
              Typography.labelMd,
              { color: theme.primary, fontWeight: '600' },
            ]}>
              Copy Code: <u>WELCOME15</u>
            </Text>
          </Pressable>

          {progress.couponCopied && (
            <Text style={[
              Typography.labelMd,
              { color: theme.secondary, marginTop: Spacing.sm, textAlign: 'center' },
            ]}>
              ✓ Coupon copied to clipboard!
            </Text>
          )}
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.secondaryContainer + '99',
    marginBottom: Spacing.sm,
  },
  passCard: {
    borderRadius: CraftRadii.lg,
    overflow: 'hidden',
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: theme => theme.primary,
    position: 'relative',
  },
  passGlow1: {
    position: 'absolute',
    top: -48,
    right: -48,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme => theme.secondaryFixed + '33',
  },
  passGlow2: {
    position: 'absolute',
    bottom: -44,
    left: -40,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme => theme.tertiaryFixed + '20',
  },
  passContent: {
    position: 'relative',
    zIndex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: 280,
  },
  passTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passEmblem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  emblemLogo: {
    width: 48,
    height: 48,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.surfaceContainerLowest + 'E6',
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemImage: {
    width: '100%',
    height: '100%',
  },
  vipBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.surfaceContainerLowest + '33',
  },
  passCenter: {
    backgroundColor: theme => theme.surfaceContainerLowest + '26',
    borderRadius: CraftRadii.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  giftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  giftIcon: {
    width: 40,
    height: 40,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
  },
  snapshotCard: {
    backgroundColor: theme => theme.surfaceContainerLow,
    borderRadius: CraftRadii.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  snapshotTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
    badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.secondaryContainer,
  },
  perksWrapper: {
    marginBottom: Spacing.md,
  },
  perksGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  perkCard: {
    flex: 1,
    backgroundColor: theme => theme.surfaceContainer,
    borderRadius: CraftRadii.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  perkIcon: {
    width: 32,
    height: 32,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.secondaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guaranteeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  ctaWrapper: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ctaButton: {
    minHeight: 56,
    borderRadius: CraftRadii.pill,
    paddingHorizontal: Spacing.xl,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  copyButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
});