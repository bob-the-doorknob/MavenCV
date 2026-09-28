import { spacing, typography } from '../../theme/tokens';

export const STROKE_WIDTH = 14;
export const CAP_RADIUS = STROKE_WIDTH / 2;

/**
 * Approximate advance widths of the display font, in em. Used to size the
 * readout against the arc's inner width without measuring text at runtime.
 */
const DIGIT_EM = 0.62;
const PERCENT_EM = 0.95;
/** The readout is always laid out for "100%", so it never shifts as the score counts up. */
const WIDEST_READOUT_EM = 3 * DIGIT_EM + PERCENT_EM;
/** Clear space between the number and the stroke on each side. */
const READOUT_PADDING = spacing.md;
/** Keeps the number's top corners off the stroke's inner edge. */
const READOUT_CLEARANCE = 4;
const MIN_SCORE_FONT_SIZE = 22;

export interface ArcGeometry {
  svgHeight: number;
  path: string;
  arcLength: number;
  /** Widest the readout can be: "100%" at the chosen font size. */
  readoutWidth: number;
  /** The arc's hole — the band the readout must stay inside. */
  innerWidth: number;
  /** X of the arc's right endpoint, before its round cap. */
  endX: number;
  scoreFontSize: number;
  scoreLineHeight: number;
  scoreLetterSpacing: number;
  /** Negative: pulls the readout up into the arc, far enough to stay clear of it. */
  readoutOffset: number;
}

/**
 * Everything the arc and its readout need, derived from `size` alone — so the
 * number is sized and placed to fit the arc rather than hoping 56pt clears it.
 *
 * Pure and free of native imports, so the geometry is unit-testable.
 */
export const arcGeometry = (size: number): ArcGeometry => {
  const radius = (size - STROKE_WIDTH) / 2;
  const centerX = size / 2;
  const centerY = radius + CAP_RADIUS;
  // The band the number must stay inside: the arc's hole, not the arc itself.
  const innerRadius = radius - CAP_RADIUS;

  // Endpoints are pulled in by one cap radius, so the round caps finish level
  // with the baseline instead of overshooting past it.
  const capAngle = CAP_RADIUS / radius;
  const startX = centerX - radius * Math.cos(capAngle);
  const endX = centerX + radius * Math.cos(capAngle);
  const capY = centerY - radius * Math.sin(capAngle);

  const available = innerRadius * 2 - READOUT_PADDING * 2;
  const scoreFontSize = Math.max(
    MIN_SCORE_FONT_SIZE,
    Math.min(typography.display.fontSize, Math.floor(available / WIDEST_READOUT_EM)),
  );
  const widestWidth = scoreFontSize * WIDEST_READOUT_EM;

  // How far above the baseline the arc's hole is still wider than "100%",
  // measured against a slightly shrunken hole so the number's top corners keep
  // a visible gap from the stroke rather than grazing it.
  const clearanceRadius = Math.max(widestWidth / 2, innerRadius - READOUT_CLEARANCE);
  const clearRise = Math.sqrt(Math.max(0, clearanceRadius ** 2 - (widestWidth / 2) ** 2));

  return {
    svgHeight: centerY + CAP_RADIUS,
    path: `M ${startX} ${capY} A ${radius} ${radius} 0 0 1 ${endX} ${capY}`,
    arcLength: radius * (Math.PI - 2 * capAngle),
    readoutWidth: widestWidth,
    innerWidth: innerRadius * 2,
    endX,
    scoreFontSize,
    scoreLineHeight: Math.round(scoreFontSize * 1.07),
    scoreLetterSpacing:
      typography.display.letterSpacing * (scoreFontSize / typography.display.fontSize),
    readoutOffset: -(clearRise + CAP_RADIUS),
  };
};
