import { useEffect } from 'react';
import { AppState, SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// TEMPORARY: showing the design-system review harness instead of SetupScreen.
// Swap back to SetupScreen once the gallery has been reviewed.
import { UiGalleryScreen } from './src/screens/UiGalleryScreen';
import { processPendingCvEntries } from './src/services/cvQueue';
import { configureRevenueCat } from './src/services/revenueCat';
import { useAppStore } from './src/store/useAppStore';
import { useTheme } from './src/theme/useTheme';

export default function App() {
  const theme = useTheme();

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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <UiGalleryScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
