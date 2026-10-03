import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button, Sheet, StatusNode } from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import { useAppStore } from '../../store/useAppStore';
import { radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { clampEstimatedWeeks } from '../../utils/schedule';
import type { RoadmapTask } from '../../types';

interface TrimMilestonesSheetProps {
  visible: boolean;
  onClose: () => void;
  tasks: readonly RoadmapTask[];
  /** Runs after the picked milestones are deleted, so the caller can re-check the fit. */
  onTrimmed: () => void;
}

export function TrimMilestonesSheet({ visible, onClose, tasks, onTrimmed }: TrimMilestonesSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setPicked([]);
    }
  }, [visible]);

  const trimmable = tasks.filter((task) => task.priority === 1 && task.status !== 'done');
  const weeksSaved = trimmable
    .filter((task) => picked.includes(task.id))
    .reduce((total, task) => total + clampEstimatedWeeks(task.estimatedWeeks), 0);

  const toggle = (taskId: string): void => {
    setPicked((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  };

  const trim = (): void => {
    const { deleteTask } = useAppStore.getState();
    picked.forEach((taskId) => deleteTask(taskId));
    onClose();
    onTrimmed();
  };

  return (
    <Sheet onClose={onClose} scrollable={false} title="Trim low-priority milestones" visible={visible}>
      <Text style={styles.body}>
        These are your lowest-priority milestones. Removing one deletes it from your roadmap.
      </Text>

      <ScrollView style={styles.list}>
        {trimmable.map((task) => (
          <TrimRow
            key={task.id}
            onPress={() => toggle(task.id)}
            selected={picked.includes(task.id)}
            task={task}
          />
        ))}
        {trimmable.length === 0 ? (
          <Text style={styles.body}>Nothing here — every milestone left is a higher priority.</Text>
        ) : null}
      </ScrollView>

      {weeksSaved > 0 ? <Text style={styles.saved}>Frees up about {weeksSaved} weeks</Text> : null}
      <Button
        disabled={picked.length === 0}
        label={picked.length === 1 ? 'Remove 1 milestone' : `Remove ${picked.length} milestones`}
        onPress={trim}
      />
    </Sheet>
  );
}

function TrimRow({
  task,
  selected,
  onPress,
}: {
  task: RoadmapTask;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={task.title}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.row, selected && styles.rowSelected]}
      >
        <StatusNode
          backgroundColor={theme.colors.surface}
          size={20}
          status={selected ? 'done' : 'not_started'}
        />
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>
            {task.title}
          </Text>
          <Text style={styles.rowMeta}>~{clampEstimatedWeeks(task.estimatedWeeks)} weeks</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    body: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    // Shrinks on a short screen or at a large text size, so the buttons below stay on screen.
    list: {
      flexShrink: 1,
      maxHeight: 300,
    },
    row: {
      alignItems: 'center',
      borderColor: theme.colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.sm,
      minHeight: 56,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    rowSelected: {
      borderColor: theme.colors.danger,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
    rowMeta: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
    saved: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
  });
