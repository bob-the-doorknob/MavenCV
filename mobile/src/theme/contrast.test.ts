import { describe, expect, it } from 'vitest';

import { categoryTints, headerColors, themes, type CategoryKey, type ThemeColors, type ThemeMode } from './tokens';

/**
 * Computes WCAG 2.1 contrast for every text and meaningful-graphic colour pair
 * the tokens produce, and fails below 4.5:1 (text) or 3:1 (graphics: icons,
 * rings, progress fills, input outlines). A pair that is knowingly below its
 * line goes in KNOWN_EXCEPTIONS with the reason and the cue that covers it;
 * the test also fails if an excepted pair starts passing, so the list can't rot.
 */

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r as number) + 0.7152 * channel(g as number) + 0.0722 * channel(b as number);
};
export const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

type Kind = 'text' | 'graphic';
interface Pair {
  id: string;
  kind: Kind;
  fg: string;
  bg: string;
}

const TEXT_MIN = 4.5;
const GRAPHIC_MIN = 3;

const themePairs = (mode: ThemeMode, c: ThemeColors): Pair[] => {
  const p = (name: string, kind: Kind, fg: string, bg: string): Pair => ({ id: `${mode}:${name}`, kind, fg, bg });
  const pairs: Pair[] = [];
  // Text on the three surfaces it can sit on. (Raised cards hold text only.)
  for (const [fgName, fg] of [
    ['textPrimary', c.textPrimary],
    ['textSecondary', c.textSecondary],
    ['textMuted', c.textMuted],
    ['accentText', c.accentText],
    ['danger', c.danger],
    ['warning', c.warning],
  ] as const) {
    for (const [bgName, bg] of [['background', c.background], ['surface', c.surface], ['surfaceRaised', c.surfaceRaised]] as const) {
      pairs.push(p(`${fgName}/${bgName}`, 'text', fg, bg));
    }
  }
  pairs.push(
    p('textPrimary/accentMuted', 'text', c.textPrimary, c.accentMuted),
    p('accentText/accentMuted', 'text', c.accentText, c.accentMuted),
    p('onPrimaryButton/primaryButton', 'text', c.onPrimaryButton, c.primaryButton),
    // The confirmation banner: paper text on an ink surface.
    p('banner background/textPrimary', 'text', c.background, c.textPrimary),
    // Meaningful graphics. Nodes and inputs sit on paper or on a card, never on a raised card.
    p('onAccent/accent (check on done node)', 'graphic', c.onAccent, c.accent),
    p('accent/background (fill, ring)', 'graphic', c.accent, c.background),
    p('accent/surface (fill, ring)', 'graphic', c.accent, c.surface),
    p('accent/track (fill vs unfilled)', 'graphic', c.accent, c.track),
    p('node/background (inactive ring)', 'graphic', c.node, c.background),
    p('node/surface (inactive ring)', 'graphic', c.node, c.surface),
    p('inputBorder/background (field outline)', 'graphic', c.inputBorder, c.background),
    p('inputBorder/surface (field outline)', 'graphic', c.inputBorder, c.surface),
  );
  return pairs;
};

const tintPairs = (mode: ThemeMode): Pair[] =>
  (Object.keys(categoryTints[mode]) as CategoryKey[]).map((key) => ({
    id: `${mode}:category chip ${key}`,
    kind: 'text',
    fg: categoryTints[mode][key].text,
    bg: categoryTints[mode][key].background,
  }));

