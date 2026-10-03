import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { minTouchTarget, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { SectionLabel } from './SectionLabel';

interface TextFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  maxLength?: number;
  error?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Single-line counterpart to TextArea — same styling via tokens. */
export function TextField({
  value,
  onChangeText,
  placeholder,
  label,
  maxLength,
  error,
  disabled = false,
  accessibilityLabel,
}: TextFieldProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);
  const atLimit = maxLength !== undefined && value.length >= maxLength;

  return (
    <View style={styles.container}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        editable={!disabled}
        maxLength={maxLength}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          focused && styles.inputFocused,
          Boolean(error) && styles.inputError,
          disabled && styles.inputDisabled,
        ]}
        value={value}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {maxLength !== undefined ? (
        <Text style={[styles.count, atLimit && styles.countAtLimit]}>
          {value.length}/{maxLength}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      gap: spacing.sm,
    },
    input: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.inputBorder,
      borderRadius: radii.md,
      borderWidth: 1,
      color: theme.colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      minHeight: minTouchTarget + 6,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    inputFocused: {
      borderColor: theme.colors.textPrimary,
    },
    inputError: {
      borderColor: theme.colors.danger,
    },
    inputDisabled: {
      opacity: 0.4,
    },
    error: {
      color: theme.colors.danger,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    count: {
      alignSelf: 'flex-end',
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    countAtLimit: {
      color: theme.colors.danger,
    },
  });
