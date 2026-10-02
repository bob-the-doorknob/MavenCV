import { useMemo } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { readRawData, retryLoadingSavedData, startFresh } from '../services/localData';
import { useStorageStatus } from '../store/useAppStore';
import { spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import {
  START_FRESH_NOTE,
  STILL_UNREADABLE,
  loadErrorActions,
  retryLabel,
  showStillUnreadable,
  type LoadAction,
} from '../utils/loadError';
import { BrandSplash } from './BrandSplash';
import { Button } from './ui';

/** Shares the unreadable data exactly as stored, so support (or the user) has it. */
const exportRawData = async (): Promise<void> => {
  try {
    const raw = await readRawData();
    if (raw === null) {
      Alert.alert('Nothing to export', 'There is no saved data on this phone.');
      return;
    }
    await Share.share({ message: raw });
  } catch {
    Alert.alert('Export failed', 'The share sheet could not be opened. Your saved data is untouched.');
  }
};

const confirmStartFresh = (): void => {
  Alert.alert(
    'Start fresh?',
    "Your saved data can't be read. It will be set aside on this phone so support can try to recover it, and the app starts again from the beginning. Export it first if you want your own copy.",
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start fresh',
        style: 'destructive',
        onPress: () => {
          startFresh().catch(() => {
            Alert.alert('Nothing was cleared', "Your saved data couldn't be set aside, so it was left as it is. Try again.");
          });
        },
      },
    ],
  );
};

/**
 * Shown when the saved data could not be loaded. Scrolls, so nothing clips at
 * the largest text size or in Display Zoom. Leads with the action most likely
 * to help: Export for data that cannot be read, Retry for a failure that may pass.
 */
export function LoadErrorScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { error, loadFailure, checking, retried } = useStorageStatus();

  const run = (action: LoadAction): void => {
    if (action === 'retry') void retryLoadingSavedData();
    else if (action === 'export') void exportRawData();
    else confirmStartFresh();
  };

  const label = (action: LoadAction): string =>
    action === 'retry' ? retryLabel(checking) : action === 'export' ? 'Export raw data' : 'Start fresh';

  return (
    <BrandSplash isError message={error ?? ''} scrollable>
      {showStillUnreadable({ retried, checking, error }) ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.still}>
          {STILL_UNREADABLE}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {loadErrorActions(loadFailure).map(({ action, style }) => (
          <View key={action} style={styles.actionBlock}>
            <Button disabled={checking} label={label(action)} onPress={() => run(action)} variant={style} />
            {action === 'startFresh' ? <Text style={styles.note}>{START_FRESH_NOTE}</Text> : null}
          </View>
        ))}
      </View>
    </BrandSplash>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Full width so a label that wraps at a large text size has the whole row to wrap in.
    actions: {
      alignSelf: 'stretch',
      gap: spacing.sm,
    },
    actionBlock: {
      gap: spacing.xs,
    },
    still: {
      color: theme.colors.danger,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.body.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.body.lineHeight,
      textAlign: 'center',
    },
    note: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
      textAlign: 'center',
    },
  });
