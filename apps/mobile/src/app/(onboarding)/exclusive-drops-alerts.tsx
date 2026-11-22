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
 * Screen 07: Exclusive Drops & Alerts
 *
 * Based on Stitch: 07-exclusive-drops-alerts.html
 * - Headline "Catch small batches before they sell out"
 * - Interactive notification card mockup (Rare Batch Drop)
 * - Granular notification preferences (3 toggles):
 *   - Studio Drops & New Collections (Weekly, default on)
 *   - Direct Messages from Artisans (Real-time, default on)
 *   - Weekend Maker Live Streams (Occasional, default off)
 * - Progress indicator (Step 5 of 6)
 * - "Enable Drop Alerts" CTA + "Maybe Later" soft exit
 */
export default function ExclusiveDropsAlertsScreen() {
  const theme = useTheme();
  const { nextStep, updateProgress, progress } = useOnboarding();

  // Animation values
  const badgeOpacity = useSharedValue(0);
  const badgeScale = useSharedValue(0.8);
  const headlineOpacity = useSharedValue(0);
  const headlineTranslateY = useSharedValue(20);
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(30);
  const prefsOpacity = useSharedValue(0);
  const prefsTranslateY = useSharedValue(30);
  const ctaOpacity = useSharedValue(0);
  const ctaTranslateY = useSharedValue(20);

  React.useEffect(() => {
    badgeOpacity.value = withDelay(100, withTiming(1, { duration: 300 }));
    badgeScale.value = withDelay(100, withSpring(1, { damping: 18, stiffness: 200 }));

    headlineOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
    headlineTranslateY.value = withDelay(200, withSpring(0, { damping: 20, stiffness: 200 }));

    cardOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
    cardTranslateY.value = withDelay(300, withSpring(0, { damping: 20, stiffness: 200 }));

    prefsOpacity.value = withDelay(450, withTiming(1, { duration: 400 }));
    prefsTranslateY.value = withDelay(450, withSpring(0, { damping: 20, stiffness: 200 }));

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

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const prefsAnimStyle = useAnimatedStyle(() => ({
    opacity: prefsOpacity.value,
    transform: [{ translateY: prefsTranslateY.value }],
  }));

  const ctaAnimStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }));

  const preferences = [
    {
      id: 'studioDrops',
      label: 'Studio Drops & New Collections',
      description: 'Priority access before open release to the wider marketplace.',
      frequency: 'Weekly',
      defaultActive: true,
    },
    {
      id: 'artisanDMs',
      label: 'Direct Messages from Artisans',
      description: 'Order craftsmanship progress, commission updates, & custom notes.',
      frequency: 'Real-time',
      defaultActive: true,
    },
    {
      id: 'liveStreams',
      label: 'Weekend Maker Live Streams',
      description: 'Watch pottery throwing, loom weaving, and glass blowing in real-time.',
      frequency: 'Occasional',
      defaultActive: false,
    },
  ];

  const handlePrefPress = (prefId: string) => {
    updateProgress((prev) => {
      const prefs = { ...prev.notificationPreferences };
      prefs[prefId as keyof typeof prefs] = !prefs[prefId as keyof typeof prefs];
      return { ...prev, notificationPreferences: prefs };
    });
  };

  const isPrefActive = (prefId: string) => {
    return progress.notificationPreferences?.[prefId as keyof typeof progress.notificationPreferences] ?? false;
  };

  const handleEnableAlerts = () => {
    nextStep();
  };

  const handleMaybeLater = () => {
    nextStep();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.contentWrapper}>
        {/* Progress & Context Indicator */}
        <View style={styles.progressHeader}>
          <View style={styles.progressLabel}>
            <CraftStatusPill text="Step 5 of 6" tone="neutral" />
            <Text style={[
              Typography.labelSm,
              { color: theme.textSecondary },
            ]}>
              Drop Alerts
            </Text>
          </View>
          {/* Mini step dots */}
          <View style={styles.miniProgressDots}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View
                key={i}
                style={[
                  styles.miniDot,
                  i < 4 ? styles.miniDotActive : i === 4 ? styles.miniDotCurrent : styles.miniDotInactive,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Narrative & Delight Framing Card */}
        <Animated.View style={[styles.narrativeCard, headlineAnimStyle]}>
          {/* Warm ambient backdrop blob */}
          <View style={styles.ambientBlob} pointerEvents="none" />

          <View style={styles.narrativeContent}>
            <View style={styles.narrativeBadge}>
              <Text style={{ fontSize: 14 }}>🔔</Text>
              <Text style={[
                Typography.labelSm,
                { color: theme.onSecondaryContainer },
              ]}>
                Limited Run Priority
              </Text>
            </View>
            <Text style={[
              Typography.headlineLgMobile,
              { color: theme.text },
            ]}>
              Catch small batches before they sell out.
            </Text>
            <Text style={[
              Typography.bodyMd,
              { color: theme.textSecondary, marginTop: Spacing.sm },
            ]}>
              Independent makers craft in limited runs. Enable quiet notifications
              for instant restock alerts from your favorite artists.
            </Text>
          </View>

          {/* Interactive Simulated Mockup: Notification Card */}
          <View style={styles.mockupCard}>
            <View style={styles.mockupHeader}>
              <View style={styles.artisanThumbnail}>
                <View style={styles.thumbnailImage} />
                <View style={styles.liveIndicator} />
              </View>
              <View style={styles.mockupDetails}>
                <View style={styles.mockupMeta}>
                  <CraftStatusPill text="Rare Batch Drop" tone="accent" style={styles.metaPill} />
                  <Text style={[
                    Typography.labelSm,
                    { color: theme.border },
                  ]}>
                    🕐 In 15m
                  </Text>
                </View>
                <Text style={[
                  Typography.headlineSm,
                  { color: theme.text },
                ]}>
                  12 Hand-Thrown Matcha Bowls
                </Text>
                <Text style={[
                  Typography.bodySm,
                  { color: theme.textSecondary, marginTop: Spacing.xs },
                ]}>
                  by Mei Lin Studio · Kyoto Atelier
                </Text>
              </View>
            </View>

            <View style={styles.mockupFooter}>
              <View style={styles.mockupStatus}>
                <Text style={{ fontSize: 14 }}>🔥</Text>
                <Text style={[
                  Typography.labelMd,
                  { color: theme.textSecondary },
                ]}>
                  Only 12 available worldwide
                </Text>
              </View>
              <CraftStatusPill text="Reserved" tone="accent" style={styles.reservedPill} />
            </View>
          </View>
        </Animated.View>

        {/* Granular Preferences Box */}
        <Animated.View style={[styles.prefsWrapper, prefsAnimStyle]}>
          <View style={styles.prefsHeader}>
            <Text style={[
              Typography.labelMd,
              { color: theme.text, fontWeight: '600' },
            ]}>
              Customize your alerts
            </Text>
            <Text style={[
              Typography.bodySm,
              { color: theme.textSecondary },
            ]}>
              Quiet by default
            </Text>
          </View>

          <View style={styles.prefsList}>
            {preferences.map((pref) => (
              <Pressable
                key={pref.id}
                onPress={() => handlePrefPress(pref.id)}
                style={({ pressed }) => [
                  styles.prefCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
                  },
                ]}
                android_ripple={{
                  color: theme.primary + '33',
                  borderless: false,
                }}>
                <View style={styles.prefCheckboxWrapper}>
                  <View style={[
                    styles.prefCheckboxTrack,
                    isPrefActive(pref.id)
                      ? styles.prefCheckboxTrackActive
                      : styles.prefCheckboxTrackInactive,
                  ]}>
                    <Animated.View
                      style={[
                        styles.prefCheckboxThumb,
                        isPrefActive(pref.id)
                          ? styles.prefCheckboxThumbActive
                          : styles.prefCheckboxThumbInactive,
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.prefContent}>
                  <View style={styles.prefTopRow}>
                    <Text style={[
                      Typography.labelLg,
                      { color: theme.text, fontWeight: '600' },
                    ]}>
                      {pref.label}
                    </Text>
                    <View style={styles.frequencyBadge}>
                      <Text style={[
                        Typography.labelSm,
                        { color: theme.textSecondary },
                      ]}>
                        {pref.frequency}
                      </Text>
                    </View>
                  </View>
                  <Text style={[
                    Typography.bodySm,
                    { color: theme.textSecondary, marginTop: Spacing.xs },
                  ]}>
                    {pref.description}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Primary Action & Soft Exit */}
        <Animated.View style={[styles.ctaWrapper, ctaAnimStyle]}>
          <CraftPressButton
            label="Enable Drop Alerts"
            variant="primary"
            onPress={handleEnableAlerts}
            style={styles.ctaButton}
            textStyle={[
              Typography.labelLg,
              { color: theme.onPrimary, letterSpacing: 0.5 },
            ]}
          />

          <Pressable
            onPress={handleMaybeLater}
            style={styles.secondaryButton}
            android_ripple={{ color: theme.textSecondary + '20', borderless: false }}>
            <Text style={[
              Typography.labelMd,
              { color: theme.textSecondary },
            ]}>
              Maybe Later
            </Text>
          </Pressable>

          {/* Micro trust reassurance */}
          <View style={styles.trustNote}>
            <Text style={{ fontSize: 14 }}>✓</Text>
            <Text style={[
              Typography.bodySm,
              { color: theme.textSecondary, textAlign: 'center' },
            ]}>
              No spam ever. Mute or adjust frequency anytime in Settings.
            </Text>
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
  contentWrapper: {
    flex: 1,
    paddingHorizontal: Spacing.margin,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  progressLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
    miniProgressDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  miniDotActive: {
    width: 20,
    backgroundColor: theme => theme.primaryFixed,
  },
  miniDotCurrent: {
    width: 20,
    backgroundColor: theme => theme.primary,
  },
  miniDotInactive: {
    backgroundColor: theme => theme.surfaceContainerHighest,
  },
  narrativeCard: {
    borderRadius: CraftRadii.lg,
    backgroundColor: theme => theme.surfaceContainerLow,
    padding: Spacing.md,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  ambientBlob: {
    position: 'absolute',
    top: -48,
    right: -48,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme => theme.secondaryContainer + '66',
  },
  narrativeContent: {
    position: 'relative',
    zIndex: 1,
  },
  narrativeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.secondaryContainer + '99',
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },
  mockupCard: {
    backgroundColor: theme => theme.background,
    borderRadius: CraftRadii.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  mockupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  artisanThumbnail: {
    position: 'relative',
    width: 56,
    height: 56,
    borderRadius: CraftRadii.md,
    backgroundColor: theme => theme.secondaryContainer,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: CraftRadii.md,
  },
  liveIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme => theme.primary,
  },
  mockupDetails: {
    flex: 1,
    minWidth: 0,
  },
  mockupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  metaPill: {
    // Custom styling for meta pill
  },
  mockupFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  mockupStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    color: theme => theme.textSecondary,
  },
  reservedPill: {
    // Custom styling for reserved pill
  },
  prefsWrapper: {
    marginBottom: Spacing.xl,
  },
  prefsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  prefsList: {
    gap: Spacing.sm,
  },
  prefCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: CraftRadii.md,
  },
  prefCheckboxWrapper: {
    marginTop: 2,
  },
  prefCheckboxTrack: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  prefCheckboxTrackActive: {
    backgroundColor: theme => theme.primary,
  },
  prefCheckboxTrackInactive: {
    backgroundColor: theme => theme.surfaceContainerHigh,
  },
  prefCheckboxThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme => theme.background,
  },
  prefCheckboxThumbActive: {
    opacity: 1,
  },
  prefCheckboxThumbInactive: {
    opacity: 0,
  },
  prefContent: {
    flex: 1,
    minWidth: 0,
  },
  prefTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  frequencyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: CraftRadii.pill,
    backgroundColor: theme => theme.surfaceContainerHigh,
  },
  ctaWrapper: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
  },
  ctaButton: {
    minHeight: 54,
    borderRadius: CraftRadii.pill,
    paddingHorizontal: Spacing.xl,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  secondaryButton: {
    minHeight: 44,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
  },
});