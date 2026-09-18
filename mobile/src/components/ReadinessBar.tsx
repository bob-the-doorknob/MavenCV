import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/tokens';

interface ReadinessBarProps {
  value: number;
}

export function ReadinessBar({ value }: ReadinessBarProps) {
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

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  value: {
    color: colors.primary,
    fontSize: typography.body,
    fontWeight: '700',
  },
  track: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.sm,
    height: 10,
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    height: '100%',
  },
});
