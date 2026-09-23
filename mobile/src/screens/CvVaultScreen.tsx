import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, SectionLabel } from '../components/ui';
import { spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** Placeholder until the real CV vault lands — the tab exists so navigation is complete. */
export function CvVaultScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
      ]}
      style={styles.screen}
    >
      <View style={styles.header}>
        <SectionLabel>Your CV</SectionLabel>
        <Text style={styles.title}>CV vault</Text>
      </View>
      <EmptyState
        message="Your CV bullets will appear here as you finish tasks"
        title="Nothing here yet"
      />
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    content: {
      gap: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    header: {
      gap: spacing.sm,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: typography.title.fontFamily,
      fontSize: typography.title.fontSize,
      fontWeight: typography.title.fontWeight,
      letterSpacing: typography.title.letterSpacing,
      lineHeight: typography.title.lineHeight,
    },
  });
