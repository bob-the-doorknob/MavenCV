import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Path } from 'react-native-svg';

import { headerColors, motion, spacing, typography, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface ScoreArcProps {
  /** 0-100. Out-of-range values are clamped. */
  value: number;
  label?: string;
  /** Arc width in points. */
  size?: number;
  /** 'onDark' for the dark header block, 'onSurface' for paper/surface. */
  variant?: 'onDark' | 'onSurface';
}

const STROKE_WIDTH = 14;

export function ScoreArc({ value, label = 'Interview readiness', size = 220, variant = 'onDark' }: ScoreArcProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const clamped = Math.min(100, Math.max(0, value));

  const progress = useSharedValue(reducedMotion ? clamped : 0);
  const [displayed, setDisplayed] = useState(reducedMotion ? Math.round(clamped) : 0);

  useEffect(() => {
    progress.value = reducedMotion
      ? clamped
      : withTiming(clamped, { duration: motion.scoreCountDuration });
  }, [clamped, progress, reducedMotion]);

  useAnimatedReaction(
    () => Math.round(progress.value),
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setDisplayed, current);
    },
    [],
  );

  const radius = (size - STROKE_WIDTH) / 2;
  const centerY = radius + STROKE_WIDTH / 2;
  const arcLength = Math.PI * radius;
  const d = `M ${STROKE_WIDTH / 2} ${centerY} A ${radius} ${radius} 0 0 1 ${size - STROKE_WIDTH / 2} ${centerY}`;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: arcLength * (1 - progress.value / 100),
  }));

  const trackColor = variant === 'onDark' ? headerColors.track : theme.colors.track;
  const labelColor = variant === 'onDark' ? headerColors.textSecondary : theme.colors.textSecondary;

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[styles.container, { width: size }]}
    >
      <Svg height={radius + STROKE_WIDTH} width={size}>
        <Path
          d={d}
          fill="none"
          stroke={trackColor}
          strokeLinecap="round"
          strokeWidth={STROKE_WIDTH}
        />
        <AnimatedPath
          animatedProps={animatedProps}
          d={d}
          fill="none"
          stroke={theme.colors.accent}
          strokeDasharray={arcLength}
          strokeLinecap="round"
          strokeWidth={STROKE_WIDTH}
        />
      </Svg>
      <View style={styles.readout}>
        <Text style={styles.score}>{displayed}%</Text>
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
    },
    readout: {
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: -spacing.xxl,
    },
    score: {
      color: theme.colors.accent,
      fontFamily: typography.display.fontFamily,
      fontSize: typography.display.fontSize,
      fontWeight: typography.display.fontWeight,
      letterSpacing: typography.display.letterSpacing,
      lineHeight: typography.display.lineHeight,
    },
    label: {
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
  });
