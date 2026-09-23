import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated from 'react-native-reanimated';

import {
  Card,
  CategoryChip,
  Chip,
  EmptyState,
  MilestonePath,
  ScoreArc,
  SectionLabel,
  Sheet,
  StatusNode,
  type MilestoneItem,
} from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import { levelLabels, resolveRoleTitle } from '../../data/roles';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useActiveTarget, useAppStore, useFocusTasks, useReadiness } from '../../store/useAppStore';
import { headerColors, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { countSteps, orderRoadmap, taskMetaLine } from '../../utils/groupTasks';
import { categoryKeyForRole } from '../../utils/roleCategory';
import { fits, scheduleLabel } from '../../utils/schedule';
import { formatDueDate, formatMonthYear, formatWeeksLeft } from '../../utils/targetDate';
import type { RoadmapTask, Target } from '../../types';
import { DoesNotFitSheet } from './DoesNotFitSheet';
import { FocusPickerSheet } from './FocusPickerSheet';
import { ReadyBySheet } from './ReadyBySheet';
import { TrimMilestonesSheet } from './TrimMilestonesSheet';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const SCORE_LABELS = {
  internship: 'ready for internships',
  'entry-level': 'ready for entry-level roles',
} as const;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const CHECK_IN_INTERVAL_DAYS = 7;

/** The weekday the next check-in falls on, a week after the last one. */
const nextCheckInLabel = (target: Target): string => {
  const since = Date.parse(target.lastCheckInAt ?? target.createdAt);
  if (Number.isNaN(since)) {
    return 'Check-in weekly';
  }
  const next = new Date(since + CHECK_IN_INTERVAL_DAYS * 24 * 60 * 60 * 1_000);
  return `Check-in ${WEEKDAYS[next.getDay()] ?? 'weekly'}`;
};

const handleResetPress = (): void => {
  Alert.alert(
    'Reset app data',
    "This deletes your roadmap and CV lines from this device. This can't be undone.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => useAppStore.getState().resetAll() },
    ],
  );
};

