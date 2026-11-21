import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { CraftElevation, CraftRadii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PRESS_SPRING = { damping: 18, stiffness: 340, mass: 0.75 } as const;

function runSpring(sv: SharedValue<number>, val: number) {
  'worklet';
  sv.value = withSpring(val, PRESS_SPRING);
}

export function CraftEntrance({
  children,
  delayMs = 0,
  offsetY = 12,
  style,
}: {
  children: React.ReactNode;
  delayMs?: number;
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(offsetY);

  useEffect(() => {
    opacity.value = withDelay(delayMs, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delayMs, withSpring(0, { damping: 20, stiffness: 260 }));
  }, [delayMs, offsetY, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}

export type CraftButtonVariant = 'primary' | 'secondary' | 'tonal' | 'outline' | 'danger';

export function CraftPressButton({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  onPressIn,
  onPressOut,
  style,
  textStyle,
  children,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: CraftButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const isInactive = Boolean(disabled || loading);

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      if (!isInactive) runSpring(scale, 0.965);
      onPressIn?.(e);
    },
    [isInactive, onPressIn, scale],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      runSpring(scale, 1);
      onPressOut?.(e);
    },
    [onPressOut, scale],
  );

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const pal =
    variant === 'secondary' ? { bg: theme.secondary, border: theme.secondary, text: '#FFFFFF', spin: '#FFFFFF' }
    : variant === 'tonal' ? { bg: theme.secondaryContainer, border: theme.secondaryContainer, text: theme.onSecondaryContainer, spin: theme.onSecondaryContainer }
    : variant === 'outline' ? { bg: theme.backgroundElement, border: theme.border, text: theme.text, spin: theme.primary }
    : variant === 'danger' ? { bg: theme.dangerContainer, border: theme.danger, text: theme.danger, spin: theme.danger }
    : { bg: theme.primary, border: theme.primary, text: '#FFFFFF', spin: '#FFFFFF' };

  return (
    <Animated.View style={[variant === 'primary' || variant === 'secondary' ? CraftElevation?.level1 : null, animatedStyle]}>
      <Pressable
        disabled={isInactive}
        accessibilityRole="button"
        accessibilityLabel={rest.accessibilityLabel ?? label}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.button, { backgroundColor: pal.bg, borderColor: pal.border, opacity: isInactive ? 0.52 : 1 }, style]}
        {...rest}>
        {loading ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={pal.spin} />
            <Text style={[styles.label, { color: pal.text }, textStyle]}>{label}</Text>
          </View>
        ) : children ? children : (
          <Text style={[styles.label, { color: pal.text }, textStyle]}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function CraftStatusPill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const theme = useTheme();
  const pulse = useSharedValue(0.95);

  useEffect(() => {
    pulse.value = withSpring(1, { damping: 16, stiffness: 280 });
  }, [text, pulse]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const colors =
    tone === 'success' ? { bg: theme.secondaryContainer, fg: theme.secondary, border: theme.secondary }
    : tone === 'warning' ? { bg: theme.warningContainer, fg: theme.warning, border: theme.warning }
    : tone === 'danger' ? { bg: theme.dangerContainer, fg: theme.danger, border: theme.danger }
    : tone === 'accent' ? { bg: theme.primaryContainer, fg: theme.primary, border: theme.primary }
    : { bg: theme.backgroundSelected, fg: theme.textSecondary, border: theme.border };

  return (
    <Animated.View style={[styles.pill, { backgroundColor: colors.bg, borderColor: colors.border }, animStyle]}>
      <Text style={[styles.pillText, { color: colors.fg }]}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, paddingHorizontal: Spacing.three, paddingVertical: 12, borderRadius: CraftRadii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  label: { fontSize: 15, fontWeight: '700', letterSpacing: 0.15 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: CraftRadii.pill, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
});