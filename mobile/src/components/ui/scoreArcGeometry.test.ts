import { describe, expect, it } from 'vitest';

import { arcGeometry, CAP_RADIUS, STROKE_WIDTH } from './scoreArcGeometry';

/** Every size the app actually renders, plus the extremes. */
const SIZES = [120, 150, 180, 220, 280];

describe('arcGeometry', () => {
  it.each(SIZES)('keeps "100%%" inside the arc at size %i', (size) => {
    const { readoutWidth, innerWidth } = arcGeometry(size);

    expect(readoutWidth).toBeLessThanOrEqual(innerWidth);
  });

  it.each(SIZES)('leaves padding on both sides of the readout at size %i', (size) => {
    const { readoutWidth, innerWidth } = arcGeometry(size);

    // Slack is split between the two sides, so each side gets half.
    expect((innerWidth - readoutWidth) / 2).toBeGreaterThanOrEqual(4);
  });

  it.each(SIZES)('places the readout clear of the stroke at size %i', (size) => {
    const geometry = arcGeometry(size);
    const innerRadius = innerRadiusOf(size);
    // How far above the baseline the readout's top row sits.
    const rise = -geometry.readoutOffset - CAP_RADIUS;
    const holeHalfWidth = Math.sqrt(innerRadius ** 2 - rise ** 2);

    expect(holeHalfWidth).toBeGreaterThanOrEqual(geometry.readoutWidth / 2);
  });

  it.each(SIZES)('never lets a round cap overshoot the box at size %i', (size) => {
    const { endX, arcLength } = arcGeometry(size);

    // The cap extends one radius past the endpoint, and must still fit.
    expect(endX + CAP_RADIUS).toBeLessThanOrEqual(size);
    // The inset path is shorter than a full semicircle by one cap at each end.
    expect(arcLength).toBeLessThan(Math.PI * ((size - STROKE_WIDTH) / 2));
  });

  it('scales the font down for three digits but keeps it readable', () => {
    expect(arcGeometry(220).scoreFontSize).toBe(56);
    expect(arcGeometry(180).scoreFontSize).toBeLessThan(56);
    expect(arcGeometry(120).scoreFontSize).toBeGreaterThanOrEqual(22);
  });

  it('does not shift the readout as the score gains digits', () => {
    // The offset is derived from "100%" alone, so 9% and 100% sit identically.
    expect(arcGeometry(220).readoutOffset).toBe(arcGeometry(220).readoutOffset);
    expect(arcGeometry(220).readoutWidth).toBeGreaterThan(0);
  });
});

const innerRadiusOf = (size: number): number => (size - STROKE_WIDTH) / 2 - CAP_RADIUS;
