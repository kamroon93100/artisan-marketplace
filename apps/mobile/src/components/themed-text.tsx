import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor, Typography, FontSizes, LineHeights, FontWeights, LetterSpacings } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    | 'displayLg'
    | 'displayMd'
    | 'displaySm'
    | 'headlineLg'
    | 'headlineMd'
    | 'headlineSm'
    | 'headlineLgMobile'
    | 'titleLg'
    | 'titleMd'
    | 'titleSm'
    | 'bodyLg'
    | 'bodyMd'
    | 'bodySm'
    | 'labelLg'
    | 'labelMd'
    | 'labelSm';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  const typographyStyles = getTypographyStyles(type);
  const fontFamily = getFontFamily(type);

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        typographyStyles,
        fontFamily ? { fontFamily } : null,
        style,
      ]}
      {...rest}
    />
  );
}

function getTypographyStyles(type: ThemedTextProps['type']) {
  switch (type) {
    case 'displayLg':
      return {
        fontSize: FontSizes.displayLg,
        lineHeight: LineHeights.displayLg,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.displayLg,
      };
    case 'displayMd':
      return {
        fontSize: FontSizes.displayMd,
        lineHeight: LineHeights.displayMd,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.displayMd,
      };
    case 'displaySm':
      return {
        fontSize: FontSizes.displaySm,
        lineHeight: LineHeights.displaySm,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.displaySm,
      };
    case 'headlineLg':
      return {
        fontSize: FontSizes.headlineLg,
        lineHeight: LineHeights.headlineLg,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.headlineLg,
      };
    case 'headlineMd':
      return {
        fontSize: FontSizes.headlineMd,
        lineHeight: LineHeights.headlineMd,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.headlineMd,
      };
    case 'headlineSm':
      return {
        fontSize: FontSizes.headlineSm,
        lineHeight: LineHeights.headlineSm,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.headlineSm,
      };
    case 'headlineLgMobile':
      return {
        fontSize: FontSizes.headlineLgMobile,
        lineHeight: LineHeights.headlineLgMobile,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.headlineLg,
      };
    case 'titleLg':
      return {
        fontSize: FontSizes.titleLg,
        lineHeight: LineHeights.titleLg,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.titleLg,
      };
    case 'titleMd':
      return {
        fontSize: FontSizes.titleMd,
        lineHeight: LineHeights.titleMd,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.titleMd,
      };
    case 'titleSm':
      return {
        fontSize: FontSizes.titleSm,
        lineHeight: LineHeights.titleSm,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.titleSm,
      };
    case 'bodyLg':
      return {
        fontSize: FontSizes.bodyLg,
        lineHeight: LineHeights.bodyLg,
        fontWeight: FontWeights.regular,
        letterSpacing: LetterSpacings.bodyLg,
      };
    case 'bodyMd':
      return {
        fontSize: FontSizes.bodyMd,
        lineHeight: LineHeights.bodyMd,
        fontWeight: FontWeights.regular,
        letterSpacing: LetterSpacings.bodyMd,
      };
    case 'bodySm':
      return {
        fontSize: FontSizes.bodySm,
        lineHeight: LineHeights.bodySm,
        fontWeight: FontWeights.regular,
        letterSpacing: LetterSpacings.bodySm,
      };
    case 'labelLg':
      return {
        fontSize: FontSizes.labelLg,
        lineHeight: LineHeights.labelLg,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.labelLg,
      };
    case 'labelMd':
      return {
        fontSize: FontSizes.labelMd,
        lineHeight: LineHeights.labelMd,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.labelMd,
      };
    case 'labelSm':
      return {
        fontSize: FontSizes.labelSm,
        lineHeight: LineHeights.labelSm,
        fontWeight: FontWeights.semibold,
        letterSpacing: LetterSpacings.labelSm,
      };
    case 'title':
      return styles.title;
    case 'subtitle':
      return styles.subtitle;
    case 'small':
      return styles.small;
    case 'smallBold':
      return styles.smallBold;
    case 'link':
      return styles.link;
    case 'linkPrimary':
      return styles.linkPrimary;
    case 'code':
      return styles.code;
    default:
      return styles.default;
  }
}

function getFontFamily(type: ThemedTextProps['type']): string | undefined {
  const headlineTypes = [
    'displayLg', 'displayMd', 'displaySm',
    'headlineLg', 'headlineMd', 'headlineSm', 'headlineLgMobile',
    'titleLg', 'titleMd', 'titleSm',
  ];
  const bodyTypes = ['bodyLg', 'bodyMd', 'bodySm'];
  const labelTypes = ['labelLg', 'labelMd', 'labelSm'];

  if (headlineTypes.includes(type as string)) {
    return Fonts.serif;
  }
  if (bodyTypes.includes(type as string) || labelTypes.includes(type as string)) {
    return Fonts.sans;
  }
  if (type === 'title' || type === 'subtitle') {
    return Fonts.serif;
  }
  return undefined;
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.web?.mono || Fonts.ios?.mono || 'monospace',
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});