import type { TextStyle } from 'react-native';

/**
 * "Paper & Ember" design tokens. See mobile/DESIGN.md for the rules these
 * encode — most importantly: accent is reserved for progress signals only,
 * and primary actions are ink, never orange.
 */

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Inactive milestone node ring. */
  node: string;
  /** Unfilled part of a progress bar or arc. */
  track: string;
  accent: string;
  accentMuted: string;
  /** Accent-derived color that is legible as text on paper/surface. */
  accentText: string;
  /** Text/icon color rendered on top of an accent-filled shape. */
  onAccent: string;
  primaryButton: string;
  onPrimaryButton: string;
  danger: string;
  warning: string;
  overlay: string;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
}

const lightColors: ThemeColors = {
  background: '#F6F4EE',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E6E2D8',
  divider: '#EEEBE3',
  textPrimary: '#15171B',
  textSecondary: '#5C584F',
  textMuted: '#6B665C',
  node: '#CFCBC2',
  track: '#D9D4C9',
  accent: '#FF6B2C',
  accentMuted: '#FFE9DF',
  accentText: '#9A3A0F',
  onAccent: '#15171B',
  primaryButton: '#15171B',
  onPrimaryButton: '#FFFFFF',
  danger: '#A32A12',
  warning: '#8A5A10',
  overlay: 'rgba(21, 23, 27, 0.45)',
};

const darkColors: ThemeColors = {
  background: '#111214',
  surface: '#1A1C1F',
  surfaceRaised: '#212327',
  border: '#2C2E33',
  divider: '#24262A',
  textPrimary: '#F6F4EE',
  textSecondary: '#A8A49B',
  textMuted: '#85817A',
  node: '#3A3D44',
  track: '#2C2F36',
  accent: '#FF6B2C',
  accentMuted: '#3A2318',
  accentText: '#FFB089',
  onAccent: '#15171B',
  primaryButton: '#F6F4EE',
  onPrimaryButton: '#15171B',
  danger: '#FF6B5C',
  warning: '#E0A83D',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const themes: Readonly<Record<ThemeMode, Theme>> = {
  light: { mode: 'light', colors: lightColors },
  dark: { mode: 'dark', colors: darkColors },
};

/**
 * The dark header block is always dark, in both themes — it is a fixed
 * surface, not a themed one.
 */
export const headerColors = {
  background: '#17191E',
  text: '#F6F4EE',
  textSecondary: '#A8A49B',
  track: '#2C2F36',
  control: '#24272D',
  /** Light enough to read on the header's own dark, unlike the paper danger. */
  danger: '#FF6B5C',
} as const;

export type CategoryKey = 'engineering' | 'dataAi' | 'productDesign' | 'businessFinance';

export interface CategoryTint {
  background: string;
  text: string;
}

export const categoryLabels: Readonly<Record<CategoryKey, string>> = {
  engineering: 'Engineering',
  dataAi: 'Data & AI',
  productDesign: 'Product & Design',
  businessFinance: 'Business & finance',
};

export const categoryTints: Readonly<Record<ThemeMode, Readonly<Record<CategoryKey, CategoryTint>>>> = {
  light: {
    engineering: { background: '#E4ECF5', text: '#2E4B6B' },
    dataAi: { background: '#E3F0E8', text: '#2F5B40' },
    productDesign: { background: '#EEE8F5', text: '#4E3B6B' },
    businessFinance: { background: '#F6EDDC', text: '#6B4E1E' },
  },
  dark: {
    engineering: { background: '#243447', text: '#A9C4E0' },
    dataAi: { background: '#1E3327', text: '#9DCBAF' },
    productDesign: { background: '#2C2340', text: '#C1AEDD' },
    businessFinance: { background: '#3A2F1B', text: '#DCC189' },
  },
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
  sm: 10,
  md: 14,
  lg: 18,
  xl: 20,
  /** Bottom corners of the dark header block. */
  header: 28,
  pill: 999,
} as const;

export const motion = {
  pressScale: 0.98,
  pressInDuration: 90,
  pressOutDuration: 140,
  scoreCountDuration: 600,
  arcDuration: 600,
  pathSegmentDuration: 450,
  progressDuration: 400,
} as const;

/** Minimum tappable size — smaller visuals must make it up with hitSlop. */
export const minTouchTarget = 44;

export const fontFamily = {
  display: 'BricolageGrotesque_800ExtraBold',
  title: 'BricolageGrotesque_700Bold',
  body: 'Geist_400Regular',
  bodyMedium: 'Geist_500Medium',
  bodySemiBold: 'Geist_600SemiBold',
} as const;

export interface TypographyStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: NonNullable<TextStyle['fontWeight']>;
  letterSpacing: number;
}

export const typography = {
  /** The large readiness-score number. */
  display: {
    fontFamily: fontFamily.display,
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '800',
    letterSpacing: -1.6,
  },
  /** Screen titles. */
  title: {
    fontFamily: fontFamily.title,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  heading: {
    fontFamily: fontFamily.title,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  /** List/row titles. */
  rowTitle: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: 0,
  },
  /** Secondary/supporting copy. */
  caption: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    letterSpacing: 0,
  },
  /** Uppercase section labels. 0.08em at 12px. */
  sectionLabel: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.96,
  },
  /** Button and chip labels. */
  label: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
} as const satisfies Record<string, TypographyStyle>;
