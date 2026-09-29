import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Clipboard comes from react-native core: expo-clipboard isn't installed and
// adding a dependency needs approval. Core's shim is deprecated but works.
import {
  Alert,
  Clipboard,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Button, Card, ConfirmationBanner, EmptyState, Sheet, ShimmerBar, StatusNode } from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import { levelLabels, resolveRoleTitle } from '../../data/roles';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { repairLegacyMockCvEntries, retryCvEntry, processPendingCvEntries, setCvQueueActive, useCvQueueStatus } from '../../services/cvQueue';
import { useProStatus } from '../../services/useProStatus';
import { useActiveTarget, useAppStore } from '../../store/useAppStore';
import { minTouchTarget, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { formatBulletsForCopy, needsNumber, splitOnPlaceholder } from '../../utils/cvBullets';
import type { CvEntry, RoadmapTask } from '../../types';
import { AddNumberSheet } from './AddNumberSheet';
import { EditBulletSheet } from './EditBulletSheet';
import { ProUpsellSheet } from './ProUpsellSheet';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const BANNER_DURATION_MS = 2_500;
/** Long enough to notice and reach, short enough not to linger. */
const UNDO_DURATION_MS = 6_000;

export function CvVaultScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const target = useActiveTarget();
  const allEntries = useAppStore((state) => state.cvEntries);
  const { isPro } = useProStatus();
  const queueMessage = useCvQueueStatus((state) => state.message);
  const pendingUndo = useAppStore((state) => state.pendingUndo);
  useFocusEffect(useCallback(() => {
    setCvQueueActive(true);
    repairLegacyMockCvEntries();
    void processPendingCvEntries();
    return () => setCvQueueActive(false);
  }, []));

  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<CvEntry | null>(null);
  const [numberEntry, setNumberEntry] = useState<CvEntry | null>(null);
  const [upsellVisible, setUpsellVisible] = useState(false);
  const [menuEntry, setMenuEntry] = useState<CvEntry | null>(null);
  const bannerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (bannerTimeout.current) {
        clearTimeout(bannerTimeout.current);
      }
    },
    [],
  );

  const entries = useMemo(
    () =>
      allEntries
        .filter((entry) => entry.targetId === target?.id)
        .slice()
        .reverse(),
    [allEntries, target?.id],
  );

  const readyCount = entries.filter((entry) => entry.status === 'ready' && !needsNumber(entry.text)).length;

  const showBanner = useCallback((message: string) => {
    setBanner(message);
    if (bannerTimeout.current) {
      clearTimeout(bannerTimeout.current);
    }
    bannerTimeout.current = setTimeout(() => setBanner(null), BANNER_DURATION_MS);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await processPendingCvEntries();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const copyOne = (text: string): void => {
    Clipboard.setString(text);
    showBanner('Copied to clipboard');
  };

  const copyAll = (): void => {
    if (!isPro) {
      setUpsellVisible(true);
      return;
    }
    const text = formatBulletsForCopy(entries);
    if (!text) {
      showBanner('No finished bullets yet');
      return;
    }
    Clipboard.setString(text);
    showBanner(`Copied ${readyCount} bullets`);
  };

  /** The OS share sheet — email, notes, messages, whatever they use. */
  const shareOne = async (text: string): Promise<void> => {
    try {
      await Share.share({ message: text });
    } catch {
      showBanner('Could not open the share sheet');
    }
  };

  const shareAll = async (): Promise<void> => {
    if (!isPro) {
      setUpsellVisible(true);
      return;
    }
    const text = formatBulletsForCopy(entries);
    if (!text) {
      showBanner('No finished bullets yet');
      return;
    }
    try {
      await Share.share({ message: text });
    } catch {
      showBanner('Could not open the share sheet');
    }
  };

  const confirmDelete = (entry: CvEntry): void => {
    Alert.alert('Delete this bullet?', 'You can undo this for a few seconds.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => useAppStore.getState().deleteCvEntry(entry.id),
      },
    ]);
  };

  const taskFor = (taskId: string): RoadmapTask | undefined =>
    target?.roadmap.find((task) => task.id === taskId);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl
            colors={[theme.colors.accent]}
            onRefresh={() => void onRefresh()}
            refreshing={refreshing}
            tintColor={theme.colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>CV bullets</Text>
            <Text style={styles.subtitle}>
              {target ? resolveRoleTitle(target.roleId, target.customTitle) : 'No role'} ·{' '}
              {target ? levelLabels[target.level] : '—'} · {entries.length}{' '}
              {entries.length === 1 ? 'bullet' : 'bullets'}
            </Text>
          </View>
          {/* One finished bullet is already worth exporting. */}
          {readyCount > 0 ? (
            <View style={styles.headerActions}>
              <CopyAllButton onPress={copyAll} />
              <Button
                label="Share all"
                onPress={() => void shareAll()}
                style={styles.exportButton}
                variant="secondary"
              />
            </View>
          ) : null}
        </View>

        {queueMessage ? <Text accessibilityRole="alert" style={styles.subtitle}>{queueMessage}</Text> : null}
        {entries.length === 0 ? (
          <EmptyState
            message="Finish a milestone and Maven writes your first CV bullet here."
            title="No bullets yet"
          />
        ) : (
          entries.map((entry) => (
            <BulletCard
              key={entry.id}
              entry={entry}
              onAddNumber={() => setNumberEntry(entry)}
              onCopy={() => copyOne(entry.text)}
              onOpenTask={() => navigation.navigate('TaskDetail', { taskId: entry.taskId })}
              onMore={() => setMenuEntry(entry)}
              onRetry={() => retryCvEntry(entry.id)}
              taskTitle={taskFor(entry.taskId)?.title ?? 'a deleted milestone'}
            />
          ))
        )}

        <View style={styles.footer}>
          <Svg fill="none" height={14} viewBox="0 0 24 24" width={14}>
            <Path
              d="M12 3 L19 6 V12 C19 16.4 15.9 19.8 12 21 C8.1 19.8 5 16.4 5 12 V6 Z"
              stroke={theme.colors.textMuted}
              strokeLinejoin="round"
              strokeWidth={1.8}
            />
          </Svg>
          <Text style={styles.footerText}>
            Review each bullet before sharing. Numbers only come from you.
          </Text>
        </View>
        <PrivacyRow onPress={() => navigation.navigate('Settings')} />
      </ScrollView>

      {banner ? (
        <View style={[styles.banner, { bottom: insets.bottom + spacing.xl }]}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      ) : null}

      <ConfirmationBanner
        action={{ label: 'Undo', onPress: () => useAppStore.getState().undoDelete() }}
        bottomOffset={insets.bottom + spacing.xxl}
        durationMs={UNDO_DURATION_MS}
        message={pendingUndo?.kind === 'cvEntry' ? pendingUndo.message : null}
        onDismiss={() => useAppStore.getState().clearPendingUndo()}
      />

      <Sheet onClose={() => setMenuEntry(null)} title="Bullet actions" visible={menuEntry !== null}>
        <Button
          label="Share"
          onPress={() => {
            const entry = menuEntry;
            setMenuEntry(null);
            if (entry) void shareOne(entry.text);
          }}
          variant="secondary"
        />
        <Button
          label="Edit"
          onPress={() => {
            setEditEntry(menuEntry);
            setMenuEntry(null);
          }}
          variant="secondary"
        />
        <Button
          label="Delete"
          onPress={() => {
            const entry = menuEntry;
            setMenuEntry(null);
            if (entry) confirmDelete(entry);
          }}
          variant="danger"
        />
      </Sheet>

      <EditBulletSheet entry={editEntry} onClose={() => setEditEntry(null)} visible={editEntry !== null} />
      <AddNumberSheet
        entry={numberEntry}
        onClose={() => setNumberEntry(null)}
        visible={numberEntry !== null}
      />
      <ProUpsellSheet onClose={() => setUpsellVisible(false)} visible={upsellVisible} />
    </View>
  );
}

function CopyAllButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={[press.style, styles.exportButton]}>
      <Pressable
        accessibilityLabel="Copy all bullets. Pro feature."
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.copyAll}
      >
        <Text style={styles.copyAllLabel}>Copy all</Text>
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeLabel}>PRO</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

interface BulletCardProps {
  entry: CvEntry;
  taskTitle: string;
  onOpenTask: () => void;
  onCopy: () => void;
  onAddNumber: () => void;
  onRetry: () => void;
  onMore: () => void;
}

function BulletCard({
  entry,
  taskTitle,
  onOpenTask,
  onCopy,
  onAddNumber,
  onRetry,
  onMore,
}: BulletCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const wantsNumber = entry.status === 'ready' && needsNumber(entry.text);

  return (
    <Card style={wantsNumber ? styles.cardNeedsNumber : undefined}>
      <TaskLabelRow onPress={onOpenTask} title={taskTitle} />

      {entry.status === 'pending' ? (
        <View style={styles.pending}>
          <ShimmerBar width="100%" />
          <ShimmerBar delayMs={120} width="92%" />
          <ShimmerBar delayMs={240} width="64%" />
          <Text style={styles.pendingLabel}>CV bullet queued. Pull to retry if generation pauses.</Text>
        </View>
      ) : entry.status === 'failed' ? (
        <View style={styles.block}>
          <Text style={styles.bulletText}>Couldn&apos;t write this one</Text>
          <View style={styles.actionRow}>
            <Button label="Retry" onPress={onRetry} style={styles.actionButton} />
            <MoreButton onPress={onMore} />
          </View>
        </View>
      ) : (
        <View style={styles.block}>
          {wantsNumber ? (
            <View style={styles.needsChip}>
              <Text style={styles.needsChipLabel}>Needs a number</Text>
            </View>
          ) : null}

          <Text style={styles.bulletText}>
            {splitOnPlaceholder(entry.text).map((segment, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <Text key={index} style={segment.isPlaceholder ? styles.placeholder : undefined}>
                {segment.text}
              </Text>
            ))}
          </Text>

          {entry.suggestions?.length ? (
            <Text style={styles.suggestion}>{entry.suggestions[0]}</Text>
          ) : null}

          {/* One filled action; everything else lives behind the dots. */}
          <View style={styles.actionRow}>
            {wantsNumber ? (
              <Button label="Add number" onPress={onAddNumber} style={styles.actionButton} />
            ) : (
              <Button label="Copy" onPress={onCopy} style={styles.actionButton} />
            )}
            <MoreButton onPress={onMore} />
          </View>
        </View>
      )}
    </Card>
  );
}

