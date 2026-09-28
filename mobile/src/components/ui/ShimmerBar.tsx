import { useEffect, useMemo } from 'react';
import { StyleSheet, type DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { radii, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const PULSE_DURATION_MS = 700;

interface ShimmerBarProps {
  width: DimensionValue;
  /** Staggers the pulse so the bars don't breathe in unison. */
  delayMs?: number;
}

export function ShimmerBar({ width, delayMs = 0 }: ShimmerBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: PULSE_DURATION_MS + delayMs }),
        withTiming(0.45, { duration: PULSE_DURATION_MS }),
      ),
      -1,
      true,
    );
  }, [delayMs, opacity, reducedMotion]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.bar, { width }, pulseStyle]} />;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      backgroundColor: theme.colors.track,
      borderRadius: radii.sm,
      height: 12,
    },
  });
