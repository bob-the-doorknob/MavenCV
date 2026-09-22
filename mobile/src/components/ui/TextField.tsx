import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

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
  const atLimit = maxLength !== undefined && value.length >= maxLength;

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        editable={!disabled}
        maxLength={maxLength}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, Boolean(error) && styles.inputError, disabled && styles.inputDisabled]}
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
      gap: spacing.xs,
    },
    label: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: typography.caption.fontWeight,
    },
    input: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      color: theme.colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      padding: spacing.md,
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
    },
    count: {
      alignSelf: 'flex-end',
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
    countAtLimit: {
      color: theme.colors.danger,
    },
  });
