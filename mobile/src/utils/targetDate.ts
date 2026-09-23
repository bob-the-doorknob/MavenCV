const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const SHORT_MONTH_NAMES = MONTH_NAMES.map((name) => name.slice(0, 3));

/** Summer internships start in May. */
const INTERNSHIP_START_MONTH = 5;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1_000;

export interface MonthYear {
  /** 1-12. */
  month: number;
  year: number;
}

export interface QuickTargetDate {
  id: string;
  label: string;
  date: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The first day of the given month, as an ISO date at UTC midnight. */
export const monthYearToIso = ({ month, year }: MonthYear): string =>
  `${year}-${pad(month)}-01T00:00:00.000Z`;

/**
 * Parses "05/2027" or "5/2027". Returns null for anything malformed, an
 * impossible month, or a month already in the past — a target date behind you
 * is never what the user meant.
 */
export const parseMonthYearInput = (input: string, now: number): MonthYear | null => {
  const match = /^\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/u.exec(input);
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const year = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }

  const today = new Date(now);
  const currentYear = today.getUTCFullYear();
  if (year < currentYear || year > currentYear + 10) {
    return null;
  }
  if (year === currentYear && month <= today.getUTCMonth() + 1) {
    return null;
  }

  return { month, year };
};

/** Adds whole months, landing on the first of the resulting month. */
const addMonths = (now: number, months: number): string => {
  const date = new Date(now);
  const total = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return monthYearToIso({ month: month + 1, year });
};

/** The May after today — this year's if it hasn't started, next year's otherwise. */
export const nextInternshipStart = (now: number): string => {
  const date = new Date(now);
  const year = date.getUTCMonth() + 1 < INTERNSHIP_START_MONTH
    ? date.getUTCFullYear()
    : date.getUTCFullYear() + 1;
  return monthYearToIso({ month: INTERNSHIP_START_MONTH, year });
};

export const quickTargetDates = (now: number): QuickTargetDate[] => [
  { id: '3m', label: 'In 3 months', date: addMonths(now, 3) },
  { id: '6m', label: 'In 6 months', date: addMonths(now, 6) },
  { id: '9m', label: 'In 9 months', date: addMonths(now, 9) },
  { id: 'internship', label: 'Next summer internship (May)', date: nextInternshipStart(now) },
];

/** "May 2027". Returns an empty string for an unparseable date. */
export const formatMonthYear = (iso: string): string => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return '';
  }
  const date = new Date(parsed);
  return `${MONTH_NAMES[date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()}`;
};

/** "12 May". Returns an empty string for an unparseable date. */
export const formatDueDate = (iso: string): string => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return '';
  }
  const date = new Date(parsed);
  return `${date.getUTCDate()} ${SHORT_MONTH_NAMES[date.getUTCMonth()] ?? ''}`;
};

/** "14 weeks left", "1 week left", or "date passed" once it is behind you. */
export const formatWeeksLeft = (iso: string, now: number): string => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return '';
  }
  // Check the raw difference, not the week count: Math.trunc turns anything
  // inside the last week into -0, which is not < 0.
  if (parsed < now) {
    return 'date passed';
  }
  const weeks = Math.trunc((parsed - now) / MS_PER_WEEK);
  if (weeks === 0) {
    return 'less than a week left';
  }
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} left`;
};
