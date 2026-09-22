import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

interface TextAreaProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  maxLength: number;
  numberOfLines?: number;
}

export function TextArea({
  value,
  onChangeText,
  placeholder,
  label,
  maxLength,
  numberOfLines = 4,
}: TextAreaProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const atLimit = value.length >= maxLength;

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        maxLength={maxLength}
        multiline
        numberOfLines={numberOfLines}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        textAlignVertical="top"
        value={value}
      />
      <Text style={[styles.count, atLimit && styles.countAtLimit]}>
        {value.length}/{maxLength}
      </Text>
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
      lineHeight: typography.body.lineHeight,
      minHeight: 96,
      padding: spacing.md,
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
