import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ReadinessBar } from '../components/ReadinessBar';
import { TaskCard } from '../components/TaskCard';
import { resolveRoleTitle } from '../data/roles';
import { spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { Target } from '../types';
import { calculateReadiness } from '../utils/readiness';

interface ChecklistScreenProps {
  target: Target | null;
}

export function ChecklistScreen({ target }: ChecklistScreenProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  if (!target) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.heading}>No active target role</Text>
        <Text style={styles.body}>Complete setup to create your first roadmap.</Text>
      </View>
    );
  }

  const roleTitle = resolveRoleTitle(target.roleId, target.customTitle);
  const targetLabel = target.employer ? `${roleTitle} at ${target.employer}` : roleTitle;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>ACTIVE ROADMAP</Text>
      <Text style={styles.heading}>{targetLabel}</Text>
      <ReadinessBar value={calculateReadiness(target.roadmap)} />
      <View style={styles.taskList}>
        {target.roadmap.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      gap: spacing.md,
      padding: spacing.lg,
    },
    emptyContainer: {
      flex: 1,
      gap: spacing.sm,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontSize: typography.caption.fontSize,
      fontWeight: '800',
      letterSpacing: 1.5,
    },
    heading: {
      color: theme.colors.textPrimary,
      fontSize: typography.heading.fontSize,
      fontWeight: '700',
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: typography.body.fontSize,
    },
    taskList: {
      gap: spacing.sm,
    },
  });
