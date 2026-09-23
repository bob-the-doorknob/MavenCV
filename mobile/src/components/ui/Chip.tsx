import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  categoryTints,
  headerColors,
  radii,
  spacing,
  typography,
  type CategoryKey,
  type Theme,
} from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { usePressScale } from './usePressScale';

export type ChipTone = 'neutral' | CategoryKey;

interface ChipProps {
  label: string;
  /** Category tones use the category tint; neutral stays paper-and-ink. */
  tone?: ChipTone;
  selected?: boolean;
  disabled?: boolean;
  /** Set inside the dark header block, where ink text would disappear. */
  onDark?: boolean;
  /** Omit for a read-only chip. */
  onPress?: () => void;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

export function Chip({
  label,
  tone = 'neutral',
  selected = false,
  disabled = false,
  onDark = false,
  onPress,
}: ChipProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();
  const tint = tone === 'neutral' ? undefined : categoryTints[theme.mode][tone];

  const neutralStyle = onDark ? styles.onDark : styles.neutral;
  const neutralSelectedStyle = onDark ? styles.onDarkSelected : styles.neutralSelected;

  const chipStyle = [
    styles.chip,
    tint ? { backgroundColor: tint.background, borderColor: tint.background } : neutralStyle,
    selected && (tint ? styles.tintSelected : neutralSelectedStyle),
    disabled && styles.disabled,
  ];
  const labelStyle = [
    styles.label,
    tint ? { color: tint.text } : onDark ? styles.onDarkLabel : styles.neutralLabel,
    selected && !tint && (onDark ? styles.onDarkLabelSelected : styles.neutralLabelSelected),
  ];

  if (!onPress) {
    return (
      <View style={chipStyle}>
        <Text style={labelStyle}>{label}</Text>
      </View>
    );
  }

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled }}
        android_ripple={{ color: theme.colors.border }}
        disabled={disabled}
        hitSlop={HIT_SLOP}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={chipStyle}
      >
        <Text style={labelStyle}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: {
      alignItems: 'center',
      borderRadius: radii.pill,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 34,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm - 2,
    },
    neutral: {
      backgroundColor: 'transparent',
      borderColor: theme.colors.border,
    },
    neutralSelected: {
      backgroundColor: theme.colors.textPrimary,
      borderColor: theme.colors.textPrimary,
    },
    onDark: {
      backgroundColor: headerColors.control,
      borderColor: headerColors.control,
    },
    onDarkSelected: {
      backgroundColor: headerColors.text,
      borderColor: headerColors.text,
    },
    onDarkLabel: {
      color: headerColors.text,
    },
    onDarkLabelSelected: {
      color: headerColors.background,
    },
    tintSelected: {
      borderColor: theme.colors.textPrimary,
    },
    disabled: {
      opacity: 0.4,
    },
    label: {
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
      letterSpacing: typography.caption.letterSpacing,
      lineHeight: typography.caption.lineHeight,
    },
    neutralLabel: {
      color: theme.colors.textPrimary,
    },
    neutralLabelSelected: {
      color: theme.colors.background,
    },
  });