const headerPairs = (): Pair[] => [
  { id: 'header:text/background', kind: 'text', fg: headerColors.text, bg: headerColors.background },
  { id: 'header:textSecondary/background', kind: 'text', fg: headerColors.textSecondary, bg: headerColors.background },
  { id: 'header:danger/background', kind: 'text', fg: headerColors.danger, bg: headerColors.background },
  { id: 'header:text/control', kind: 'text', fg: headerColors.text, bg: headerColors.control },
  { id: 'header:textSecondary/control', kind: 'text', fg: headerColors.textSecondary, bg: headerColors.control },
  // The score number and arc on the dark block: the one place accent carries the number.
  { id: 'header:accent/background (score number, arc)', kind: 'graphic', fg: '#FF6B2C', bg: headerColors.background },
  { id: 'header:accent/track (arc fill vs unfilled)', kind: 'graphic', fg: '#FF6B2C', bg: headerColors.track },
];

const ALL: Pair[] = [
  ...themePairs('light', themes.light.colors),
  ...themePairs('dark', themes.dark.colors),
  ...tintPairs('light'),
  ...tintPairs('dark'),
  ...headerPairs(),
];

/**
 * Pairs known to be under their line, and accepted. Each needs the reason and
 * the redundant cue that means colour alone is not carrying the meaning.
 * The accent colour and the track colour are brand decisions that were
 * explicitly not changed (DESIGN.md §2).
 */
const KNOWN_EXCEPTIONS: Readonly<Record<string, string>> = {
  // Accent (#FF6B2C) on paper is 2.58:1, on a card 2.84:1.
  // Accepted because: the score number is NOT drawn in accent on paper (it is
  // ink — DESIGN.md §2), and a ring or fill is always paired with a cue that
  // does not rely on its colour: the done node has an ink checkmark, the
  // in-progress node has an inner dot, and every progress bar sits next to a
  // number or a spoken value ("2 of 4 steps done").
  'light:accent/background (fill, ring)': 'accent on paper; ink number, checkmark/dot shapes and spoken value cover it',
  'light:accent/surface (fill, ring)': 'accent on a card; same cues as above',
  // Accent vs the unfilled track is 1.92:1 in light mode (4.72:1 in dark).
  // Accepted because: the track's colour was deliberately left alone, and the
  // fill is distinguishable by its length and by the adjacent number or
  // accessibilityValue — never by colour alone.
  'light:accent/track (fill vs unfilled)': 'fill length plus the number or spoken value carries progress, not the hue difference',
};

describe('WCAG contrast of the design tokens', () => {
  it.each(ALL.map((pair) => [pair.id, pair] as const))('%s', (_id, pair) => {
    const ratio = contrast(pair.fg, pair.bg);
    const min = pair.kind === 'text' ? TEXT_MIN : GRAPHIC_MIN;
    if (pair.id in KNOWN_EXCEPTIONS) {
      // An exception must still be needed. If this fails, delete it from KNOWN_EXCEPTIONS.
      expect(ratio, `${pair.id} now passes (${ratio.toFixed(2)}:1); remove it from KNOWN_EXCEPTIONS`).toBeLessThan(min);
    } else {
      expect(ratio, `${pair.id} is ${ratio.toFixed(2)}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min);
    }
  });

  it('every exception names a pair that exists', () => {
    const ids = new Set(ALL.map((pair) => pair.id));
    for (const id of Object.keys(KNOWN_EXCEPTIONS)) expect(ids.has(id), `${id} matches no pair`).toBe(true);
  });

  it('keeps the exception list short and explained', () => {
    expect(Object.keys(KNOWN_EXCEPTIONS)).toHaveLength(3);
    for (const reason of Object.values(KNOWN_EXCEPTIONS)) expect(reason.length).toBeGreaterThan(20);
  });

  it('gives inputs their own outline token, and keeps card borders pale', () => {
    for (const mode of ['light', 'dark'] as const) {
      const c = themes[mode].colors;
      expect(c.inputBorder).not.toBe(c.border);
      expect(contrast(c.inputBorder, c.surface)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
      // Card borders and dividers separate surfaces; they are unchanged and not meaningful graphics.
      expect(contrast(c.border, c.surface)).toBeLessThan(GRAPHIC_MIN);
    }
  });

  it('measures the contrast function against known values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
});
