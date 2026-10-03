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
import { arcGeometry, STROKE_WIDTH } from './scoreArcGeometry';
import { useTheme } from '../../theme/useTheme';
import { spokenScore } from '../../utils/spokenText';

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

  const geometry = useMemo(() => arcGeometry(size), [size]);
  const { arcLength } = geometry;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: arcLength * (1 - progress.value / 100),
    // A zero-length dash still paints a dot under a round cap, so an empty
    // score shows nothing at all instead of an accent pip at the left end.
    strokeOpacity: progress.value <= 0 ? 0 : 1,
  }));

  const trackColor = variant === 'onDark' ? headerColors.track : theme.colors.track;
  const labelColor = variant === 'onDark' ? headerColors.textSecondary : theme.colors.textSecondary;
  // Accent on paper is 2.6-2.8:1, under the 3:1 a large number needs. Only the dark
  // header block (6.2:1) carries the number in accent; on paper it is ink, and the
  // arc keeps the accent. See DESIGN.md §2.
  const scoreColor = variant === 'onDark' ? theme.colors.accent : theme.colors.textPrimary;

  return (
    <View
      accessibilityLabel={spokenScore(clamped, label)}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[styles.container, { width: size }]}
    >
      <Svg height={geometry.svgHeight} width={size}>
        <Path
          d={geometry.path}
          fill="none"
          stroke={trackColor}
          strokeLinecap="round"
          strokeWidth={STROKE_WIDTH}
        />
        <AnimatedPath
          animatedProps={animatedProps}
          d={geometry.path}
          fill="none"
          stroke={theme.colors.accent}
          strokeDasharray={arcLength}
          strokeLinecap="round"
          strokeWidth={STROKE_WIDTH}
        />
      </Svg>
      <View style={[styles.readout, { marginTop: geometry.readoutOffset }]}>
        {/* Sized to fit inside the arc, which does not grow with the system text
            size; capped so a large setting cannot push it over the stroke. The
            value is still read out in full through accessibilityValue. */}
        <Text
          maxFontSizeMultiplier={1.2}
          style={[
            styles.score,
            {
              color: scoreColor,
              fontSize: geometry.scoreFontSize,
              letterSpacing: geometry.scoreLetterSpacing,
              lineHeight: geometry.scoreLineHeight,
            },
          ]}
        >
          {displayed}%
        </Text>
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
    },
    // Size, line height and tracking are computed from the arc — see arcGeometry.
    score: {
      color: theme.colors.accent,
      fontFamily: typography.display.fontFamily,
      fontWeight: typography.display.fontWeight,
    },
    label: {
      fontFamily: typography.caption.fontFamily,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
  });
