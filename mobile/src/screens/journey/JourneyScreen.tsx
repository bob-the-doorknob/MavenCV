import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Card, EmptyState, SectionLabel, StatusNode } from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useActiveTarget, useAppStore } from '../../store/useAppStore';
import { minTouchTarget, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { buildJourney, journeySummary, type JourneyEntry } from '../../utils/journey';
import { formatDueDate, formatMonthYear } from '../../utils/targetDate';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * A record, not a workspace: everything here is read-only. Tapping an entry
 * goes to the milestone itself, which is where editing belongs.
 */
export function JourneyScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const target = useActiveTarget();
  const cvEntries = useAppStore((state) => state.cvEntries);

  const journey = useMemo(
    () => (target ? buildJourney(target, cvEntries) : []),
    [target, cvEntries],
  );
  const summary = useMemo(
    () => (target ? journeySummary(target, cvEntries) : null),
    [target, cvEntries],
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.topBarTitle}>Your journey</Text>
        {/* Balances the back button so the title stays centred. */}
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {summary ? (
          <Card>
            <View style={styles.summaryRow}>
              <SummaryStat label="Milestones" value={`${summary.milestonesCompleted}`} />
              <SummaryStat label="CV bullets" value={`${summary.bulletsWritten}`} />
              <SummaryStat label="Weeks active" value={`${summary.weeksActive}`} />
              <SummaryStat label="Ready" value={`${summary.readiness}%`} />
            </View>
          </Card>
        ) : null}

        {journey.length === 0 ? (
          <EmptyState
            message="Finish a milestone and it will appear here, with the notes you wrote and the CV bullet it produced."
            title="Nothing finished yet"
          />
        ) : (
          journey.map((month) => (
            <View key={month.key} style={styles.month}>
              <SectionLabel>{formatMonthYear(`${month.key}-01T00:00:00.000Z`)}</SectionLabel>
              {month.entries.map((entry) => (
                <JourneyCard
                  key={entry.taskId}
                  entry={entry}
                  onPress={() => navigation.navigate('TaskDetail', { taskId: entry.taskId })}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function JourneyCard({ entry, onPress }: { entry: JourneyEntry; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityHint="Opens this milestone"
        accessibilityLabel={`${entry.title}. Completed ${formatDueDate(entry.completedAt)}.`}
        accessibilityRole="button"
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Card>
          <View style={styles.cardHead}>
            <StatusNode backgroundColor={theme.colors.surface} haptics={false} size={18} status="done" />
            <Text style={styles.date}>{formatDueDate(entry.completedAt)}</Text>
          </View>

          <Text style={styles.title}>{entry.title}</Text>

          {entry.notes ? <Text style={styles.notes}>{entry.notes}</Text> : null}

          {entry.bullet ? (
            <View style={styles.bulletBlock}>
              <SectionLabel>CV bullet</SectionLabel>
              <Text style={styles.bullet}>{entry.bullet}</Text>
            </View>
          ) : entry.bulletPending ? (
            <Text style={styles.pending}>Writing your CV bullet…</Text>
          ) : null}
        </Card>
      </Pressable>
    </Animated.View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        android_ripple={{ borderless: true, color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.iconButton}
      >
        <Svg fill="none" height={24} viewBox="0 0 24 24" width={24}>
          <Path
            d="M15 5 L8 12 L15 19"
            stroke={theme.colors.textPrimary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
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
    topBarSpacer: {
      width: minTouchTarget,
    },
    iconButton: {
      alignItems: 'center',
      height: minTouchTarget,
      justifyContent: 'center',
      width: minTouchTarget,
    },
    content: {
      gap: spacing.xl,
      padding: spacing.lg,
    },
    summaryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.lg,
      justifyContent: 'space-between',
    },
    stat: {
      gap: 2,
      minWidth: 64,
    },
    statValue: {
      color: theme.colors.textPrimary,
      fontFamily: typography.title.fontFamily,
      fontSize: typography.heading.fontSize,
      fontWeight: typography.heading.fontWeight,
      letterSpacing: typography.heading.letterSpacing,
      lineHeight: typography.heading.lineHeight,
    },
    statLabel: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    month: {
      gap: spacing.md,
    },
    cardHead: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    date: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
    notes: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      marginTop: spacing.sm,
    },
    bulletBlock: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: 1,
      gap: spacing.xs,
      marginTop: spacing.md,
      paddingTop: spacing.md,
    },
    bullet: {
      color: theme.colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    pending: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      marginTop: spacing.md,
    },
  });
