import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button, Sheet, TextField } from '../../components/ui';
import { useAppStore } from '../../store/useAppStore';
import { typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { fillNumberPlaceholder } from '../../utils/cvBullets';
import type { CvEntry } from '../../types';

interface AddNumberSheetProps {
  visible: boolean;
  onClose: () => void;
  entry: CvEntry | null;
}

export function AddNumberSheet({ visible, onClose, entry }: AddNumberSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) {
      setValue('');
    }
  }, [visible]);

  if (!entry) {
    return null;
  }

  const preview = fillNumberPlaceholder(entry.text, value);
  const canSave = value.trim().length > 0;

  const save = (): void => {
    if (!canSave) {
      return;
    }
    useAppStore.getState().updateCvEntry(entry.id, { text: preview });
    onClose();
  };

  return (
    <Sheet onClose={onClose} title="Add your number" visible={visible}>
      <Text style={styles.body}>
        What goes where the bullet says {'['}X{']'}? Use the real figure — nothing is invented for
        you.
      </Text>
      <TextField
        accessibilityLabel="Your number"
        label="Your number"
        maxLength={40}
        onChangeText={setValue}
        placeholder="e.g. 5,000 or 3"
        value={value}
      />
      <Text style={styles.preview}>{preview}</Text>
      <Button disabled={!canSave} label="Save bullet" onPress={save} />
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
    preview: {
      color: theme.colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
  });
