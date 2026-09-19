import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/tokens';

export function SetupScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>TRAJECTORY</Text>
      <Text style={styles.title}>Turn career goals into measurable progress.</Text>
      <Text style={styles.body}>
        Choose a target role, map the milestones that matter, and build evidence for your CV.
      </Text>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Project scaffold ready</Text>
        <Text style={styles.noticeBody}>
          Guided setup and roadmap generation will be added in the next implementation phase.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: '800',
    lineHeight: 38,
  },
  body: {
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 24,
  },
  notice: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  noticeBody: {
    color: colors.textMuted,
    fontSize: typography.caption,
    lineHeight: 19,
  },
});
