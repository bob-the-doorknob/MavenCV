import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { radii, spacing, typography, type Theme } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { CvEntry } from '../types';

interface CvVaultScreenProps {
  entries: readonly CvEntry[];
}

export function CvVaultScreen({ entries }: CvVaultScreenProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>CV Vault</Text>
      {entries.length === 0 ? (
        <Text style={styles.empty}>Completed milestones will become reusable CV lines here.</Text>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <Text style={styles.entryText}>{entry.text}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      gap: spacing.md,
      padding: spacing.lg,
    },
    heading: {
      color: theme.colors.textPrimary,
      fontSize: typography.heading.fontSize,
      fontWeight: '700',
    },
    empty: {
      color: theme.colors.textSecondary,
      fontSize: typography.body.fontSize,
      lineHeight: 24,
    },
    entry: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      padding: spacing.md,
    },
    entryText: {
      color: theme.colors.textPrimary,
      fontSize: typography.body.fontSize,
      lineHeight: 24,
    },
  });
