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
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Button, SectionLabel, TextField } from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import { CUSTOM_ROLE_ID, rolePresets, type RoleCategory, type RolePreset } from '../../data/roles';
import { categoryTints, fontFamily, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { categoryKeyForRole } from '../../utils/roleCategory';

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
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerBlock}>
            <Text style={styles.title}>What role are you aiming for?</Text>
            <Text style={styles.subtitle}>
              Pick the closest one. You can change it later — it only sets the starting roadmap.
            </Text>
          </View>

          {GROUPED_ROLES.map(([category, presets]) => (
            <View key={category} style={styles.group}>
              <SectionLabel>{category}</SectionLabel>
              <View style={styles.list}>
                {presets.map((preset, index) => (
                  <RoleRow
                    key={preset.id}
                    description={preset.description}
                    isFirst={index === 0}
                    onPress={() => onSelectRole(preset.id)}
                    roleId={preset.id}
                    selected={selectedRoleId === preset.id}
                    title={preset.title}
                  />
                ))}
              </View>
            </View>
          ))}

          <View style={styles.group}>
            <SectionLabel>Other</SectionLabel>
            <View style={styles.list}>
              <RoleRow
                description="Enter a role we don't have yet."
                isFirst
                onPress={() => onSelectRole(CUSTOM_ROLE_ID)}
                roleId={CUSTOM_ROLE_ID}
                selected={selectedRoleId === CUSTOM_ROLE_ID}
                title="Custom role"
              />
            </View>
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
          <Text style={styles.stepMeta}>Step 1 of 3</Text>
          <Button label="Continue" onPress={onContinue} disabled={!canContinue} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

interface RoleRowProps {
  roleId: string;
  title: string;
  description: string;
  selected: boolean;
  isFirst: boolean;
  onPress: () => void;
}

function RoleRow({ roleId, title, description, selected, isFirst, onPress }: RoleRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();
  const tint = categoryTints[theme.mode][categoryKeyForRole(roleId)];

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={`${title}. ${description}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.row, !isFirst && styles.rowDivided, selected && styles.rowSelected]}
      >
        <View style={[styles.tintBar, { backgroundColor: tint.text }]} />
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, selected && styles.rowTitleSelected]}>{title}</Text>
          <Text style={styles.rowDescription}>{description}</Text>
        </View>
        {selected ? (
          <Svg fill="none" height={18} viewBox="0 0 24 24" width={18}>
            <Path
              d="M4 12.5 L9.5 18 L20 6.5"
              stroke={theme.colors.textPrimary}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
            />
          </Svg>
        ) : null}
      </Pressable>
    </Animated.View>
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
    headerBlock: {
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
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: typography.body.fontFamily,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    group: {
      gap: spacing.sm,
    },
    list: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      overflow: 'hidden',
    },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 64,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    rowDivided: {
      borderTopColor: theme.colors.divider,
      borderTopWidth: 1,
    },
    // Selection gains weight: an ink edge and a heavier title. The paddingLeft
    // absorbs the border so the row's content does not shift on select.
    rowSelected: {
      borderLeftColor: theme.colors.textPrimary,
      borderLeftWidth: 2,
      paddingLeft: spacing.md - 2,
    },
    tintBar: {
      borderRadius: radii.pill,
      height: 28,
      width: 4,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: theme.colors.textPrimary,
      fontFamily: fontFamily.bodyMedium,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: '500',
      lineHeight: typography.rowTitle.lineHeight,
    },
    rowTitleSelected: {
      fontFamily: typography.rowTitle.fontFamily,
      fontWeight: typography.rowTitle.fontWeight,
    },
    rowDescription: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    // The step count is wayfinding, not a section label: it sits with the
    // control that advances it (DESIGN.md §3).
    stepMeta: {
      color: theme.colors.textMuted,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    footer: {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: spacing.sm,
      padding: spacing.lg,
    },
  });
