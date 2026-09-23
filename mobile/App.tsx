import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from './src/navigation/RootNavigator';
import { getAuthToken } from './src/services/auth';
import { processPendingCvEntries } from './src/services/cvQueue';
import { configureRevenueCat } from './src/services/revenueCat';
import { useAppStore } from './src/store/useAppStore';
import { useAppFonts } from './src/theme/fonts';
import { useTheme } from './src/theme/useTheme';

export default function App() {
  const theme = useTheme();
  const fontsReady = useAppFonts();

  useEffect(() => {
    configureRevenueCat();

    // Anonymous sign-in first: every backend call needs the token, and the CV
    // queue below is the first thing that makes one. Fire-and-forget — the
    // token is cached, and a failure surfaces later as an auth ApiError.
    void getAuthToken();

    // Trigger 1: app start, but only once the persisted store has actually
    // rehydrated — otherwise we'd process against an empty, not-yet-loaded
    // cvEntries list.
    let unsubscribeHydration: (() => void) | undefined;
    if (useAppStore.persist.hasHydrated()) {
      void processPendingCvEntries();
    } else {
      unsubscribeHydration = useAppStore.persist.onFinishHydration(() => {
        void processPendingCvEntries();
      });
    }

    // Trigger 2: returning to the foreground.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void processPendingCvEntries();
      }
    });

    // Trigger 3 (after completeTask) lives in services/tasks.ts's
    // completeTaskAndQueue — screens call that instead of completeTask
    // directly.
    return () => {
      unsubscribeHydration?.();
      subscription.remove();
    };
  }, []);

  return (
    // react-native-gesture-handler requires this at the root; the milestone
    // drag on the roadmap does not work without it.
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        {/* Each screen applies its own safe-area insets — this wrapper only sets
            the background so there's no gap around them. */}
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          {/* Screens with a dark header block override this with their own. */}
          <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
          {/* Nothing renders until the fonts are in — typography is the loudest
              part of this design and swapping it in late looks broken. */}
          {fontsReady ? <RootNavigator /> : null}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
