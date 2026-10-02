import type { Level } from '../data/roles';
import { findRolePreset, resolveRoleTitle } from '../data/roles';
import type { RoadmapTask, TaskStep } from '../types';
import { createId } from '../utils/id';
import { prepareOutgoingText } from '../utils/sanitizeText';
import { formatMockCvBullet } from '../utils/cvBullets';
import { clampEstimatedWeeks } from '../utils/schedule';
import { getAuthToken } from './auth';
import { getAppCheckToken } from './appCheck';
import { hasAiConsent, loadConsent } from './privacy';
import { mockAuthBackend } from './mockAuthBackend';
import { SYNC_MAX_BODY_BYTES, mockSyncServerFor, utf8Length } from './syncMockServer';

/** The backend's limits, in UTF-16 units, per field (backend/src/services). */
const MAX_EXPERIENCE_LENGTH = 4_000;
const MAX_ROLE_TITLE_LENGTH = 120;
const MAX_EMPLOYER_LENGTH = 120;
const MAX_TASK_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2_000;
/** normalizeCvBulletInput rejects a targetRole longer than this. */
const MAX_TARGET_ROLE_LENGTH = 80;
/** The backend returns 5-7 milestones; far more than that is a bad response, not a big roadmap. */
const MAX_ROADMAP_TASKS = 20;

const ROADMAP_TIMEOUT_MS = 120_000;
/** Sync moves no AI work, so it has no reason to wait as long as generation. */
const SYNC_TIMEOUT_MS = 30_000;
const CV_BULLET_TIMEOUT_MS = 120_000;
const EXTRACT_PROFILE_TIMEOUT_MS = 120_000;

export type ApiErrorKind =
  | 'rate_limited'
  | 'network'
  | 'server'
  | 'invalid_response'
  /** The backend refused text the user supplied. Retrying cannot help; editing the text can. */
  | 'invalid_input'
  | 'auth'
  | 'consent_required';

export class ApiError extends Error {
  public readonly kind: ApiErrorKind;
  /**
   * The backend's error code, when it sent one. Screens never read it (they
   * use getErrorMessage); sync does, to tell a wrong device clock apart from
   * other rejected input.
   */
  public readonly code: string | undefined;

  public constructor(kind: ApiErrorKind, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = code;
  }
}

const isRelease = (): boolean => typeof __DEV__ !== 'undefined' && !__DEV__;
const isMockMode = (): boolean => {
  const mock = process.env.EXPO_PUBLIC_USE_MOCK_API === 'true';
  if (mock && isRelease()) throw new ApiError('server', 'Mock API is disabled in release builds.');
  return mock;
};

const mockFailureKind = (): ApiErrorKind | undefined => {
  const value = process.env.EXPO_PUBLIC_MOCK_FAIL;
  return value === 'rate_limited' || value === 'server' || value === 'network' ? value : undefined;
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'AbortError';

const requireBaseUrl = (): string => {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!baseUrl?.trim()) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is not set. Set it in mobile/.env, or set EXPO_PUBLIC_USE_MOCK_API=true for local development.',
    );
  }
  const normalized = baseUrl.trim().replace(/\/$/u, '');
  if (isRelease() && !normalized.startsWith('https://')) throw new ApiError('server', 'Release builds require an HTTPS backend.');
  return normalized;
};

/**
 * The backend answers failures with { error: { code, message } }. Its codes
 * are the source of truth; the status is only the fallback for a response
 * that never reached a route handler (a proxy 502, say).
 */
const ERROR_KINDS_BY_CODE: Readonly<Record<string, ApiErrorKind>> = {
  AUTHENTICATION_REQUIRED: 'auth',
  APP_CHECK_REQUIRED: 'auth',
  RATE_LIMIT_EXCEEDED: 'rate_limited',
  ROADMAP_GENERATION_FAILED: 'server',
  CV_BULLET_GENERATION_FAILED: 'server',
  CV_PROFILE_GENERATION_FAILED: 'server',
  SERVICE_UNAVAILABLE: 'server',
  INTERNAL_ERROR: 'server',
  INVALID_ROADMAP_INPUT: 'invalid_input',
  INVALID_CV_BULLET_INPUT: 'invalid_input',
  INVALID_CV_PROFILE_INPUT: 'invalid_input',
  // docs/sync-contract.md §6. SYNC_CONFLICT never becomes an ApiError.
  SYNC_ACCOUNT_REQUIRED: 'auth',
  INVALID_SYNC_INPUT: 'invalid_response',
  SYNC_CLOCK_SKEW: 'invalid_response',
  SYNC_SCHEMA_UNSUPPORTED: 'invalid_response',
  SYNC_PAYLOAD_TOO_LARGE: 'invalid_response',
};

const kindFromStatus = (status: number): ApiErrorKind => {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  return 'invalid_response';
};

const readErrorResponse = async (response: Response): Promise<ApiError> => {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(kindFromStatus(response.status), `Backend request failed (${response.status}).`);
  }

  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const code = typeof error?.code === 'string' ? error.code : undefined;
  const message = typeof error?.message === 'string' ? error.message : undefined;

  return new ApiError(
    (code === undefined ? undefined : ERROR_KINDS_BY_CODE[code]) ?? kindFromStatus(response.status),
    message ?? `Backend request failed (${response.status}).`,
    code,
  );
};

/** Same envelope as readErrorResponse, for a body already parsed (the mock server). */
const errorFromBody = (status: number, body: unknown): ApiError => {
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const code = typeof error?.code === 'string' ? error.code : undefined;
  return new ApiError(
    (code === undefined ? undefined : ERROR_KINDS_BY_CODE[code]) ?? kindFromStatus(status),
    typeof error?.message === 'string' ? error.message : `Sync request failed (${status}).`,
    code,
  );
};

/** POSTs to the backend with an auth header (when available) and a hard timeout. */
const sendRequest = async (
  path: `/${string}`,
  init: Pick<RequestInit, 'headers' | 'body'>,
  timeoutMs: number,
): Promise<unknown> => {
  await loadConsent();
  const requireConsent = () => {
    if (!hasAiConsent()) throw new ApiError('consent_required', 'Review AI sharing in your privacy controls before continuing.');
  };
  requireConsent();
  const baseUrl = requireBaseUrl();
  let appCheckToken: string;
  try { appCheckToken = await getAppCheckToken(); }
  catch { throw new ApiError('auth', 'App verification failed. Use a configured development or store build.'); }
  const token = await getAuthToken();
  if (!token) throw new ApiError('auth', 'Unable to authenticate. Check your connection and Firebase configuration.');
  requireConsent();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
        'X-Firebase-AppCheck': appCheckToken,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw await readErrorResponse(response);
    try { return await response.json(); }
    catch (error) {
      if (isAbortError(error)) throw error;
      throw new ApiError('invalid_response', 'Response was not valid JSON.');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('network', isAbortError(error) ? 'Request timed out.' : 'Network request failed.');
  } finally {
    clearTimeout(timeout);
  }

};

