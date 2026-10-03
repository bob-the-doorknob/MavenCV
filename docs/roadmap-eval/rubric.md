# Roadmap quality rubric

How to score one generated roadmap for one case in `cases.csv`. Score each milestone against the per-milestone criteria (M1–M8), then score the roadmap as a whole (R1–R4). Record the results in `results-template.csv`, one row per milestone.

Read the case's `experience_text`, `level` and `weekly_hours` first. Several criteria depend on them.

## Per-milestone criteria (each 0 or 1)

| Code | Criterion | Scores 1 when… | Scores 0 when… |
|---|---|---|---|
| **M1 artifact** | Names a verifiable artifact | The title names something that exists when finished and that someone else could check: a repo, a deployed app, a report, a dashboard, a certificate, a published post. | It describes an activity or a state of mind: "learn React", "get comfortable with SQL", "explore cloud". |
| **M2 measurable** | Has a number or measurable target | The title or `doneWhen` contains a count or threshold that decides completion: "3 REST endpoints", "20 unit tests", "0.80 AUC", "5 user interviews". | There is no number, or the number doesn't decide completion ("1 journey of learning"). |
| **M3 achievable** | Achievable for the level and the weekly hours | `estimatedWeeks × weekly_hours` is a realistic effort for this person. A beginner on 5 h/week is not asked to ship a production system in 2 weeks. An internship roadmap stays at internship scope. | The effort is clearly too large or too trivial for the stated hours and experience, or the milestone needs access the student can't have (production data at a company, a paid enterprise licence). |
| **M4 role-specific** | Specific to the role | Only makes sense for this role, or for a small family of roles. It uses the role's real tools and artifacts. | It would fit any role unchanged ("improve communication skills", "build a personal brand"), or it belongs to a different role. |
| **M5 not duplicate** | Not a near-duplicate of another milestone in the same roadmap | It produces a different artifact or covers a different skill from every other milestone. | Another milestone produces essentially the same artifact with different wording ("Build 1 portfolio site" and "Publish 1 portfolio website"). Score 0 on the **later** one only. |
| **M6 weeks** | Plausible `estimatedWeeks` | The estimate is within about ×2 of what an experienced reviewer would expect, given `weekly_hours`. | The estimate is off by more than ×2 either way. |
| **M7 steps** | Concrete steps | Each step is an action a student could start today: "write the schema for 3 tables", "record 5 interviews". | Steps are vague or just restate the title: "research the topic", "work hard", "finalise". |
| **M8 no invented facts** | No invented facts about the user | Nothing in the title, `why`, `doneWhen` or steps claims the user has done, owns, knows or lacks something the profile doesn't say. Not mentioning a skill is **not** evidence the user lacks it. | It claims prior work ("extend your existing Kubernetes cluster" when none is mentioned), attributes credentials, or assumes a missing skill ("since you don't know Python…" when the profile is silent). **A 0 here is a failure in every case** (see "Recording a failure"). |

## Roadmap-level checks (each 0 or 1, recorded once per roadmap)

| Code | Check | Scores 1 when… |
|---|---|---|
| **R1 order** | Sensible order | Foundations come before work that depends on them. A milestone never needs the output of a later one. |
| **R2 level fit** | Respects the stated experience | For profile (c), the roadmap doesn't repeat work the profile already lists. For profile (a), it doesn't assume skills the profile rules out. |
| **R3 coverage** | Covers what the role is hired for | Taken together, the milestones touch the role's core skill areas (the backend's guidance for the role in `backend/src/data/targets.ts` is a useful reference), not one area five times. |
| **R4 format** | Every title follows `[Verb] + [Measurable Quantity/Artifact] + [Topic]` | All 5–7 milestones use an allowed verb (Build, Complete, Create, Deliver, Demonstrate, Deploy, Design, Develop, Earn, Implement, Lead, Pass, Publish, Ship, Validate) and an artifact that starts with a number. The backend should already enforce this; a 0 here means it doesn't. |

