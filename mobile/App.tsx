import { useEffect } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { SetupScreen } from './src/screens/SetupScreen';
import { configureRevenueCat } from './src/services/revenueCat';
import { colors } from './src/theme/tokens';

export default function App() {
  useEffect(() => {
    configureRevenueCat();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <SetupScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
