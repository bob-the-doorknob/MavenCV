import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Sheet, TextField } from '../../components/ui';
import { spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import {
  formatMonthYear,
  monthYearToIso,
  parseMonthYearInput,
  quickTargetDates,
} from '../../utils/targetDate';

interface ReadyBySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Receives the first day of the chosen month, as an ISO date. */
  onPick: (date: string) => void;
  currentDate?: string | undefined;
}

export function ReadyBySheet({ visible, onClose, onPick, currentDate }: ReadyBySheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [typed, setTyped] = useState('');
  const [touched, setTouched] = useState(false);

  // A new open starts clean rather than resuming an abandoned entry.
  useEffect(() => {
    if (visible) {
      setTyped('');
      setTouched(false);
    }
  }, [visible]);

  const now = Date.now();
  const choices = useMemo(() => quickTargetDates(now), [now]);
  const parsed = parseMonthYearInput(typed, now);
  const showError = touched && typed.trim().length > 0 && parsed === null;

  const confirmTyped = (): void => {
    if (!parsed) {
      setTouched(true);
      return;
    }
    onPick(monthYearToIso(parsed));
  };

  return (
    <Sheet onClose={onClose} title="Ready by" visible={visible}>
      <Text style={styles.body}>
        When do you want to be interview-ready? We&apos;ll spread your milestones across the time
        you have.
      </Text>

      <View style={styles.chips}>
        {choices.map((choice) => (
          <Chip
            key={choice.id}
            label={choice.label}
            onPress={() => onPick(choice.date)}
            selected={currentDate === choice.date}
          />
        ))}
      </View>

      <TextField
        accessibilityLabel="Month and year, for example 05/2027"
        label="Or a month and year"
        maxLength={7}
        onChangeText={(text) => {
          setTyped(text);
          setTouched(true);
        }}
        placeholder="05/2027"
        value={typed}
        {...(showError ? { error: 'Use MM/YYYY, and pick a month still ahead of you.' } : {})}
      />
      {parsed ? <Text style={styles.preview}>Ready by {formatMonthYear(monthYearToIso(parsed))}</Text> : null}

      <Button disabled={parsed === null} label="Use this date" onPress={confirmTyped} />
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
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    preview: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
    },
  });