**Scores:**
- **Milestone score** = M1 + … + M8, out of 8.
- **Roadmap score** = mean milestone score + R1 + R2 + R3 + R4, out of 12.
- **Pass** = no M8 failures, **and** a roadmap score of at least 9, **and** R4 = 1.

## Worked examples

Case `backend-cloud-internship-b`: third-year, one Flask API with 6 endpoints, no cloud or tests, 8 h/week.

1. **Good:** *"Deploy 1 Flask API with 6 endpoints to a cloud container service"*
   - `doneWhen`: "A public URL returns 200 from all 6 endpoints and the deploy runs from a script."
   - 3 weeks, with steps like "Write a Dockerfile for the existing API".
   - Scores **8/8**. It builds on stated work without claiming more, and 3 × 8 = 24 hours is plausible.
2. **Bad, vague:** *"Learn 1 cloud platform deeply"*
   - M1 = 0 (no artifact). M2 = 0 (the "1" doesn't decide completion). M4 = 0 for cloud generally. M7 = 0 (steps: "Read documentation", "Practise").
   - Scores **4/8**.
3. **Bad, invented fact:** *"Implement 20 integration tests for your existing CI pipeline"*
   - The profile says nothing about CI. M8 = 0, which is a failure regardless of the other scores.
   - Fixed version: *"Implement 20 integration tests for the 6-endpoint Flask API"*.

Case `ui-ux-internship-a`: beginner, no Figma, 5 h/week.

4. **Bad, unachievable:** *"Ship 3 full product case studies with usability testing"* in 2 weeks
   - 2 × 5 = 10 hours for three case studies, for someone who has never opened Figma. M3 = 0, M6 = 0.
   - Better: *"Create 1 redesign of a 4-screen sign-up flow in Figma"*, 3 weeks.

Case `data-scientist-entry-level-c`: strong profile, already built a churn model.

5. **Bad, duplicate of past work:** *"Build 1 churn prediction model on customer data"*
   - The profile already lists this. R2 = 0 for the roadmap. The milestone may still score well on M1–M8.

## Banned vague phrases

A milestone title or step containing any of these scores **0 on M1 or M7** (whichever applies), unless the same sentence also names a concrete artifact and a number:

- "improve your skills", "level up", "upskill"
- "learn the basics of", "get familiar with", "get comfortable with", "explore"
- "gain experience in", "gain exposure to", "deepen your understanding"
- "build your personal brand", "network more", "stay up to date"
- "work on", "practise regularly", "keep practising"
- "master", "become proficient in", "become an expert"
- "research the topic", "do some reading", "think about"
- "finalise", "polish", "wrap up" (as a whole step)
- "various", "several", "some", "a few" (in place of a number)

## Recording a failure

In `results-template.csv`:

1. **Put a 0 in the failing criterion's column** and write one sentence in `notes` quoting the exact text that failed, e.g. `M8: "extend your existing Kubernetes cluster" — profile has no Kubernetes`.
2. **Set `failure_type`** to the first matching type:
   - `invented_fact` — any M8 = 0. Always a roadmap fail.
   - `format` — R4 = 0, or the title has no verb, number or topic. The backend should have rejected it, so also file a backend bug.
   - `unachievable` — M3 = 0 or M6 = 0.
   - `vague` — M1, M2 or M7 = 0, or a banned phrase.
   - `off_role` — M4 = 0.
   - `duplicate` — M5 = 0, or R2 = 0 because of repeated past work.
   - `order` — R1 = 0.
3. **Record roadmap-level checks once**, on the row with `milestone_index` = 1, and leave R1–R4 blank on the other rows.
4. **If the request itself fails** (an error, a timeout, or a response with fewer than 5 or more than 7 milestones), add one row with `milestone_index` = 0, `failure_type` = `request_failed`, and the error code or message in `notes`.
5. **Two reviewers disagree:** each records their own rows (the `reviewer` column differs). Resolve by discussion, then add a third row set with `reviewer` = `consensus`.