const requestJson = (path: `/${string}`, body: unknown, timeoutMs: number): Promise<unknown> =>
  sendRequest(path, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The backend sends steps as plain strings; ids are generated here. */
const mapSteps = (raw: unknown): TaskStep[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry) =>
    typeof entry === 'string' && entry.trim()
      ? [{ id: createId(), title: entry.trim(), done: false }]
      : [],
  );
};

/**
 * Converts the backend's roadmap response into RoadmapTask[], filling safe
 * defaults for fields the backend does not send yet. Screens only ever see
 * RoadmapTask — this is the one place that translation happens.
 */
export const mapRoadmapResponse = (raw: unknown): RoadmapTask[] => {
  if (!isRecord(raw) || !Array.isArray(raw.tasks)) {
    throw new ApiError('invalid_response', 'Roadmap response was missing a tasks array.');
  }

  // A bad response becomes a retryable error — never an empty or broken roadmap.
  if (raw.tasks.length === 0) {
    throw new ApiError('invalid_response', 'Roadmap response had no tasks.');
  }
  if (raw.tasks.length > MAX_ROADMAP_TASKS) {
    throw new ApiError('invalid_response', `Roadmap response had more than ${MAX_ROADMAP_TASKS} tasks.`);
  }

  const seenIds = new Set<string>();
  return raw.tasks.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string') {
      throw new ApiError('invalid_response', `Roadmap task at index ${index} was missing an id or title.`);
    }
    // Everything the app does to a milestone finds it by id, so two with one id
    // would be started, finished and deleted together.
    if (!item.id.trim() || seenIds.has(item.id)) {
      throw new ApiError('invalid_response', `Roadmap task at index ${index} had a blank or repeated id.`);
    }
    seenIds.add(item.id);
    if (!item.title.trim()) {
      throw new ApiError('invalid_response', `Roadmap task at index ${index} had a blank title.`);
    }
    return {
      id: item.id,
      title: item.title.trim(),
      doneWhen: typeof item.doneWhen === 'string' ? item.doneWhen : '',
      weight: typeof item.weight === 'number' && Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1,
      ...(typeof item.why === 'string' && item.why.trim() ? { why: item.why.trim() } : {}),
      steps: mapSteps(item.steps),
      estimatedWeeks: clampEstimatedWeeks(item.estimatedWeeks),
      priority: item.priority === 1 || item.priority === 3 ? item.priority : 2,
      status: 'not_started',
    };
  });
};

export interface CvBulletResult {
  text: string;
  suggestions?: string[];
}

/** Converts the backend's { bullet, suggestions? } response into { text, suggestions? }. */
export const mapCvBulletResponse = (raw: unknown): CvBulletResult => {
  if (!isRecord(raw) || typeof raw.bullet !== 'string' || !raw.bullet.trim()) {
    throw new ApiError('invalid_response', 'CV bullet response was missing a bullet.');
  }

  const { suggestions } = raw;
  if (suggestions !== undefined && (!Array.isArray(suggestions) || suggestions.some((s) => typeof s !== 'string'))) {
    throw new ApiError('invalid_response', 'CV bullet response had invalid suggestions.');
  }

  return {
    text: raw.bullet,
    ...(Array.isArray(suggestions) && suggestions.length > 0 ? { suggestions: suggestions as string[] } : {}),
  };
};

export interface GenerateRoadmapInput {
  roleId: string;
  customTitle?: string;
  level: Level;
  employer?: string;
  experience: string;
}

/**
 * normalizeRoadmapInput rejects a targetRole.id it does not know, and a custom
 * role has no backend definition — so the id is sent only for a preset.
 */
const backendRoleId = (roleId: string): string | undefined =>
  findRolePreset(roleId) ? roleId : undefined;

export const generateRoadmap = async (input: GenerateRoadmapInput): Promise<RoadmapTask[]> => {
  if (isMockMode()) {
    return mockGenerateRoadmap(input);
  }

  // Level is separate from the candidate's evidence; never mutate their experience.
  const title = prepareOutgoingText(resolveRoleTitle(input.roleId, input.customTitle), MAX_ROLE_TITLE_LENGTH).trim();
  const experience = prepareOutgoingText(input.experience, MAX_EXPERIENCE_LENGTH).trim();
  const employer = input.employer ? prepareOutgoingText(input.employer, MAX_EMPLOYER_LENGTH).trim() : '';
  // The backend requires both; saying so here saves a round trip that would only fail.
  if (!title || !experience) {
    throw new ApiError('invalid_input', 'Role title or experience was empty after removing unsupported characters.');
  }
  const id = backendRoleId(input.roleId);
  const body = {
    experience,
    level: input.level,
    targetRole: {
      ...(id ? { id } : {}),
      title,
      ...(employer ? { employer } : {}),
    },
  };
  const raw = await requestJson('/api/roadmap', body, ROADMAP_TIMEOUT_MS);
  return mapRoadmapResponse(raw);
};

export interface GenerateCvBulletInput {
  taskTitle: string;
  notes: string;
  /** Sent for future backend targeting; the current backend ignores both. */
  roleTitle?: string;
  level?: Level;
}

export const generateCvBullet = async (input: GenerateCvBulletInput): Promise<CvBulletResult> => {
  if (isMockMode()) {
    return mockGenerateCvBullet(input);
  }

  // normalizeCvBulletInput takes { taskTitle, notes, targetRole?,
  // targetIndustry? }. Our roleTitle is its targetRole; level has no slot and
  // is not sent.
  const taskTitle = prepareOutgoingText(input.taskTitle, MAX_TASK_TITLE_LENGTH).trim();
  const notes = prepareOutgoingText(input.notes, MAX_NOTES_LENGTH).trim();
  // Both are required. An empty one (a milestone that no longer exists, notes
  // that were only invisible characters) would be refused, so don't spend a call on it.
  if (!taskTitle || !notes) {
    throw new ApiError('invalid_input', 'Milestone title or notes were empty after removing unsupported characters.');
  }
  const roleTitle = input.roleTitle ? prepareOutgoingText(input.roleTitle, MAX_TARGET_ROLE_LENGTH).trim() : '';
  const body = {
    taskTitle,
    notes,
    ...(roleTitle ? { targetRole: roleTitle } : {}),
  };
  const raw = await requestJson('/api/cv-bullet', body, CV_BULLET_TIMEOUT_MS);
  return mapCvBulletResponse(raw);
};

export interface ExtractProfileFile {
  /** The picked PDF, already read as base64 (see filePicker.readPdfBase64). */
  pdfBase64: string;
}

export interface ExtractProfileResult {
  experienceText: string;
  /** Up to 3 follow-up questions the backend wants the student to answer. */
  questions: string[];
}

/** Converts the backend's { experience, questions } response. */
const mapExtractProfileResponse = (raw: unknown): ExtractProfileResult => {
  if (!isRecord(raw) || typeof raw.experience !== 'string' || !raw.experience.trim()) {
    throw new ApiError('invalid_response', 'CV extraction response was missing experience.');
  }
  const { questions } = raw;
  if (questions !== undefined && (!Array.isArray(questions) || questions.some((q) => typeof q !== 'string'))) {
    throw new ApiError('invalid_response', 'CV extraction response had invalid questions.');
  }
  return {
    experienceText: raw.experience,
    questions: Array.isArray(questions) ? (questions as string[]) : [],
  };
};