export function RoadmapScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const target = useActiveTarget();
  const readiness = useReadiness();
  const focusTasks = useFocusTasks();
  const [scoringVisible, setScoringVisible] = useState(false);
  const [focusPickerVisible, setFocusPickerVisible] = useState(false);
  const [readyByVisible, setReadyByVisible] = useState(false);
  const [trimVisible, setTrimVisible] = useState(false);
  const [misfit, setMisfit] = useState<{ neededWeeks: number; availableWeeks: number } | null>(null);

  const roadmap = target?.roadmap ?? [];
  const ordered = useMemo(() => orderRoadmap(roadmap), [roadmap]);
  const now = Date.now();

  const milestones: MilestoneItem[] = ordered.tasks.map((task) => {
    const schedule = scheduleLabel(task, now, formatDueDate);
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      meta: taskMetaLine(task, task.id === ordered.upNextId),
      ...(schedule ? { schedule: { text: schedule.text, tone: schedule.status } } : {}),
    };
  });

  /**
   * Picking a date only schedules straight away when the work actually fits.
   * Otherwise the user chooses how to resolve it rather than being handed a
   * plan that was quietly compressed.
   */
  const chooseTargetDate = (date: string): void => {
    const store = useAppStore.getState();
    store.setTargetDate(date);
    setReadyByVisible(false);

    const fit = fits(roadmap, date, Date.now());
    if (fit.fits) {
      store.applySchedule('comfortable');
      setMisfit(null);
      return;
    }
    setMisfit({ neededWeeks: fit.neededWeeks, availableWeeks: fit.availableWeeks });
  };

  /** Re-checks the fit after the roadmap was trimmed. */
  const recheckFit = (): void => {
    const current = useAppStore.getState().targets.find((candidate) => candidate.id === target?.id);
    if (!current?.targetDate) {
      return;
    }
    const fit = fits(current.roadmap, current.targetDate, Date.now());
    if (fit.fits) {
      useAppStore.getState().applySchedule(current.schedulePace ?? 'comfortable');
      setMisfit(null);
      return;
    }
    setMisfit({ neededWeeks: fit.neededWeeks, availableWeeks: fit.availableWeeks });
  };

  const openTask = (taskId: string): void => {
    navigation.navigate('TaskDetail', { taskId });
  };

  return (
    <View style={styles.screen}>
      {/* The header block behind the status bar is always dark. */}
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        style={styles.screen}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
          <SectionLabel color={headerColors.textSecondary}>Your roadmap</SectionLabel>
          <Text style={styles.roleTitle}>
            {target ? resolveRoleTitle(target.roleId, target.customTitle) : 'No target role'}
          </Text>
          {target ? (
            <View style={styles.headerChips}>
              <CategoryChip category={categoryKeyForRole(target.roleId)} />
              <Chip label={levelLabels[target.level]} onDark />
            </View>
          ) : null}

          <ScoreArc
            label={target ? SCORE_LABELS[target.level] : 'ready'}
            value={readiness}
          />

          <Text style={styles.headerCaption}>
            {ordered.doneCount} of {ordered.totalCount} milestones done
          </Text>

          <Pressable
            accessibilityLabel="How is this scored?"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setScoringVisible(true)}
          >
            <Text style={styles.scoringLink}>How is this scored?</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <ReadyByRow
            onPress={() => setReadyByVisible(true)}
            {...(target?.targetDate ? { targetDate: target.targetDate } : {})}
          />
        </View>

        {ordered.totalCount === 0 ? (
          <View style={styles.section}>
            <EmptyState
              message="Your roadmap has no milestones yet. Reset the app to generate a new one."
              title="Nothing to work on"
            />
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <SectionLabel>This week&apos;s focus</SectionLabel>
                {target ? <Text style={styles.checkIn}>{nextCheckInLabel(target)}</Text> : null}
              </View>
              <Card>
                {focusTasks.length > 0 ? (
                  focusTasks.map((task, index) => (
                    <FocusTaskRow
                      key={task.id}
                      isFirst={index === 0}
                      onPress={() => openTask(task.id)}
                      task={task}
                    />
                  ))
                ) : (
                  <FocusPromptRow onPress={() => setFocusPickerVisible(true)} />
                )}
              </Card>
            </View>

            <View style={styles.section}>
              <SectionLabel>Milestones</SectionLabel>
              <MilestonePath
                items={milestones}
                onPressItem={openTask}
                {...(ordered.currentId ? { currentId: ordered.currentId } : {})}
              />
            </View>
          </>
        )}

        {__DEV__ ? (
          <View style={styles.devLinks}>
            <Pressable
              accessibilityLabel="Open UI gallery"
              accessibilityRole="button"
              android_ripple={{ color: theme.colors.border }}
              onPress={() => navigation.navigate('UiGallery')}
              style={styles.devLinkContainer}
            >
              <Text style={styles.devLink}>UI Gallery (dev)</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Reset app data"
              accessibilityRole="button"
              android_ripple={{ color: theme.colors.border }}
              onPress={handleResetPress}
              style={styles.devLinkContainer}
            >
              <Text style={styles.devLink}>Reset app data (dev)</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Sheet onClose={() => setScoringVisible(false)} title="How is this scored?" visible={scoringVisible}>
        <Text style={styles.sheetBody}>
          Your score is the share of your roadmap you&apos;ve completed, weighted by each task&apos;s
          priority.
        </Text>
      </Sheet>

      <FocusPickerSheet
        onClose={() => setFocusPickerVisible(false)}
        selectedIds={target?.focusTaskIds ?? []}
        tasks={roadmap}
        visible={focusPickerVisible}
      />

      <ReadyBySheet
        currentDate={target?.targetDate}
        onClose={() => setReadyByVisible(false)}
        onPick={chooseTargetDate}
        visible={readyByVisible}
      />

      <DoesNotFitSheet
        availableWeeks={misfit?.availableWeeks ?? 0}
        neededWeeks={misfit?.neededWeeks ?? 0}
        onClose={() => setMisfit(null)}
        onGoAmbitious={() => {
          useAppStore.getState().applySchedule('ambitious');
          setMisfit(null);
        }}
        onPickLaterDate={() => {
          setMisfit(null);
          setReadyByVisible(true);
        }}
        onTrim={() => {
          setMisfit(null);
          setTrimVisible(true);
        }}
        visible={misfit !== null}
      />

      <TrimMilestonesSheet
        onClose={() => setTrimVisible(false)}
        onTrimmed={recheckFit}
        tasks={roadmap}
        visible={trimVisible}
      />
    </View>
  );
}

