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
 * Screen 05: Aesthetic Style Quiz
 *
 * Based on Stitch: 05-aesthetic-style-quiz.html
 * - Headline "Discover Your Aesthetic"
 * - 4 style cards (Wabi-Sabi, Bohemian, Minimalist, Rustic)
 * - Single select with visual feedback
 * - Progress indicator (Step 4 of 6)
 * - "Continue" CTA
 */
export default function AestheticStyleQuizScreen() {
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

  const styles_quiz = [
    {
      id: 'wabi-sabi',
      label: 'Wabi-Sabi',
      subtitle: 'Perfectly imperfect',
      description: 'Embrace the beauty of imperfection, impermanence, and incompleteness. Natural materials, muted tones, organic forms.',
      icon: '🍵',
      color: '#9E3D00',
      gradient: ['#FDF9F3', '#F4D3C5'],
    },
    {
      id: 'bohemian',
      label: 'Bohemian',
      subtitle: 'Free-spirited eclectic',
      description: 'Rich textures, layered patterns, global influences. Vintage finds, hand-dyed fabrics, collected treasures.',
      icon: '🌿',
      color: '#E65C00',
      gradient: ['#FDF9F3', '#FFDBD0'],
    },
    {
      id: 'minimalist',
      label: 'Minimalist',
      subtitle: 'Essential elegance',
      description: 'Clean lines, negative space, intentional curation. Quality over quantity, neutral palette, functional beauty.',
      icon: '⬜',
      color: '#72594E',
      gradient: ['#FDF9F3', '#EBE8E2'],
    },
    {
      id: 'rustic',
      label: 'Rustic',
      subtitle: 'Warm & grounded',
      description: 'Raw materials, weathered finishes, handcrafted charm. Reclaimed wood, stone, iron, earthy warmth.',
      icon: '🪵',
      color: '#CA4A1C',
      gradient: ['#FDF9F3', '#FAD9CB'],
    },
  ];

  const handleStylePress = (styleId: string) => {
    updateProgress({ selectedStyle: styleId });
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
            <CraftStatusPill text="Step 4 of 6" tone="neutral" />
          </Animated.View>
        </CraftEntrance>

        {/* Headline */}
        <Animated.View style={[styles.headlineWrapper, headlineAnimStyle]}>
          <Text style={[
            Typography.headlineXlMobile,
            { color: theme.text, textAlign: 'center' },
          ]}>
            Discover Your Aesthetic
          </Text>

          <Text style={[
            Typography.bodyMd,
            { color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
          ]}>
            Choose the style that resonates with your space
          </Text>
        </Animated.View>

        {/* Style Cards */}
        <Animated.View style={[styles.gridWrapper, cardsAnimStyle]}>
          <View style={styles.grid}>
            {styles_quiz.map((style, index) => (
              <Pressable
                key={style.id}
                onPress={() => handleStylePress(style.id)}
                style={({ pressed }) => [
                  styles.styleCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor:
                      progress.selectedStyle === style.id
                        ? theme.primary
                        : theme.backgroundSelected,
                    borderWidth: progress.selectedStyle === style.id ? 2 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
                android_ripple={{
                  color: theme.primary + '33',
                  borderless: false,
                }}>
                <View style={styles.styleCardContent}>
                  <View style={[
                    styles.styleIcon,
                    { backgroundColor: style.color + '20' },
                  ]}>
                    <Text style={{ fontSize: 32 }}>{style.icon}</Text>
                  </View>
                  <Text style={[
                    Typography.headlineMd,
                    { color: theme.text, marginTop: Spacing.md },
                  ]}>
                    {style.label}
                  </Text>
                  <Text style={[
                    Typography.labelSm,
                    { color: theme.primary, marginTop: Spacing.xs },
                  ]}>
                    {style.subtitle}
                  </Text>
                  <Text style={[
                    Typography.bodySm,
                    { color: theme.textSecondary, marginTop: Spacing.sm, textAlign: 'center' },
                  ]}>
                    {style.description}
                  </Text>
                </View>
                {progress.selectedStyle === style.id && (
                  <View style={styles.selectedOverlay}>
                    <View style={styles.selectedCheck}>
                      <Text style={{ color: theme.onPrimary, fontSize: 20, fontWeight: '700' }}>
                        ✓
                      </Text>
                    </View>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* CTA Button */}
        <Animated.View style={[styles.ctaWrapper, ctaAnimStyle]}>
          <CraftPressButton
            label="Continue"
            variant="primary"
            onPress={handleContinue}
            disabled={!progress.selectedStyle}
            style={styles.ctaButton}
            textStyle={[
              Typography.labelLg,
              { color: theme.onPrimary, letterSpacing: 0.5 },
            ]}
          />

          {!progress.selectedStyle && (
            <Text style={[
              Typography.labelSm,
              { color: theme.textSecondary, marginTop: Spacing.md, textAlign: 'center' },
            ]}>
              Select an aesthetic to continue
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
    gap: Spacing.md,
  },
  styleCard: {
    borderRadius: CraftRadii.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  styleCardContent: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  styleIcon: {
    width: 72,
    height: 72,
    borderRadius: CraftRadii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedOverlay: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
  },
  selectedCheck: {
    width: 32,
    height: 32,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
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