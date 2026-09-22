import { StyleSheet, Text, View } from 'react-native';

import { radii, spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export function SetupScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>MAVEN</Text>
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

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      gap: spacing.md,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontSize: typography.caption.fontSize,
      fontWeight: '800',
      letterSpacing: 2,
    },
    title: {
      color: theme.colors.textPrimary,
      fontSize: typography.title.fontSize,
      fontWeight: '800',
      lineHeight: 38,
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: typography.body.fontSize,
      lineHeight: 24,
    },
    notice: {
      backgroundColor: theme.colors.accentMuted,
      borderRadius: radii.md,
      gap: spacing.sm,
      marginTop: spacing.sm,
      padding: spacing.md,
    },
    noticeTitle: {
      color: theme.colors.textPrimary,
      fontSize: typography.body.fontSize,
      fontWeight: '700',
    },
    noticeBody: {
      color: theme.colors.textMuted,
      fontSize: typography.caption.fontSize,
      lineHeight: 19,
    },
  });
