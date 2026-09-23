import { describe, expect, it } from 'vitest';

import {
  EXPERIENCE_MIN_LENGTH,
  EXPERIENCE_RECOMMENDED_LENGTH,
  getExperienceFeedback,
} from './experienceLimits';

const repeat = (char: string, count: number): string => char.repeat(count);

describe('getExperienceFeedback', () => {
  it('is below-minimum and does not meet the minimum just under the threshold', () => {
    const feedback = getExperienceFeedback(repeat('a', EXPERIENCE_MIN_LENGTH - 1));
    expect(feedback.meetsMinimum).toBe(false);
    expect(feedback.tone).toBe('below-minimum');
    expect(feedback.hintText).toBe('Write at least 100 characters (about 2 sentences).');
  });

  it('meets the minimum and is below-recommended exactly at the minimum', () => {
    const feedback = getExperienceFeedback(repeat('a', EXPERIENCE_MIN_LENGTH));
    expect(feedback.meetsMinimum).toBe(true);
    expect(feedback.tone).toBe('below-recommended');
    expect(feedback.hintText).toBe('Add more detail for a sharper roadmap (aim for 500+ characters).');
  });

  it('is below-recommended just under the recommended threshold', () => {
    const feedback = getExperienceFeedback(repeat('a', EXPERIENCE_RECOMMENDED_LENGTH - 1));
    expect(feedback.tone).toBe('below-recommended');
  });

  it('is sufficient at exactly the recommended threshold', () => {
    const feedback = getExperienceFeedback(repeat('a', EXPERIENCE_RECOMMENDED_LENGTH));
    expect(feedback.tone).toBe('sufficient');
    expect(feedback.hintText).toBe('Great detail.');
  });

  it('is sufficient well above the recommended threshold', () => {
    const feedback = getExperienceFeedback(repeat('a', EXPERIENCE_RECOMMENDED_LENGTH * 3));
    expect(feedback.tone).toBe('sufficient');
    expect(feedback.progressToRecommended).toBe(1);
  });

  it('counts trimmed length, not raw length — leading/trailing whitespace does not count', () => {
    const padded = `   ${repeat('a', EXPERIENCE_MIN_LENGTH - 1)}   `;
    const feedback = getExperienceFeedback(padded);
    expect(feedback.meetsMinimum).toBe(false);
    expect(feedback.trimmedLength).toBe(EXPERIENCE_MIN_LENGTH - 1);
  });

  it('computes progress toward the recommended length proportionally', () => {
    const feedback = getExperienceFeedback(repeat('a', EXPERIENCE_RECOMMENDED_LENGTH / 2));
    expect(feedback.progressToRecommended).toBeCloseTo(0.5);
  });

  it('hides the raw count at or below 80% of the max', () => {
    const feedback = getExperienceFeedback(repeat('a', 80), 100);
    expect(feedback.showRawCount).toBe(false);
  });

  it('shows the raw count above 80% of the max', () => {
    const feedback = getExperienceFeedback(repeat('a', 81), 100);
    expect(feedback.showRawCount).toBe(true);
  });

  it('defaults maxLength to EXPERIENCE_MAX_LENGTH when not given', () => {
    const feedback = getExperienceFeedback(repeat('a', 10));
    expect(feedback.showRawCount).toBe(false);
  });
});
