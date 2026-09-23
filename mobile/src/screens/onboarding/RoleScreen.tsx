import { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextField } from '../../components/ui';
import { CUSTOM_ROLE_ID, rolePresets, type RoleCategory, type RolePreset } from '../../data/roles';
import { radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const MAX_CUSTOM_TITLE_LENGTH = 60;

interface RoleScreenProps {
  selectedRoleId: string | null;
  customTitle: string;
  onSelectRole: (roleId: string) => void;
  onCustomTitleChange: (text: string) => void;
  canContinue: boolean;
  onContinue: () => void;
}

const groupByCategory = (presets: readonly RolePreset[]): Array<[RoleCategory, RolePreset[]]> => {
  const groups = new Map<RoleCategory, RolePreset[]>();
  for (const preset of presets) {
    const list = groups.get(preset.category) ?? [];
    list.push(preset);
    groups.set(preset.category, list);
  }
  return Array.from(groups.entries());
};

const GROUPED_ROLES = groupByCategory(rolePresets);

export function RoleScreen({
  selectedRoleId,
  customTitle,
  onSelectRole,
  onCustomTitleChange,
  canContinue,
  onContinue,
}: RoleScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
      style={styles.flex}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom }]}>
          <Text style={styles.title}>What role are you aiming for?</Text>

          {GROUPED_ROLES.map(([category, presets]) => (
            <View key={category} style={styles.group}>
              <Text style={styles.categoryHeading}>{category}</Text>
              {presets.map((preset) => {
                const selected = selectedRoleId === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    accessibilityLabel={`${preset.title}. ${preset.description}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    android_ripple={{ color: theme.colors.border }}
                    onPress={() => onSelectRole(preset.id)}
                    style={[styles.card, selected && styles.cardSelected]}
                  >
                    <Text style={styles.cardTitle}>{preset.title}</Text>
                    <Text style={styles.cardDescription}>{preset.description}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={styles.group}>
            <Text style={styles.categoryHeading}>Other</Text>
            <Pressable
              accessibilityLabel="Custom role. Enter a role we don't have yet."
              accessibilityRole="button"
              accessibilityState={{ selected: selectedRoleId === CUSTOM_ROLE_ID }}
              android_ripple={{ color: theme.colors.border }}
              onPress={() => onSelectRole(CUSTOM_ROLE_ID)}
              style={[styles.card, selectedRoleId === CUSTOM_ROLE_ID && styles.cardSelected]}
            >
              <Text style={styles.cardTitle}>Custom role</Text>
              <Text style={styles.cardDescription}>Enter a role we don&apos;t have yet.</Text>
            </Pressable>
            {selectedRoleId === CUSTOM_ROLE_ID ? (
              <TextField
                accessibilityLabel="Custom role title"
                maxLength={MAX_CUSTOM_TITLE_LENGTH}
                onChangeText={onCustomTitleChange}
                placeholder="e.g. Robotics Engineer"
                value={customTitle}
              />
            ) : null}
          </View>

        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
          <Button label="Continue" onPress={onContinue} disabled={!canContinue} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    screen: {
      backgroundColor: theme.colors.background,
      flex: 1,
    },
    content: {
      gap: spacing.xl,
      padding: spacing.lg,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: typography.title.fontFamily,
      fontSize: typography.title.fontSize,
      fontWeight: typography.title.fontWeight,
      letterSpacing: typography.title.letterSpacing,
      lineHeight: typography.title.lineHeight,
    },
    group: {
      gap: spacing.sm,
    },
    categoryHeading: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.md,
    },
    cardSelected: {
      borderColor: theme.colors.textPrimary,
      borderWidth: 2,
    },
    cardTitle: {
      color: theme.colors.textPrimary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      fontWeight: '700',
    },
    cardDescription: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
    },
    footer: {
      borderTopColor: theme.colors.border,
      borderTopWidth: 1,
      padding: spacing.lg,
    },
  });
