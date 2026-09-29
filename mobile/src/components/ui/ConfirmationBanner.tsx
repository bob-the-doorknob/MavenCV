import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';

import { minTouchTarget, radii, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const DEFAULT_DURATION_MS = 2_600;

interface ConfirmationBannerProps {
  /** Null hides the banner. */
  message: string | null;
  onDismiss: () => void;
  /** Adds an action inside the banner, e.g. Undo. */
  action?: { label: string; onPress: () => void } | undefined;
  /** Lifts the banner above a tab bar or action bar. */
  bottomOffset?: number;
  durationMs?: number;
}

/**
 * A short, non-blocking confirmation. It never takes touches, so whatever it
 * covers stays usable while it plays.
 */
export function ConfirmationBanner({
  message,
  onDismiss,
  action,
  bottomOffset = spacing.xxl,
  durationMs = DEFAULT_DURATION_MS,
}: ConfirmationBannerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!message) {
      return undefined;
    }
    const timeout = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timeout);
  }, [durationMs, message, onDismiss]);

  if (!message) {
    return null;
  }

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      // Only the action takes touches; the rest never blocks what is under it.
      pointerEvents={action ? 'box-none' : 'none'}
      style={[styles.banner, { bottom: bottomOffset }]}
      {...(reducedMotion
        ? {}
        : { entering: FadeInDown.duration(220), exiting: FadeOut.duration(180) })}
    >
      <View style={styles.row}>
        <Text style={styles.text}>{message}</Text>
        {action ? (
          <Pressable
            accessibilityLabel={action.label}
            accessibilityRole="button"
            hitSlop={12}
            onPress={action.onPress}
            style={styles.action}
          >
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    banner: {
      alignSelf: 'center',
      backgroundColor: theme.colors.textPrimary,
      borderRadius: radii.pill,
      maxWidth: '92%',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      position: 'absolute',
    },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
    },
    action: {
      justifyContent: 'center',
      minHeight: minTouchTarget - spacing.md,
      paddingHorizontal: spacing.xs,
    },
    actionLabel: {
      // The banner is an ink surface: paper text with an underline, not accent.
      color: theme.colors.background,
      fontFamily: typography.linkLabel.fontFamily,
      fontSize: typography.linkLabel.fontSize,
      fontWeight: typography.linkLabel.fontWeight,
      lineHeight: typography.linkLabel.lineHeight,
      textDecorationLine: 'underline',
    },
    text: {
      color: theme.colors.background,
      flexShrink: 1,
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      fontWeight: '600',
    },
  });
