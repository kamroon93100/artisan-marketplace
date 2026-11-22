import React from 'react';
import {
  Dimensions,
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

import { CraftPressButton, CraftEntrance, CraftStatusPill } from '@/components/craft-motion';
import { Colors, CraftRadii, Fonts, Spacing, Typography } from '@/constants/theme';
import { useOnboarding } from '@/features/onboarding/onboarding-context';
import { useTheme } from '@/hooks/use-theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.margin * 2 - Spacing.md) / 2;

/**
 * Screen 02: Truly Unique Crafts
 *
 * Based on Stitch: 02-truly-unique-crafts.html
 * - Hero headline "Find Something, Truly Unique"
 * - Staggered grid of artisan product cards
 * - Progress indicator (Step 1 of 6)
 * - "Explore Makers" CTA
 */
export default function TrulyUniqueCraftsScreen() {
  const theme = useTheme();
  const { nextStep } = useOnboarding();

  // Animation values
  const badgeOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0.8);
  const headlineOpacity = useSharedValue(0);
  const headlineTranslateY = useSharedValue(20);
  const card1Opacity = useSharedValue(0);
  const card1TranslateY = useSharedValue(30);
  const card2Opacity = useSharedValue(0);
  const card2TranslateY = useSharedValue(30);
  const card3Opacity = useSharedValue(0);
  const card3TranslateY = useSharedValue(30);
  const card4Opacity = useSharedValue(0);
  const card4TranslateY = useSharedValue(30);
  const ctaOpacity = useSharedValue(0);
  const ctaTranslateY = useSharedValue(20);

  React.useEffect(() => {
    // Badge animation
    badgeOpacity.value = withDelay(100, withTiming(1, { duration: 300 }));
    badgeScale.value = withDelay(100, withSpring(1, { damping: 18, stiffness: 200 }));

    // Headline animation
    headlineOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
    headlineTranslateY.value = withDelay(200, withSpring(0, { damping: 20, stiffness: 200 }));

    // Card animations (staggered)
    card1Opacity.value = withDelay(300, withTiming(1, { duration: 400 }));
    card1TranslateY.value = withDelay(300, withSpring(0, { damping: 20, stiffness: 200 }));

    card2Opacity.value = withDelay(400, withTiming(1, { duration: 400 }));
    card2TranslateY.value = withDelay(400, withSpring(0, { damping: 20, stiffness: 200 }));

    card3Opacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    card3TranslateY.value = withDelay(500, withSpring(0, { damping: 20, stiffness: 200 }));

    card4Opacity.value = withDelay(600, withTiming(1, { duration: 400 }));
    card4TranslateY.value = withDelay(600, withSpring(0, { damping: 20, stiffness: 200 }));

    // CTA animation
    ctaOpacity.value = withDelay(700, withTiming(1, { duration: 400 }));
    ctaTranslateY.value = withDelay(700, withSpring(0, { damping: 20, stiffness: 200 }));
  }, []);

  const badgeAnimStyle = useAnimatedStyle(() => ({
    opacity: badgeOpacity.value,
    transform: [{ scale: badgeScale.value }],
  }));

  const headlineAnimStyle = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ translateY: headlineTranslateY.value }],
  }));

  const cardAnimStyle = (opacity: Animated.SharedValue<number>, translateY: Animated.SharedValue<number>) =>
    useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    }));

  const ctaAnimStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }));

  const handleExploreMakers = () => {
    nextStep();
  };

  // Progress indicator (Step 1 of 6)
  const renderProgressDots = () => {
    const dots = [];
    for (let i = 0; i < 6; i++) {
      dots.push(
        <View
          key={i}
          style={[
            styles.progressDot,
            i === 0
              ? styles.progressDotActive
              : styles.progressDotInactive,
          ]}
        />
      );
    }
    return dots;
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Sunburst decorative backdrop */}
      <View
        style={[
          styles.sunburst,
          { backgroundColor: theme.secondaryContainer },
        ]}
        pointerEvents="none"
      />

      <View style={styles.contentWrapper}>
        {/* Animated Badge */}
        <CraftEntrance delayMs={100} style={styles.badgeWrapper}>
          <Animated.View style={badgeAnimStyle}>
            <CraftStatusPill text="Curated Artisan Craft" tone="accent" />
          </Animated.View>
        </CraftEntrance>

        {/* Headline */}
        <Animated.View style={[styles.headlineWrapper, headlineAnimStyle]}>
          <Text style={[
            Typography.headlineXlMobile,
            { color: theme.text, textAlign: 'center', lineHeight: LineHeights.headlineXlMobile },
          ]}>
            Find Something,{' '}
            <Text style={{ color: theme.primary, fontStyle: 'italic' }}>
              Truly Unique
            </Text>
          </Text>

          {/* Handcrafted motif */}
          <View style={styles.motif} accessibilityHidden={true}>
            <View style={[styles.motifLine, { backgroundColor: theme.border }]} />
            <Text style={{ color: theme.primary, fontSize: 16 }}>✦</Text>
            <View style={[styles.motifLine, { backgroundColor: theme.border }]} />
          </View>
        </Animated.View>

        {/* Artisan Showcase Grid */}
        <View style={styles.gridWrapper}>
          {/* Left Column - Small Vase Card + Maker Quote */}
          <Animated.View
            style={[
              styles.column,
              cardAnimStyle(card1Opacity, card1TranslateY),
            ]}>
            {/* Botanical Vase Card */}
            <View style={styles.vaseCard}>
              <Image
                source={{
                  uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBka2-ogQ3-w9gxV_JZB_qH9WWwvZpo0N3GRzDJMitL9HUKAL8JYHPBWCxnyrnGxa3fCPcCyQEBNR9_LDQ497i14h6E10nVr5k2j9ZfoOaYK-wRmXodiAW0myXNb1JICD61C8DjLnxQgT0ScVXbdJpobhy37NSI69DNixlwyjisoX6j6b715pS_aD_uY8F2KHXLYTjsvdCMbN57iwgI7C6YBQ_apMIXxQvwV3hU_syZ',
                }}
                style={styles.vaseImage}
                resizeMode="cover"
                accessibilityLabel="Delicate soft pink hand-thrown ceramic vase with painted cherry blossom motifs"
              />
              <View style={styles.vaseOverlay} />
              <View style={styles.vaseFooter}>
                <View style={styles.categoryChip}>
                  <Text style={[
                    Typography.labelSm,
                    { color: theme.text },
                  ]}>
                    Ceramics
                  </Text>
                </View>
                <Text style={[
                  { color: theme.background, fontSize: 18 },
                ]}>
                  ♡
                </Text>
              </View>
            </View>

            {/* Mini Maker Quote Bubble */}
            <View style={styles.quoteCard}>
              <View style={styles.quoteIcon}>
                <Text style={{ fontSize: 18 }}>🖌</Text>
              </View>
              <Text style={[
                Typography.bodySm,
                { color: theme.textSecondary },
              ]}>
                Hand-pinched & glazed with floral flora
              </Text>
            </View>
          </Animated.View>

          {/* Right Column - Hero Woven Bag & Dainty Accessory */}
          <View style={styles.column}>
            <Animated.View
              style={[
                styles.card,
                cardAnimStyle(card2Opacity, card2TranslateY),
              ]}>
              {/* Main Pastel Crochet Shoulder Bag */}
              <View style={styles.bagCard}>
                <Image
                  source={{
                    uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCSRfPJqK8eX3zNKXDlvFqpFEOf63ImrMY4P3EkQqx3ThYhqoU92PGezokv2uJfHKgvGPXrU-MKLpwqwjnO4zDj0DDzfzGrjsGyskI4poQvZv5t2wxRDqYgFT7mmQz7yKeTxCqTLVYPg7FSBLzAsvXiPcs77sHMOuPauTtEK380suuSsXd6XWyIQ5a2-ECJJ5SR9pXOzwmZV8qEphJbJR6oXPLvT9qIRFU1w4zuTLBt',
                  }}
                  style={styles.bagImage}
                  resizeMode="cover"
                  accessibilityLabel="Pale pink and ivory artisan hand-crocheted shoulder bag with scallop ruffle trim"
                />
                <View style={styles.staffPickBadge}>
                  <View style={styles.staffPickInner}>
                    <Text style={{ fontSize: 12 }}>★</Text>
                    <Text style={[
                      Typography.labelSm,
                      { color: theme.onPrimary },
                    ]}>
                      Staff Pick
                    </Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            <Animated.View
              style={[
                styles.card,
                cardAnimStyle(card3Opacity, card3TranslateY),
              ]}>
              {/* Dainty Floral Bracelet */}
              <View style={styles.braceletCard}>
                <Image
                  source={{
                    uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAf8sdcDjL7j566ddE_g_XHCrRU2niH-VMnkf8NEOGfPqmzZwN1y6qkLmofQbB_sbLmG34IOOEDDLZor6IXpK5por-h7YEITu2miNS7ypfveJlt_SCCEiljgD4MAqsoHvp67JnEvGOagQC0V62AnDQSbzFRDyQ6QaSfvv1Pr6hNN_vjHxDkcVtFw3qzxkJTlMXCjeqwqy1gfyzKtagY7i4m07RajHCy7wRp-XdjB7os',
                  }}
                  style={styles.braceletImage}
                  resizeMode="cover"
                  accessibilityLabel="Dainty handmade resin and dried miniature pink flower bracelet"
                />
                <View style={styles.braceletOverlay}>
                  <Text style={[
                    Typography.labelMd,
                    { color: theme.background, fontWeight: '600' },
                  ]}>
                    Bespoke Jewelry
                  </Text>
                </View>
              </View>
            </Animated.View>
          </View>
        </View>

        {/* Value Proposition */}
        <Animated.View
          style={[
            styles.valueProp,
            cardAnimStyle(card4Opacity, card4TranslateY),
          ]}>
          <Text style={[
            Typography.bodyMd,
            { color: theme.textSecondary, textAlign: 'center' },
          ]}>
            Discover handmade treasures, vintage finds, and creative goods
            crafted with love by independent makers around the world.
          </Text>
        </Animated.View>

        {/* Progress Indicator */}
        <Animated.View
          style={[
            styles.progressWrapper,
            cardAnimStyle(card4Opacity, card4TranslateY),
          ]}>
          <View style={styles.progressDots}>
            {renderProgressDots()}
          </View>
          <Text style={[
            Typography.labelSm,
            { color: theme.textSecondary, marginTop: Spacing.xs },
          ]}>
            Step 1 of 6
          </Text>
        </Animated.View>

        {/* CTA Button */}
        <Animated.View style={[styles.ctaWrapper, ctaAnimStyle]}>
          <CraftPressButton
            label="Explore Makers"
            variant="primary"
            onPress={handleExploreMakers}
            style={styles.ctaButton}
            textStyle={[
              Typography.labelLg,
              { color: theme.onPrimary, letterSpacing: 0.5 },
            ]}
          />

          {/* Trust badges */}
          <View style={styles.trustBadges}>
            <View style={styles.trustBadge}>
              <Text style={{ fontSize: 14 }}>✓</Text>
              <Text style={[
                Typography.labelSm,
                { color: theme.textSecondary },
              ]}>
                Verified Artisans
              </Text>
            </View>
            <View style={styles.trustDot} accessibilityHidden={true} />
            <View style={styles.trustBadge}>
              <Text style={{ fontSize: 14 }}>📦</Text>
              <Text style={[
                Typography.labelSm,
                { color: theme.textSecondary },
              ]}>
                Plastic-Free Wrap
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  sunburst: {
    position: 'absolute',
    top: -100,
    left: 0,
    right: 0,
    height: 250,
    borderBottomLeftRadius: 200,
    borderBottomRightRadius: 200,
    opacity: 0.4,
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
  },
  motif: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  motifLine: {
    width: 30,
    height: 1,
  },
  gridWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  column: {
    flex: 1,
    gap: Spacing.md,
  },
  card: {
    borderRadius: CraftRadii.lg,
    overflow: 'hidden',
    backgroundColor: theme => theme.backgroundElement,
  },
  vaseCard: {
    aspectRatio: 4 / 5,
    borderRadius: CraftRadii.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  vaseImage: {
    width: '100%',
    height: '100%',
  },
  vaseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(28,28,24,0.4)',
  },
  vaseFooter: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryChip: {
    backgroundColor: 'rgba(253,249,243,0.85)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
  },
  quoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
    backgroundColor: theme => theme.surfaceContainerLow,
  },
  quoteIcon: {
    width: 32,
    height: 32,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.secondaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bagCard: {
    aspectRatio: 5 / 6,
    borderRadius: CraftRadii.lg,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: theme => theme.secondaryContainer + '4D',
  },
  bagImage: {
    width: '100%',
    height: '100%',
  },
  staffPickBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
  },
  staffPickInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.primary,
  },
  braceletCard: {
    aspectRatio: 16 / 9,
    borderRadius: CraftRadii.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  braceletImage: {
    width: '100%',
    height: '100%',
  },
  braceletOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: 'rgba(28,28,24,0.5)',
    alignItems: 'flex-end',
  },
  valueProp: {
    maxWidth: 320,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  progressWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  progressDots: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressDotActive: {
    width: 24,
    backgroundColor: theme => theme.primary,
  },
  progressDotInactive: {
    backgroundColor: theme => theme.border,
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
  trustBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  trustDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme => theme.border,
  },
});

// Import LineHeights for the headline
import { LineHeights } from '@/constants/theme';