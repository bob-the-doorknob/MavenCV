import { useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

interface SectionLabelProps {
  children: string;
  /** Color override, e.g. inside the dark header block. */
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function SectionLabel({ children, color, style }: SectionLabelProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return <Text style={[styles.label, color ? { color } : null, style]}>{children.toUpperCase()}</Text>;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    label: {
      color: theme.colors.textMuted,
      fontFamily: typography.sectionLabel.fontFamily,
      fontSize: typography.sectionLabel.fontSize,
      fontWeight: typography.sectionLabel.fontWeight,
      letterSpacing: typography.sectionLabel.letterSpacing,
      lineHeight: typography.sectionLabel.lineHeight,
    },
  });
