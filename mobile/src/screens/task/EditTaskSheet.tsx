import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, SectionLabel, Sheet, TextArea, TextField } from '../../components/ui';
import { useAppStore } from '../../store/useAppStore';
import { spacing, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { priorityLabels } from '../../utils/groupTasks';
import type { RoadmapTask, TaskPriority } from '../../types';

const PRIORITIES: readonly TaskPriority[] = [3, 2, 1];
const MAX_TITLE_LENGTH = 120;
const MAX_DONE_WHEN_LENGTH = 200;

interface EditTaskSheetProps {
  visible: boolean;
  onClose: () => void;
  task: RoadmapTask;
}

export function EditTaskSheet({ visible, onClose, task }: EditTaskSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [title, setTitle] = useState(task.title);
  const [doneWhen, setDoneWhen] = useState(task.doneWhen);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [notes, setNotes] = useState(task.notes ?? '');

  // Reopening starts from what is saved, not from an abandoned edit.
  useEffect(() => {
    if (visible) {
      setTitle(task.title);
      setDoneWhen(task.doneWhen);
      setPriority(task.priority);
      setNotes(task.notes ?? '');
    }
  }, [visible, task.title, task.doneWhen, task.priority, task.notes]);

  const trimmedTitle = title.trim();
  const canSave = trimmedTitle.length > 0;

  const save = (): void => {
    if (!canSave) {
      return;
    }
    useAppStore.getState().editTask(task.id, {
      title: trimmedTitle,
      doneWhen: doneWhen.trim(),
      priority,
      notes: notes.trim(),
    });
    onClose();
  };

  return (
    <Sheet onClose={onClose} title="Edit milestone" visible={visible}>
      <TextField
        label="Title"
        maxLength={MAX_TITLE_LENGTH}
        onChangeText={setTitle}
        placeholder="What are you going to do?"
        value={title}
        {...(canSave ? {} : { error: 'A title is required.' })}
      />
      <TextArea
        label="Done when"
        maxLength={MAX_DONE_WHEN_LENGTH}
        numberOfLines={3}
        onChangeText={setDoneWhen}
        placeholder="How will you know it's finished?"
        value={doneWhen}
      />
      <View style={styles.priorityBlock}>
        {task.status === 'done' ? <TextArea label="Completion evidence (for CV retries)" maxLength={2000} onChangeText={setNotes} value={notes} /> : null}
        <SectionLabel>Priority</SectionLabel>
        <View style={styles.priorityRow}>
          {PRIORITIES.map((value) => (
            <Chip
              key={value}
              label={priorityLabels[value]}
              onPress={() => setPriority(value)}
              selected={priority === value}
            />
          ))}
        </View>
        <Text style={styles.hint}>Priority helps you choose what to work on. Scoring weights stay fixed.</Text>
      </View>
      <Button disabled={!canSave} label="Save" onPress={save} />
    </Sheet>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    priorityBlock: {
      gap: spacing.sm,
    },
    priorityRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    hint: {
      color: theme.colors.textMuted,
      fontSize: 13,
    },
  });