function ReadyByRow({ targetDate, onPress }: { targetDate?: string; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  const label = targetDate
    ? `Ready by ${formatMonthYear(targetDate)} · ${formatWeeksLeft(targetDate, Date.now())}`
    : 'Set a date you want to be ready by';

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={targetDate ? `${label}. Change it.` : label}
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.readyByRow}
      >
        <Text style={[styles.readyByLabel, !targetDate && styles.readyByPrompt]}>{label}</Text>
        <Text style={styles.readyByAction}>{targetDate ? 'Edit' : 'Set'}</Text>
      </Pressable>
    </Animated.View>
  );
}

function FocusTaskRow({
  task,
  isFirst,
  onPress,
}: {
  task: RoadmapTask;
  isFirst: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();
  const steps = countSteps(task);

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={task.title}
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.focusRow, !isFirst && styles.focusRowDivided]}
      >
        <StatusNode backgroundColor={theme.colors.surface} status={task.status} />
        <View style={styles.focusCopy}>
          <Text numberOfLines={2} style={styles.focusTitle}>
            {task.title}
          </Text>
          {steps.total > 0 ? (
            <Text style={styles.focusMeta}>
              {steps.done}/{steps.total} steps
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function FocusPromptRow({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel="Pick up to 2 tasks to focus on this week"
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.focusRow}
      >
        <StatusNode backgroundColor={theme.colors.surface} status="not_started" />
        <Text style={styles.focusPrompt}>Pick up to 2 tasks to focus on this week</Text>
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
    },
    header: {
      alignItems: 'center',
      backgroundColor: headerColors.background,
      borderBottomLeftRadius: radii.header,
      borderBottomRightRadius: radii.header,
      gap: spacing.md,
      paddingBottom: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    roleTitle: {
      color: headerColors.text,
      fontFamily: typography.title.fontFamily,
      fontSize: typography.title.fontSize,
      fontWeight: typography.title.fontWeight,
      letterSpacing: typography.title.letterSpacing,
      lineHeight: typography.title.lineHeight,
      textAlign: 'center',
    },
    headerChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      justifyContent: 'center',
    },
    headerCaption: {
      color: headerColors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    scoringLink: {
      color: headerColors.text,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      textDecorationLine: 'underline',
    },
    section: {
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    sectionHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    readyByRow: {
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'space-between',
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    readyByLabel: {
      color: theme.colors.textPrimary,
      flex: 1,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
    readyByPrompt: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      fontWeight: typography.body.fontWeight,
    },
    readyByAction: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    checkIn: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    focusRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 48,
      paddingVertical: spacing.sm,
    },
    focusRowDivided: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: 1,
      marginTop: spacing.sm,
      paddingTop: spacing.md,
    },
    focusCopy: {
      flex: 1,
      gap: 2,
    },
    focusTitle: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
    focusMeta: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    focusPrompt: {
      color: theme.colors.textSecondary,
      flex: 1,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    sheetBody: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    devLinks: {
      alignItems: 'center',
      gap: spacing.xs,
    },
    devLinkContainer: {
      padding: spacing.sm,
    },
    devLink: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
  });
