import { useMemo } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { currentDataAsText, retryWrite } from '../services/localData';
import { useStorageStatus } from '../store/useAppStore';
import { radii, spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Button } from './ui';

/**
 * Shown over the app when a save to this phone failed (disk full, say). It
 * does not block anything: the app keeps working from memory, and the notice
 * explains that a force-quit now would lose recent changes, with a way to
 * retry the save or get the data out. It disappears on the next good save.
 */
export function StorageWriteNotice() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const writeFailed = useStorageStatus((state) => state.writeFailed);

  if (!writeFailed) return null;

  const exportData = async (): Promise<void> => {
    try {
      await Share.share({ message: currentDataAsText() });
    } catch {
      // The share sheet failing leaves the notice up; retry is still there.
    }
  };

  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <View style={styles.card}>
        <Text style={styles.title}>Changes aren&apos;t being saved</Text>
        <Text style={styles.body}>
          This phone couldn&apos;t save your latest changes, possibly because storage is full. Keep the app open, free up
          space, then retry. Closing the app now would lose them.
        </Text>
        <View style={styles.actions}>
          <Button label="Retry save" onPress={retryWrite} style={styles.action} variant="secondary" />
          <Button label="Export" onPress={() => void exportData()} style={styles.action} variant="ghost" />
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      left: spacing.lg,
      position: 'absolute',
      right: spacing.lg,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.danger,
      borderRadius: radii.lg,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.lg,
    },
    title: {
      color: theme.colors.danger,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
    body: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    action: {
      flex: 1,
    },
  });
