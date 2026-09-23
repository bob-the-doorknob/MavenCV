import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Button, Sheet, TextArea } from '../../components/ui';
import { completeTaskAndQueue } from '../../services/tasks';
import { spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const MAX_NOTES_LENGTH = 400;

interface MarkDoneSheetProps {
  visible: boolean;
  onClose: () => void;
  taskId: string;
  /** Fired after the task is completed, so the screen can show its banner. */
  onCompleted: () => void;
}

export function MarkDoneSheet({ visible, onClose, taskId, onCompleted }: MarkDoneSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible) {
      setNotes('');
    }
  }, [visible]);

  const save = (): void => {
    // Fire-and-forget: the CV bullet is generated in the background, so the
    // sheet closes immediately rather than waiting on the network.
    completeTaskAndQueue(taskId, notes.trim());
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
    onCompleted();
  };

  return (
    <Sheet onClose={onClose} title="What did you actually do?" visible={visible}>
      <TextArea
        label="Notes"
        maxLength={MAX_NOTES_LENGTH}
        numberOfLines={4}
        onChangeText={setNotes}
        placeholder="A sentence or two is enough."
        value={notes}
      />
      <Text style={styles.hint}>
        Numbers make your CV stronger, e.g. &apos;handled 5k rows&apos; or &apos;3 users tested
        it&apos;
      </Text>
      <Button label="Mark as done" onPress={save} />
    </Sheet>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    hint: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      marginTop: -spacing.xs,
    },
  });
