import { useEffect, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from './src/navigation/RootNavigator';
import { configureRevenueCat } from './src/services/revenueCat';
import { useAppStore, useStorageStatus } from './src/store/useAppStore';
import { Button } from './src/components/ui';
import { spacing, typography, type Theme } from './src/theme/tokens';
import { useAppFonts } from './src/theme/fonts';
import { useTheme } from './src/theme/useTheme';

export default function App() {
  const theme = useTheme();
  const fontsReady = useAppFonts();
  const { ready: hydrated, error } = useStorageStatus();
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    configureRevenueCat();
  }, []);

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
          {/* Nothing renders until the fonts are in — typography is the loudest
              part of this design and swapping it in late looks broken. */}
          {fontsReady && hydrated ? <RootNavigator /> : <View style={styles.loading}>
            <Text accessibilityRole={error ? 'alert' : 'text'} style={styles.message}>{error ?? 'Loading saved roadmap…'}</Text>
            {error ? <Button label="Retry loading saved data" onPress={() => void useAppStore.persist.rehydrate()} /> : null}
          </View>}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  surface: { flex: 1, backgroundColor: theme.colors.background },
  loading: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  message: { ...typography.body, color: theme.colors.textPrimary },
  container: {
    flex: 1,
  },
});
