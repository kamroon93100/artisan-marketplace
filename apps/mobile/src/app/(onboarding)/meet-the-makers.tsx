import React from 'react';
import {
  Dimensions,
  Image,
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

import { CraftPressButton, CraftEntrance, CraftStatusPill } from '@/components/craft-motion';
import { Colors, CraftRadii, Fonts, Spacing, Typography } from '@/constants/theme';
import { useOnboarding } from '@/features/onboarding/onboarding-context';
import { useTheme } from '@/hooks/use-theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAKER_CARD_WIDTH = (SCREEN_WIDTH - Spacing.margin * 2 - Spacing.md * 2) / 3;

/**
 * Screen 03: Meet the Makers
 *
 * Based on Stitch: 03-meet-the-makers.html
 * - Headline "Meet the Makers"
 * - Horizontal scroll of 3 maker cards with photos, names, locations, specialties
 * - Progress indicator (Step 2 of 6)
 * - "Continue" CTA
 */
export default function MeetTheMakersScreen() {
  const theme = useTheme();
  const { nextStep } = useOnboarding();

  // Animation values
  const badgeOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0.8);
  const headlineOpacity = useSharedValue(0);
  const headlineTranslateY = useSharedValue(20);
  const card1Opacity = useSharedValue(0);
  const card1TranslateX = useSharedValue(-30);
  const card2Opacity = useSharedValue(0);
  const card2TranslateX = useSharedValue(30);
  const card3Opacity = useSharedValue(0);
  const card3TranslateX = useSharedValue(30);
  const ctaOpacity = useSharedValue(0);
  const ctaTranslateY = useSharedValue(20);

  React.useEffect(() => {
    badgeOpacity.value = withDelay(100, withTiming(1, { duration: 300 }));
    badgeScale.value = withDelay(100, withSpring(1, { damping: 18, stiffness: 200 }));

    headlineOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
    headlineTranslateY.value = withDelay(200, withSpring(0, { damping: 20, stiffness: 200 }));

    card1Opacity.value = withDelay(300, withTiming(1, { duration: 400 }));
    card1TranslateX.value = withDelay(300, withSpring(0, { damping: 20, stiffness: 200 }));

    card2Opacity.value = withDelay(400, withTiming(1, { duration: 400 }));
    card2TranslateX.value = withDelay(400, withSpring(0, { damping: 20, stiffness: 200 }));

    card3Opacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    card3TranslateX.value = withDelay(500, withSpring(0, { damping: 20, stiffness: 200 }));

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

  const cardAnimStyle = (opacity: Animated.SharedValue<number>, translateX: Animated.SharedValue<number>) =>
    useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [{ translateX: translateX.value }],
    }));

  const ctaAnimStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }));

  const handleContinue = () => {
    nextStep();
  };

  const makers = [
    {
      id: '1',
      name: 'Mei Lin',
      location: 'Kyoto, Japan',
      specialty: 'Ceramics & Tea Ware',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAf2lUbM7SzcF6akkBdB577S-UiRlPNxp4a8x1KGMBzLIVCTsa7QBNzgTEnnamdf5PnjLeORsNEKDFa-Be-EVS01hOtjMxNrXGojhESxJ36ddp2d5vhTxgec0Y9Z4hEnwhoSjHDLZUNFRWcHv6hqsBAx-aesPckEuT8GJ7aCXUJHnD-hv05YBOlY8wzlNdFFAhRONjtCO4r8349Lag2bGdn4amYftRnkJWy6RoANkFh',
      verified: true,
    },
    {
      id: '2',
      name: 'Carlos Mendez',
      location: 'Oaxaca, Mexico',
      specialty: 'Textiles & Weaving',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAf2lUbM7SzcF6akkBdB577S-UiRlPNxp4a8x1KGMBzLIVCTsa7QBNzgTEnnamdf5PnjLeORsNEKDFa-Be-EVS01hOtjMxNrXGojhESxJ36ddp2d5vhTxgec0Y9Z4hEnwhoSjHDLZUNFRWcHv6hqsBAx-aesPckEuT8GJ7aCXUJHnD-hv05YBOlY8wzlNdFFAhRONjtCO4r8349Lag2bGdn4amYftRnkJWy6RoANkFh',
      verified: true,
    },
    {
      id: '3',
      name: 'Aisha Patel',
      location: 'Jaipur, India',
      specialty: 'Block Printing & Textiles',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAf2lUbM7SzcF6akkBdB577S-UiRlPNxp4a8x1KGMBzLIVCTsa7QBNzgTEnnamdf5PnjLeORsNEKDFa-Be-EVS01hOtjMxNrXGojhESxJ36ddp2d5vhTxgec0Y9Z4hEnwhoSjHDLZUNFRWcHv6hqsBAx-aesPckEuT8GJ7aCXUJHnD-hv05YBOlY8wzlNdFFAhRONjtCO4r8349Lag2bGdn4amYftRnkJWy6RoANkFh',
      verified: true,
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.contentWrapper}>
        {/* Animated Badge */}
        <CraftEntrance delayMs={100} style={styles.badgeWrapper}>
          <Animated.View style={badgeAnimStyle}>
            <CraftStatusPill text="Step 2 of 6" tone="neutral" />
          </Animated.View>
        </CraftEntrance>

        {/* Headline */}
        <Animated.View style={[styles.headlineWrapper, headlineAnimStyle]}>
          <Text style={[
            Typography.headlineXlMobile,
            { color: theme.text, textAlign: 'center' },
          ]}>
            Meet the Makers
          </Text>

          <Text style={[
            Typography.bodyMd,
            { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
          ]}>
            Independent artisans preserving heritage crafts worldwide
          </Text>
        </Animated.View>

        {/* Maker Cards - Horizontal Scroll */}
        <Animated.View
          style={[
            styles.scrollWrapper,
            cardAnimStyle(card1Opacity, card1TranslateX),
          ]}>
          <View style={styles.scrollContent}>
            {makers.map((maker, index) => {
              const animStyle = index === 0
                ? cardAnimStyle(card1Opacity, card1TranslateX)
                : index === 1
                ? cardAnimStyle(card2Opacity, card2TranslateX)
                : cardAnimStyle(card3Opacity, card3TranslateX);

              return (
                <Animated.View
                  key={maker.id}
                  style={[
                    styles.makerCard,
                    animStyle,
                  ]}>
                  <Image
                    source={{ uri: maker.image }}
                    style={styles.makerImage}
                    resizeMode="cover"
                    accessibilityLabel={`${maker.name}, ${maker.specialty} from ${maker.location}`}
                  />
                  <View style={styles.makerInfo}>
                    <View style={styles.makerNameRow}>
                      <Text style={[
                        Typography.headlineSm,
                        { color: theme.text },
                      ]}>
                        {maker.name}
                      </Text>
                      {maker.verified && (
                        <Text style={[
                          { color: theme.primary, fontSize: 14, marginLeft: Spacing.xs },
                        ]}>
                          ✓
                        </Text>
                      )}
                    </View>
                    <Text style={[
                      Typography.bodySm,
                      { color: theme.textSecondary, marginTop: Spacing.xs },
                    ]}>
                      {maker.location}
                    </Text>
                    <Text style={[
                      Typography.labelSm,
                      { color: theme.primary, marginTop: Spacing.xs },
                    ]}>
                      {maker.specialty}
                    </Text>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        {/* Scroll indicator */}
        <Animated.View
          style={[
            styles.scrollIndicator,
            cardAnimStyle(card2Opacity, card2TranslateX),
          ]}>
          <View style={styles.scrollDots}>
            {makers.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.scrollDot,
                  i === 0 ? styles.scrollDotActive : styles.scrollDotInactive,
                ]}
              />
            ))}
          </View>
        </Animated.View>

        {/* Description */}
        <Animated.View
          style={[
            styles.description,
            cardAnimStyle(card3Opacity, card3TranslateX),
          ]}>
          <Text style={[
            Typography.bodyMd,
            { color: theme.textSecondary, textAlign: 'center' },
          ]}>
            Every piece in our marketplace comes directly from makers like these —
            no middlemen, no mass production, just authentic craftsmanship.
          </Text>
        </Animated.View>

        {/* CTA Button */}
        <Animated.View style={[styles.ctaWrapper, ctaAnimStyle]}>
          <CraftPressButton
            label="Continue"
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
            You can skip and explore on your own
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
    marginBottom: Spacing.xl,
  },
  scrollWrapper: {
    marginBottom: Spacing.md,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  makerCard: {
    width: MAKER_CARD_WIDTH,
    borderRadius: CraftRadii.lg,
    overflow: 'hidden',
    backgroundColor: theme => theme.backgroundElement,
  },
  makerImage: {
    width: '100%',
    aspectRatio: 1,
  },
  makerInfo: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  makerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollIndicator: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  scrollDots: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  scrollDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scrollDotActive: {
    width: 24,
    backgroundColor: theme => theme.primary,
  },
  scrollDotInactive: {
    backgroundColor: theme => theme.border,
  },
  description: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  ctaWrapper: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
  },
  ctaButton: {
    minHeight: 56,
    borderRadius: CraftRadii.pill,
    paddingHorizontal: Spacing.xl,
    width: '100%',
  },
});