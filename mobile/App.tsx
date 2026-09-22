import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { ChecklistScreen } from './src/screens/ChecklistScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { configureRevenueCat } from './src/services/revenueCat';
import { useAppStore } from './src/store/useAppStore';
import { colors } from './src/theme/tokens';

export default function App() {
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  const targetRoles = useAppStore((state) => state.targetRoles);
  const activeTargetRoleId = useAppStore((state) => state.activeTargetRoleId);

  useEffect(() => {
    configureRevenueCat();
    const unsubscribe = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, []);

  const activeTargetRole = targetRoles.find((role) => role.id === activeTargetRoleId) ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {!hydrated ? <ActivityIndicator color={colors.primary} /> : activeTargetRole ? (
        <ChecklistScreen targetRole={activeTargetRole} />
      ) : <SetupScreen />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
