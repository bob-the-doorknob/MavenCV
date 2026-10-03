import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';

import {
  Card,
  Button,
  CategoryChip,
  Chip,
  ConfirmationBanner,
  EmptyState,
  MilestoneRow,
  ScoreArc,
  SectionLabel,
  Sheet,
  StatusNode,
  type MilestoneItem,
} from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import { levelLabels, resolveRoleTitle } from '../../data/roles';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useActiveTarget, useAppStore, useFocusTasks, useReadiness, isCheckInDue } from '../../store/useAppStore';
import { checkProEntitlement } from '../../services/proStatus';
import { processPendingCvEntries } from '../../services/cvQueue';
import { headerColors, minTouchTarget, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { countSteps, orderRoadmap, sortMilestones, taskMetaLine } from '../../utils/groupTasks';
import { atLimit, limitMessage } from '../../utils/limits';
import { categoryKeyForRole } from '../../utils/roleCategory';
import { moveId, spokenScore } from '../../utils/spokenText';
import { fits, overdueSummary, scheduleLabel } from '../../utils/schedule';
import type { PaywallTrigger } from '../../utils/paywallCopy';
import { formatDueDate, formatMonthYear, formatWeeksLeft } from '../../utils/targetDate';
import type { MilestoneSort, RoadmapTask } from '../../types';
import { ProUpsellSheet } from '../cv/ProUpsellSheet';
import { EditTargetSheet } from './EditTargetSheet';
import { TargetSwitcherSheet } from './TargetSwitcherSheet';
import { AddMilestoneSheet } from './AddMilestoneSheet';
import { DoesNotFitSheet } from './DoesNotFitSheet';
import { FocusPickerSheet } from './FocusPickerSheet';
import { ReadyBySheet } from './ReadyBySheet';
import { TrimMilestonesSheet } from './TrimMilestonesSheet';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** Long enough to notice and reach, short enough not to linger. */
const UNDO_DURATION_MS = 6_000;

/** One shared empty roadmap, so a missing target does not make a new array (and re-run the memos below) every render. */
const NO_TASKS: readonly RoadmapTask[] = [];

const SORT_OPTIONS: ReadonlyArray<{ value: MilestoneSort; label: string }> = [
  { value: 'roadmap', label: 'Roadmap order' },
  { value: 'priority', label: 'Priority' },
  { value: 'dueDate', label: 'Due date' },
];

const SCORE_LABELS = {
  internship: 'ready for internships',
  'entry-level': 'ready for entry-level roles',
} as const;

export function RoadmapScreen() {
  const theme = useTheme();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const target = useActiveTarget();
  const targets = useAppStore((state) => state.targets);
  const [targetsVisible, setTargetsVisible] = useState(false);
  const [addingTarget, setAddingTarget] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [upsellVisible, setUpsellVisible] = useState(false);
  const [upsellTrigger, setUpsellTrigger] = useState<PaywallTrigger>('addTarget');
  const [editTargetVisible, setEditTargetVisible] = useState(false);
  const completionNotice = useAppStore((state) => state.completionNotice);
  const completedTaskId = useAppStore((state) => state.completedTaskId);
  const pendingUndo = useAppStore((state) => state.pendingUndo);
  const [refreshing, setRefreshing] = useState(false);

  const addTarget = async (): Promise<void> => {
    if (addingTarget) return;
    if (atLimit('targets', useAppStore.getState().targets.length)) {
      Alert.alert("Can't add another target", limitMessage('targets'));
      return;
    }
    setAddingTarget(true);
    try {
      // The first target is free; a second one is the Pro moment.
      if (useAppStore.getState().targets.length > 0 && !(await checkProEntitlement())) {
        // Our own sheet first: it names this user's role and score, which the
        // store-hosted paywall cannot. Upgrading happens from inside it.
        setTargetsVisible(false);
        setUpsellTrigger('addTarget');
        setUpsellVisible(true);
        return;
      }
      setTargetsVisible(false);
      navigation.navigate('AddTarget');
    } catch (error) { Alert.alert('Unable to add target', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setAddingTarget(false); }
  };
  /**
   * Regenerating throws away unfinished milestones, so it asks first and
   * spells out exactly what survives.
   */
  const startRegenerate = async (): Promise<void> => {
    if (!target || regenerating) return;
    setRegenerating(true);
    try {
      if (!(await checkProEntitlement())) {
        setTargetsVisible(false);
        setUpsellTrigger('regenerate');
        setUpsellVisible(true);
        return;
      }
      const doneCount = target.roadmap.filter((entry) => entry.status === 'done').length;
      const openCount = target.roadmap.length - doneCount;
      Alert.alert(
        'Regenerate this roadmap?',
        `${doneCount} finished ${doneCount === 1 ? 'milestone' : 'milestones'} and the CV bullets they earned are kept. ${openCount} unfinished ${openCount === 1 ? 'milestone is' : 'milestones are'} replaced with a fresh set built from your current experience.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Regenerate',
            onPress: () => {
              setTargetsVisible(false);
              navigation.navigate('RegenerateRoadmap');
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Unable to regenerate', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const readiness = useReadiness();
  const focusTasks = useFocusTasks();
  const [scoringVisible, setScoringVisible] = useState(false);
  const [focusPickerVisible, setFocusPickerVisible] = useState(false);
  const [readyByVisible, setReadyByVisible] = useState(false);
  const [addMilestoneVisible, setAddMilestoneVisible] = useState(false);
  const [trimVisible, setTrimVisible] = useState(false);
  const [misfit, setMisfit] = useState<{ neededWeeks: number; availableWeeks: number } | null>(null);

  const roadmap = target?.roadmap ?? NO_TASKS;
  const ordered = useMemo(() => orderRoadmap(roadmap), [roadmap]);
  const sort = target?.milestoneSort ?? 'roadmap';
  // Sorting is a view: the stored order never changes, so dragging is only
  // offered while the list is in that order.
  const visibleTasks = useMemo(() => sortMilestones(ordered.tasks, sort), [ordered.tasks, sort]);
  const canReorder = sort === 'roadmap';
  const now = Date.now();

  // A brand-new roadmap: nothing done, nothing started.
  const neverStarted = ordered.doneCount === 0 && ordered.inProgressId === null;

  const milestones: MilestoneItem[] = visibleTasks.map((task) => {
    const schedule = scheduleLabel(task, now, formatDueDate);
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      meta: taskMetaLine(task, task.id === ordered.upNextId, { neverStarted }),
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

  const overdue = useMemo(() => overdueSummary(roadmap, now), [roadmap, now]);

  /**
   * Dates move on their own, so a refresh re-lays the schedule against today
   * and picks up any CV bullets that were waiting on a connection.
   */
  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const current = useAppStore.getState();
      const active = current.targets.find((entry) => entry.id === current.activeTargetId);
      if (active?.targetDate) {
        current.applySchedule(active.schedulePace ?? 'comfortable');
      }
      await processPendingCvEntries();
    } finally {
      setRefreshing(false);
    }
  }, []);

  // The celebration lands once per target, ever: the stamp is persisted, so
  // reopening the app at 100% is quiet.
  const isReady = ordered.totalCount > 0 && readiness === 100;
  const hasCelebrated = Boolean(target?.readyCelebratedAt);

  useEffect(() => {
    if (!isReady || hasCelebrated) {
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    useAppStore.getState().markReadyCelebrated();
  }, [isReady, hasCelebrated]);

  const moveMilestone = (id: string, offset: -1 | 1): void => {
    useAppStore.getState().reorderTasks(moveId(milestones.map((milestone) => milestone.id), id, offset));
  };

  const renderMilestone = ({ item, getIndex, drag, isActive }: RenderItemParams<MilestoneItem>) => {
    // Indices shift while a drag is in flight, so the rail is derived from the
    // list's live index rather than a captured one.
    const index = getIndex() ?? 0;
    const travelledIndex = ordered.currentId
      ? milestones.findIndex((entry) => entry.id === ordered.currentId)
      : -1;

    return (
      <View style={styles.milestoneRow}>
        <MilestoneRow
          index={index}
          isCurrent={item.id === ordered.currentId}
          isDragging={isActive}
          isFirst={index === 0}
          isLast={index === milestones.length - 1}
          item={item}
          onPress={() => openTask(item.id)}
          {...(canReorder ? { onLongPress: drag } : {})}
          // The screen-reader way to reorder, since a long-press drag is not reachable by swipe.
          {...(canReorder && index > 0 ? { onMoveUp: () => moveMilestone(item.id, -1) } : {})}
          {...(canReorder && index < milestones.length - 1 ? { onMoveDown: () => moveMilestone(item.id, 1) } : {})}
          // Replays the pop for a task completed on the screen above this one.
          pulseKey={completedTaskId === item.id ? completedTaskId : undefined}
          travelledIndex={travelledIndex}
        />
      </View>
    );
  };

  /**
   * The list owns the scroll, so the drag gesture never competes with a
   * parent ScrollView. Everything above the milestones is its header.
   */
  const listHeader = (
    <View style={styles.headerStack}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <SettingsButton onPress={() => navigation.navigate('Settings')} />
          </View>
          <Pressable
            accessibilityHint="Switch, edit or add a target"
            accessibilityLabel={
              target
                ? `${resolveRoleTitle(target.roleId, target.customTitle)}. Manage targets.`
                : 'No target role'
            }
            accessibilityRole="button"
            android_ripple={{ color: headerColors.control }}
            disabled={!target}
            onPress={() => setTargetsVisible(true)}
            style={styles.roleTitleTarget}
          >
            <Text style={styles.roleTitle}>
              {target ? resolveRoleTitle(target.roleId, target.customTitle) : 'No target role'}
            </Text>
            {target ? (
              <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
                <Path
                  d="M6 9.5 L12 15.5 L18 9.5"
                  stroke={headerColors.textSecondary}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </Svg>
            ) : null}
          </Pressable>
          {target ? (
            <View style={styles.headerChips}>
              <CategoryChip category={categoryKeyForRole(target.roleId)} />
              <Chip label={levelLabels[target.level]} onDark />
            </View>
          ) : null}

          {/* The score is the thing being explained, so it is the thing you
              tap — the header no longer needs a separate link. */}
          <Pressable
            accessibilityLabel={`${spokenScore(readiness, target ? SCORE_LABELS[target.level] : 'ready', ordered.doneCount, ordered.totalCount)}. How is this scored?`}
            accessibilityRole="button"
            accessibilityValue={{ min: 0, max: 100, now: readiness }}
            onPress={() => setScoringVisible(true)}
            style={styles.arcTarget}
          >
            <ScoreArc
              label={target ? SCORE_LABELS[target.level] : 'ready'}
              value={readiness}
            />
          </Pressable>

          <Pressable
            accessibilityHint="Opens your journey"
            accessibilityLabel={`${ordered.doneCount} of ${ordered.totalCount} milestones done. See your journey.`}
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => navigation.navigate('Journey')}
            style={[styles.headerCaptionTarget, styles.headerCaptionTargetSpaced]}
          >
            <Text style={styles.headerCaption}>
              {ordered.doneCount} of {ordered.totalCount} milestones done
            </Text>
            <Text style={styles.headerCaptionLink}>See your journey</Text>
          </Pressable>

          {overdue ? (
            <Pressable
              accessibilityHint="Opens the earliest one"
              accessibilityLabel={overdue.label}
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => openTask(overdue.firstId)}
              style={styles.overdueRow}
            >
              <Text style={styles.overdueText}>{overdue.label}</Text>
            </Pressable>
          ) : null}

        </View>

        {isReady && target ? (
          <View style={styles.section}>
            <ReadyCard
              doneCount={ordered.doneCount}
              onExport={() => navigation.navigate('MainTabs', { screen: 'Cv' })}
              roleTitle={resolveRoleTitle(target.roleId, target.customTitle)}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <ReadyByRow
            onPress={() => setReadyByVisible(true)}
            {...(target?.targetDate ? { targetDate: target.targetDate } : {})}
          />
          {target?.targetDate && roadmap.some((task) => task.status !== 'done' && task.targetDate && Date.parse(task.targetDate) > Date.parse(target.targetDate!)) ? (
            <Button label="Schedule runs past your target date — review" onPress={recheckFit} variant="ghost" />
          ) : null}
        </View>

        {ordered.totalCount === 0 ? (
          <View style={styles.section}>
            <EmptyState
              message="Add a milestone below to continue your roadmap."
              title="Nothing to work on"
            />
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <SectionLabel>Working on now</SectionLabel>
                <Text style={styles.focusLimit}>Up to 2 at a time</Text>
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
              <Button label={isCheckInDue(target, now) ? 'Weekly check-in: review your focus' : 'Change current focus'} onPress={() => setFocusPickerVisible(true)} variant="ghost" />
            </View>

            <View style={styles.section}>
              <View style={styles.milestonesLabel}>
                <SectionLabel>Milestones</SectionLabel>
                <Text style={styles.focusLimit}>
                  {canReorder ? 'Hold to reorder' : 'Sorted view'}
                </Text>
              </View>
              <View style={styles.sortRow}>
                {SORT_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    onPress={() => useAppStore.getState().setMilestoneSort(option.value)}
                    selected={sort === option.value}
                  />
                ))}
              </View>
            </View>
          </>
        )}
    </View>
  );

  const listFooter = (
    <View style={styles.footerStack}>
        {target ? (
          <View style={styles.section}>
            <AddMilestoneRow onPress={() => setAddMilestoneVisible(true)} />
          </View>
        ) : null}

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
          </View>
        ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* The header block behind the status bar is always dark. */}
      {isFocused ? <StatusBar style="light" /> : null}
      <TargetSwitcherSheet
        activeTargetId={target?.id ?? null}
        onAddTarget={() => void addTarget()}
        onClose={() => setTargetsVisible(false)}
        onEditTarget={() => {
          setTargetsVisible(false);
          setEditTargetVisible(true);
        }}
        onRegenerate={() => void startRegenerate()}
        targets={targets}
        visible={targetsVisible}
      />

      <EditTargetSheet
        onClose={() => setEditTargetVisible(false)}
        target={target}
        visible={editTargetVisible}
      />

      {/* The list owns the top inset, not the header element inside it — a
          padded child of ListHeaderComponent is not reliably respected. */}
      <DraggableFlatList
        activationDistance={12}
        // The library wraps the list in its own View for the gesture handler.
        // Without flex here that wrapper has no height, so the list viewport
        // is mis-sized and the header gets clipped.
        containerStyle={styles.screen}
        // No bottom inset here: the tab bar already sits on it, and the screen
        // ends where the tab bar begins.
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top }]}
        data={milestones}
        keyExtractor={(item) => item.id}
        ListFooterComponent={listFooter}
        ListHeaderComponent={listHeader}
        onDragBegin={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        onDragEnd={({ data }) => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          useAppStore.getState().reorderTasks(data.map((item) => item.id));
        }}
        refreshControl={
          <RefreshControl
            colors={[theme.colors.accent]}
            onRefresh={() => void onRefresh()}
            refreshing={refreshing}
            tintColor={theme.colors.accent}
          />
        }
        renderItem={renderMilestone}
        style={styles.screen}
      />

      {/* Keeps the status bar sitting on the header's own dark, both at rest
          and once the list scrolls under it. */}
      <View pointerEvents="none" style={[styles.statusBarScrim, { height: insets.top }]} />

      {/* Set by the task screen as it pops, so the arc, the node pop and this
          all land together on the screen the user is looking at. */}
      <ConfirmationBanner
        message={completionNotice}
        onDismiss={() => useAppStore.getState().clearCompletionNotice()}
      />

      <ConfirmationBanner
        action={{ label: 'Undo', onPress: () => useAppStore.getState().undoDelete() }}
        durationMs={UNDO_DURATION_MS}
        message={pendingUndo?.kind === 'task' ? pendingUndo.message : null}
        onDismiss={() => useAppStore.getState().clearPendingUndo()}
      />

      <Sheet onClose={() => setScoringVisible(false)} title="How is this scored?" visible={scoringVisible}>
        <Text style={styles.sheetBody}>
          Your score is the share of your roadmap you&apos;ve completed, weighted by each task&apos;s
          original scoring weight. Changing priority does not change the score.
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

      <AddMilestoneSheet onClose={() => setAddMilestoneVisible(false)} visible={addMilestoneVisible} />

      <ProUpsellSheet
        onClose={() => setUpsellVisible(false)}
        trigger={upsellTrigger}
        visible={upsellVisible}
      />
    </View>
  );
}

function SettingsButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel="Settings"
        accessibilityRole="button"
        android_ripple={{ borderless: true, color: headerColors.control }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.gearButton}
      >
        <Svg fill="none" height={22} viewBox="0 0 24 24" width={22}>
          <Path
            d="M12 15.2 A3.2 3.2 0 1 0 12 8.8 A3.2 3.2 0 1 0 12 15.2 Z"
            stroke={headerColors.text}
            strokeWidth={1.8}
          />
          <Path
            d="M12 2.8 L13.4 5.3 L16.2 4.7 L16.6 7.5 L19.3 8.4 L18 10.9 L19.9 13 L17.6 14.6 L18 17.4 L15.2 17.6 L14 20.2 L11.6 19 L9.2 20.2 L8 17.6 L5.2 17.4 L5.6 14.6 L3.3 13 L5.2 10.9 L3.9 8.4 L6.6 7.5 L7 4.7 L9.8 5.3 Z"
            stroke={headerColors.text}
            strokeLinejoin="round"
            strokeWidth={1.6}
          />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}

interface ReadyCardProps {
  roleTitle: string;
  doneCount: number;
  onExport: () => void;
}

/** Shown only at 100%: the roadmap is finished, so the screen leads with it. */
function ReadyCard({ roleTitle, doneCount, onExport }: ReadyCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Card style={styles.readyCard}>
      <SectionLabel>Interview ready</SectionLabel>
      <Text style={styles.readyTitle}>You&apos;re interview-ready for {roleTitle}</Text>
      <ScoreArc label="of your roadmap done" size={180} value={100} variant="onSurface" />
      <Text style={styles.readyBody}>
        You finished {doneCount} {doneCount === 1 ? 'milestone' : 'milestones'}, and each one wrote
        a CV bullet you can paste straight into an application.
      </Text>
      <Button label="Export my CV bullets" onPress={onExport} />
    </Card>
  );
}

function AddMilestoneRow({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel="Add milestone"
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.addMilestoneRow}
      >
        <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
          <Path
            d="M12 5 V19 M5 12 H19"
            stroke={theme.colors.textPrimary}
            strokeLinecap="round"
            strokeWidth={2}
          />
        </Svg>
        <Text style={styles.addMilestoneLabel}>Add milestone</Text>
      </Pressable>
    </Animated.View>
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
        accessibilityLabel="Pick up to 2 milestones you're working on now"
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.focusRow}
      >
        <StatusNode backgroundColor={theme.colors.surface} status="not_started" />
        <Text style={styles.focusPrompt}>Pick up to 2 milestones you&apos;re working on now</Text>
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
    listContent: {
      backgroundColor: theme.colors.background,
      paddingBottom: spacing.xl,
    },
    statusBarScrim: {
      backgroundColor: headerColors.background,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    headerStack: {
      backgroundColor: theme.colors.background,
      gap: spacing.xl,
      paddingBottom: spacing.md,
    },
    footerStack: {
      gap: spacing.xl,
      paddingTop: spacing.md,
    },
    sortRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    // Sits inside styles.section now, which owns the horizontal padding.
    milestonesLabel: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    milestoneRow: {
      paddingHorizontal: spacing.lg,
    },
    header: {
      alignItems: 'center',
      backgroundColor: headerColors.background,
      // #17191E on a #111214 background is nearly invisible, so in dark mode
      // the block gets a hairline edge to separate it from the page.
      borderBottomWidth: theme.mode === 'dark' ? StyleSheet.hairlineWidth : 0,
      borderColor: theme.colors.border,
      borderBottomLeftRadius: radii.header,
      borderBottomRightRadius: radii.header,
      paddingBottom: spacing.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    headerTop: {
      alignItems: 'center',
      alignSelf: 'stretch',
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    gearButton: {
      alignItems: 'center',
      height: minTouchTarget,
      justifyContent: 'center',
      // Pulls the gear to the block's edge without shrinking its target.
      marginRight: -spacing.sm,
      width: minTouchTarget,
    },
    readyCard: {
      alignItems: 'center',
      gap: spacing.md,
    },
    readyTitle: {
      color: theme.colors.textPrimary,
      fontFamily: typography.title.fontFamily,
      fontSize: typography.title.fontSize,
      fontWeight: typography.title.fontWeight,
      letterSpacing: typography.title.letterSpacing,
      lineHeight: typography.title.lineHeight,
      textAlign: 'center',
    },
    readyBody: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      textAlign: 'center',
    },
    roleTitleTarget: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    roleTitle: {
      color: headerColors.text,
      flexShrink: 1,
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
      marginTop: spacing.sm,
    },
    // The arc is the block's one hero: spacing.xl above, and the caption
    // hugging it below, keep everything else out of its way.
    arcTarget: {
      alignItems: 'center',
      marginTop: spacing.xl,
    },
    overdueRow: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: minTouchTarget,
      paddingHorizontal: spacing.sm,
    },
    headerCaptionTargetSpaced: {
      marginTop: spacing.sm,
    },
    overdueText: {
      // The header block is always dark, so the paper danger would not read.
      color: headerColors.danger,
      fontFamily: typography.linkLabel.fontFamily,
      fontSize: typography.linkLabel.fontSize,
      fontWeight: typography.linkLabel.fontWeight,
      lineHeight: typography.linkLabel.lineHeight,
      textDecorationLine: 'underline',
    },
    headerCaptionTarget: {
      alignItems: 'center',
      gap: 2,
      justifyContent: 'center',
      minHeight: minTouchTarget,
      paddingHorizontal: spacing.sm,
    },
    headerCaptionLink: {
      color: headerColors.text,
      fontFamily: typography.linkLabel.fontFamily,
      fontSize: typography.linkLabel.fontSize,
      fontWeight: typography.linkLabel.fontWeight,
      lineHeight: typography.linkLabel.lineHeight,
      textDecorationLine: 'underline',
    },
    headerCaption: {
      color: headerColors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
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
    addMilestoneRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      marginLeft: spacing.xs,
      minHeight: minTouchTarget,
      paddingVertical: spacing.sm,
    },
    addMilestoneLabel: {
      color: theme.colors.textPrimary,
      fontFamily: typography.label.fontFamily,
      fontSize: typography.body.fontSize,
      fontWeight: '600',
    },
    readyByRow: {
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      // Card radius: this is a surface, not a button.
      borderRadius: radii.lg,
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
    focusLimit: {
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
