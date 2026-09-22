import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radii, spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
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
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={() => onPress?.(task)}
      style={styles.card}
    >
      <View style={styles.copy}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={styles.weight}>Priority {task.priority}</Text>
      </View>
      <Text style={task.status === 'done' ? styles.doneStatus : styles.status}>
        {statusLabels[task.status]}
      </Text>
    </Pressable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.md,
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
      color: theme.colors.textPrimary,
      fontSize: typography.body.fontSize,
      fontWeight: '600',
    },
    weight: {
      color: theme.colors.textMuted,
      fontSize: typography.caption.fontSize,
    },
    status: {
      color: theme.colors.textSecondary,
      fontSize: typography.caption.fontSize,
      fontWeight: '700',
    },
    doneStatus: {
      color: theme.colors.accent,
      fontSize: typography.caption.fontSize,
      fontWeight: '700',
    },
  });
