import type { CvEntry, RoadmapTask, Target, TaskStatus, TaskStep } from '../types';

/**
 * Generated data for trying the app at scale: 3 targets, one with 20
 * milestones of 10 steps each, and 500 ready CV bullets. Pure — no clock, no
 * randomness, no network — so the same `now` and `runId` always give the same
 * data. `runId` makes every id unique to one load: tombstones are terminal, so
 * reusing an id from an earlier, deleted load would make it vanish on sync.
 */

const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const pad = (n: number): string => String(n).padStart(2, '0');

export const TEST_DATA_COUNTS = { targets: 3, bigRoadmap: 20, stepsPerMilestone: 10, bullets: 500 } as const;

const VERBS = ['Build', 'Ship', 'Write', 'Publish', 'Complete', 'Deploy', 'Analyse', 'Present'] as const;
const ARTIFACTS = ['REST API', 'case study', 'dashboard', 'design doc', 'test suite', 'portfolio page', 'SQL report', 'CLI tool'] as const;

/** The big roadmap's status pattern: 6 done, 3 in progress, 11 not started. */
const statusFor = (index: number): TaskStatus => (index < 6 ? 'done' : index < 9 ? 'in_progress' : 'not_started');

const steps = (prefix: string, status: TaskStatus, index: number, now: number): TaskStep[] =>
  Array.from({ length: TEST_DATA_COUNTS.stepsPerMilestone }, (_, s) => {
    const done = status === 'done' || (status === 'in_progress' && s < 3 + index % 5);
    return {
      id: `${prefix}-s${pad(s + 1)}`,
      title: `Step ${s + 1}: ${['Plan', 'Draft', 'Build', 'Test', 'Review'][s % 5]} part ${s + 1}`,
      done,
      ...(done ? { completedAt: iso(now - (30 - index) * DAY + s * 3_600_000) } : {}),
    };
  });

const milestone = (prefix: string, index: number, status: TaskStatus, now: number): RoadmapTask => {
  const priority = ((index % 3) + 1) as 1 | 2 | 3;
  // Due dates a week apart, the tenth milestone's falling today: milestones 7-9
  // (the three in progress) are overdue, 10 is due today, 11 onwards are ahead.
  const due = now + (index - 9) * 7 * DAY;
  return {
    id: `${prefix}-m${pad(index + 1)}`,
    title: `${VERBS[index % VERBS.length]} ${(index % 4) + 1} ${ARTIFACTS[index % ARTIFACTS.length]} for project ${index + 1}`,
    doneWhen: `The ${ARTIFACTS[index % ARTIFACTS.length]} is finished and linked from your CV.`,
    why: 'Generated test data.',
    steps: steps(`${prefix}-m${pad(index + 1)}`, status, index, now),
    estimatedWeeks: (index % 8) + 1,
    targetDate: iso(due),
    priority,
    weight: priority,
    status,
    ...(status !== 'not_started' ? { startedAt: iso(now - (40 - index) * DAY) } : {}),
    ...(status === 'done' ? { completedAt: iso(now - (30 - index) * DAY), notes: `Finished milestone ${index + 1} with 3 users testing it.` } : {}),
  };
};

const target = (id: string, roleId: string, level: Target['level'], roadmap: RoadmapTask[], now: number, ageDays: number): Target => ({
  id,
  roleId,
  level,
  experience: 'Generated test data: two class projects and one internship.',
  createdAt: iso(now - ageDays * DAY),
  updatedAt: iso(now - ageDays * DAY),
  roadmap,
  focusTaskIds: roadmap.filter((task) => task.status === 'in_progress').slice(0, 2).map((task) => task.id),
});

export const generateTestData = (now: number, runId: string): { targets: Target[]; cvEntries: CvEntry[] } => {
  const p = `test-${runId}`;
  const small = (prefix: string): RoadmapTask[] =>
    Array.from({ length: 5 }, (_, i) => milestone(prefix, i, i < 2 ? 'done' : i === 2 ? 'in_progress' : 'not_started', now));

  const targets = [
    target(`${p}-t1`, 'software-engineer', 'internship', Array.from({ length: TEST_DATA_COUNTS.bigRoadmap }, (_, i) => milestone(`${p}-t1`, i, statusFor(i), now)), now, 60),
    target(`${p}-t2`, 'data-analyst', 'entry-level', small(`${p}-t2`), now, 45),
    target(`${p}-t3`, 'product-manager', 'internship', small(`${p}-t3`), now, 30),
  ];

  // Bullets point at finished milestones, spread across all three targets.
  const finished = targets.flatMap((t) => t.roadmap.filter((task) => task.status === 'done').map((task) => ({ targetId: t.id, task })));
  const cvEntries: CvEntry[] = Array.from({ length: TEST_DATA_COUNTS.bullets }, (_, i) => {
    const source = finished[i % finished.length] as (typeof finished)[number];
    const created = iso(now - (TEST_DATA_COUNTS.bullets - i) * 60_000);
    return {
      id: `${p}-b${String(i + 1).padStart(3, '0')}`,
      targetId: source.targetId,
      taskId: source.task.id,
      status: 'ready',
      text: `Built ${i + 1} things for ${source.task.title.toLowerCase()}, used by ${(i % 9) + 1} classmates.`,
      createdAt: created,
      updatedAt: created,
    };
  });

  return { targets, cvEntries };
};
