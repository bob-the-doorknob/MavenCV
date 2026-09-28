import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, SectionLabel, Sheet, TextArea, TextField } from '../../components/ui';
import { levelLabels, resolveRoleTitle, type Level } from '../../data/roles';
import { useAppStore } from '../../store/useAppStore';
import { spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { EXPERIENCE_MAX_LENGTH, getExperienceFeedback } from '../../utils/experienceLimits';
import type { Target } from '../../types';

const LEVELS: readonly Level[] = ['internship', 'entry-level'];
const MAX_EMPLOYER_LENGTH = 60;

interface EditTargetSheetProps {
  visible: boolean;
  onClose: () => void;
  target: Target | null;
}

export function EditTargetSheet({ visible, onClose, target }: EditTargetSheetProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = Math.max(160, height - insets.top - insets.bottom - 220);
  const styles = useMemo(() => createStyles(theme, availableHeight), [theme, availableHeight]);

  const [level, setLevel] = useState<Level>(target?.level ?? 'internship');
  const [employer, setEmployer] = useState(target?.employer ?? '');
  const [experience, setExperience] = useState(target?.experience ?? '');

  // Reopening starts from what is saved, not from an abandoned edit.
  useEffect(() => {
    if (visible && target) {
      setLevel(target.level);
      setEmployer(target.employer ?? '');
      setExperience(target.experience);
    }
  }, [visible, target]);

  if (!target) {
    return null;
  }

  const feedback = getExperienceFeedback(experience);
  const canSave = experience.trim().length > 0;

  const save = (): void => {
    if (!canSave) {
      return;
    }
    useAppStore.getState().updateTargetProfile(target.id, { level, employer, experience });
    onClose();
  };

  return (
    <Sheet onClose={onClose} title="Edit target" visible={visible}>
      <ScrollView contentContainerStyle={styles.list} style={styles.scroll}>
        <Text style={styles.body}>
          {resolveRoleTitle(target.roleId, target.customTitle)}. The role itself cannot be changed —
          add another target for a different role.
        </Text>

        <View style={styles.block}>
          <SectionLabel>Level</SectionLabel>
          <View style={styles.chipRow}>
            {LEVELS.map((value) => (
              <Chip
                key={value}
                label={levelLabels[value]}
                onPress={() => setLevel(value)}
                selected={level === value}
              />
            ))}
          </View>
        </View>

        <TextField
          accessibilityLabel="Target company"
          label="Target company (optional)"
          maxLength={MAX_EMPLOYER_LENGTH}
          onChangeText={setEmployer}
          placeholder="e.g. Google"
          value={employer}
        />

        <TextArea
          label="Your experience"
          maxLength={EXPERIENCE_MAX_LENGTH}
          numberOfLines={6}
          onChangeText={setExperience}
          placeholder="What have you actually done?"
          showCount={feedback.showRawCount}
          value={experience}
        />

        <Text style={styles.note}>
          Saving updates your profile only. Your roadmap stays exactly as it is — use Regenerate
          roadmap when you want it rebuilt from this.
        </Text>

        <Button disabled={!canSave} label="Save changes" onPress={save} />
      </ScrollView>
    </Sheet>
  );
}

const createStyles = (theme: Theme, availableHeight: number) =>
  StyleSheet.create({
    scroll: { maxHeight: availableHeight },
    list: {
      gap: spacing.lg,
    },
    block: {
      gap: spacing.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    body: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    note: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
  });