/** A quiet way through to the controls, which now live in Settings. */
function PrivacyRow({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityHint="Opens Settings"
        accessibilityLabel="Privacy and AI"
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.privacyRow}
      >
        <Text style={styles.privacyLabel}>Privacy & AI</Text>
        <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
          <Path
            d="M9 5 L16 12 L9 19"
            stroke={theme.colors.textMuted}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}

/** Three dots: everything that is not the card's one primary action. */
function MoreButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel="More actions for this bullet"
        accessibilityRole="button"
        android_ripple={{ borderless: true, color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.moreButton}
      >
        <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
          <Path
            d="M12 5.5 V5.6 M12 12 V12.1 M12 18.4 V18.5"
            stroke={theme.colors.textSecondary}
            strokeLinecap="round"
            strokeWidth={3}
          />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}

function TaskLabelRow({ title, onPress }: { title: string; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={`From ${title}. Open milestone.`}
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.taskRow}
      >
        <StatusNode backgroundColor={theme.colors.surface} size={16} status="done" />
        <Text numberOfLines={1} style={styles.taskLabel}>
          From: {title}
        </Text>
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
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    header: {
      alignItems: 'flex-start',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    headerActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    exportButton: { flex: 1 },
    headerCopy: {
      gap: spacing.xs,
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
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    copyAll: {
      alignItems: 'center',
      backgroundColor: theme.colors.primaryButton,
      borderRadius: radii.md,
      flex: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'center',
      minHeight: minTouchTarget + 6,
      paddingHorizontal: spacing.md,
    },
    copyAllLabel: {
      color: theme.colors.onPrimaryButton,
      fontFamily: typography.label.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    proBadge: {
      backgroundColor: theme.colors.onPrimaryButton,
      borderRadius: radii.pill,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    proBadgeLabel: {
      color: theme.colors.primaryButton,
      fontFamily: typography.sectionLabel.fontFamily,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.6,
    },
    cardNeedsNumber: {
      backgroundColor: theme.colors.accentMuted,
      borderColor: theme.colors.accent,
    },
    privacyRow: {
      alignItems: 'center',
      borderColor: theme.colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: minTouchTarget,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    privacyLabel: {
      color: theme.colors.textSecondary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    moreButton: {
      alignItems: 'center',
      height: minTouchTarget,
      justifyContent: 'center',
      width: minTouchTarget,
    },
    taskRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      // It navigates to the milestone, so it gets a full tap target.
      minHeight: minTouchTarget,
    },
    taskLabel: {
      color: theme.colors.textMuted,
      flex: 1,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    block: {
      gap: spacing.md,
      marginTop: spacing.md,
    },
    bulletText: {
      color: theme.colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    placeholder: {
      color: theme.colors.accentText,
      fontFamily: typography.rowTitle.fontFamily,
      fontWeight: '600',
    },
    needsChip: {
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.surface,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    needsChipLabel: {
      color: theme.colors.accentText,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
    suggestion: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    actionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    actionButton: { flex: 1 },
    pending: {
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    pendingLabel: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      marginTop: spacing.xs,
    },
    footer: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    footerText: {
      color: theme.colors.textMuted,
      flex: 1,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
    banner: {
      alignSelf: 'center',
      backgroundColor: theme.colors.textPrimary,
      borderRadius: radii.pill,
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
  });
