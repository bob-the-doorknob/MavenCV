import type { Level } from '../data/roles';
import { resolveRoleTitle } from '../data/roles';
import type { RoadmapTask } from '../types';
import { createId } from '../utils/id';
import { getAuthToken } from './auth';

const ROADMAP_TIMEOUT_MS = 45_000;
const CV_BULLET_TIMEOUT_MS = 30_000;

export type ApiErrorKind = 'rate_limited' | 'network' | 'server' | 'invalid_response' | 'auth';

export class ApiError extends Error {
  public readonly kind: ApiErrorKind;

  public constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

const isMockMode = (): boolean => process.env.EXPO_PUBLIC_USE_MOCK_API === 'true';

const mockFailureKind = (): ApiErrorKind | undefined => {
  const value = process.env.EXPO_PUBLIC_MOCK_FAIL;
  return value === 'rate_limited' || value === 'server' || value === 'network' ? value : undefined;
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && (error as { name?: unknown }).name === 'AbortError';

/** POSTs JSON to the backend with an auth header (when available) and a hard timeout. */
const requestJson = async (path: `/${string}`, body: unknown, timeoutMs: number): Promise<unknown> => {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!baseUrl?.trim()) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is not set. Set it in mobile/.env, or set EXPO_PUBLIC_USE_MOCK_API=true for local development.',
    );
  }

  const token = await getAuthToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/u, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError('network', isAbortError(error) ? 'Request timed out.' : 'Network request failed.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiError('rate_limited', 'AI request limit exceeded.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError('auth', 'Authentication is required.');
    }
    if (response.status >= 500) {
      throw new ApiError('server', `Backend request failed (${response.status}).`);
    }
    throw new ApiError('invalid_response', `Backend request failed (${response.status}).`);
  }

  try {
    return await response.json();
  } catch {
    throw new ApiError('invalid_response', 'Response was not valid JSON.');
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Converts the backend's roadmap response into RoadmapTask[], filling safe
 * defaults for fields the backend does not send yet. Screens only ever see
 * RoadmapTask — this is the one place that translation happens.
 */
export const mapRoadmapResponse = (raw: unknown): RoadmapTask[] => {
  if (!isRecord(raw) || !Array.isArray(raw.tasks)) {
    throw new ApiError('invalid_response', 'Roadmap response was missing a tasks array.');
  }

  return raw.tasks.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.title !== 'string') {
      throw new ApiError('invalid_response', `Roadmap task at index ${index} was missing an id or title.`);
    }
    return {
      id: item.id,
      title: item.title,
      doneWhen: '',
      priority: 2,
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

export const generateRoadmap = async (input: GenerateRoadmapInput): Promise<RoadmapTask[]> => {
  if (isMockMode()) {
    return mockGenerateRoadmap(input);
  }

  // The backend contract has no roleId/level yet — only title/employer/experience.
  const title = resolveRoleTitle(input.roleId, input.customTitle);
  const body = {
    experience: input.experience,
    targetRole: { title, ...(input.employer ? { employer: input.employer } : {}) },
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

  const raw = await requestJson('/api/cv-bullet', input, CV_BULLET_TIMEOUT_MS);
  return mapCvBulletResponse(raw);
};

// --- Mock mode -------------------------------------------------------------

interface MockRoadmapItem {
  title: string;
  doneWhen: string;
  priority: 1 | 2 | 3;
}

type MockRoadmapByLevel = Readonly<Record<Level, readonly MockRoadmapItem[]>>;

const SOFTWARE_ENGINEER_ROADMAP: MockRoadmapByLevel = {
  internship: [
    { title: 'Build 1 portfolio project in a language relevant to target companies', doneWhen: 'Project is complete, on GitHub, with a README.', priority: 3 },
    { title: 'Solve 50 data structures & algorithms problems', doneWhen: '50 problems solved and tracked.', priority: 3 },
    { title: 'Merge 1 pull request on an open-source or class project', doneWhen: 'At least one PR merged.', priority: 2 },
    { title: 'Write 1 resume tailored to internship roles', doneWhen: 'Resume reviewed by a mentor or career center.', priority: 2 },
    { title: 'Complete 2 mock technical interviews', doneWhen: 'Two mock interviews completed with feedback notes.', priority: 2 },
    { title: 'Apply to 15 internship postings', doneWhen: '15 applications submitted and tracked.', priority: 1 },
  ],
  'entry-level': [
    { title: 'Complete 1 software engineering internship', doneWhen: 'Internship completed with a manager reference available.', priority: 3 },
    { title: 'Build 2 production-quality portfolio projects with tests and CI', doneWhen: 'Both projects deployed with passing CI.', priority: 3 },
    { title: 'Solve 150 data structures & algorithms problems', doneWhen: '150 problems solved across core topics.', priority: 3 },
    { title: 'Complete 5 system design interview sessions', doneWhen: 'Five system design sessions completed with feedback.', priority: 2 },
    { title: 'Merge 2 pull requests on open-source or team projects', doneWhen: 'At least two PRs merged.', priority: 2 },
    { title: 'Apply to 30 full-time roles', doneWhen: '30 applications submitted and tracked.', priority: 1 },
  ],
};

const DATA_SCIENTIST_ROADMAP: MockRoadmapByLevel = {
  internship: [
    { title: 'Complete 1 end-to-end data analysis project with a public dataset', doneWhen: 'Notebook published with findings and visualizations.', priority: 3 },
    { title: 'Complete 1 statistics and probability course', doneWhen: 'Course or equivalent self-study completed with notes.', priority: 3 },
    { title: 'Build 1 predictive model with scikit-learn or similar', doneWhen: 'Model trained, evaluated, and documented.', priority: 2 },
    { title: 'Solve 30 SQL query problems', doneWhen: '30 SQL problems solved.', priority: 2 },
    { title: 'Write 1 resume highlighting data projects', doneWhen: 'Resume reviewed by a mentor or career center.', priority: 2 },
    { title: 'Apply to 15 internship postings', doneWhen: '15 applications submitted and tracked.', priority: 1 },
  ],
  'entry-level': [
    { title: 'Complete 1 data science or analytics internship', doneWhen: 'Internship completed with a manager reference available.', priority: 3 },
    { title: 'Build 2 portfolio projects covering cleaning, modeling, and deployment', doneWhen: 'Both projects documented and deployed or presented.', priority: 3 },
    { title: 'Design and analyze 1 A/B test', doneWhen: 'One mock experiment designed and analyzed.', priority: 3 },
    { title: 'Solve 50 SQL and statistics practice questions', doneWhen: '50 practice questions completed.', priority: 2 },
    { title: 'Present 1 project to a technical or non-technical audience', doneWhen: 'Presentation delivered and feedback collected.', priority: 2 },
    { title: 'Apply to 30 full-time roles', doneWhen: '30 applications submitted and tracked.', priority: 1 },
  ],
};

const PRODUCT_MANAGER_ROADMAP: MockRoadmapByLevel = {
  internship: [
    { title: 'Write 1 product case study analyzing an existing app', doneWhen: 'Case study written and shared for feedback.', priority: 3 },
    { title: 'Complete 1 product fundamentals course', doneWhen: 'Course or equivalent reading completed with notes.', priority: 3 },
    { title: 'Conduct 3 user interviews for a class or side project', doneWhen: 'Three interviews completed with synthesized notes.', priority: 2 },
    { title: 'Write 1 product requirements document for a hypothetical feature', doneWhen: 'PRD drafted and reviewed by a peer or mentor.', priority: 2 },
    { title: 'Complete 2 mock product sense or case interviews', doneWhen: 'Two mock case interviews completed with feedback.', priority: 2 },
    { title: 'Apply to 15 internship postings', doneWhen: '15 applications submitted and tracked.', priority: 1 },
  ],
  'entry-level': [
    { title: 'Complete 1 product management or related internship', doneWhen: 'Internship completed with a manager reference available.', priority: 3 },
    { title: 'Lead 1 feature from spec to launch on a class, club, or side project', doneWhen: 'Feature shipped with a documented outcome or metric.', priority: 3 },
    { title: 'Conduct 5 user interviews and synthesize findings', doneWhen: 'Five interviews completed with a written synthesis.', priority: 3 },
    { title: 'Complete 15 mock product, analytical, and behavioral interviews', doneWhen: '15 mock interviews completed with feedback notes.', priority: 2 },
    { title: 'Write 2 PRDs, at least one backed by real user data', doneWhen: 'Both PRDs reviewed by a mentor or peer.', priority: 2 },
    { title: 'Apply to 30 full-time roles', doneWhen: '30 applications submitted and tracked.', priority: 1 },
  ],
};

const UI_UX_ROADMAP: MockRoadmapByLevel = {
  internship: [
    { title: 'Build 1 case study redesigning an existing app’s core flow', doneWhen: 'Case study published in a portfolio with before/after visuals.', priority: 3 },
    { title: 'Complete 1 UX research and design fundamentals course', doneWhen: 'Course or equivalent completed with notes.', priority: 3 },
    { title: 'Conduct 3 usability tests on a design', doneWhen: 'Three usability tests completed with findings documented.', priority: 2 },
    { title: 'Build 1 high-fidelity prototype in Figma', doneWhen: 'Prototype complete and shared for feedback.', priority: 2 },
    { title: 'Publish 1 portfolio site with 2-3 projects', doneWhen: 'Portfolio published with a shareable link.', priority: 2 },
    { title: 'Apply to 15 internship postings', doneWhen: '15 applications submitted and tracked.', priority: 1 },
  ],
  'entry-level': [
    { title: 'Complete 1 UX or product design internship', doneWhen: 'Internship completed with a manager or mentor reference available.', priority: 3 },
    { title: 'Build 2 in-depth case studies from research through final design', doneWhen: 'Both case studies published with process and outcomes.', priority: 3 },
    { title: 'Conduct 5 usability tests across at least 2 projects', doneWhen: 'Five usability tests completed with documented findings.', priority: 3 },
    { title: 'Complete 5 mock portfolio review interviews', doneWhen: 'Five mock portfolio reviews completed with feedback.', priority: 2 },
    { title: 'Collaborate with 1 engineer or PM on a shipped feature', doneWhen: 'Feature shipped with the design implemented as specified.', priority: 2 },
    { title: 'Apply to 30 full-time roles', doneWhen: '30 applications submitted and tracked.', priority: 1 },
  ],
};

const GENERIC_ROADMAP: MockRoadmapByLevel = {
  internship: [
    { title: 'Build 1 project or portfolio piece relevant to the target role', doneWhen: 'Project complete and shareable.', priority: 3 },
    { title: 'Complete 1 introductory course in the target field', doneWhen: 'Course or equivalent self-study completed with notes.', priority: 3 },
    { title: 'Complete 1 hands-on exercise or case study relevant to the role', doneWhen: 'Exercise complete and documented.', priority: 2 },
    { title: 'Write 1 resume tailored to the target role', doneWhen: 'Resume reviewed by a mentor or career center.', priority: 2 },
    { title: 'Complete 2 mock interviews for the target role', doneWhen: 'Two mock interviews completed with feedback.', priority: 2 },
    { title: 'Apply to 15 internship postings', doneWhen: '15 applications submitted and tracked.', priority: 1 },
  ],
  'entry-level': [
    { title: 'Complete 1 internship or equivalent hands-on experience in the target field', doneWhen: 'Experience completed with a reference available.', priority: 3 },
    { title: 'Build 2 portfolio-quality projects relevant to the target role', doneWhen: 'Both projects complete and documented.', priority: 3 },
    { title: 'Complete 1 intermediate course deepening core role skills', doneWhen: 'Course or equivalent self-study completed with notes.', priority: 2 },
    { title: 'Complete 5 mock interviews for the target role', doneWhen: 'Five mock interviews completed with feedback.', priority: 2 },
    { title: 'Build a network of 10 contacts in the field', doneWhen: '10 informational conversations or connections made.', priority: 2 },
    { title: 'Apply to 30 full-time roles', doneWhen: '30 applications submitted and tracked.', priority: 1 },
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
    priority: item.priority,
    status: 'not_started',
  }));
};

const DIGIT_PATTERN = /\d/u;

const mockGenerateCvBullet = async (input: GenerateCvBulletInput): Promise<CvBulletResult> => {
  await delay(3_000);
  const failure = mockFailureKind();
  if (failure) {
    throw new ApiError(failure, `Mocked ${failure} failure.`);
  }

  const notes = input.notes.trim();
  const evidence = notes || input.taskTitle;

  if (!DIGIT_PATTERN.test(notes)) {
    return {
      text: `Completed ${input.taskTitle} by [X], based on: ${evidence}.`,
      suggestions: ['Add a specific number — how many, how much, or over what time period.'],
    };
  }

  return {
    text: `Completed ${input.taskTitle}, as shown by: ${evidence}.`,
  };
};