/**
 * Sends a picked PDF to the backend for extraction. The file is never
 * persisted anywhere in the app — it's read as base64 here and handed off.
 *
 * The real backend requires a known targetRoleId, so a custom role cannot use
 * this path; mock mode only uses roleId to pick a role-tailored sample.
 */
export const extractProfile = async (
  file: ExtractProfileFile,
  roleId?: string,
  customTitle?: string,
): Promise<ExtractProfileResult> => {
  if (isMockMode()) {
    return mockExtractProfile(roleId);
  }

  if ((!roleId || !backendRoleId(roleId)) && !customTitle?.trim()) {
    throw new ApiError('invalid_response', 'Choose one of the listed roles before uploading a CV.');
  }

  const raw = await requestJson(
    '/api/cv-profile',
    { pdfBase64: file.pdfBase64, ...(roleId && backendRoleId(roleId) ? { targetRoleId: roleId } : { targetRoleTitle: customTitle?.trim() }) },
    EXTRACT_PROFILE_TIMEOUT_MS,
  );
  return mapExtractProfileResponse(raw);
};

/** The backend's role catalog. The UI reads data/roles.ts instead — this is
 *  only for checking the catalog against ours. */
export interface RoleCatalogCategory {
  id: string;
  title: string;
  roles: Array<{ id: string; title: string }>;
}

export const fetchRoleCatalog = async (): Promise<RoleCatalogCategory[]> => {
  const baseUrl = requireBaseUrl();
  const response = await fetch(`${baseUrl}/api/roles`);
  if (!response.ok) {
    throw await readErrorResponse(response);
  }
  const raw: unknown = await response.json();
  if (!isRecord(raw) || !Array.isArray(raw.categories)) {
    throw new ApiError('invalid_response', 'Role catalog response was missing categories.');
  }
  return raw.categories as RoleCatalogCategory[];
};

// --- Mock mode -------------------------------------------------------------

interface MockRoadmapItem {
  title: string;
  doneWhen: string;
  /** 1-2 sentences on why this matters for this role and level. */
  why: string;
  steps: readonly string[];
  priority: 1 | 2 | 3;
  estimatedWeeks: number;
}

type MockRoadmapByLevel = Readonly<Record<Level, readonly MockRoadmapItem[]>>;

