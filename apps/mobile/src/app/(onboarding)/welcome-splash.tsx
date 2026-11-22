import React from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CraftPressButton, CraftEntrance } from '@/components/craft-motion';
import { Colors, CraftRadii, FontSizes, Fonts, FontWeights, LineHeights, LetterSpacings, Spacing, Typography } from '@/constants/theme';
import { useOnboarding } from '@/features/onboarding/onboarding-context';
import { useTheme } from '@/hooks/use-theme';

/**
 * Screen 01: Welcome & Splash
 *
 * Based on Stitch: 01-welcome-splash.html
 * - Full-screen splash with logo, headline, and "Begin Your Journey" CTA
 * - Decorative ambient glow/blob
 * - Subtle entrance animations
 */
export default function WelcomeSplashScreen() {
  const theme = useTheme();
  const { nextStep } = useOnboarding();

  // Animation values
  const logoScale = useSharedValue(0.8);
  const logoOpacity = useSharedValue(0);
  const blobScale = useSharedValue(0.5);
  const blobOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(30);

  // Trigger entrance animations
  React.useEffect(() => {
    logoScale.value = withDelay(100, withSpring(1, { damping: 18, stiffness: 180 }));
    logoOpacity.value = withDelay(100, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));

    blobScale.value = withDelay(200, withSpring(1, { damping: 16, stiffness: 140 }));
    blobOpacity.value = withDelay(200, withTiming(0.15, { duration: 600, easing: Easing.out(Easing.cubic) }));

    contentOpacity.value = withDelay(400, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
    contentTranslateY.value = withDelay(400, withSpring(0, { damping: 20, stiffness: 200 }));
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const blobAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: blobScale.value }],
    opacity: blobOpacity.value,
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const handleBegin = () => {
    nextStep();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Decorative Ambient Blob */}
      <Animated.View
        style={[
          styles.blob,
          {
            backgroundColor: theme.primary,
            ...blobAnimStyle,
          },
        ]}
        pointerEvents="none"
      />

      <View style={styles.contentWrapper}>
        {/* Logo */}
        <Animated.View style={[styles.logoWrapper, logoAnimStyle]}>
          <Image
            source={require('@/assets/images/logo-glow.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Artisan Marketplace"
          />
        </Animated.View>

        {/* Content */}
        <Animated.View style={[styles.content, contentAnimStyle]}>
          <Text style={[
            Typography.headlineXlMobile,
            { color: theme.text, textAlign: 'center' },
          ]}>
            Welcome to the{' '}
            <Text style={{ color: theme.primary, fontStyle: 'italic' }}>
              Collective
            </Text>
          </Text>

          <Text style={[
            Typography.bodyMd,
            { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.md },
          ]}>
            Discover handmade treasures, vintage finds, and creative goods crafted
            with love by independent makers around the world.
          </Text>

          {/* Handcrafted motif divider */}
          <View style={styles.divider} accessibilityHidden={true}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[
              { color: theme.primary, fontSize: 18 },
              { fontFamily: Fonts.web?.serif || Fonts.ios?.serif || 'Playfair Display' },
            ]}>
              ✦
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <Text style={[
            Typography.bodySm,
            { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.lg },
          ]}>
            Where every piece tells a story.
          </Text>
        </Animated.View>

        {/* CTA Button */}
        <CraftEntrance delayMs={600} style={styles.ctaWrapper}>
          <CraftPressButton
            label="Begin Your Journey"
            variant="primary"
            onPress={handleBegin}
            style={styles.ctaButton}
            textStyle={[
              Typography.labelLg,
              { color: theme.onPrimary, letterSpacing: 0.5 },
            ]}
          />
        </CraftEntrance>

        {/* Trust badges */}
        <CraftEntrance delayMs={700} style={styles.badges}>
          <View style={styles.badgesRow}>
            <View style={styles.badge}>
              <Text style={[
                Typography.labelSm,
                { color: theme.primary },
              ]}>
                Verified Artisans
              </Text>
            </View>
            <View style={styles.badgeDot} accessibilityHidden={true} />
            <View style={styles.badge}>
              <Text style={[
                Typography.labelSm,
                { color: theme.primary },
              ]}>
                Plastic-Free Wrap
              </Text>
            </View>
            <View style={styles.badgeDot} accessibilityHidden={true} />
            <View style={styles.badge}>
              <Text style={[
                Typography.labelSm,
                { color: theme.primary },
              ]}>
                Direct Maker Support
              </Text>
            </View>
          </View>
        </CraftEntrance>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  blob: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.15,
  },
  contentWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.margin,
    paddingBottom: Spacing['2xl'],
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logo: {
    width: 120,
    height: 120,
  },
  content: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    maxWidth: 60,
  },
  ctaWrapper: {
    width: '100%',
    marginTop: Spacing.xl,
  },
  ctaButton: {
    minHeight: 56,
    borderRadius: CraftRadii.pill,
    paddingHorizontal: Spacing.xl,
  },
  badges: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  badgeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.border,
  },
});