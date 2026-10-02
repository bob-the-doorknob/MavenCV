import { useEffect, useMemo } from 'react';
import { Alert, AppState, Share, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BrandSplash } from './src/components/BrandSplash';
import { StorageWriteNotice } from './src/components/StorageWriteNotice';
import { readRawData, startFresh } from './src/services/localData';
import { Button } from './src/components/ui';
import { RootNavigator } from './src/navigation/RootNavigator';
import { configureRevenueCat } from './src/services/revenueCat';
import { loadAccountState } from './src/services/accountState';
import { startSync } from './src/services/sync';
import { useAppStore, useStorageStatus } from './src/store/useAppStore';
import type { Theme } from './src/theme/tokens';
import { useAppFonts } from './src/theme/fonts';
import { useTheme } from './src/theme/useTheme';

// Hold the native splash from the first frame, so nothing paper-blank shows
// before the fonts and the saved roadmap are in.
void SplashScreen.preventAutoHideAsync();

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

export default function App() {
  const theme = useTheme();
  const fontsReady = useAppFonts();
  const { ready: hydrated, error } = useStorageStatus();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const canRender = fontsReady && hydrated;

  useEffect(() => {
    configureRevenueCat();
  }, []);

  // Sync starts only once saved data is loaded: merging into an empty store
  // that has not finished hydrating would look like a fresh device. It never
  // blocks rendering — every request runs in the background.
  useEffect(() => {
    if (!hydrated) {
      return undefined;
    }
    // The linked account decides whether sync may run at all, so it is read
    // first. Until it loads, "linked?" answers no — the safe default.
    let stop: (() => void) | null = null;
    let cancelled = false;
    void loadAccountState().then(() => {
      if (cancelled) return;
      stop = startSync((onActive) => {
        const subscription = AppState.addEventListener('change', (next) => {
          if (next === 'active') onActive();
        });
        return () => subscription.remove();
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [hydrated]);

  // The splash also comes down on a storage failure — that state needs a
  // retry button, which the native splash cannot draw.
  useEffect(() => {
    if (canRender || error) {
      void SplashScreen.hideAsync();
    }
  }, [canRender, error]);

  return (
    // react-native-gesture-handler requires this at the root; the milestone
    // drag on the roadmap does not work without it.
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        {/* Each screen applies its own safe-area insets — this wrapper only sets
            the background so there's no gap around them. */}
        <View style={styles.surface}>
          {/* Screens with a dark header block override this with their own. */}
          <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
          {canRender ? (
            <>
              <RootNavigator />
              <StorageWriteNotice />
            </>
          ) : (
            <BrandSplash
              isError={Boolean(error)}
              message={error ?? 'Loading your saved roadmap'}
            >
              {error ? (
                <>
                  <Button
                    label="Retry loading saved data"
                    onPress={() => void useAppStore.persist.rehydrate()}
                  />
                  <Button label="Export raw data" onPress={() => void exportRawData()} variant="secondary" />
                  <Button label="Start fresh" onPress={confirmStartFresh} variant="ghost" />
                </>
              ) : null}
            </BrandSplash>
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    surface: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
  });
