import '@/global.css';
import { Platform } from 'react-native';

// Terracotta & Craft Design System Tokens (from Stitch)
// Primary: #E05A2B (overridePrimaryColor)
// Secondary: #F4D3C5 (overrideSecondaryColor)
// Tertiary: #E65C00 (overrideTertiaryColor)
// Neutral/Background: #FAF6F0 (overrideNeutralColor)
// Background: #FDF9F3
// Typography: Playfair Display (headlines) + Plus Jakarta Sans (body/label)
// Roundness: ROUND_FULL (pill = 9999px, cards = xl/2xl)
// Color Variant: FIDELITY

export const Colors = {
  light: {
    // Core surface colors
    text: '#1C1C18',                    // on-surface
    background: '#FAF6F0',              // overrideNeutralColor (neutral warm cream)
    backgroundElement: '#FDF9F3',       // surface / background
    backgroundSelected: '#F1EDE7',      // surface-container
    textSecondary: '#59413A',           // on-surface-variant

    // Primary - Terracotta
    primary: '#E05A2B',                 // overridePrimaryColor
    primaryContainer: '#CA4A1C',        // primary-container
    onPrimaryContainer: '#FFFBFF',      // on-primary-container
    onPrimary: '#FFFFFF',               // on-primary
    primaryFixed: '#FFDCCB',            // primary-fixed (light primary)
    primaryFixedDim: '#FFB59D',         // primary-fixed-dim
    onPrimaryFixed: '#431200',          // on-primary-fixed
    onPrimaryFixedVariant: '#842500',   // on-primary-fixed-variant

    // Secondary - Blush/Peach
    secondary: '#72594E',               // secondary
    secondaryContainer: '#FAD9CB',      // secondary-container
    onSecondaryContainer: '#765D52',    // on-secondary-container
    onSecondary: '#FFFFFF',             // on-secondary
    secondaryFixed: '#FAD9CB',          // secondary-fixed
    secondaryFixedDim: '#E0C0B2',       // secondary-fixed-dim
    onSecondaryFixed: '#3E2C23',        // on-secondary-fixed
    onSecondaryFixedVariant: '#584238', // on-secondary-fixed-variant

    // Tertiary - Burnt Orange
    tertiary: '#E65C00',                // overrideTertiaryColor
    tertiaryContainer: '#C74E00',       // tertiary-container
    onTertiaryContainer: '#FFFBFF',     // on-tertiary-container
    onTertiary: '#FFFFFF',              // on-tertiary
    tertiaryFixed: '#FFDCCB',           // tertiary-fixed
    tertiaryFixedDim: '#FFB595',        // tertiary-fixed-dim
    onTertiaryFixed: '#431200',         // on-tertiary-fixed
    onTertiaryFixedVariant: '#7C2E00',  // on-tertiary-fixed-variant

    // Semantic colors
    warning: '#A66316',
    warningContainer: '#FBEEDB',
    danger: '#BA1A1A',                  // error
    dangerContainer: '#FFDAD6',         // error-container
    onDanger: '#FFFFFF',                // on-error

    // Borders & outlines
    border: '#E1BFB5',                  // outline-variant
    borderStrong: '#8D7168',            // outline

    // Surface variants
    surface: '#FDF9F3',
    surfaceDim: '#DDDAD4',
    surfaceBright: '#FDF9F3',
    surfaceContainerLow: '#F7F3ED',
    surfaceContainer: '#F1EDE7',
    surfaceContainerHigh: '#EBE8E2',
    surfaceContainerHighest: '#E6E2DC',
    surfaceVariant: '#E6E2DC',
    onSurface: '#1C1C18',
    onSurfaceVariant: '#59413A',

    // Accent (alias for primary)
    accent: '#E05A2B',
  },
  dark: {
    // Core surface colors
    text: '#F4F0EA',                    // inverse-on-surface
    background: '#1C1C18',              // on-surface (deep charcoal)
    backgroundElement: '#31302D',       // inverse-surface
    backgroundSelected: '#3D3B38',      // elevated surface
    textSecondary: '#D4C9C0',           // on-surface-variant (lighter)

    // Primary - Terracotta (lighter for dark mode)
    primary: '#FFB59D',                 // inverse-primary / primary-fixed-dim
    primaryContainer: '#842500',        // on-primary-fixed-variant
    onPrimaryContainer: '#FFFBFF',
    onPrimary: '#431200',               // on-primary
    primaryFixed: '#FFDCCB',            // primary-fixed
    primaryFixedDim: '#FFB59D',         // primary-fixed-dim
    onPrimaryFixed: '#431200',          // on-primary-fixed
    onPrimaryFixedVariant: '#842500',   // on-primary-fixed-variant

    // Secondary - Blush/Peach
    secondary: '#E0C0B2',               // secondary-fixed-dim
    secondaryContainer: '#584238',      // on-secondary-fixed-variant
    onSecondaryContainer: '#FDDCCD',    // secondary-fixed
    onSecondary: '#3E2C23',             // on-secondary
    secondaryFixed: '#FAD9CB',          // secondary-fixed
    secondaryFixedDim: '#E0C0B2',       // secondary-fixed-dim
    onSecondaryFixed: '#3E2C23',        // on-secondary-fixed
    onSecondaryFixedVariant: '#584238', // on-secondary-fixed-variant

    // Tertiary - Burnt Orange
    tertiary: '#FFB595',                // tertiary-fixed-dim
    tertiaryContainer: '#7C2E00',       // on-tertiary-fixed-variant
    onTertiaryContainer: '#FFFBFF',
    onTertiary: '#431200',              // on-tertiary
    tertiaryFixed: '#FFDCCB',           // tertiary-fixed
    tertiaryFixedDim: '#FFB595',        // tertiary-fixed-dim
    onTertiaryFixed: '#431200',         // on-tertiary-fixed
    onTertiaryFixedVariant: '#7C2E00',  // on-tertiary-fixed-variant

    // Semantic colors
    warning: '#E6A853',
    warningContainer: '#382711',
    danger: '#FFB4AB',                  // error (lighter for dark)
    dangerContainer: '#93000A',         // on-error-container
    onDanger: '#FFFFFF',                // on-error

    // Borders & outlines
    border: '#59413A',                  // on-surface-variant
    borderStrong: '#8D7168',            // outline

    // Surface variants
    surface: '#1C1C18',
    surfaceDim: '#1C1C18',
    surfaceBright: '#2D2B28',
    surfaceContainerLow: '#252422',
    surfaceContainer: '#2D2B28',
    surfaceContainerHigh: '#353330',
    surfaceContainerHighest: '#3D3B38',
    surfaceVariant: '#3D3B38',
    onSurface: '#F4F0EA',
    onSurfaceVariant: '#D4C9C0',

    // Accent (alias for primary)
    accent: '#FFB59D',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Terracotta & Craft Radii (ROUND_FULL scale)
// pill = 9999px (full), cards = 24-32px (xl/2xl), small elements = 12-16px
export const CraftRadii = {
  xs: 8,      // small chips, badges
  sm: 12,     // buttons, inputs
  md: 16,     // cards (rounded-xl equivalent)
  lg: 24,     // large cards (rounded-2xl equivalent)
  xl: 32,     // hero cards, modals
  pill: 9999, // full pill roundness for CTAs, nav, chips
} as const;

// Terracotta & Craft Elevation (warm, tinted shadows)
// Shadows use rgba(45, 36, 33, 0.06) to rgba(168, 51, 1, 0.08) tinted with terracotta
export const CraftElevation = Platform.select({
  ios: {
    level1: {
      shadowColor: '#2D2421',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8
    },
    level2: {
      shadowColor: '#A83301',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 24
    },
    level3: {
      shadowColor: '#A83301',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.1,
      shadowRadius: 32
    },
  },
  android: {
    level1: { elevation: 2 },
    level2: { elevation: 6 },
    level3: { elevation: 12 },
  },
  default: { level1: {}, level2: {}, level3: {} },
});

// Typography: Playfair Display (headlines) + Plus Jakarta Sans (body/label)
// Font weights: Playfair Display 600 (semibold), Plus Jakarta Sans 400/500/600
export const Fonts = {
  sans: Platform.select({
    ios: 'Plus Jakarta Sans',
    android: 'PlusJakartaSans-Regular',
    web: 'var(--font-plus-jakarta)',
    default: 'Plus Jakarta Sans',
  })!,
  serif: Platform.select({
    ios: 'Playfair Display',
    android: 'PlayfairDisplay-SemiBold',
    web: 'var(--font-playfair)',
    default: 'Playfair Display',
  })!,
  rounded: Platform.select({
    ios: 'Plus Jakarta Sans',
    android: 'PlusJakartaSans-Regular',
    web: 'var(--font-plus-jakarta)',
    default: 'Plus Jakarta Sans',
  })!,
  mono: Platform.select({
    ios: 'ui-monospace',
    android: 'monospace',
    web: 'var(--font-mono)',
    default: 'monospace',
  })!,
} as const;

// Font weight constants
export const FontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;

// Font sizes matching Stitch design tokens
export const FontSizes = {
  // Headlines (Playfair Display, weight 600)
  headlineXl: 40,        // headline-xl: 40px, lineHeight 48px, letterSpacing -0.02em
  headlineXlMobile: 30,  // headline-xl-mobile: 30px, lineHeight 38px, letterSpacing -0.01em
  headlineLg: 32,        // headline-lg: 32px, lineHeight 40px, letterSpacing -0.01em
  headlineLgMobile: 24,  // headline-lg-mobile: 24px, lineHeight 32px
  headlineMd: 22,        // headline-md: 22px, lineHeight 28px
  headlineSm: 18,        // headline-sm: 18px, lineHeight 24px

  // Body (Plus Jakarta Sans, weight 400)
  bodyLg: 16,            // body-lg: 16px, lineHeight 26px
  bodyMd: 14,            // body-md: 14px, lineHeight 22px
  bodySm: 12,            // body-sm: 12px, lineHeight 18px

  // Labels (Plus Jakarta Sans, weight 500/600)
  labelLg: 14,           // label-lg: 14px, lineHeight 20px, letterSpacing 0.01em, weight 600
  labelMd: 12,           // label-md: 12px, lineHeight 16px, letterSpacing 0.02em, weight 600
  labelSm: 11,           // label-sm: 11px, lineHeight 14px, letterSpacing 0.03em, weight 500
} as const;

// Line heights matching Stitch design tokens
export const LineHeights = {
  headlineXl: 48,
  headlineXlMobile: 38,
  headlineLg: 40,
  headlineLgMobile: 32,
  headlineMd: 28,
  headlineSm: 24,
  bodyLg: 26,
  bodyMd: 22,
  bodySm: 18,
  labelLg: 20,
  labelMd: 16,
  labelSm: 14,
} as const;

// Letter spacing matching Stitch design tokens
export const LetterSpacings = {
  headlineXl: -0.02,
  headlineXlMobile: -0.01,
  headlineLg: -0.01,
  headlineMd: 0,
  headlineSm: 0,
  labelLg: 0.01,
  labelMd: 0.02,
  labelSm: 0.03,
} as const;

// Spacing scale (from Stitch: 4px base unit)
// gutter: 16px, margin: 20px, space-xs: 4px, space-sm: 8px, space-md: 16px, space-lg: 24px, space-xl: 32px, space-2xl: 48px
export const Spacing = {
  none: 0,
  xs: 4,      // space-xs: 0.25rem = 4px
  sm: 8,      // space-sm: 0.5rem = 8px
  md: 16,     // space-md: 1rem = 16px (gutter)
  lg: 24,     // space-lg: 1.5rem = 24px
  xl: 32,     // space-xl: 2rem = 32px
  '2xl': 48,  // space-2xl: 3rem = 48px
  '3xl': 64,  // extra for large layouts
  gutter: 16,     // 1rem
  gutterDesktop: 24, // 1.5rem
  margin: 20,     // 1.25rem
  marginDesktop: 40, // 2.5rem

  // Backwards-compatible aliases (legacy numeric keys)
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
  seven: 56,
  eight: 64,
  nine: 72,
  ten: 80,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

// Helper to get typography style for a given variant
export const Typography = {
  // Headlines (Playfair Display, semibold)
  headlineXl: {
    fontFamily: Fonts.web?.serif || Fonts.ios?.serif || 'Playfair Display',
    fontSize: FontSizes.headlineXl,
    lineHeight: LineHeights.headlineXl,
    letterSpacing: LetterSpacings.headlineXl,
    fontWeight: FontWeights.semibold,
  },
  headlineXlMobile: {
    fontFamily: Fonts.web?.serif || Fonts.ios?.serif || 'Playfair Display',
    fontSize: FontSizes.headlineXlMobile,
    lineHeight: LineHeights.headlineXlMobile,
    letterSpacing: LetterSpacings.headlineXlMobile,
    fontWeight: FontWeights.semibold,
  },
  headlineLg: {
    fontFamily: Fonts.web?.serif || Fonts.ios?.serif || 'Playfair Display',
    fontSize: FontSizes.headlineLg,
    lineHeight: LineHeights.headlineLg,
    letterSpacing: LetterSpacings.headlineLg,
    fontWeight: FontWeights.semibold,
  },
  headlineLgMobile: {
    fontFamily: Fonts.web?.serif || Fonts.ios?.serif || 'Playfair Display',
    fontSize: FontSizes.headlineLgMobile,
    lineHeight: LineHeights.headlineLgMobile,
    letterSpacing: LetterSpacings.headlineLg,
    fontWeight: FontWeights.semibold,
  },
  headlineMd: {
    fontFamily: Fonts.web?.serif || Fonts.ios?.serif || 'Playfair Display',
    fontSize: FontSizes.headlineMd,
    lineHeight: LineHeights.headlineMd,
    letterSpacing: LetterSpacings.headlineMd,
    fontWeight: FontWeights.semibold,
  },
  headlineSm: {
    fontFamily: Fonts.web?.serif || Fonts.ios?.serif || 'Playfair Display',
    fontSize: FontSizes.headlineSm,
    lineHeight: LineHeights.headlineSm,
    letterSpacing: LetterSpacings.headlineSm,
    fontWeight: FontWeights.semibold,
  },

  // Body (Plus Jakarta Sans, regular)
  bodyLg: {
    fontFamily: Fonts.web?.sans || Fonts.ios?.sans || 'Plus Jakarta Sans',
    fontSize: FontSizes.bodyLg,
    lineHeight: LineHeights.bodyLg,
    fontWeight: FontWeights.regular,
  },
  bodyMd: {
    fontFamily: Fonts.web?.sans || Fonts.ios?.sans || 'Plus Jakarta Sans',
    fontSize: FontSizes.bodyMd,
    lineHeight: LineHeights.bodyMd,
    fontWeight: FontWeights.regular,
  },
  bodySm: {
    fontFamily: Fonts.web?.sans || Fonts.ios?.sans || 'Plus Jakarta Sans',
    fontSize: FontSizes.bodySm,
    lineHeight: LineHeights.bodySm,
    fontWeight: FontWeights.regular,
  },

  // Labels (Plus Jakarta Sans, medium/semibold)
  labelLg: {
    fontFamily: Fonts.web?.sans || Fonts.ios?.sans || 'Plus Jakarta Sans',
    fontSize: FontSizes.labelLg,
    lineHeight: LineHeights.labelLg,
    letterSpacing: LetterSpacings.labelLg,
    fontWeight: FontWeights.semibold,
  },
  labelMd: {
    fontFamily: Fonts.web?.sans || Fonts.ios?.sans || 'Plus Jakarta Sans',
    fontSize: FontSizes.labelMd,
    lineHeight: LineHeights.labelMd,
    letterSpacing: LetterSpacings.labelMd,
    fontWeight: FontWeights.semibold,
  },
  labelSm: {
    fontFamily: Fonts.web?.sans || Fonts.ios?.sans || 'Plus Jakarta Sans',
    fontSize: FontSizes.labelSm,
    lineHeight: LineHeights.labelSm,
    letterSpacing: LetterSpacings.labelSm,
    fontWeight: FontWeights.medium,
  },
} as const;