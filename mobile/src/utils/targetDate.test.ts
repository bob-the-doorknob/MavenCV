import { describe, expect, it } from 'vitest';

import {
  formatDueDate,
  formatMonthYear,
  formatWeeksLeft,
  monthYearToIso,
  nextInternshipStart,
  parseMonthYearInput,
  quickTargetDates,
} from './targetDate';

const NOW = Date.parse('2026-09-23T00:00:00.000Z');

describe('monthYearToIso', () => {
  it('returns the first day of the month', () => {
    expect(monthYearToIso({ month: 5, year: 2027 })).toBe('2027-05-01T00:00:00.000Z');
  });

  it('pads a single-digit month', () => {
    expect(monthYearToIso({ month: 1, year: 2027 })).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('parseMonthYearInput', () => {
  it('parses MM/YYYY and M/YYYY', () => {
    expect(parseMonthYearInput('05/2027', NOW)).toEqual({ month: 5, year: 2027 });
    expect(parseMonthYearInput('5/2027', NOW)).toEqual({ month: 5, year: 2027 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseMonthYearInput('  11 / 2026 ', NOW)).toEqual({ month: 11, year: 2026 });
  });

  it('rejects an impossible month', () => {
    expect(parseMonthYearInput('13/2027', NOW)).toBeNull();
    expect(parseMonthYearInput('00/2027', NOW)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseMonthYearInput('May 2027', NOW)).toBeNull();
    expect(parseMonthYearInput('2027-05', NOW)).toBeNull();
    expect(parseMonthYearInput('05/27', NOW)).toBeNull();
    expect(parseMonthYearInput('', NOW)).toBeNull();
  });

  it('rejects the current month and anything before it', () => {
    expect(parseMonthYearInput('09/2026', NOW)).toBeNull();
    expect(parseMonthYearInput('08/2026', NOW)).toBeNull();
    expect(parseMonthYearInput('12/2025', NOW)).toBeNull();
  });

  it('accepts a later month this year', () => {
    expect(parseMonthYearInput('10/2026', NOW)).toEqual({ month: 10, year: 2026 });
  });

  it('rejects a year more than ten out', () => {
    expect(parseMonthYearInput('05/2099', NOW)).toBeNull();
  });
});

describe('quickTargetDates', () => {
  it('offers 3, 6 and 9 months plus the next internship start', () => {
    expect(quickTargetDates(NOW).map((choice) => choice.date)).toEqual([
      '2026-12-01T00:00:00.000Z',
      '2027-03-01T00:00:00.000Z',
      '2027-06-01T00:00:00.000Z',
      '2027-05-01T00:00:00.000Z',
    ]);
  });
});

describe('nextInternshipStart', () => {
  it('uses next year once May has started', () => {
    expect(nextInternshipStart(Date.parse('2026-05-02T00:00:00.000Z'))).toBe('2027-05-01T00:00:00.000Z');
  });

  it('uses this year when May is still ahead', () => {
    expect(nextInternshipStart(Date.parse('2026-02-10T00:00:00.000Z'))).toBe('2026-05-01T00:00:00.000Z');
  });
});

describe('formatMonthYear', () => {
  it('formats the month and year', () => {
    expect(formatMonthYear('2027-05-01T00:00:00.000Z')).toBe('May 2027');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(formatMonthYear('not a date')).toBe('');
  });
});

describe('formatDueDate', () => {
  it('formats a short day and month', () => {
    expect(formatDueDate('2027-05-12T00:00:00.000Z')).toBe('12 May');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(formatDueDate('not a date')).toBe('');
  });
});

describe('formatWeeksLeft', () => {
  it('counts whole weeks', () => {
    expect(formatWeeksLeft(new Date(NOW + 14 * 7 * 86_400_000).toISOString(), NOW)).toBe(
      '14 weeks left',
    );
  });

  it('uses the singular for one week', () => {
    expect(formatWeeksLeft(new Date(NOW + 7 * 86_400_000).toISOString(), NOW)).toBe('1 week left');
  });

  it('calls out less than a week', () => {
    expect(formatWeeksLeft(new Date(NOW + 3 * 86_400_000).toISOString(), NOW)).toBe(
      'less than a week left',
    );
  });

  it('says the date passed once it is behind', () => {
    expect(formatWeeksLeft(new Date(NOW - 86_400_000).toISOString(), NOW)).toBe('date passed');
  });
});
