import { useEffect, useMemo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

interface ProgressBarProps {
  /** 0-100. Out-of-range values are clamped. */
  value: number;
  height?: number;
  /** Track color override, e.g. inside the dark header block. */
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({ value, height = 10, trackColor, style }: ProgressBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, value));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.value = reducedMotion
      ? clamped
      : withTiming(clamped, { duration: motion.progressDuration });
  }, [clamped, progress, reducedMotion]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value}%` }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[
        styles.track,
        { height, borderRadius: height / 2 },
        trackColor ? { backgroundColor: trackColor } : null,
        style,
      ]}
    >
      <Animated.View style={[styles.fill, { height, borderRadius: height / 2 }, fillStyle]} />
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    track: {
      backgroundColor: theme.colors.track,
      overflow: 'hidden',
      width: '100%',
    },
    fill: {
      backgroundColor: theme.colors.accent,
    },
  });
