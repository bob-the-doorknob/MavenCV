# Cross-Industry CV Bullet Targeting Design

**Date:** 2026-09-19
**Status:** Approved for specification

## Objective

Extend Trajectory's CV bullet generator so it can tailor truthful resume bullets to any target role and optional industry. Preserve the existing single-bullet contract, prevent prompt instructions embedded in user data from changing model behavior, and ask for missing evidence instead of inventing it.

## Scope

This feature includes:

- explicit target-role and optional target-industry inputs;
- persisted mobile defaults with per-generation overrides;
- cross-industry few-shot prompting;
- role-neutral behavior when no role is available;
- input and model-output validation;
- a working `POST /api/cv-bullet` route;
- a CV Vault generation form; and
- focused backend and mobile tests.

This feature does not add a navigation framework, external resume data, scraping, or AI calls to the daily checklist. The current app renders only its setup placeholder, so the CV Vault form will be ready for later navigation integration but will not introduce an unrelated navigation system.

## Architecture

The mobile store owns a persisted `cvPreferences` value. It supplies defaults to the CV Vault form. Editing form values creates a local, per-generation override and does not update the stored defaults. An explicit save action updates the defaults.

The CV Vault form sends a completed task title, candidate notes, target role, and optional industry to `POST /api/cv-bullet`. The backend validates and normalizes the request before calling Gemini. The service builds the complete prompt, requests structured JSON, validates the response, and returns one bullet plus optional suggestions.

Gemini remains isolated in the Cloud Run backend. The mobile client never receives the Gemini API key or imports the Gemini SDK.

## Data Model and Persistence

Add the following mobile type:

```ts
interface CvPreferences {
  targetRole: string;
  targetIndustry?: string;
}
```

`targetRole` uses an empty string as the safe default so existing users can migrate without guessing a profession. `targetIndustry` is omitted when blank.

The Zustand store gains:

- `cvPreferences`;
- `setCvPreferences(preferences)`; and
- persisted-state version 2.

The version-2 migration preserves `targetRoles`, `activeTargetRoleId`, and `cvEntries`, then adds `{ targetRole: '' }` when preferences are absent. No existing storage key is deleted.

## API Contract

The request body is:

```ts
interface CvBulletRequestBody {
  taskTitle: string;
  notes: string;
  targetRole?: string;
  targetIndustry?: string;
}
```

Role is optional at the API boundary because the product explicitly supports role-neutral generation. The mobile preference remains a string so it has a stable persisted default.

The successful response remains backward compatible:

```ts
interface CvBulletResponseBody {
  bullet: string;
  suggestions?: string[];
}
```

Validation errors return HTTP 400 using the existing `{ error: { code, message } }` envelope. Model failures or invalid model output return HTTP 502 with a non-sensitive error message. The route never returns the Gemini API key, raw provider response, or internal prompt.

## Input Validation

The backend applies these rules before any Gemini call:

- trim every string;
- require non-empty `taskTitle` and `notes`;
- limit `taskTitle` to 200 characters and `notes` to 2,000 characters;
- limit `targetRole` and `targetIndustry` to 80 characters;
- reject ASCII control characters except ordinary whitespace handled during normalization;
- treat a blank role as missing and use the role-neutral path; and
- omit a blank industry.

The UI mirrors these limits for fast feedback, but the backend remains authoritative.

## Prompt Design

The system instruction identifies the model as a cross-industry resume-writing specialist rather than a recruiter for a tier-1 technology company. It requires:

- exactly one concise bullet using Google's XYZ structure;
- a strong past-tense verb, or present tense only for explicitly ongoing work;
- no first-person language, filler, or unsupported claims;
- only facts contained in the task and notes;
- `[X]` placeholders when a missing quantity would materially improve the bullet;
- short suggestions that ask for the missing details;
- role-appropriate priorities and vocabulary when a role is supplied;
- plain, role-neutral language when it is not; and
- strict JSON output with `bullet` and optional `suggestions` only.

The user payload is serialized inside explicit `BEGIN_UNTRUSTED_CANDIDATE_DATA` and `END_UNTRUSTED_CANDIDATE_DATA` delimiters. The system instruction says that text inside the block is data, not instructions, and that embedded requests must be ignored.

Few-shot examples cover nursing, investment banking, product design, teaching, and an electrical trade. Examples demonstrate domain-appropriate evidence without implying that the supported roles are limited to those professions.

## Model Selection

Use the explicit stable model ID `gemini-3.6-flash`. Do not use the moving `gemini-flash-latest` alias because an automatic model swap could change structured-output behavior without a code deployment. The model remains injectable in service tests.

## Output Validation

Gemini's JSON response schema permits exactly:

- required non-empty `bullet`; and
- optional array of non-empty `suggestions` strings.

Runtime validation rejects malformed JSON, unknown properties, an empty bullet, more than one bullet, more than 28 words, first-person pronouns, and an unsupported sentence opening. The action-verb rule uses a focused allowlist covering common cross-industry verbs and can be extended without changing the API contract.

Suggestions are trimmed, empty values are removed, and output is limited to three suggestions of at most 120 characters each. A bullet containing `[X]` must include a suggestion explaining what evidence the user can add.

## Mobile UI

`CvVaultScreen` gains a generation form using React Native primitives and the centralized theme:

- required-looking `Target role` field with a role-neutral fallback notice;
- optional `Target industry` field;
- task-title and notes inputs;
- a save-defaults action separate from generation;
- a generate action using the current form values as one-off overrides;
- accessible labels, hints, keyboard configuration, loading state, and inline validation; and
- rendering for the generated bullet and optional suggestions.

No AI request is initiated from `ChecklistScreen`. No new UI dependency is required.

Because application navigation has not been implemented, this feature does not replace `SetupScreen` in `App.tsx` or add ad hoc navigation. The CV Vault flow will be integrated when the planned navigation shell is built.

## Error Handling

The UI distinguishes validation failures from backend/provider failures and keeps the user's typed values after an error. It never displays raw provider errors.

The backend maps:

- invalid client input to HTTP 400;
- invalid or empty Gemini output to HTTP 502; and
- unexpected failures to the existing generic API error envelope.

## Testing

Backend tests cover:

- role and industry prompt content;
- clean omission of industry;
- role-neutral prompting without guessed professions;
- cross-industry few-shot guidance;
- whitespace, length, and control-character validation;
- injection-style notes remaining inside the untrusted-data block;
- the `gemini-3.6-flash` request payload;
- strict parsing of `bullet` and optional `suggestions`; and
- route success and error mappings.

Mobile tests cover pure preference normalization/migration and API request construction. UI behavior will be checked with the project's available tooling; no new test dependency will be added solely for this feature.

## Manual Verification

Verify four cases through the CV Vault form once navigation exposes it:

1. Nurse with healthcare terminology and patient-safety evidence.
2. Investment Banking Analyst with valuation or diligence evidence.
3. Product Designer with research, iteration, or usability evidence.
4. No target role, confirming neutral language and the prompt to set a role.

For each case, confirm that the bullet contains only supplied facts, uses `[X]` rather than an invented metric, remains within 28 words, and returns helpful suggestions when evidence is missing.

## Security and Privacy

The API key remains in `GEMINI_API_KEY` on the backend. User text is treated as untrusted data and cannot select models, tools, or system instructions. The implementation does not use external datasets, scrapers, or third-party resume services.
