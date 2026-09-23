import { useEffect, useState } from 'react';

import { Button, Sheet, TextArea } from '../../components/ui';
import { useAppStore } from '../../store/useAppStore';
import type { CvEntry } from '../../types';

const MAX_BULLET_LENGTH = 300;

interface EditBulletSheetProps {
  visible: boolean;
  onClose: () => void;
  entry: CvEntry | null;
}

export function EditBulletSheet({ visible, onClose, entry }: EditBulletSheetProps) {
  const [text, setText] = useState(entry?.text ?? '');

  useEffect(() => {
    if (visible && entry) {
      setText(entry.text);
    }
  }, [visible, entry]);

  if (!entry) {
    return null;
  }

  const canSave = text.trim().length > 0;

  const save = (): void => {
    if (!canSave) {
      return;
    }
    useAppStore.getState().updateCvEntry(entry.id, { text: text.trim() });
    onClose();
  };

  return (
    <Sheet onClose={onClose} title="Edit bullet" visible={visible}>
      <TextArea
        label="Your bullet"
        maxLength={MAX_BULLET_LENGTH}
        numberOfLines={4}
        onChangeText={setText}
        placeholder="Rewrite it in your own words."
        value={text}
      />
      <Button disabled={!canSave} label="Save" onPress={save} />
    </Sheet>
  );
}
