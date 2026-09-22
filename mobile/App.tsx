import { useEffect } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// TEMPORARY: showing the design-system review harness instead of SetupScreen.
// Swap back to SetupScreen once the gallery has been reviewed.
import { UiGalleryScreen } from './src/screens/UiGalleryScreen';
import { configureRevenueCat } from './src/services/revenueCat';
import { useTheme } from './src/theme/useTheme';

export default function App() {
  const theme = useTheme();

  useEffect(() => {
    configureRevenueCat();
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
