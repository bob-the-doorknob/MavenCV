import { useEffect, useMemo, useState } from 'react';
// Clipboard from react-native core, as in CvVaultScreen: expo-clipboard is not installed.
import { Clipboard, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Button, Sheet, TextArea } from '../../components/ui';
import { completeTaskAndQueue } from '../../services/tasks';
import { useAppStore } from '../../store/useAppStore';
import { spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { atLimit, limitMessage } from '../../utils/limits';
import { markDoneState } from '../../utils/markDone';

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
  // Finishing a milestone writes a CV bullet, so a full vault blocks it — with a reason.
  const full = useAppStore((state) => atLimit('cvEntries', state.cvEntries.length));
  const status = useAppStore(
    (state) =>
      state.targets.find((target) => target.id === state.activeTargetId)?.roadmap.find((task) => task.id === taskId)
        ?.status,
  );
  const doneState = markDoneState(status, notes, full);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (visible) {
      setNotes('');
      setCopied(false);
    }
  }, [visible]);

  const save = (): void => {
    // Re-checked at the moment of saving: a sync may have landed since render.
    const current = useAppStore
      .getState()
      .targets.find((target) => target.id === useAppStore.getState().activeTargetId)
      ?.roadmap.find((task) => task.id === taskId)?.status;
    if (markDoneState(current, notes, full) !== 'ready') return;
    // Synchronous local completion; the CV screen generates the bullet later.
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
      <Text style={styles.hint}>Add evidence of what you completed. Your CV bullet will generate when you open CV.</Text>
      {doneState === 'full' ? <Text style={styles.hint}>{limitMessage('cvEntries')}</Text> : null}
      {doneState === 'completed_elsewhere' ? (
        <>
          <Text style={styles.notice}>
            This milestone was marked done on another device, so these notes weren&apos;t saved. They&apos;re still here
            — copy them if you want to keep them.
          </Text>
          <Button
            disabled={!notes.trim()}
            label={copied ? 'Notes copied' : 'Copy my notes'}
            onPress={() => {
              Clipboard.setString(notes.trim());
              setCopied(true);
            }}
            variant="secondary"
          />
          <Button label="Close" onPress={onClose} variant="ghost" />
        </>
      ) : (
        <Button disabled={doneState !== 'ready'} label="Mark as done" onPress={save} />
      )}
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
    notice: {
      color: theme.colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
  });
