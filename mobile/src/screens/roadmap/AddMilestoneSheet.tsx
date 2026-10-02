import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, SectionLabel, Sheet, TextArea, TextField } from '../../components/ui';
import { useActiveTarget, useAppStore } from '../../store/useAppStore';
import { spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { priorityLabels } from '../../utils/groupTasks';
import { atLimit, limitMessage } from '../../utils/limits';
import type { TaskPriority } from '../../types';

const PRIORITIES: readonly TaskPriority[] = [3, 2, 1];
const ESTIMATE_CHOICES = [1, 2, 4, 6, 8] as const;
const MAX_TITLE_LENGTH = 120;
const MAX_DONE_WHEN_LENGTH = 200;

interface AddMilestoneSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AddMilestoneSheet({ visible, onClose }: AddMilestoneSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [title, setTitle] = useState('');
  const [doneWhen, setDoneWhen] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(2);
  const [estimatedWeeks, setEstimatedWeeks] = useState<number>(2);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setDoneWhen('');
      setPriority(2);
      setEstimatedWeeks(2);
      setTouched(false);
    }
  }, [visible]);

  const milestoneCount = useActiveTarget()?.roadmap.length ?? 0;
  const full = atLimit('milestones', milestoneCount);
  const canSave = title.trim().length > 0 && !full;

  const save = (): void => {
    if (full) {
      return;
    }
    if (!canSave) {
      setTouched(true);
      return;
    }
    // addMilestone reschedules by itself when a target date is set.
    useAppStore.getState().addMilestone({ title, doneWhen, priority, estimatedWeeks });
    onClose();
  };

  return (
    <Sheet onClose={onClose} title="Add a milestone" visible={visible}>
      <Text style={styles.body}>
        Write it the way the rest of your roadmap reads: a verb, a number, and the thing you
        produce.
      </Text>

      <TextField
        label="Title"
        maxLength={MAX_TITLE_LENGTH}
        onChangeText={(text) => {
          setTitle(text);
          setTouched(true);
        }}
        placeholder="e.g. Ship 1 side project with 3 users"
        value={title}
        {...(touched && !canSave ? { error: 'A title is required.' } : {})}
      />

      <TextArea
        label="Done when"
        maxLength={MAX_DONE_WHEN_LENGTH}
        numberOfLines={3}
        onChangeText={setDoneWhen}
        placeholder="How will you know it's finished?"
        value={doneWhen}
      />

      <View style={styles.block}>
        <SectionLabel>Priority</SectionLabel>
        <View style={styles.chipRow}>
          {PRIORITIES.map((value) => (
            <Chip
              key={value}
              label={priorityLabels[value]}
              onPress={() => setPriority(value)}
              selected={priority === value}
            />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <SectionLabel>Estimated time</SectionLabel>
        <View style={styles.chipRow}>
          {ESTIMATE_CHOICES.map((weeks) => (
            <Chip
              key={weeks}
              label={weeks === 1 ? '1 week' : `${weeks} weeks`}
              onPress={() => setEstimatedWeeks(weeks)}
              selected={estimatedWeeks === weeks}
            />
          ))}
        </View>
      </View>

      {full ? <Text style={styles.body}>{limitMessage('milestones')}</Text> : null}
      <Button disabled={!canSave} label="Add milestone" onPress={save} />
    </Sheet>
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
    block: {
      gap: spacing.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
  });
