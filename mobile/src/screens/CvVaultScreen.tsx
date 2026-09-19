import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/tokens';
import type { CvEntry } from '../types';

interface CvVaultScreenProps {
  entries: readonly CvEntry[];
}

export function CvVaultScreen({ entries }: CvVaultScreenProps) {
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

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 24,
  },
  entry: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  entryText: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 24,
  },
});
