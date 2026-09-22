import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ReadinessBar } from '../components/ReadinessBar';
import { TaskCard } from '../components/TaskCard';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing, typography } from '../theme/tokens';
import type { TargetRole } from '../types';
import { calculateReadiness } from '../utils/readiness';
import { advanceTask } from '../utils/taskProgress';

interface ChecklistScreenProps {
  targetRole: TargetRole | null;
}

export function ChecklistScreen({ targetRole }: ChecklistScreenProps) {
  const upsertRoadmapTask = useAppStore((state) => state.upsertRoadmapTask);
  if (!targetRole) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.heading}>No active target role</Text>
        <Text style={styles.body}>Complete setup to create your first roadmap.</Text>
      </View>
    );
  }

  const targetLabel = targetRole.employer
    ? `${targetRole.title} at ${targetRole.employer}`
    : targetRole.title;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>ACTIVE ROADMAP</Text>
      <Text style={styles.heading}>{targetLabel}</Text>
      <ReadinessBar value={calculateReadiness(targetRole.tasks)} />
      <Text style={styles.body}>Tap a milestone to move it from not started to in progress to done.</Text>
      <View style={styles.taskList}>
        {targetRole.tasks.map((task) => (
          <TaskCard key={task.id} task={task} onPress={(pressed) => upsertRoadmapTask(targetRole.id, advanceTask(pressed))} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heading: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: typography.body,
  },
  taskList: {
    gap: spacing.sm,
  },
});
