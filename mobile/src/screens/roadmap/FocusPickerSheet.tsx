import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button, Sheet, StatusNode } from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import { MAX_FOCUS_TASKS, useAppStore } from '../../store/useAppStore';
import { radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import type { RoadmapTask } from '../../types';

interface FocusPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  tasks: readonly RoadmapTask[];
  selectedIds: readonly string[];
}

export function FocusPickerSheet({ visible, onClose, tasks, selectedIds }: FocusPickerSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [picked, setPicked] = useState<string[]>([...selectedIds]);

  // Reopening the sheet starts from what is actually saved, not from a
  // half-finished selection the user backed out of.
  useEffect(() => {
    if (visible) {
      setPicked([...selectedIds]);
    }
  }, [visible, selectedIds]);

  const openTasks = tasks.filter((task) => task.status !== 'done');

  const toggle = (taskId: string): void => {
    setPicked((current) => {
      if (current.includes(taskId)) {
        return current.filter((id) => id !== taskId);
      }
      if (current.length >= MAX_FOCUS_TASKS) {
        return current;
      }
      return [...current, taskId];
    });
  };

  const save = (): void => {
    useAppStore.getState().setFocusTasks(picked);
    onClose();
  };

  return (
    <Sheet onClose={onClose} title="What are you working on now?" visible={visible}>
      <Text style={styles.hint}>
        Milestones take a few weeks each — pick what you&apos;re actively doing. Up to{' '}
        {MAX_FOCUS_TASKS}.
      </Text>
      <ScrollView style={styles.list}>
        {openTasks.map((task) => (
          <FocusRow
            key={task.id}
            disabled={!picked.includes(task.id) && picked.length >= MAX_FOCUS_TASKS}
            onPress={() => toggle(task.id)}
            selected={picked.includes(task.id)}
            task={task}
          />
        ))}
        {openTasks.length === 0 ? (
          <Text style={styles.hint}>Every milestone is done — nothing left to work on.</Text>
        ) : null}
      </ScrollView>
      <Button label="Save" onPress={save} />
    </Sheet>
  );
}

interface FocusRowProps {
  task: RoadmapTask;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

function FocusRow({ task, selected, disabled, onPress }: FocusRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={task.title}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled }}
        android_ripple={{ color: theme.colors.border }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.row, selected && styles.rowSelected, disabled && styles.rowDisabled]}
      >
        <StatusNode
          backgroundColor={theme.colors.surface}
          status={selected ? 'done' : 'not_started'}
        />
        <Text numberOfLines={2} style={styles.rowTitle}>
          {task.title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    hint: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    list: {
      maxHeight: 320,
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
      borderColor: theme.colors.textPrimary,
    },
    rowDisabled: {
      opacity: 0.4,
    },
    rowTitle: {
      color: theme.colors.textPrimary,
      flex: 1,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
  });
