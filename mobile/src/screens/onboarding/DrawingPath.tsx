import { useEffect } from 'react';
import Animated, {
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { headerColors, type Theme } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const NODE_COUNT = 4;
const RAIL_X = 22;
const TOP = 16;
const GAP = 46;
const LINE_LENGTH = GAP * (NODE_COUNT - 1);
const HEIGHT = TOP * 2 + LINE_LENGTH;
const WIDTH = 160;
const DRAW_DURATION_MS = 2_600;

/**
 * The roadmap's own milestone path, drawing itself while the roadmap is
 * generated — the wait shows what is being built rather than a spinner.
 */
export function DrawingPath() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withRepeat(withTiming(1, { duration: DRAW_DURATION_MS }), -1, false);
  }, [progress, reducedMotion]);

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: LINE_LENGTH * (1 - progress.value),
  }));

  return (
    <Svg height={HEIGHT} width={WIDTH}>
      <Path
        d={`M ${RAIL_X} ${TOP} V ${TOP + LINE_LENGTH}`}
        stroke={headerColors.track}
        strokeWidth={2}
      />
      <AnimatedPath
        animatedProps={lineProps}
        d={`M ${RAIL_X} ${TOP} V ${TOP + LINE_LENGTH}`}
        stroke={theme.colors.accent}
        strokeDasharray={LINE_LENGTH}
        strokeWidth={2}
      />
      {Array.from({ length: NODE_COUNT }, (_, index) => (
        <PathNode index={index} key={index} progress={progress} theme={theme} />
      ))}
    </Svg>
  );
}

interface PathNodeProps {
  index: number;
  progress: { value: number };
  theme: Theme;
}

function PathNode({ index, progress, theme }: PathNodeProps) {
  const reached = index / (NODE_COUNT - 1);

  // Each node fills as the line passes it, so the path reads as progress.
  const nodeProps = useAnimatedProps(() => ({
    fillOpacity: interpolate(progress.value, [reached - 0.08, reached], [0, 1], 'clamp'),
  }));

  return (
    <>
      <Circle
        cx={RAIL_X}
        cy={TOP + index * GAP}
        fill={headerColors.background}
        r={9}
        stroke={headerColors.track}
        strokeWidth={2}
      />
      <AnimatedCircle
        animatedProps={nodeProps}
        cx={RAIL_X}
        cy={TOP + index * GAP}
        fill={theme.colors.accent}
        r={9}
      />
    </>
  );
}
