import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { minTouchTarget, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { usePressScale } from './usePressScale';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();
  const isDisabled = disabled || loading;

  return (
    <Animated.View style={[press.style, style]}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        android_ripple={{ color: theme.colors.border }}
        disabled={isDisabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.base, styles[variant], isDisabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' ? theme.colors.onPrimaryButton : theme.colors.textPrimary}
          />
        ) : (
          <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      borderRadius: radii.md,
      justifyContent: 'center',
      minHeight: minTouchTarget + 6,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    primary: {
      backgroundColor: theme.colors.primaryButton,
    },
    secondary: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    disabled: {
      opacity: 0.4,
    },
    label: {
      fontFamily: typography.label.fontFamily,
      fontSize: typography.label.fontSize,
      fontWeight: typography.label.fontWeight,
      letterSpacing: typography.label.letterSpacing,
      lineHeight: typography.label.lineHeight,
    },
    primaryLabel: {
      color: theme.colors.onPrimaryButton,
    },
    secondaryLabel: {
      color: theme.colors.textPrimary,
    },
    ghostLabel: {
      color: theme.colors.textPrimary,
    },
  });
