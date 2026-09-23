import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button, Sheet } from '../../components/ui';
import { typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

interface DoesNotFitSheetProps {
  visible: boolean;
  onClose: () => void;
  neededWeeks: number;
  availableWeeks: number;
  onPickLaterDate: () => void;
  onGoAmbitious: () => void;
  onTrim: () => void;
}

export function DoesNotFitSheet({
  visible,
  onClose,
  neededWeeks,
  availableWeeks,
  onPickLaterDate,
  onGoAmbitious,
  onTrim,
}: DoesNotFitSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Sheet onClose={onClose} title={"That's a tight deadline"} visible={visible}>
      <Text style={styles.body}>
        Your roadmap needs about {neededWeeks} weeks, but your target is {availableWeeks} weeks
        away.
      </Text>
      <Button label="Pick a later date" onPress={onPickLaterDate} />
      <Button label="Go ambitious" onPress={onGoAmbitious} variant="secondary" />
      <Button label="Trim low-priority milestones" onPress={onTrim} variant="ghost" />
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
  });
