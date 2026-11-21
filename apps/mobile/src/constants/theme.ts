import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1C1917',
    background: '#FAF7F2',
    backgroundElement: '#FFFDF9',
    backgroundSelected: '#F1ECE3',
    textSecondary: '#5C554E',
    primary: '#B85028',
    primaryContainer: '#FCE8DF',
    onPrimaryContainer: '#5A1E08',
    secondary: '#2F6F4E',
    secondaryContainer: '#E2F2E9',
    onSecondaryContainer: '#123B26',
    warning: '#A66316',
    warningContainer: '#FBEEDB',
    danger: '#B42318',
    dangerContainer: '#FEE4E2',
    border: '#E4DDD0',
    accent: '#B85028',
  },
  dark: {
    text: '#F5EFE6',
    background: '#121110',
    backgroundElement: '#1C1A18',
    backgroundSelected: '#292522',
    textSecondary: '#B5ACA2',
    primary: '#E48259',
    primaryContainer: '#3D2014',
    onPrimaryContainer: '#FFDAD0',
    secondary: '#6EC094',
    secondaryContainer: '#173325',
    onSecondaryContainer: '#BCEAD0',
    warning: '#E6A853',
    warningContainer: '#382711',
    danger: '#F97066',
    dangerContainer: '#3B1816',
    border: '#2E2925',
    accent: '#E48259',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const CraftRadii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const CraftElevation = Platform.select({
  ios: {
    level1: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    level2: { shadowColor: '#1C1917', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16 },
  },
  android: {
    level1: { elevation: 2 },
    level2: { elevation: 5 },
  },
  default: { level1: {}, level2: {} },
});

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'var(--font-display)', serif: 'var(--font-serif)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' },
});

export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;