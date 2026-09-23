import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import {
  Button,
  Card,
  Chip,
  ProgressBar,
  SectionLabel,
  Sheet,
  StatusNode,
  TextField,
} from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useActiveTarget, useAppStore } from '../../store/useAppStore';
import { minTouchTarget, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { countSteps, priorityLabels } from '../../utils/groupTasks';
import { clampEstimatedWeeks, scheduleLabel } from '../../utils/schedule';
import { formatDueDate } from '../../utils/targetDate';
import type { CvEntry, TaskStatus } from '../../types';
import { EditTaskSheet } from './EditTaskSheet';
import { MarkDoneSheet } from './MarkDoneSheet';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type TaskDetailRoute = RouteProp<RootStackParamList, 'TaskDetail'>;

const STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

const BANNER_DURATION_MS = 3_000;

const ESTIMATE_CHOICES = [1, 2, 4, 6, 8] as const;

export function TaskDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<TaskDetailRoute>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const target = useActiveTarget();
  const cvEntries = useAppStore((state) => state.cvEntries);

  const [actionsVisible, setActionsVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [markDoneVisible, setMarkDoneVisible] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [newStep, setNewStep] = useState('');
  const bannerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roadmap = target?.roadmap ?? [];
  const index = roadmap.findIndex((candidate) => candidate.id === params.taskId);
  const task = index >= 0 ? roadmap[index] : undefined;

  // Deleting the task unmounts nothing by itself — leave rather than render a blank screen.
  useEffect(() => {
    if (!task && navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [task, navigation]);

  useEffect(
    () => () => {
      if (bannerTimeout.current) {
        clearTimeout(bannerTimeout.current);
      }
    },
    [],
  );

  if (!task) {
    return <View style={styles.screen} />;
  }

  const steps = countSteps(task);
  const schedule = scheduleLabel(task, Date.now(), formatDueDate);
  const isFocus = target?.focusTaskIds.includes(task.id) ?? false;
  const cvEntry = [...cvEntries].reverse().find((entry) => entry.taskId === task.id);

  const showBanner = (): void => {
    setBannerVisible(true);
    if (bannerTimeout.current) {
      clearTimeout(bannerTimeout.current);
    }
    bannerTimeout.current = setTimeout(() => setBannerVisible(false), BANNER_DURATION_MS);
  };

  const confirmDelete = (): void => {
    Alert.alert('Delete milestone', `"${task.title}" will be removed from your roadmap.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          useAppStore.getState().deleteTask(task.id);
          if (navigation.canGoBack()) {
            navigation.goBack();
          }
        },
      },
    ]);
  };

  /** Swaps this milestone with its neighbour and hands the whole order to the store. */
  const move = (offset: -1 | 1): void => {
    const next = index + offset;
    if (next < 0 || next >= roadmap.length) {
      return;
    }
    const ids = roadmap.map((candidate) => candidate.id);
    const moved = ids[index] as string;
    ids.splice(index, 1);
    ids.splice(next, 0, moved);
    useAppStore.getState().reorderTasks(ids);
  };

  const addStep = (): void => {
    if (!newStep.trim()) {
      return;
    }
    useAppStore.getState().addStep(task.id, newStep);
    setNewStep('');
  };

  const confirmRemoveStep = (stepId: string, title: string): void => {
    Alert.alert('Remove step', `"${title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => useAppStore.getState().removeStep(task.id, stepId),
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton label="Back" onPress={() => navigation.goBack()}>
          <Path
            d="M15 5 L8 12 L15 19"
            stroke={theme.colors.textPrimary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </IconButton>
        <Text style={styles.topBarTitle}>
          Milestone {index + 1} of {roadmap.length}
        </Text>
        <IconButton label="More actions" onPress={() => setActionsVisible(true)}>
          <Path
            d="M12 5.5 V5.6 M12 12 V12.1 M12 18.4 V18.5"
            stroke={theme.colors.textPrimary}
            strokeLinecap="round"
            strokeWidth={3}
          />
        </IconButton>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chipRow}>
          <StatusPill status={task.status} />
          <Chip label={`${priorityLabels[task.priority]} priority`} />
          {isFocus ? <Chip label="Working on now" /> : null}
          {task.createdByUser ? <Chip label="Added by you" /> : null}
        </View>

        <Text style={styles.title}>{task.title}</Text>

        {schedule ? (
          <Text
            style={[
              styles.schedule,
              schedule.status === 'overdue' && styles.scheduleOverdue,
              schedule.status === 'due_soon' && styles.scheduleDueSoon,
            ]}
          >
            {schedule.text}
          </Text>
        ) : null}

        <View style={styles.section}>
          <SectionLabel>Estimated time</SectionLabel>
          <View style={styles.chipRow}>
            {ESTIMATE_CHOICES.map((weeks) => (
              <Chip
                key={weeks}
                label={weeks === 1 ? '1 week' : `${weeks} weeks`}
                onPress={() => useAppStore.getState().setEstimatedWeeks(task.id, weeks)}
                selected={clampEstimatedWeeks(task.estimatedWeeks) === weeks}
              />
            ))}
          </View>
        </View>

        {steps.total > 0 ? (
          <View style={styles.stepSummary}>
            <Text style={styles.stepCount}>
              {steps.done} of {steps.total} steps
            </Text>
            <ProgressBar height={8} value={(steps.done / steps.total) * 100} />
            <Text style={styles.stepNote}>Steps don&apos;t change your score</Text>
          </View>
        ) : null}

        {task.why ? (
          <View style={styles.section}>
            <SectionLabel>Why it matters</SectionLabel>
            <Card>
              <Text style={styles.body}>{task.why}</Text>
            </Card>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionLabel>Steps</SectionLabel>
          <Card>
            {task.steps.map((step, stepIndex) => (
              <StepRow
                key={step.id}
                done={step.done}
                isFirst={stepIndex === 0}
                onLongPress={() => confirmRemoveStep(step.id, step.title)}
                onPress={() => useAppStore.getState().toggleStep(task.id, step.id)}
                onRemove={() => confirmRemoveStep(step.id, step.title)}
                title={step.title}
              />
            ))}
            <View style={[styles.addStepRow, task.steps.length > 0 && styles.addStepRowDivided]}>
              <TextField
                accessibilityLabel="Add a step"
                label="Add a step"
                maxLength={120}
                onChangeText={setNewStep}
                placeholder="What is the next small move?"
                value={newStep}
              />
              <Button disabled={!newStep.trim()} label="Add" onPress={addStep} variant="secondary" />
            </View>
          </Card>
        </View>

        {task.doneWhen ? (
          <View style={styles.section}>
            <SectionLabel>Done when</SectionLabel>
            <Card>
              <Text style={styles.body}>{task.doneWhen}</Text>
            </Card>
          </View>
        ) : null}

        {task.status === 'done' ? <DoneSection notes={task.notes} entry={cvEntry} /> : null}
      </ScrollView>

      {bannerVisible ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>CV bullet on its way</Text>
        </View>
      ) : null}

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md }]}>
        {task.status === 'not_started' ? (
          <>
            <Button label="Start" onPress={() => useAppStore.getState().startTask(task.id)} />
            <Button label="Mark as done" onPress={() => setMarkDoneVisible(true)} variant="secondary" />
          </>
        ) : task.status === 'in_progress' ? (
          <Button label="Mark as done" onPress={() => setMarkDoneVisible(true)} />
        ) : null}
        <View style={styles.secondaryActions}>
          <Pressable
            accessibilityLabel="Edit milestone"
            accessibilityRole="button"
            android_ripple={{ color: theme.colors.border }}
            hitSlop={8}
            onPress={() => setEditVisible(true)}
            style={styles.textAction}
          >
            <Text style={styles.textActionLabel}>Edit</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Delete milestone"
            accessibilityRole="button"
            android_ripple={{ color: theme.colors.border }}
            hitSlop={8}
            onPress={confirmDelete}
            style={styles.textAction}
          >
            <Text style={[styles.textActionLabel, styles.dangerLabel]}>Delete</Text>
          </Pressable>
        </View>
      </View>

      <Sheet onClose={() => setActionsVisible(false)} title="Milestone actions" visible={actionsVisible}>
        <Button
          disabled={index <= 0}
          label="Move up"
          onPress={() => move(-1)}
          variant="secondary"
        />
        <Button
          disabled={index >= roadmap.length - 1}
          label="Move down"
          onPress={() => move(1)}
          variant="secondary"
        />
        <Button
          label="Edit"
          onPress={() => {
            setActionsVisible(false);
            setEditVisible(true);
          }}
          variant="secondary"
        />
        <Button
          label="Delete"
          onPress={() => {
            setActionsVisible(false);
            confirmDelete();
          }}
          variant="ghost"
        />
      </Sheet>

      <EditTaskSheet onClose={() => setEditVisible(false)} task={task} visible={editVisible} />

      <MarkDoneSheet
        onClose={() => setMarkDoneVisible(false)}
        onCompleted={showBanner}
        taskId={task.id}
        visible={markDoneVisible}
      />
    </View>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View
      style={[
        styles.statusPill,
        status === 'in_progress' ? styles.statusPillActive : styles.statusPillNeutral,
      ]}
    >
      <Text
        style={[
          styles.statusPillLabel,
          status === 'in_progress' ? styles.statusPillLabelActive : styles.statusPillLabelNeutral,
        ]}
      >
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

interface StepRowProps {
  title: string;
  done: boolean;
  isFirst: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onRemove: () => void;
}

function StepRow({ title, done, isFirst, onPress, onLongPress, onRemove }: StepRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <View style={[styles.stepRow, !isFirst && styles.stepRowDivided]}>
        <Pressable
          accessibilityLabel={title}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          android_ripple={{ color: theme.colors.border }}
          onLongPress={onLongPress}
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={styles.stepPressable}
        >
          <StatusNode
            backgroundColor={theme.colors.surface}
            size={20}
            status={done ? 'done' : 'not_started'}
          />
          <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>{title}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Remove step ${title}`}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onRemove}
          style={styles.stepRemove}
        >
          <Svg fill="none" height={16} viewBox="0 0 24 24" width={16}>
            <Path
              d="M6 6 L18 18 M18 6 L6 18"
              stroke={theme.colors.textMuted}
              strokeLinecap="round"
              strokeWidth={2}
            />
          </Svg>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function DoneSection({ notes, entry }: { notes: string | undefined; entry: CvEntry | undefined }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <>
      {notes ? (
        <View style={styles.section}>
          <SectionLabel>What you did</SectionLabel>
          <Card>
            <Text style={styles.body}>{notes}</Text>
          </Card>
        </View>
      ) : null}
      {entry ? (
        <View style={styles.section}>
          <SectionLabel>Your CV bullet</SectionLabel>
          <Card>
            {entry.status === 'pending' ? (
              <Text style={styles.pending}>Writing your CV bullet…</Text>
            ) : entry.status === 'failed' ? (
              <Text style={styles.pending}>That bullet didn&apos;t come through. It will retry.</Text>
            ) : (
              <Text style={styles.body}>{entry.text}</Text>
            )}
          </Card>
        </View>
      ) : null}
    </>
  );
}

function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border, borderless: true }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.iconButton}
      >
        <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
          {children}
        </Svg>
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
    topBar: {
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    topBarTitle: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    iconButton: {
      alignItems: 'center',
      height: minTouchTarget,
      justifyContent: 'center',
      width: minTouchTarget,
    },
    content: {
      gap: spacing.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xxxl,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    statusPill: {
      borderRadius: radii.pill,
      borderWidth: 1,
      minHeight: 34,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    statusPillActive: {
      backgroundColor: theme.colors.accentMuted,
      borderColor: theme.colors.accentMuted,
    },
    statusPillNeutral: {
      backgroundColor: 'transparent',
      borderColor: theme.colors.border,
    },
    statusPillLabel: {
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    statusPillLabelActive: {
      color: theme.colors.accentText,
    },
    statusPillLabelNeutral: {
      color: theme.colors.textPrimary,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: typography.title.fontFamily,
      fontSize: typography.title.fontSize,
      fontWeight: typography.title.fontWeight,
      letterSpacing: typography.title.letterSpacing,
      lineHeight: typography.title.lineHeight,
    },
    schedule: {
      color: theme.colors.textSecondary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
      marginTop: -spacing.sm,
    },
    scheduleDueSoon: {
      color: theme.colors.accentText,
    },
    scheduleOverdue: {
      color: theme.colors.danger,
    },
    stepSummary: {
      gap: spacing.sm,
    },
    stepCount: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
    },
    stepNote: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
    section: {
      gap: spacing.sm,
    },
    body: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    pending: {
      color: theme.colors.textMuted,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    stepRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    stepRowDivided: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: 1,
    },
    stepPressable: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: minTouchTarget,
      paddingVertical: spacing.sm,
    },
    stepTitle: {
      color: theme.colors.textPrimary,
      flex: 1,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    stepTitleDone: {
      color: theme.colors.textSecondary,
    },
    stepRemove: {
      alignItems: 'center',
      height: minTouchTarget,
      justifyContent: 'center',
      width: 32,
    },
    addStepRow: {
      gap: spacing.sm,
    },
    addStepRowDivided: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: 1,
      marginTop: spacing.sm,
      paddingTop: spacing.md,
    },
    banner: {
      alignSelf: 'center',
      backgroundColor: theme.colors.textPrimary,
      borderRadius: radii.pill,
      bottom: 150,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      position: 'absolute',
    },
    bannerText: {
      color: theme.colors.background,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    actionBar: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    secondaryActions: {
      flexDirection: 'row',
      gap: spacing.xl,
      justifyContent: 'center',
    },
    textAction: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: minTouchTarget,
      paddingHorizontal: spacing.md,
    },
    textActionLabel: {
      color: theme.colors.textSecondary,
      fontFamily: typography.label.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    dangerLabel: {
      color: theme.colors.danger,
    },
  });
