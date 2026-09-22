import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radii, spacing, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

interface CardProps {
  children: React.ReactNode;
  /** Uses the wider radius — for the highlighted current task. */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, raised = false, style }: CardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return <View style={[styles.card, raised && styles.raised, style]}>{children}</View>;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.lg,
    },
    raised: {
      backgroundColor: theme.colors.surfaceRaised,
      borderRadius: radii.xl,
    },
  });
