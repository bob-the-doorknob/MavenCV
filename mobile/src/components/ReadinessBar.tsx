import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

interface ReadinessBarProps {
  value: number;
}

export function ReadinessBar({ value }: ReadinessBarProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const safeValue = Math.min(100, Math.max(0, Math.round(value)));
  const progressStyle = StyleSheet.create({
    fill: {
      width: `${safeValue}%`,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Interview readiness</Text>
        <Text style={styles.value}>{safeValue}%</Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: safeValue }}
        style={styles.track}
      >
        <View style={[styles.fill, progressStyle.fill]} />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      gap: spacing.sm,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    label: {
      color: theme.colors.textPrimary,
      fontSize: typography.body.fontSize,
      fontWeight: '600',
    },
    value: {
      color: theme.colors.accent,
      fontSize: typography.body.fontSize,
      fontWeight: '700',
    },
    track: {
      backgroundColor: theme.colors.accentMuted,
      borderRadius: radii.sm,
      height: 10,
      overflow: 'hidden',
    },
    fill: {
      backgroundColor: theme.colors.accent,
      borderRadius: radii.sm,
      height: '100%',
    },
  });
