import type { TextStyle } from 'react-native';

/**
 * Warm editorial design system tokens: light-first, dark-supported.
 * The accent color is reserved for progress signals and the primary
 * action only — every other surface stays neutral.
 */

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  /** Text/icon color rendered on top of an accent-filled surface. */
  onAccent: string;
  danger: string;
  warning: string;
  overlay: string;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
}

const lightColors: ThemeColors = {
  background: '#F7F6F2',
  surface: '#FFFFFF',
  surfaceRaised: '#FCFBF8',
  border: '#E4E1D9',
  textPrimary: '#14161A',
  textSecondary: '#54514A',
  textMuted: '#8B877C',
  accent: '#FF6B2C',
  accentMuted: '#FFE3D2',
  onAccent: '#FFFFFF',
  danger: '#C6402E',
  warning: '#9C6B12',
  overlay: 'rgba(20, 22, 26, 0.45)',
};

const darkColors: ThemeColors = {
  background: '#111214',
  surface: '#1A1C1F',
  surfaceRaised: '#212327',
  border: '#2C2E33',
  textPrimary: '#F4F3F0',
  textSecondary: '#B7B4AC',
  textMuted: '#7C7A75',
  accent: '#FF6B2C',
  accentMuted: '#3D2416',
  onAccent: '#FFFFFF',
  danger: '#FF6B5C',
  warning: '#E0A83D',
  overlay: 'rgba(0, 0, 0, 0.55)',
};

export const themes: Readonly<Record<ThemeMode, Theme>> = {
  light: { mode: 'light', colors: lightColors },
  dark: { mode: 'dark', colors: darkColors },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 20,
} as const;

/**
 * System font for now, centralized so a custom typeface can be swapped
 * in later without touching every component.
 */
export const fontFamily: string | undefined = undefined;

export interface TypographyStyle {
  fontFamily: string | undefined;
  fontSize: number;
  lineHeight: number;
  fontWeight: NonNullable<TextStyle['fontWeight']>;
  letterSpacing: number;
}

export const typography = {
  /** The large readiness-score number. */
  display: {
    fontFamily,
    fontSize: 80,
    lineHeight: 84,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  title: {
    fontFamily,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heading: {
    fontFamily,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0,
  },
  body: {
    fontFamily,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0,
  },
  caption: {
    fontFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0,
  },
} as const satisfies Record<string, TypographyStyle>;