const SOFTWARE_ENGINEER_ROADMAP: MockRoadmapByLevel = {
  internship: [
    {
      title: 'Build 1 portfolio project in a language relevant to target companies',
      doneWhen: 'Project is complete, on GitHub, with a README.',
      why: 'Internship recruiters screen for proof you can finish something, not just coursework. One project you can talk through in depth carries a first-round interview.',
      steps: [
        'Pick a problem you actually have, small enough to finish in 3 weeks',
        'Set up the repository with a README describing the problem and the stack',
        'Build the core feature end to end before adding anything else',
        'Write 3 tests covering the main paths',
        'Record a 2-minute walkthrough of the demo for your own reference',
      ],
      priority: 3,
      estimatedWeeks: 5,
    },
    {
      title: 'Solve 50 data structures & algorithms problems',
      doneWhen: '50 problems solved and tracked.',
      why: 'Nearly every software internship screen is a 30-45 minute coding problem. Fifty problems is roughly where pattern recognition starts replacing panic.',
      steps: [
        'Cover arrays, strings, and hash maps first — they are the most common',
        'Solve 5 problems a week and log the pattern behind each one',
        'Redo every problem you needed a hint on, one week later',
        'Time yourself on the last 10 to practise the real constraint',
      ],
      priority: 3,
      estimatedWeeks: 6,
    },
    {
      title: 'Merge 1 pull request on an open-source or class project',
      doneWhen: 'At least one PR merged.',
      why: 'It proves you can work inside someone else’s codebase and take review feedback — the single biggest gap between coursework and an internship.',
      steps: [
        'Find a project you already use with issues labelled for beginners',
        'Read its contributing guide and get the tests running locally',
        'Start with a documentation or small bug fix to learn the review flow',
        'Respond to review comments within two days',
      ],
      priority: 2,
      estimatedWeeks: 2,
    },
    {
      title: 'Write 1 resume tailored to internship roles',
      doneWhen: 'Resume reviewed by a mentor or career center.',
      why: 'Internship resumes are skimmed in seconds against a keyword filter. A tailored one page is what gets your projects read at all.',
      steps: [
        'Cut to one page, projects and skills above coursework',
        'Rewrite each bullet as an action plus a number',
        'Mirror the exact technology names from 3 postings you want',
        'Get it reviewed by a career center or a working engineer',
      ],
      priority: 2,
      estimatedWeeks: 1,
    },
    {
      title: 'Complete 2 mock technical interviews',
      doneWhen: 'Two mock interviews completed with feedback notes.',
      why: 'Solving problems alone is a different skill from solving them while narrating to a stranger. Two sessions remove most of the first-time shock.',
      steps: [
        'Ask a classmate or mentor to interview you for 45 minutes',
        'Talk through your approach out loud before writing any code',
        'Write down the feedback the same day',
        'Repeat with a different interviewer and a different problem type',
      ],
      priority: 2,
      estimatedWeeks: 2,
    },
    {
      title: 'Apply to 15 internship postings',
      doneWhen: '15 applications submitted and tracked.',
      why: 'Internship hiring is a numbers game with early deadlines. Fifteen tracked applications is usually the minimum for a few first-round callbacks.',
      steps: [
        'Build a simple tracker with company, role, date, and status',
        'Apply to 5 a week rather than all at once',
        'Tailor the top 3 lines of your resume for each posting',
        'Follow up on anything silent after two weeks',
      ],
      priority: 1,
      estimatedWeeks: 3,
    },
  ],
  'entry-level': [
    {
      title: 'Complete 1 software engineering internship',
      doneWhen: 'Internship completed with a manager reference available.',
      why: 'For entry-level roles, prior industry experience is the strongest single signal on a resume. It also gives you a reference who can speak to your work.',
      steps: [
        'Target internships that convert to full-time offers',
        'Agree on a measurable goal with your manager in week one',
        'Keep a weekly log of what you shipped and its impact',
        'Ask your manager for a reference before your last day',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Build 2 production-quality portfolio projects with tests and CI',
      doneWhen: 'Both projects deployed with passing CI.',
      why: 'Entry-level interviewers expect more than a working demo — they look for tests, CI, and deployment, because that is the job. Two such projects separate you from the coursework pile.',
      steps: [
        'Choose two projects with different shapes, such as an API and a data tool',
        'Add a test suite and wire it to CI on every push',
        'Deploy both somewhere publicly reachable',
        'Write a README covering the architecture and the trade-offs you made',
        'Add error handling and logging to at least one of them',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Solve 150 data structures & algorithms problems',
      doneWhen: '150 problems solved across core topics.',
      why: 'Full-time loops run several coding rounds at a harder level than internship screens. At 150 problems most interview questions become a variant of something you have already seen.',
      steps: [
        'Cover trees, graphs, dynamic programming, and heaps beyond the basics',
        'Solve 10 a week, in timed 45-minute sittings',
        'Keep a log of every pattern and the problems it unlocks',
        'Revisit anything you failed after two weeks, from scratch',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Complete 5 system design interview sessions',
      doneWhen: 'Five system design sessions completed with feedback.',
      why: 'Most entry-level loops now include a scaled-down design round. It is the round students prepare for least, so progress here moves your odds the most.',
      steps: [
        'Learn the standard framework: requirements, estimates, API, data model, scaling',
        'Design 5 familiar systems, such as a URL shortener or a news feed',
        'Practise 2 of them out loud with an engineer',
        'Write down the follow-up questions you could not answer, then answer them',
      ],
      priority: 2,
      estimatedWeeks: 4,
    },
    {
      title: 'Merge 2 pull requests on open-source or team projects',
      doneWhen: 'At least two PRs merged.',
      why: 'Merged PRs are public evidence that you write code others accept. For entry-level candidates without a long work history, that evidence carries real weight.',
      steps: [
        'Pick one project and stay with it long enough to learn the codebase',
        'Ship a small fix first, then take on a feature issue',
        'Write a clear PR description explaining the why, not just the what',
        'Address review feedback promptly and completely',
      ],
      priority: 2,
      estimatedWeeks: 3,
    },
    {
      title: 'Apply to 30 full-time roles',
      doneWhen: '30 applications submitted and tracked.',
      why: 'Entry-level response rates are low and hiring windows are seasonal. Thirty tracked applications is what it usually takes to reach a handful of loops.',
      steps: [
        'Track every application with company, role, date, and status',
        'Split the list between large companies and smaller teams',
        'Ask for a referral wherever you know someone',
        'Apply to 10 a week rather than all at once',
      ],
      priority: 1,
      estimatedWeeks: 4,
    },
  ],
};

const DATA_SCIENTIST_ROADMAP: MockRoadmapByLevel = {
  internship: [
    {
      title: 'Complete 1 end-to-end data analysis project with a public dataset',
      doneWhen: 'Notebook published with findings and visualizations.',
      why: 'Data internships screen for whether you can take a messy dataset all the way to a conclusion. A single finished analysis shows that better than any coursework grade.',
      steps: [
        'Pick a public dataset in a domain you can reason about',
        'Document your cleaning decisions as you make them',
        'State a question up front and answer it with the data',
        'Build 3 visualizations that support the conclusion',
        'Write a short summary a non-analyst could follow',
      ],
      priority: 3,
      estimatedWeeks: 4,
    },
    {
      title: 'Complete 1 statistics and probability course',
      doneWhen: 'Course or equivalent self-study completed with notes.',
      why: 'Internship screens lean on distributions, sampling, and hypothesis testing. Without that base, the modelling work later has nothing to stand on.',
      steps: [
        'Cover distributions, sampling, confidence intervals, and hypothesis testing',
        'Work every practice problem set rather than only reading',
        'Write a one-page summary of each topic in your own words',
        'Explain p-values out loud to someone outside the field',
      ],
      priority: 3,
      estimatedWeeks: 6,
    },
    {
      title: 'Build 1 predictive model with scikit-learn or similar',
      doneWhen: 'Model trained, evaluated, and documented.',
      why: 'Interviewers ask how you chose a metric and whether you checked for leakage. Building one model properly gives you real answers to those questions.',
      steps: [
        'Split train and test data before touching anything else',
        'Start with a simple baseline so you can measure improvement',
        'Choose an evaluation metric that matches the problem, and justify it',
        'Document what you tried, including what did not work',
      ],
      priority: 2,
      estimatedWeeks: 3,
    },
    {
      title: 'Solve 30 SQL query problems',
      doneWhen: '30 SQL problems solved.',
      why: 'Almost every data internship screen includes live SQL. Joins and window functions are the two areas candidates most often stall on.',
      steps: [
        'Practise joins and aggregation until they are automatic',
        'Work through window functions, which show up most in screens',
        'Solve 5 problems a week against a real database, not on paper',
        'Rewrite your slowest queries to practise reading a query plan',
      ],
      priority: 2,
      estimatedWeeks: 3,
    },
    {
      title: 'Write 1 resume highlighting data projects',
      doneWhen: 'Resume reviewed by a mentor or career center.',
      why: 'Data resumes are filtered on tools and outcomes. Naming the dataset size, the method, and the result is what gets you past the first pass.',
      steps: [
        'Lead each project bullet with the method and the outcome',
        'Include dataset size and the tools you used by name',
        'List Python, SQL, and your libraries explicitly in a skills line',
        'Get it reviewed by someone who has hired analysts',
      ],
      priority: 2,
      estimatedWeeks: 1,
    },
    {
      title: 'Apply to 15 internship postings',
      doneWhen: '15 applications submitted and tracked.',
      why: 'Data internship titles vary widely — analyst, data science, business intelligence — so volume across titles matters more than a perfect match.',
      steps: [
        'Search several titles, not just "data scientist"',
        'Track each application with company, role, date, and status',
        'Attach or link your analysis notebook where a portfolio is allowed',
        'Apply to 5 a week rather than all at once',
      ],
      priority: 1,
      estimatedWeeks: 3,
    },
  ],
  'entry-level': [
    {
      title: 'Complete 1 data science or analytics internship',
      doneWhen: 'Internship completed with a manager reference available.',
      why: 'Entry-level data teams want someone who has worked with real, messy production data and a real stakeholder. An internship is the most direct proof of both.',
      steps: [
        'Choose a team where you will own a question end to end',
        'Learn their data warehouse and its quirks in the first two weeks',
        'Deliver one analysis that changes a decision, and record the outcome',
        'Ask your manager for a reference before your last day',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Build 2 portfolio projects covering cleaning, modeling, and deployment',
      doneWhen: 'Both projects documented and deployed or presented.',
      why: 'Entry-level roles expect work that survives outside a notebook. Showing the full path from raw data to something usable is what distinguishes you from bootcamp output.',
      steps: [
        'Pick two projects with different data types, such as tabular and text',
        'Handle the messy cleaning in code, not by hand',
        'Deploy one as a small service or dashboard others can open',
        'Document the assumptions and the limitations of each result',
        'Include the runtime and cost of your pipeline',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Design and analyze 1 A/B test',
      doneWhen: 'One mock experiment designed and analyzed.',
      why: 'Experimentation is the daily work of most product data teams, and it is a standard entry-level interview round. Running one end to end teaches the traps a textbook does not.',
      steps: [
        'Define a hypothesis and a single primary metric before anything else',
        'Calculate the sample size and the run time you need',
        'Analyze the result, including the risk from multiple comparisons',
        'Write a recommendation and state what would change your mind',
      ],
      priority: 3,
      estimatedWeeks: 2,
    },
    {
      title: 'Solve 50 SQL and statistics practice questions',
      doneWhen: '50 practice questions completed.',
      why: 'Full-time data loops usually open with a timed SQL and stats screen. Fifty mixed questions is roughly where accuracy under time pressure becomes reliable.',
      steps: [
        'Alternate SQL and statistics questions in each session',
        'Practise window functions and CTEs until they are automatic',
        'Time yourself on every question to match screen conditions',
        'Log each mistake by topic and retake your weakest topic weekly',
      ],
      priority: 2,
      estimatedWeeks: 4,
    },
    {
      title: 'Present 1 project to a technical or non-technical audience',
      doneWhen: 'Presentation delivered and feedback collected.',
      why: 'Entry-level data work is judged on whether stakeholders act on your analysis. Communication is assessed in the interview, usually as a project walkthrough.',
      steps: [
        'Lead with the recommendation, not the methodology',
        'Cut every chart that does not support the decision',
        'Rehearse the 5-minute version and the 15-minute version',
        'Collect questions afterwards and write better answers to them',
      ],
      priority: 2,
      estimatedWeeks: 2,
    },
    {
      title: 'Apply to 30 full-time roles',
      doneWhen: '30 applications submitted and tracked.',
      why: 'Entry-level data postings are spread across analyst, scientist, and engineering titles with very different bars. Volume across titles is how you find the ones you clear.',
      steps: [
        'Track every application with company, role, date, and status',
        'Split applications between analyst and data science titles',
        'Tailor your project bullets to the domain of each company',
        'Ask for a referral wherever you know someone',
      ],
      priority: 1,
      estimatedWeeks: 4,
    },
  ],
};

const PRODUCT_MANAGER_ROADMAP: MockRoadmapByLevel = {
  internship: [
    {
      title: 'Write 1 product case study analyzing an existing app',
      doneWhen: 'Case study written and shared for feedback.',
      why: 'Product internships have no coding screen, so written thinking is the main evidence you can offer. A case study shows how you reason about users and trade-offs.',
      steps: [
        'Choose an app you use often enough to know its rough edges',
        'Identify the target user and the job they hire the app to do',
        'Diagnose one concrete problem with evidence, not opinion',
        'Propose a change and name the metric that would prove it worked',
        'Share it with someone in product and revise once',
      ],
      priority: 3,
      estimatedWeeks: 3,
    },
    {
      title: 'Complete 1 product fundamentals course',
      doneWhen: 'Course or equivalent reading completed with notes.',
      why: 'Product interviews use a shared vocabulary — funnels, retention, prioritization frameworks. Without it, good instincts get scored as vague answers.',
      steps: [
        'Cover discovery, prioritization, metrics, and the launch process',
        'Learn 2 prioritization frameworks well enough to apply live',
        'Summarize each module into your own one-page notes',
        'Apply one framework to a real backlog, even a class project',
      ],
      priority: 3,
      estimatedWeeks: 4,
    },
    {
      title: 'Conduct 3 user interviews for a class or side project',
      doneWhen: 'Three interviews completed with synthesized notes.',
      why: 'Talking to users is the part of the job you can do as a student with no title. It is also what interviewers probe hardest in a product sense round.',
      steps: [
        'Write an interview guide of open questions about past behavior',
        'Avoid pitching your idea during the conversation',
        'Take verbatim notes and look for what surprised you',
        'Synthesize the three into 3 themes with supporting quotes',
      ],
      priority: 2,
      estimatedWeeks: 2,
    },
    {
      title: 'Write 1 product requirements document for a hypothetical feature',
      doneWhen: 'PRD drafted and reviewed by a peer or mentor.',
      why: 'The PRD is the core artifact of the job. Writing one teaches you to state a problem, a scope, and a success metric precisely enough for engineers to build from.',
      steps: [
        'Open with the problem and the user, not the solution',
        'Define success as a single primary metric',
        'Write the scope and an explicit out-of-scope list',
        'List the open questions and risks honestly',
      ],
      priority: 2,
      estimatedWeeks: 2,
    },
    {
      title: 'Complete 2 mock product sense or case interviews',
      doneWhen: 'Two mock case interviews completed with feedback.',
      why: 'Product interviews are live, structured conversations. Two rounds of practice is enough to stop rambling and start signposting your structure.',
      steps: [
        'Practise a repeatable structure: user, problem, solutions, trade-offs, metric',
        'Say your structure out loud before diving into detail',
        'Have a peer time you and interrupt with follow-ups',
        'Write down the feedback the same day and apply it in the next session',
      ],
      priority: 2,
      estimatedWeeks: 2,
    },
    {
      title: 'Apply to 15 internship postings',
      doneWhen: '15 applications submitted and tracked.',
      why: 'Product internships are few and heavily oversubscribed, and many are labelled as associate or rotational programs. Breadth of search matters more than in other fields.',
      steps: [
        'Search associate and rotational program titles too',
        'Track each application with company, role, date, and status',
        'Link your case study wherever a portfolio field exists',
        'Ask for a referral wherever you know someone',
      ],
      priority: 1,
      estimatedWeeks: 3,
    },
  ],
  'entry-level': [
    {
      title: 'Complete 1 product management or related internship',
      doneWhen: 'Internship completed with a manager reference available.',
      why: 'Entry-level product roles are rare and go to candidates who have already worked with engineers and a real backlog. An internship is the most reliable route in.',
      steps: [
        'Target a team small enough that you own a real feature',
        'Agree with your manager on one measurable outcome in week one',
        'Keep a log of the decisions you made and their results',
        'Ask your manager for a reference before your last day',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Lead 1 feature from spec to launch on a class, club, or side project',
      doneWhen: 'Feature shipped with a documented outcome or metric.',
      why: 'Entry-level interviews probe for ownership through a launch, including the messy middle. Shipping something with a real outcome is the strongest story you can bring.',
      steps: [
        'Write the spec and get engineering agreement on scope',
        'Run the build with a weekly check on progress and blockers',
        'Cut scope openly when you need to, and record why',
        'Measure the result after launch and write up what you learned',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Conduct 5 user interviews and synthesize findings',
      doneWhen: 'Five interviews completed with a written synthesis.',
      why: 'Five interviews is where patterns start to separate from individual opinion. Demonstrating that judgment is exactly what a product sense round tests.',
      steps: [
        'Recruit 5 people who match one specific user segment',
        'Use the same interview guide for all of them so answers compare',
        'Tag your notes and count how often each theme appears',
        'Write a synthesis that names what you will act on and what you will not',
      ],
      priority: 3,
      estimatedWeeks: 3,
    },
    {
      title: 'Complete 15 mock product, analytical, and behavioral interviews',
      doneWhen: '15 mock interviews completed with feedback notes.',
      why: 'Full-time product loops run several different formats in one day. Fifteen sessions across all three types is what makes the structure automatic under pressure.',
      steps: [
        'Split the sessions across product sense, analytical, and behavioral',
        'Prepare 6 stories from your own experience for the behavioral rounds',
        'Practise estimation and metric questions out loud, with numbers',
        'Log feedback after each session and target your weakest format next',
      ],
      priority: 2,
      estimatedWeeks: 6,
    },
    {
      title: 'Write 2 PRDs, at least one backed by real user data',
      doneWhen: 'Both PRDs reviewed by a mentor or peer.',
      why: 'Written communication is a hiring criterion for product roles, and a PRD grounded in real data shows you can move from evidence to a decision.',
      steps: [
        'Base one PRD on findings from your own user interviews',
        'State a primary metric and a guardrail metric in each',
        'Include the alternatives you rejected and why',
        'Get both reviewed by someone working in product and revise',
      ],
      priority: 2,
      estimatedWeeks: 3,
    },
    {
      title: 'Apply to 30 full-time roles',
      doneWhen: '30 applications submitted and tracked.',
      why: 'Entry-level product openings are scarce and competitive, and many sit under associate product manager programs with fixed deadlines.',
      steps: [
        'Track every application with company, role, date, and status',
        'Include associate product manager programs and their deadlines',
        'Tailor your case study link to the company domain',
        'Ask for a referral wherever you know someone',
      ],
      priority: 1,
      estimatedWeeks: 4,
    },
  ],
};

const UI_UX_ROADMAP: MockRoadmapByLevel = {
  internship: [
    {
      title: 'Build 1 case study redesigning an existing app’s core flow',
      doneWhen: 'Case study published in a portfolio with before/after visuals.',
      why: 'Design internships are decided by the portfolio, and reviewers look for reasoning as much as visuals. One redesign shows your process from problem to pixels.',
      steps: [
        'Pick one flow with a problem you can state in a sentence',
        'Audit the current flow screen by screen and note the friction',
        'Sketch 3 alternative directions before committing to one',
        'Design the final screens and show them beside the originals',
        'Write the reasoning behind each major decision',
      ],
      priority: 3,
      estimatedWeeks: 4,
    },
    {
      title: 'Complete 1 UX research and design fundamentals course',
      doneWhen: 'Course or equivalent completed with notes.',
      why: 'Interviewers ask why you chose a pattern, and fundamentals give you a defensible answer. It also covers the research vocabulary teams expect you to share.',
      steps: [
        'Cover research methods, information architecture, and interaction patterns',
        'Learn accessibility basics including contrast and touch target size',
        'Redo the course exercises on your own project instead of the sample',
        'Summarize each topic into a one-page reference you will reuse',
      ],
      priority: 3,
      estimatedWeeks: 5,
    },
    {
      title: 'Conduct 3 usability tests on a design',
      doneWhen: 'Three usability tests completed with findings documented.',
      why: 'Testing separates designers who guess from designers who verify. Three sessions is enough to surface the obvious blockers in a flow.',
      steps: [
        'Write 3 tasks a user should be able to complete unaided',
        'Watch without helping, and record where they hesitate',
        'Note the failures by severity rather than by order',
        'Fix the top 2 issues and retest the same tasks',
      ],
      priority: 2,
      estimatedWeeks: 2,
    },
    {
      title: 'Build 1 high-fidelity prototype in Figma',
      doneWhen: 'Prototype complete and shared for feedback.',
      why: 'Teams expect fluency in the tool on day one, and an interactive prototype is what makes a portfolio review feel real rather than static.',
      steps: [
        'Build a component library with reusable styles first',
        'Wire the main flow so it can be clicked through end to end',
        'Include empty, loading, and error states, not only the happy path',
        'Share the link and collect feedback from 2 designers',
      ],
      priority: 2,
      estimatedWeeks: 3,
    },
    {
      title: 'Publish 1 portfolio site with 2-3 projects',
      doneWhen: 'Portfolio published with a shareable link.',
      why: 'For design internships the portfolio is the application. Without a shareable link, a strong resume rarely gets a reply.',
      steps: [
        'Pick your 2-3 strongest projects and cut the rest',
        'Lead each project with the problem and the outcome',
        'Show process work, not only the polished final screens',
        'Make it load fast and read well on a phone',
      ],
      priority: 2,
      estimatedWeeks: 3,
    },
    {
      title: 'Apply to 15 internship postings',
      doneWhen: '15 applications submitted and tracked.',
      why: 'Design internship titles vary — UX, product design, interaction design — and each posting weights research or visual craft differently.',
      steps: [
        'Search UX, product design, and interaction design titles',
        'Track each application with company, role, date, and status',
        'Lead every application with the portfolio link',
        'Reorder your case studies to match each company’s product type',
      ],
      priority: 1,
      estimatedWeeks: 3,
    },
  ],
  'entry-level': [
    {
      title: 'Complete 1 UX or product design internship',
      doneWhen: 'Internship completed with a manager or mentor reference available.',
      why: 'Entry-level design roles expect you to work within an existing design system and hand off to engineers. An internship is where that habit is built.',
      steps: [
        'Choose a team with an established design system to learn from',
        'Own one flow end to end, including the handoff to engineering',
        'Collect the critique you receive and track what you changed',
        'Ask your manager for a reference before your last day',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Build 2 in-depth case studies from research through final design',
      doneWhen: 'Both case studies published with process and outcomes.',
      why: 'Entry-level portfolio reviews go deep on one or two projects. Depth of process beats a gallery of screens at this level.',
      steps: [
        'Choose two projects that show different skills, such as research and systems',
        'Document the research that shaped each design decision',
        'Show the iterations you discarded and explain why',
        'State the outcome with a number wherever one exists',
        'Rehearse a 10-minute verbal walkthrough of each',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Conduct 5 usability tests across at least 2 projects',
      doneWhen: 'Five usability tests completed with documented findings.',
      why: 'Hiring teams want evidence your designs were validated, not just shipped. Testing across two projects shows it is a habit rather than a one-off.',
      steps: [
        'Recruit 5 participants who match the intended users',
        'Use consistent tasks so results can be compared',
        'Rank the findings by severity and frequency',
        'Show the before and after of what each finding changed',
      ],
      priority: 3,
      estimatedWeeks: 3,
    },
    {
      title: 'Complete 5 mock portfolio review interviews',
      doneWhen: 'Five mock portfolio reviews completed with feedback.',
      why: 'The portfolio review is the main round for design hires, and it is a live presentation under questioning. Practice is what keeps the narrative tight.',
      steps: [
        'Present to a designer who will interrupt with hard questions',
        'Keep each project to 10 minutes with a clear arc',
        'Prepare answers for "what would you do differently"',
        'Log the feedback after each session and revise the deck',
      ],
      priority: 2,
      estimatedWeeks: 3,
    },
    {
      title: 'Collaborate with 1 engineer or PM on a shipped feature',
      doneWhen: 'Feature shipped with the design implemented as specified.',
      why: 'Entry-level designers are judged on whether their work survives implementation. Shipping with an engineer proves you can spec, hand off, and compromise.',
      steps: [
        'Agree on the scope and constraints before designing',
        'Deliver specs with states, spacing, and edge cases included',
        'Review the build and file the visual differences you find',
        'Write down what you would change in the next handoff',
      ],
      priority: 2,
      estimatedWeeks: 5,
    },
    {
      title: 'Apply to 30 full-time roles',
      doneWhen: '30 applications submitted and tracked.',
      why: 'Entry-level design roles draw large applicant pools and are spread across product, UX, and visual titles with different expectations.',
      steps: [
        'Track every application with company, role, date, and status',
        'Apply across product, UX, and visual design titles',
        'Lead each application with the portfolio link',
        'Ask for a referral wherever you know someone',
      ],
      priority: 1,
      estimatedWeeks: 4,
    },
  ],
};

const GENERIC_ROADMAP: MockRoadmapByLevel = {
  internship: [
    {
      title: 'Build 1 project or portfolio piece relevant to the target role',
      doneWhen: 'Project complete and shareable.',
      why: 'For an internship you are hired on potential, and a finished piece of work is the clearest evidence of it. It also gives every interview something concrete to discuss.',
      steps: [
        'Pick a project that uses the core skill of the role',
        'Scope it so you can finish within 3 weeks',
        'Finish the core version before adding anything extra',
        'Write a short summary of the problem, your approach, and the result',
      ],
      priority: 3,
      estimatedWeeks: 4,
    },
    {
      title: 'Complete 1 introductory course in the target field',
      doneWhen: 'Course or equivalent self-study completed with notes.',
      why: 'Interviewers assume a shared vocabulary for the field. Covering the fundamentals stops good instincts from being scored as vague answers.',
      steps: [
        'Choose a course covering the fundamentals rather than one tool',
        'Do every exercise instead of only watching',
        'Summarize each module into your own one-page notes',
        'Apply one concept to your project to prove you can use it',
      ],
      priority: 3,
      estimatedWeeks: 4,
    },
    {
      title: 'Complete 1 hands-on exercise or case study relevant to the role',
      doneWhen: 'Exercise complete and documented.',
      why: 'Internship screens often mirror a small version of the daily work. Practising that format once removes most of the surprise.',
      steps: [
        'Find a realistic sample task for this kind of role',
        'Work it under a time limit, as you would in a screen',
        'Document your reasoning, not just the answer',
        'Have someone in the field review it and tell you what is missing',
      ],
      priority: 2,
      estimatedWeeks: 2,
    },
    {
      title: 'Write 1 resume tailored to the target role',
      doneWhen: 'Resume reviewed by a mentor or career center.',
      why: 'Resumes are filtered on keywords and outcomes before a person reads them. Tailoring is what gets your project seen at all.',
      steps: [
        'Cut to one page, with relevant work above general coursework',
        'Rewrite each bullet as an action plus a number',
        'Mirror the wording from 3 postings you actually want',
        'Get it reviewed by a career center or someone in the field',
      ],
      priority: 2,
      estimatedWeeks: 1,
    },
    {
      title: 'Complete 2 mock interviews for the target role',
      doneWhen: 'Two mock interviews completed with feedback.',
      why: 'Knowing the material and performing it under questioning are different skills. Two sessions cover most of the first-time nerves.',
      steps: [
        'Ask a mentor or peer to run a realistic 45-minute session',
        'Prepare 4 stories from your own experience beforehand',
        'Record the session or take notes immediately afterwards',
        'Apply the feedback in the second session',
      ],
      priority: 2,
      estimatedWeeks: 2,
    },
    {
      title: 'Apply to 15 internship postings',
      doneWhen: '15 applications submitted and tracked.',
      why: 'Internship hiring has early deadlines and low response rates. Fifteen tracked applications is usually the minimum for a few callbacks.',
      steps: [
        'Build a tracker with company, role, date, and status',
        'Apply to 5 a week rather than all at once',
        'Tailor the top of your resume for each posting',
        'Follow up on anything silent after two weeks',
      ],
      priority: 1,
      estimatedWeeks: 3,
    },
  ],
  'entry-level': [
    {
      title: 'Complete 1 internship or equivalent hands-on experience in the target field',
      doneWhen: 'Experience completed with a reference available.',
      why: 'Entry-level hiring weighs prior applied experience above coursework, and it supplies a reference who can vouch for how you work.',
      steps: [
        'Target a role where you will own something measurable',
        'Agree on a goal with your manager in the first week',
        'Keep a weekly log of what you delivered and its impact',
        'Ask for a reference before your last day',
      ],
      priority: 3,
      estimatedWeeks: 8,
    },
    {
      title: 'Build 2 portfolio-quality projects relevant to the target role',
      doneWhen: 'Both projects complete and documented.',
      why: 'At entry level, one project reads as a class assignment while two show a pattern of finishing work. They also give interviews more than one thing to probe.',
      steps: [
        'Choose two projects that demonstrate different core skills',
        'Take each one further than a demo, to something usable',
        'Document the decisions and trade-offs behind each',
        'Get feedback from someone working in the field and revise',
      ],
      priority: 3,
      estimatedWeeks: 7,
    },
    {
      title: 'Complete 1 intermediate course deepening core role skills',
      doneWhen: 'Course or equivalent self-study completed with notes.',
      why: 'Entry-level interviews go past definitions into judgment and trade-offs. Intermediate material is where that depth comes from.',
      steps: [
        'Pick the topic your target postings mention most often',
        'Choose a course that includes a substantial project',
        'Apply what you learn to one of your portfolio projects',
        'Write a summary you could teach from',
      ],
      priority: 2,
      estimatedWeeks: 5,
    },
    {
      title: 'Complete 5 mock interviews for the target role',
      doneWhen: 'Five mock interviews completed with feedback.',
      why: 'Full-time loops run multiple rounds in different formats on the same day. Five sessions is roughly what makes your structure automatic.',
      steps: [
        'Cover technical, case, and behavioral formats as the role requires',
        'Prepare 6 stories with a clear situation, action, and result',
        'Use a different interviewer for at least 2 of the sessions',
        'Log feedback after each and target your weakest area next',
      ],
      priority: 2,
      estimatedWeeks: 3,
    },
    {
      title: 'Build a network of 10 contacts in the field',
      doneWhen: '10 informational conversations or connections made.',
      why: 'A large share of entry-level roles are filled through referrals before they are widely seen. Ten genuine contacts changes which postings you hear about.',
      steps: [
        'List 10 people doing the work you want, starting with alumni',
        'Ask for 15 minutes about their path, not for a job',
        'Prepare 3 specific questions for each conversation',
        'Follow up with a thank-you and stay in touch quarterly',
      ],
      priority: 2,
      estimatedWeeks: 4,
    },
    {
      title: 'Apply to 30 full-time roles',
      doneWhen: '30 applications submitted and tracked.',
      why: 'Entry-level response rates are low and titles vary widely between companies. Thirty tracked applications is what it typically takes to reach several loops.',
      steps: [
        'Track every application with company, role, date, and status',
        'Search across the different titles this work goes by',
        'Ask for a referral wherever you know someone',
        'Apply to 10 a week rather than all at once',
      ],
      priority: 1,
      estimatedWeeks: 4,
    },
  ],
};

const MOCK_ROADMAPS_BY_ROLE_ID: Readonly<Record<string, MockRoadmapByLevel>> = {
  'software-engineer': SOFTWARE_ENGINEER_ROADMAP,
  'data-scientist': DATA_SCIENTIST_ROADMAP,
  'product-manager': PRODUCT_MANAGER_ROADMAP,
  'ui-ux': UI_UX_ROADMAP,
};

const mockGenerateRoadmap = async (input: GenerateRoadmapInput): Promise<RoadmapTask[]> => {
  await delay(2_000);
  const failure = mockFailureKind();
  if (failure) {
    throw new ApiError(failure, `Mocked ${failure} failure.`);
  }

  const template = (MOCK_ROADMAPS_BY_ROLE_ID[input.roleId] ?? GENERIC_ROADMAP)[input.level];
  return template.map((item) => ({
    id: createId(),
    title: item.title,
    doneWhen: item.doneWhen,
    why: item.why,
    steps: item.steps.map((title) => ({ id: createId(), title, done: false })),
    estimatedWeeks: item.estimatedWeeks,
    priority: item.priority,
    status: 'not_started',
  }));
};

const mockGenerateCvBullet = async (input: GenerateCvBulletInput): Promise<CvBulletResult> => {
  await delay(3_000);
  const failure = mockFailureKind();
  if (failure) {
    throw new ApiError(failure, `Mocked ${failure} failure.`);
  }

  const text = formatMockCvBullet(input.taskTitle, input.notes);
  if (!text) {
    throw new ApiError('invalid_response', 'Add completion notes before creating a CV bullet.');
  }
  return { text };
};

const MOCK_CV_SUMMARIES_BY_ROLE_ID: Readonly<Record<string, string>> = {
  'software-engineer':
    'Final-year Computer Science student. Built a full-stack task-tracking app with React and Node.js, deployed on Render and used by over 200 classmates during a trial run. Contributed two merged pull requests to an open-source CLI tool, fixing a parser bug and adding test coverage. Completed coursework in data structures, algorithms, operating systems, and databases with a 3.8 GPA. Solved over 120 algorithm problems on LeetCode. Comfortable with TypeScript, Python, SQL, and Git, and have set up CI pipelines for two class projects. Looking to grow into a role building production systems at scale.',
  'data-scientist':
    'Final-year Statistics student. Analyzed a 50,000-row public housing dataset in Python, building a regression model that explained 78% of price variance for a class project. Took graduate-level courses in probability, statistical inference, and machine learning. Built a dashboard in Tableau summarizing survey data for a student research group. Comfortable with pandas, scikit-learn, SQL, and R. Completed a Kaggle competition placing in the top 15% on a classification task. Presented findings to a room of 40 students and faculty at a department symposium.',
  'product-manager':
    'Final-year Business student with a minor in Computer Science. Ran 8 user interviews and synthesized findings into a product spec for a mobile app class project, then led a team of 4 to ship the MVP in six weeks. Wrote two PRDs, one backed by a 200-response user survey. Completed coursework in product strategy, statistics, and UX research methods. Interned part-time at a local startup helping prioritize a feature backlog using RICE scoring. Comfortable running experiments, reading analytics dashboards, and facilitating stakeholder meetings.',
  'ui-ux':
    'Final-year Design student. Redesigned the checkout flow of a mock e-commerce app in Figma, running 5 usability tests that improved task completion from 60% to 92%. Built a portfolio with three end-to-end case studies covering research, wireframes, and final UI. Completed coursework in interaction design, typography, and user research methods. Collaborated with two engineering students to implement a redesigned onboarding flow that shipped in a class capstone. Comfortable with Figma, basic HTML/CSS, and running moderated usability sessions.',
};

const GENERIC_MOCK_CV_SUMMARY =
  'Final-year student with hands-on project experience relevant to this target role. Completed coursework covering the core fundamentals of the field, led a team project from planning through delivery, and built a portfolio piece that demonstrates practical, applied skills. Comfortable picking up new tools quickly, working independently, and collaborating with a small team under a deadline. Presented project outcomes to peers and instructors on multiple occasions. Looking for an opportunity to apply this experience and keep growing quickly on the job.';

const mockExtractProfile = async (roleId: string | undefined): Promise<ExtractProfileResult> => {
  await delay(2_000);
  const failure = mockFailureKind();
  if (failure) {
    throw new ApiError(failure, `Mocked ${failure} failure.`);
  }

  const experienceText = (roleId && MOCK_CV_SUMMARIES_BY_ROLE_ID[roleId]) || GENERIC_MOCK_CV_SUMMARY;
  return { experienceText, questions: [] };
};

export type SyncHttpResult = { kind: 'ok'; body: unknown } | { kind: 'conflict'; body: unknown };
export type SyncMethod = 'GET' | 'PUT' | 'DELETE';

export interface SyncRequestOptions {
  /**
   * Send this Firebase ID token instead of the device session's. The account
   * flow uses it to read a cloud copy before deciding whether to adopt that
   * account's session at all.
   */
  idToken?: string;
}

/**
 * GET or PUT /api/sync (docs/sync-contract.md). Unlike the AI routes there is
 * no AI-consent gate — nothing here reaches Gemini — and a 409 is returned
 * rather than thrown, because its body carries the server's snapshot for the
 * caller to merge. Callers check for a linked account first; this function
 * does not, so it never decides on its own to touch the network.
 */
export const requestSync = async (
  method: SyncMethod,
  body?: unknown,
  options: SyncRequestOptions = {},
): Promise<SyncHttpResult> => {
  const json = method === 'PUT' ? JSON.stringify(body) : undefined;
  if (json !== undefined && utf8Length(json) > SYNC_MAX_BODY_BYTES) {
    // Refused before the network: the server would only refuse it too.
    throw new ApiError('invalid_response', 'Snapshot exceeds 900 KB.', 'SYNC_PAYLOAD_TOO_LARGE');
  }

  if (isMockMode()) {
    const failure = mockFailureKind();
    if (failure) {
      throw new ApiError(failure, `Mock ${failure} failure.`);
    }
    await delay(150);
    // Keyed by the account, as the real backend is. A revoked token is a 401.
    const uid = options.idToken
      ? mockAuthBackend.uidForToken(options.idToken)
      : mockAuthBackend.uidForToken(await mockAuthBackend.currentIdToken());
    if (!uid) throw new ApiError('auth', 'Authentication is required', 'AUTHENTICATION_REQUIRED');
    const server = mockSyncServerFor(uid);
    if (method === 'DELETE') {
      server.delete();
      mockAuthBackend.deleteUser(uid);
      return { kind: 'ok', body: {} };
    }
    const response = method === 'GET' ? server.get() : server.put(json ?? '');
    if (response.status === 200) return { kind: 'ok', body: response.body };
    if (response.status === 409) return { kind: 'conflict', body: response.body };
    throw errorFromBody(response.status, response.body);
  }

  const baseUrl = requireBaseUrl();
  let appCheckToken: string;
  try {
    appCheckToken = await getAppCheckToken();
  } catch {
    throw new ApiError('auth', 'App verification failed. Use a configured development or store build.');
  }
  const token = options.idToken ?? (await getAuthToken());
  if (!token) throw new ApiError('auth', 'Unable to authenticate. Check your connection and Firebase configuration.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/sync`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Firebase-AppCheck': appCheckToken,
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(json === undefined ? {} : { body: json }),
      signal: controller.signal,
    });
    if (response.status === 409) {
      try {
        return { kind: 'conflict', body: await response.json() };
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new ApiError('invalid_response', 'Conflict response was not valid JSON.');
      }
    }
    if (!response.ok) throw await readErrorResponse(response);
    // DELETE answers 204 with no body; nothing to parse.
    if (method === 'DELETE') return { kind: 'ok', body: {} };
    try {
      return { kind: 'ok', body: await response.json() };
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ApiError('invalid_response', 'Response was not valid JSON.');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('network', isAbortError(error) ? 'Request timed out.' : 'Network request failed.');
  } finally {
    clearTimeout(timeout);
  }
};
