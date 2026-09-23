import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

import { Button, SectionLabel } from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import { ReadyBySheet } from '../roadmap/ReadyBySheet';
import { minTouchTarget, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { formatMonthYear, formatWeeksLeft } from '../../utils/targetDate';

interface ReadyByScreenProps {
  targetDate: string | null;
  onPickDate: (date: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function ReadyByScreen({
  targetDate,
  onPickDate,
  onContinue,
  onSkip,
  onBack,
}: ReadyByScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [sheetVisible, setSheetVisible] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetVisible) {
        setSheetVisible(false);
        return true;
      }
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack, sheetVisible]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom }]}>
        <View style={styles.headerBlock}>
          <SectionLabel>Step 3 of 3</SectionLabel>
          <Text style={styles.title}>When do you want to be ready?</Text>
          <Text style={styles.subtitle}>
            With a date, we spread your milestones across the weeks you have and tell you when each
            one is due. You can set it later instead.
          </Text>
        </View>

        <DateRow onPress={() => setSheetVisible(true)} targetDate={targetDate} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <Button
          disabled={targetDate === null}
          label="Generate my roadmap"
          onPress={onContinue}
        />
        <Button label="Skip for now" onPress={onSkip} variant="ghost" />
      </View>

      <ReadyBySheet
        currentDate={targetDate ?? undefined}
        onClose={() => setSheetVisible(false)}
        onPick={(date) => {
          onPickDate(date);
          setSheetVisible(false);
        }}
        visible={sheetVisible}
      />
    </View>
  );
}

function DateRow({ targetDate, onPress }: { targetDate: string | null; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  const label = targetDate
    ? `Ready by ${formatMonthYear(targetDate)}`
    : 'Pick a date you want to be ready by';

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={targetDate ? `${label}. Change it.` : label}
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.dateRow}
      >
        <View style={styles.dateCopy}>
          <Text style={[styles.dateLabel, !targetDate && styles.datePrompt]}>{label}</Text>
          {targetDate ? (
            <Text style={styles.dateMeta}>{formatWeeksLeft(targetDate, Date.now())}</Text>
          ) : null}
        </View>
        <Text style={styles.dateAction}>{targetDate ? 'Edit' : 'Set'}</Text>
      </Pressable>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    content: {
      gap: spacing.xl,
      padding: spacing.lg,
    },
    headerBlock: {
      gap: spacing.sm,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: typography.title.fontFamily,
      fontSize: typography.title.fontSize,
      fontWeight: typography.title.fontWeight,
      letterSpacing: typography.title.letterSpacing,
      lineHeight: typography.title.lineHeight,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    dateRow: {
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'space-between',
      minHeight: minTouchTarget + 16,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    dateCopy: {
      flex: 1,
      gap: 2,
    },
    dateLabel: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
    datePrompt: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      fontWeight: typography.body.fontWeight,
    },
    dateMeta: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
    dateAction: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    footer: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: spacing.sm,
      padding: spacing.lg,
    },
  });
