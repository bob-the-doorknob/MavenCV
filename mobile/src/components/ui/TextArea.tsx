import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { SectionLabel } from './SectionLabel';

interface TextAreaProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  maxLength: number;
  numberOfLines?: number;
  /** Defaults to true. Set false to hide the raw counter (e.g. only show it near the limit). */
  showCount?: boolean;
}

export function TextArea({
  value,
  onChangeText,
  placeholder,
  label,
  maxLength,
  numberOfLines = 4,
  showCount = true,
}: TextAreaProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);
  const atLimit = value.length >= maxLength;

  return (
    <View style={styles.container}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <TextInput
        maxLength={maxLength}
        multiline
        numberOfLines={numberOfLines}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, focused && styles.inputFocused]}
        textAlignVertical="top"
        value={value}
      />
      {showCount ? (
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
      lineHeight: typography.body.lineHeight,
      minHeight: 112,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    inputFocused: {
      borderColor: theme.colors.textPrimary,
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
