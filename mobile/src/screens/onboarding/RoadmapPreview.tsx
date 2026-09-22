import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, ProgressBar } from '../../components/ui';
import { useActiveTarget, useAppStore, useReadiness } from '../../store/useAppStore';
import { spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

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

/**
 * TEMPORARY placeholder — just enough to confirm a generated roadmap landed
 * in the store and the readiness score computes correctly. Replace with the
 * real Roadmap screen. Deliberately unpolished.
 */
export function RoadmapPreview() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const target = useActiveTarget();
  const readiness = useReadiness();

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      style={styles.screen}
    >
      <Text style={styles.readiness}>{readiness}%</Text>
      <ProgressBar value={readiness} />

      {(target?.roadmap ?? []).map((task) => (
        <Card key={task.id} style={styles.taskCard}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          {task.doneWhen ? <Text style={styles.taskDoneWhen}>{task.doneWhen}</Text> : null}
          <View style={styles.dotsRow}>
            {Array.from({ length: task.priority }).map((_, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <View key={index} style={styles.dot} />
            ))}
          </View>
        </Card>
      ))}

      {__DEV__ ? (
        <Pressable
          accessibilityLabel="Reset app data"
          accessibilityRole="button"
          android_ripple={{ color: theme.colors.border }}
          onPress={handleResetPress}
          style={styles.devLinkContainer}
        >
          <Text style={styles.devLink}>Reset app data (dev)</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    content: {
      gap: spacing.lg,
      padding: spacing.lg,
    },
    readiness: {
      color: theme.colors.accent,
      fontFamily: typography.display.fontFamily,
      fontSize: typography.display.fontSize,
      fontWeight: typography.display.fontWeight,
      letterSpacing: typography.display.letterSpacing,
      lineHeight: typography.display.lineHeight,
    },
    taskCard: {
      gap: spacing.xs,
    },
    taskTitle: {
      color: theme.colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      fontWeight: '700',
    },
    taskDoneWhen: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
    dotsRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    dot: {
      backgroundColor: theme.colors.textPrimary,
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    devLinkContainer: {
      alignSelf: 'center',
      marginTop: spacing.lg,
      padding: spacing.sm,
    },
    devLink: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
  });
