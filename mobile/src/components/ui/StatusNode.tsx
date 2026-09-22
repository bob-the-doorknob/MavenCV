import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

import { type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import type { TaskStatus } from '../../types';

interface StatusNodeProps {
  status: TaskStatus;
  size?: number;
  /** Matches the surface the node sits on, so the path line is masked. */
  backgroundColor?: string;
}

const statusLabels: Readonly<Record<TaskStatus, string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

export function StatusNode({ status, size = 22, backgroundColor }: StatusNodeProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const previousStatus = useRef(status);

  useEffect(() => {
    const justCompleted = status === 'done' && previousStatus.current !== 'done';
    previousStatus.current = status;
    if (!justCompleted) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (reducedMotion) return;
    scale.value = withSequence(
      withTiming(0.8, { duration: 90 }),
      withTiming(1.1, { duration: 150 }),
      withTiming(1, { duration: 120 }),
    );
  }, [reducedMotion, scale, status]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const shape = { width: size, height: size, borderRadius: size / 2 };
  const fill = backgroundColor ?? theme.colors.background;

  return (
    <Animated.View
      accessibilityLabel={statusLabels[status]}
      accessibilityRole="image"
      style={[styles.node, shape, { backgroundColor: fill }, popStyle]}
    >
      {status === 'done' ? (
        <View style={[styles.done, shape]}>
          <Svg height={size * 0.6} viewBox="0 0 24 24" width={size * 0.6}>
            <Path
              d="M4 12.5 L9.5 18 L20 6.5"
              stroke={theme.colors.onAccent}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
            />
          </Svg>
        </View>
      ) : (
        <View
          style={[
            styles.ring,
            shape,
            status === 'in_progress' ? styles.ringActive : styles.ringInactive,
          ]}
        >
          {status === 'in_progress' ? (
            <View style={[styles.innerDot, { width: size * 0.36, height: size * 0.36, borderRadius: size }]} />
          ) : null}
        </View>
      )}
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    node: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    done: {
      alignItems: 'center',
      backgroundColor: theme.colors.accent,
      justifyContent: 'center',
    },
    ring: {
      alignItems: 'center',
      borderWidth: 2,
      justifyContent: 'center',
    },
    ringActive: {
      borderColor: theme.colors.accent,
    },
    ringInactive: {
      borderColor: theme.colors.node,
    },
    innerDot: {
      backgroundColor: theme.colors.accent,
    },
  });
