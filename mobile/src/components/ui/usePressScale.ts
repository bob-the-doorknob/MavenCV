import { useCallback } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import { motion } from '../../theme/tokens';

interface PressScale {
  style: AnimatedStyle<ViewStyle>;
  onPressIn: () => void;
  onPressOut: () => void;
}

/** Shared press feedback: a small scale-down that reduced motion disables. */
export function usePressScale(): PressScale {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = useCallback(() => {
    if (reducedMotion) return;
    scale.value = withTiming(motion.pressScale, { duration: motion.pressInDuration });
  }, [reducedMotion, scale]);

  const onPressOut = useCallback(() => {
    if (reducedMotion) return;
    scale.value = withTiming(1, { duration: motion.pressOutDuration });
  }, [reducedMotion, scale]);

  return { style, onPressIn, onPressOut };
}
