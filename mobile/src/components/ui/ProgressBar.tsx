import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { radii, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

interface ProgressBarProps {
  /** 0-100. Out-of-range values are clamped. */
  value: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({ value, height = 10, style }: ProgressBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const clamped = Math.min(100, Math.max(0, value));
  const widthAnim = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: clamped,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [clamped, widthAnim]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            borderRadius: height / 2,
            width: widthAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    track: {
      backgroundColor: theme.colors.accentMuted,
      overflow: 'hidden',
      width: '100%',
    },
    fill: {
      backgroundColor: theme.colors.accent,
      borderRadius: radii.sm,
    },
  });
