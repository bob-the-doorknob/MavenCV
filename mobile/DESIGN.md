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
| `textMuted` | `#6B665C` | Section labels, counters, meta |
| `border` | `#E6E2D8` | Card, input, and chip borders |
| `divider` | `#EEEBE3` | Hairline separators inside a surface |
| `node` | `#CFCBC2` | Inactive milestone node ring, untravelled path |
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

Background `#111214`, surface `#1A1C1F`, light text (`#F6F4EE` primary, `#A8A49B` secondary), same accent `#FF6B2C`. Borders, dividers, nodes, and tracks are the dark equivalents in `tokens.ts`.

### Category tints (chips)

| Category | Light bg / text | Dark bg / text |
| --- | --- | --- |
| Engineering | `#E4ECF5` / `#2E4B6B` | `#243447` / `#A9C4E0` |
| Data & AI | `#E3F0E8` / `#2F5B40` | `#1E3327` / `#9DCBAF` |
| Product & Design | `#EEE8F5` / `#4E3B6B` | `#2C2340` / `#C1AEDD` |
| Business & finance | `#F6EDDC` / `#6B4E1E` | `#3A2F1B` / `#DCC189` |

Read them through `categoryTints[mode][category]` or the `useCategoryTint` hook.

---

## 2. The accent rule

Accent (`#FF6B2C`) is **only** for progress:

- the readiness score number
- progress bars and the score arc fill
- done nodes, their checkmarks, and the in-progress ring
- the part of the milestone path already travelled

Everything else is paper, ink, and borders.

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
| `label` (buttons, chips) | 16 / 600 |

Use the `SectionLabel` component rather than restyling text — it owns the uppercasing.

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

The current task is highlighted as a white card; the others sit directly on paper.

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
