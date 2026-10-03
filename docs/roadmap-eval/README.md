# Roadmap quality evaluation

A fixed set of test cases and a scoring rubric for the roadmaps Maven generates, so that a prompt or model change can be judged on evidence rather than on a few hand-picked examples.

| File | What it is |
|---|---|
| `cases.csv` | 84 cases: 14 roles × 2 levels × 3 profiles. |
| `rubric.md` | How to score a roadmap: 8 per-milestone criteria, 4 roadmap-level checks, worked examples, banned phrases, how to record failures. |
| `results-template.csv` | One row per (case, milestone) for recording scores. The first data row is a filled-in example; delete it before use. |

Nothing here has been run. The backend is not deployed yet, and these files contain no code.

## The cases

- **Roles:** `role_id` uses the exact ids from `mobile/src/data/roles.ts`. They match the backend's `backend/src/data/targets.ts`, which rejects unknown ids.
- **Profiles:** each role has three, written in the first person:
  - **(a)** almost no experience;
  - **(b)** coursework and one small project;
  - **(c)** already at internship level.
- **Levels:** each profile appears once per level with the same text, so the level is the only thing that changes between the two rows.
- **Content:** all profiles are fictional, contain no real people or company names, and are 200–600 characters.
- **`target_employer`:** blank except for 6 rows, which use descriptive text ("a regional hospital network") to exercise the optional employer field.
- **`weekly_hours`:** 5 for (a), 8 for (b) and 12 for (c).

## Running a case against the real backend (once deployed)

`POST /api/roadmap` (see `backend/src/services/roadmap.ts`, `normalizeRoadmapInput`).

**Headers**, the same as the app sends:

```
Content-Type: application/json
Authorization: Bearer <Firebase ID token>
X-Firebase-AppCheck: <App Check token>
```

Every AI route needs a valid App Check token. For an evaluation run, use a **staging** project with a registered App Check debug token and an anonymous Firebase account. Never use production, and never put either token in a file in this repo. See `docs/app-check-and-consent.md`.

**Body**, mapped from a `cases.csv` row:

```json
{
  "experience": "<experience_text> I can spend about <weekly_hours> hours a week on this.",
  "level": "<level>",
  "targetRole": {
    "id": "<role_id>",
    "title": "<the role's title from roles.ts>",
    "employer": "<target_employer, omit the key when blank>"
  }
}
```

- **There is no weekly-hours field.** Neither the backend's input type (`experience`, `level`, `targetRole { id, title, employer }`, optional `targetIndustry`) nor the prompt has a place for available time. To test it, the hours have to be folded into the experience text, as above. Use exactly that sentence for every case, so it isn't a hidden variable between runs. This means the model sees the hours only as part of the user's self-description. If hours turn out to matter, adding a real field is a backend and prompt change.
- **`experience`** must be non-empty, at most 4,000 characters, and free of control characters. Every case is well under the limit.
- **`targetRole.id`** must be a known role. The backend then uses its own title for that id.
- **`targetIndustry`** exists in the backend but the app never sends it. Leave it out so the evaluation matches what the app does.

**Response:** `{ "tasks": [ … ] }` with 5–7 items. Each item has:
- `title`, built as `"<verb> <artifact> <topic>"`;
- `doneWhen`, `why`, `steps` (2–5), `estimatedWeeks` (1–8), `priority` (1–3);
- plus `id`, `weight` and `status`, which the server adds.

Score `title`, `doneWhen`, `steps` and `estimatedWeeks` with the rubric.

- **Already enforced by the backend:**
  - the 5–7 count;
  - the allowed verb list;
  - an artifact starting with a number;
  - no exactly repeated titles.

  The rubric's R4 check catches it if that enforcement ever breaks.
- **Rate limits:** by default 10 AI requests per user per minute, and 60 per minute / 1,000 per day globally. A full 84-case run needs pacing (about 1 request every 7 seconds per account), and a large run with repeats can hit the daily cap.

## How much to sample

**Automatically, on every run (all 84 cases):**
- **Structural checks:** request succeeded, 5–7 milestones, R4 format, estimated weeks in 1–8.
- **Banned phrases:** scan titles and steps against the list in `rubric.md`.
- **Near-duplicates:** flag any two milestone titles in one roadmap sharing most of their content words.
- **Effort sanity:** flag milestones where `estimatedWeeks × weekly_hours` is under 3 hours or over 120 hours.

These are cheap screening checks, not scores. They flag cases for review. Nobody has written a script for them yet.

**By hand:** these criteria need judgment.
- Score a stratified sample of **28 cases**: one per role per level, alternating profiles (a), (b) and (c) across roles so each profile appears about 9 times.
- Also score **every case the automatic checks flagged**.
- Use two reviewers on at least 10 of the 28 so you can see how often scorers disagree. If they disagree on more than 1 criterion in 5, tighten the rubric wording before trusting single-reviewer scores.

**Repeats:** generation isn't deterministic. For the 28 hand-scored cases, run each **3 times**. Score all three runs if time allows; otherwise score one run chosen at random and use the other two only for the automatic checks.

## Comparing two prompt versions

1. **Change one thing.** Same model, cases, request shape and hours sentence. Record the version in `prompt_version` (for example `v1`, `v2`) and the date in `run_date`.
2. **Same cases for both.** Generate every case for both versions, in the same session if possible, so model updates on the provider side don't fall between them.
3. **Blind the reviewers.** Give them both roadmaps for a case with the version labels hidden and the order randomised. Unblind only after scoring.
4. **Compare per case, not just averages.** For each hand-scored case, note whether the new version is better, the same or worse on roadmap score. Report:
   - **pass rate** for each version (the pass rule is in `rubric.md`);
   - **mean roadmap score**, and the mean of each criterion, to see what moved;
   - **number of M8 (invented fact) failures**. This must not go up. Any increase blocks the change, whatever else improves;
   - **cases where the new version is worse**, read in full.
5. **Decide.** Adopt the new prompt only if it wins or ties on more cases than it loses, its pass rate doesn't drop, and its M8 failures don't rise. With 28 cases, a difference of 1 or 2 is noise. If the result is close, run the full 84 by hand before deciding.
6. **Keep the results.** Store filled-in results files next to the template, named by version and date, for example `results-v2-2026-10-10.csv`. Don't edit `cases.csv` between versions: changing the cases makes old results incomparable. Add new cases as a new file instead.
