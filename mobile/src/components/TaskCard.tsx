import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/tokens';
import type { RoadmapTask, TaskStatus } from '../types';

interface TaskCardProps {
  task: RoadmapTask;
  onPress?: (task: RoadmapTask) => void;
}

const statusLabels: Readonly<Record<TaskStatus, string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

export function TaskCard({ task, onPress }: TaskCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={() => onPress?.(task)}
      style={styles.card}
    >
      <View style={styles.copy}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={styles.weight}>Weight {task.weight}</Text>
      </View>
      <Text style={task.status === 'done' ? styles.doneStatus : styles.status}>
        {statusLabels[task.status]}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '600',
  },
  weight: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  status: {
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: '700',
  },
  doneStatus: {
    color: colors.success,
    fontSize: typography.caption,
    fontWeight: '700',
  },
});
