/** Mirrors the backend's experience field cap (backend/src/services/roadmap.ts: readString(..., 'experience', 4000, true)). */
export const EXPERIENCE_MAX_LENGTH = 4_000;

/** Hard minimum, of trimmed text, before a roadmap can be generated. */
export const EXPERIENCE_MIN_LENGTH = 100;

/** Recommended length — below this we nudge for more detail, at or above it we confirm. */
export const EXPERIENCE_RECOMMENDED_LENGTH = 500;

/** The raw character count only shows once typed text passes this fraction of the max. */
const RAW_COUNT_VISIBILITY_THRESHOLD = 0.8;

const BELOW_MINIMUM_HINT = 'Write at least 100 characters (about 2 sentences).';
const BELOW_RECOMMENDED_HINT = 'Add more detail for a sharper roadmap (aim for 500+ characters).';
const SUFFICIENT_HINT = 'Great detail.';

export type ExperienceTone = 'below-minimum' | 'below-recommended' | 'sufficient';

export interface ExperienceFeedback {
  trimmedLength: number;
  /** Whether "Generate my roadmap" may be enabled (level choice is checked separately by the caller). */
  meetsMinimum: boolean;
  tone: ExperienceTone;
  hintText: string;
  /** 0-1, clamped, toward EXPERIENCE_RECOMMENDED_LENGTH. Drives the progress indicator, not a counter. */
  progressToRecommended: number;
  /** The raw counter only appears once typed text passes 80% of maxLength. */
  showRawCount: boolean;
}

/** Pure: no store, no theme, no I/O. Drives AboutYouScreen's hint/progress/count display. */
export const getExperienceFeedback = (
  text: string,
  maxLength: number = EXPERIENCE_MAX_LENGTH,
): ExperienceFeedback => {
  const trimmedLength = text.trim().length;
  const meetsMinimum = trimmedLength >= EXPERIENCE_MIN_LENGTH;

  const tone: ExperienceTone =
    trimmedLength < EXPERIENCE_MIN_LENGTH
      ? 'below-minimum'
      : trimmedLength < EXPERIENCE_RECOMMENDED_LENGTH
        ? 'below-recommended'
        : 'sufficient';

  const hintText =
    tone === 'below-minimum' ? BELOW_MINIMUM_HINT : tone === 'below-recommended' ? BELOW_RECOMMENDED_HINT : SUFFICIENT_HINT;

  return {
    trimmedLength,
    meetsMinimum,
    tone,
    hintText,
    progressToRecommended: Math.min(1, trimmedLength / EXPERIENCE_RECOMMENDED_LENGTH),
    showRawCount: text.length > maxLength * RAW_COUNT_VISIBILITY_THRESHOLD,
  };
};
