# Maven Design System — "Paper & Ember"

The visual direction for Maven. Every screen, component, and state in `mobile/` follows this document. Tokens live in `mobile/src/theme/tokens.ts`; components live in `mobile/src/components/ui/`. If a value is not in the tokens file, it does not belong in a screen.

The idea: warm paper, near-black ink, and a single ember-orange accent that is spent only on progress. The interface should feel like a well-set printed page that happens to be alive.

---

## 1. Palette

### Light (default)

| Token | Hex | Use |
| --- | --- | --- |
| `background` (paper) | `#F6F4EE` | Screen background |
| `surface` | `#FFFFFF` | Cards, inputs, sheets |
| `textPrimary` (ink) | `#15171B` | Body and title text, primary buttons |
| `textSecondary` | `#5C584F` | Supporting copy |
| `textMuted` | `#6B665C` | Section labels, counters, meta (dark mode `#8C8982`, for 4.5:1 on surface) |
| `border` | `#E6E2D8` | Card and chip borders: separation only |
| `inputBorder` | `#9C8C65` | Outline of a text field or text area — see below |
| `divider` | `#EEEBE3` | Hairline separators inside a surface |
| `node` | `#958C78` | Inactive milestone node ring, untravelled path (3:1 on paper and surface) |
| `track` | `#D9D4C9` | Unfilled progress bar and arc |
| `accent` | `#FF6B2C` | Progress only — see §4 |
| `accentMuted` | `#FFE9DF` | Soft accent wash |
| `accentText` | `#9A3A0F` | Accent-derived text that stays legible on paper |
| `danger` | `#A32A12` | Errors, destructive states |

### Dark header block

The dark header is a fixed surface, not a themed one — it is dark in both light and dark mode. Its colors are exported separately as `headerColors`:

| Token | Hex |
| --- | --- |
| `background` | `#17191E` |
| `text` | `#F6F4EE` |
| `textSecondary` | `#A8A49B` |
| `track` | `#2C2F36` |
| `control` | `#24272D` |
| `danger` | `#FF6B5C` |

### Dark mode

Background `#111214`, surface `#1A1C1F`, light text (`#F6F4EE` primary, `#A8A49B` secondary), same accent `#FF6B2C`. Borders, dividers, nodes, and tracks are the dark equivalents in `tokens.ts` (`inputBorder` `#626772`, `node` `#626773`).

### Input outlines

A field's outline is the only thing that shows where it is, so it gets its own token. `inputBorder` is used by `TextField` and `TextArea` and must reach **3:1** against the surface the field sits on, in light and in dark (WCAG 1.4.11). `border` stays pale and is for separating cards and chips from the page; do not use it to outline an input. Dividers are unchanged. Chips and secondary buttons keep `border` because their text label, not the outline, identifies them.

### Category tints (chips)

| Category | Light bg / text | Dark bg / text |
| --- | --- | --- |
| Engineering | `#E4ECF5` / `#2E4B6B` | `#243447` / `#A9C4E0` |
| Data & AI | `#E3F0E8` / `#2F5B40` | `#1E3327` / `#9DCBAF` |
| Product & Design | `#EEE8F5` / `#4E3B6B` | `#2C2340` / `#C1AEDD` |
| Business & finance | `#F6EDDC` / `#6B4E1E` | `#3A2F1B` / `#DCC189` |

Read them through `categoryTints[mode][category]` or the `useCategoryTint` hook.

**A category tint appears once per screen or once per group — never once per row.** Repeated down a list it stops being information and becomes a second colour system competing with the accent. On a list where every row shares a category, the tint belongs on the group, not the rows.

---

## 2. The accent rule

Accent (`#FF6B2C`) is **only** for progress towards readiness:

- the readiness score number, **only on the dark header block** (6.2:1)
- the score arc fill, and progress bars that report progress towards readiness
- done nodes, their checkmarks, and the in-progress ring
- the part of the milestone path already travelled

