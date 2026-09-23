import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';
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
    // directly. No screen wires that up yet.
    return () => {
      unsubscribeHydration?.();
      subscription.remove();
    };
  }, []);

  return (
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
