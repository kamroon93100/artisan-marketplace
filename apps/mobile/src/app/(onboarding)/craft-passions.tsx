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
 * Screen 04: Craft Passions
 *
 * Based on Stitch: 04-craft-passions.html
 * - Headline "What Crafts Speak to You?"
 * - Grid of 6 interest cards (Ceramics, Textiles, Woodwork, Jewelry, Glass, Paper)
 * - Multi-select with visual feedback
 * - Progress indicator (Step 3 of 6)
 * - "Continue" CTA
 */
export default function CraftPassionsScreen() {
  const theme = useTheme();
  const { nextStep, updateProgress, progress } = useOnboarding();

  // Animation values
  const badgeOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0.8);
  const headlineOpacity = useSharedValue(0);
  const headlineTranslateY = useSharedValue(20);
  const cardsOpacity = useSharedValue(0);
  const cardsTranslateY = useSharedValue(30);
  const ctaOpacity = useSharedValue(0);
  const ctaTranslateY = useSharedValue(20);

  React.useEffect(() => {
    badgeOpacity.value = withDelay(100, withTiming(1, { duration: 300 }));
    badgeScale.value = withDelay(100, withSpring(1, { damping: 18, stiffness: 200 }));

    headlineOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
    headlineTranslateY.value = withDelay(200, withSpring(0, { damping: 20, stiffness: 200 }));

    cardsOpacity.value = withDelay(300, withTiming(1, { duration: 500 }));
    cardsTranslateY.value = withDelay(300, withSpring(0, { damping: 20, stiffness: 200 }));

    ctaOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    ctaTranslateY.value = withDelay(500, withSpring(0, { damping: 20, stiffness: 200 }));
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

  const ctaAnimStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }));

  const interests = [
    {
      id: 'ceramics',
      label: 'Ceramics',
      icon: '🏺',
      color: '#E05A2B',
      description: 'Pottery, porcelain, stoneware',
    },
    {
      id: 'textiles',
      label: 'Textiles',
      icon: '🧵',
      color: '#9E3D00',
      description: 'Weaving, embroidery, knitting',
    },
    {
      id: 'woodwork',
      label: 'Woodwork',
      icon: '🪵',
      color: '#72594E',
      description: 'Carving, turning, joinery',
    },
    {
      id: 'jewelry',
      label: 'Jewelry',
      icon: '💍',
      color: '#E65C00',
      description: 'Metalsmithing, beading, resin',
    },
    {
      id: 'glass',
      label: 'Glass',
      icon: '🔮',
      color: '#A83301',
      description: 'Blowing, fusing, stained glass',
    },
    {
      id: 'paper',
      label: 'Paper',
      icon: '📄',
      color: '#CA4A1C',
      description: 'Origami, bookbinding, marbling',
    },
  ];

  const handleInterestPress = (interestId: string) => {
    updateProgress((prev) => {
      const selected = prev.selectedInterests.includes(interestId)
        ? prev.selectedInterests.filter((id) => id !== interestId)
        : [...prev.selectedInterests, interestId];
      return { ...prev, selectedInterests: selected };
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
            <CraftStatusPill text="Step 3 of 6" tone="neutral" />
          </Animated.View>
        </CraftEntrance>

        {/* Headline */}
        <Animated.View style={[styles.headlineWrapper, headlineAnimStyle]}>
          <Text style={[
            Typography.headlineXlMobile,
            { color: theme.text, textAlign: 'center' },
          ]}>
            What Crafts Speak to You?
          </Text>

          <Text style={[
            Typography.bodyMd,
            { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
          ]}>
            Choose 3 or more to personalize your feed
          </Text>
        </Animated.View>

        {/* Interest Cards Grid */}
        <Animated.View style={[styles.gridWrapper, cardsAnimStyle]}>
          <View style={styles.grid}>
            {interests.map((interest, index) => (
              <Pressable
                key={interest.id}
                onPress={() => handleInterestPress(interest.id)}
                style={({ pressed }) => [
                  styles.interestCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
                android_ripple={{
                  color: theme.primary + '33',
                  borderless: false,
                }}>
                <View style={[
                  styles.interestIcon,
                  { backgroundColor: interest.color + '20' },
                ]}>
                  <Text style={{ fontSize: 28 }}>{interest.icon}</Text>
                </View>
                <Text style={[
                  Typography.headlineSm,
                  { color: theme.text, marginTop: Spacing.md },
                ]}>
                  {interest.label}
                </Text>
                <Text style={[
                  Typography.bodySm,
                  { color: theme.textSecondary, marginTop: Spacing.xs },
                ]}>
                  {interest.description}
                </Text>
                <View style={[
                  styles.selectionIndicator,
                  progress.selectedInterests?.includes(interest.id)
                    ? styles.selectionIndicatorActive
                    : styles.selectionIndicatorInactive,
                ]}>
                  {progress.selectedInterests?.includes(interest.id) && (
                    <Text style={[
                      { color: theme.onPrimary, fontSize: 18, fontWeight: '700' },
                    ]}>
                      ✓
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>

          {/* Selected count */}
          <View style={styles.selectedCount}>
            <Text style={[
              Typography.labelMd,
              { color: theme.textSecondary },
            ]}>
              {progress.selectedInterests?.length ?? 0} of {interests.length} selected
            </Text>
          </View>
        </Animated.View>

        {/* CTA Button */}
        <Animated.View style={[styles.ctaWrapper, ctaAnimStyle]}>
          <CraftPressButton
            label="Continue"
            variant="primary"
            onPress={handleContinue}
            disabled={(progress.selectedInterests?.length ?? 0) < 3}
            style={styles.ctaButton}
            textStyle={[
              Typography.labelLg,
              { color: theme.onPrimary, letterSpacing: 0.5 },
            ]}
          />

          {(progress.selectedInterests?.length ?? 0) < 3 && (
            <Text style={[
              Typography.labelSm,
              { color: theme.textSecondary, marginTop: Spacing.md, textAlign: 'center' },
            ]}>
              Select at least 3 interests to continue
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
  gridWrapper: {
    flex: 1,
    marginBottom: Spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  interestCard: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: CraftRadii.lg,
    borderWidth: 2,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  interestIcon: {
    width: 64,
    height: 64,
    borderRadius: CraftRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicator: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: CraftRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  selectionIndicatorActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  selectionIndicatorInactive: {
    borderColor: Colors.light.border,
  },
  selectedCount: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
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