**The score number is ink on paper.** Accent on paper or a surface is only 2.6–2.8:1, below the 3:1 a large number needs, and the track colour is too close to it to carry the arc alone. So wherever the score number is drawn directly on paper or a card (`ScoreArc` with `variant="onSurface"`: the "Interview ready" card, and the gallery), it is `textPrimary`; the arc keeps the accent. On the dark header block the number is accent. Progress fills still use accent against their track (a known, accepted 1.9:1 — the fill's length and the number beside it carry the value, not its colour).

Everything else is paper, ink, and borders. In particular, accent is **not** for
states, warnings or time pressure:

- **due soon** is ink at 600; **overdue** is `danger`
- an **in-progress status pill** takes an ink border, not an accent fill
- a **bullet waiting on a number** takes an ink border, not an accent card
- a bar measuring anything other than readiness passes a neutral `fillColor`

**One exception:** the inline `[X]` placeholder inside a CV bullet is `accentText`.
It marks the exact word the user must replace, inside a line of body text where a
border or a weight change cannot point at a single token.

**Primary buttons are ink (`#15171B`) with white text — never orange.** White on orange fails contrast. In dark mode the primary button inverts to paper with ink text (`primaryButton` / `onPrimaryButton`). Where a check or icon sits on an accent fill, it is ink (`onAccent`), not white.

---

## 3. Typography

Two families, loaded at app start with `expo-font` (see `src/theme/fonts.ts`). Families are referenced through `typography.*`, never as raw strings.

**Bricolage Grotesque** — display and titles, tight letter spacing:

| Style | Size / weight |
| --- | --- |
| `display` (score) | 56 / 800, `-1.6` letter spacing |
| `title` (screen titles) | 28 / 700, `-0.6` (26–32 acceptable) |
| `heading` | 20 / 700, `-0.3` |

**Geist** — everything else:

| Style | Size / weight |
| --- | --- |
| `rowTitle` | 16 / 600 (15 also acceptable) |
| `body` | 15 / 400 |
| `caption` (secondary) | 13 / 400 (14 acceptable) |
| `sectionLabel` | 12 / 600, uppercase, `0.96` letter spacing (0.08em), in `textMuted` |
| `linkLabel` (inline text links) | 13 / 600 |
| `label` (buttons, chips) | 16 / 600 |

Use the `SectionLabel` component rather than restyling text — it owns the uppercasing.

**`SectionLabel` marks a group inside a screen. It never sits above a screen title.**
An uppercase label over a title is decoration: the title already says what the screen
is, and the pair reads as a template. Wayfinding that would have gone in such a label
(a step count, a mode) goes next to the control it belongs to instead.

**Links are `linkLabel` in `textPrimary`, with no underline.** The one exception is a
link inside the dark header block, which takes a header colour (`headerColors.text`,
or `headerColors.danger` for an overdue warning) and keeps its underline, since ink
cannot carry the affordance on dark. Never restyle a link per screen — five slightly
different link styles is how a system stops being one.

---

## 4. Shape and surface

- Radii: `sm` 10, `md` 14, `lg` 18, `xl` 20, `header` 28 (bottom corners of the dark header block), `pill` 999.
- **Borders instead of shadows.** No elevation, no `shadow*` props.
- No gradients, no blur, no emoji in the UI.
- Cards: surface + 1pt border, radius 18 (20 for the highlighted current task).
- Buttons: height 48–52, radius 14–16.
- Spacing comes from the `spacing` scale (4 / 8 / 12 / 16 / 24 / 32 / 48).

---

## 5. Signature elements

**Dark header with score arc.** A `headerColors.background` block with a 28pt bottom radius, holding a `ScoreArc`: an SVG semicircle whose accent fill animates its length while the score counts up beside it.

**Milestones as a vertical path.** `MilestonePath` renders a 2pt line down a left rail with a node per item. The travelled segment is accent and stops halfway through the current row; the rest is `node` grey. Node states (`StatusNode`):

- **done** — filled accent circle with an ink checkmark
- **in progress** — accent ring with an inner accent dot
- **not started** — grey (`node`) ring

The current task is highlighted as a white card (radius 20); the others sit directly on paper.

Travelled rows recede. A done milestone drops its title to `body` (15/400) in `textSecondary` and shows no meta or schedule line at all — the filled node is the whole statement. Only work still ahead carries a meta fact.

---

## 6. Motion

Animation is `react-native-reanimated`. Durations and the press scale live in the `motion` token group.

- Press feedback: scale to `0.98` (`usePressScale`).
- Score counts up over ~600ms; the arc animates its stroke length over the same window.
- Path segments animate their length as they become travelled (~450ms).
- A node completing pops 0.8 → 1.1 → 1 and fires a light haptic (`expo-haptics`).

**Respect reduced motion.** Every animated component checks `useReducedMotion()` and jumps to the final value instead. Haptics still fire — they are feedback, not motion.

---

## 7. Accessibility

- Every screen respects safe areas (`react-native-safe-area-context`).
- Touch targets are at least 44pt. Smaller visuals (chips) make it up with `hitSlop`.
- Progress surfaces carry `accessibilityRole="progressbar"` with a real `accessibilityValue`.
- Interactive elements carry a label, a role, and a state.

---

## 8. Rules of thumb

- No inline styles. Use `StyleSheet.create` with a `createStyles(theme)` factory.
- No hardcoded hex values in screens or components — import tokens.
- Add a state to the gallery (`src/screens/UiGalleryScreen.tsx`) whenever you add a component or a variant.
