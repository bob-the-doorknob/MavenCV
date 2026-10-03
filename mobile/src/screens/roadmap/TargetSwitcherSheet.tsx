import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Button, SectionLabel, Sheet } from '../../components/ui';
import { usePressScale } from '../../components/ui/usePressScale';
import { levelLabels, resolveRoleTitle } from '../../data/roles';
import { useAppStore } from '../../store/useAppStore';
import { minTouchTarget, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { calculateReadiness } from '../../utils/readiness';
import type { Target } from '../../types';

interface TargetSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  targets: readonly Target[];
  activeTargetId: string | null;
  onAddTarget: () => void;
  onEditTarget: () => void;
  onRegenerate: () => void;
}

export function TargetSwitcherSheet({
  visible,
  onClose,
  targets,
  activeTargetId,
  onAddTarget,
  onEditTarget,
  onRegenerate,
}: TargetSwitcherSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const active = targets.find((target) => target.id === activeTargetId) ?? null;

  const select = (targetId: string): void => {
    useAppStore.getState().setActiveTarget(targetId);
    onClose();
  };

  const confirmDelete = (): void => {
    if (!active) {
      return;
    }
    const isLast = targets.length === 1;
    Alert.alert(
      'Delete this target?',
      isLast
        ? `This deletes ${resolveRoleTitle(active.roleId, active.customTitle)}, its roadmap and its CV bullets. You'll start again from setup.`
        : `This deletes ${resolveRoleTitle(active.roleId, active.customTitle)}, its roadmap and its CV bullets. Your other targets are untouched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Removing the last target empties the store, and the navigator
            // sends the user back to onboarding on its own.
            useAppStore.getState().removeTarget(active.id);
            onClose();
          },
        },
      ],
    );
  };

  return (
    <Sheet onClose={onClose} scrollable={false} title="Your targets" visible={visible}>
      <ScrollView contentContainerStyle={styles.list} style={styles.scroll}>
        {targets.map((target) => (
          <TargetRow
            key={target.id}
            isActive={target.id === activeTargetId}
            onPress={() => select(target.id)}
            target={target}
          />
        ))}

        <View style={styles.actions}>
          <SectionLabel>This target</SectionLabel>
          <Button disabled={!active} label="Edit level, company or experience" onPress={onEditTarget} variant="secondary" />
          <Button disabled={!active} label="Regenerate roadmap" onPress={onRegenerate} variant="secondary" />
          <Button disabled={!active} label="Delete target" onPress={confirmDelete} variant="ghost" />
        </View>

        <View style={styles.actions}>
          <SectionLabel>More</SectionLabel>
          <Button label="Add a target" onPress={onAddTarget} />
        </View>
      </ScrollView>
    </Sheet>
  );
}

function TargetRow({
  target,
  isActive,
  onPress,
}: {
  target: Target;
  isActive: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const press = usePressScale();
  const readiness = calculateReadiness(target.roadmap);
  const title = resolveRoleTitle(target.roleId, target.customTitle);

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityLabel={`${title}. ${levelLabels[target.level]}. ${readiness} percent ready.`}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        android_ripple={{ color: theme.colors.border }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.row, isActive && styles.rowActive]}
      >
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowMeta}>
            {levelLabels[target.level]} · {readiness}% ready
          </Text>
        </View>
        {isActive ? (
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
    scroll: { maxHeight: 420 },
    list: {
      gap: spacing.sm,
    },
    actions: {
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    row: {
      alignItems: 'center',
      borderColor: theme.colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: minTouchTarget + 12,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    rowActive: {
      borderColor: theme.colors.textPrimary,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: theme.colors.textPrimary,
      fontFamily: typography.rowTitle.fontFamily,
      fontSize: typography.rowTitle.fontSize,
      fontWeight: typography.rowTitle.fontWeight,
      lineHeight: typography.rowTitle.lineHeight,
    },
    rowMeta: {
      color: theme.colors.textSecondary,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
  });
