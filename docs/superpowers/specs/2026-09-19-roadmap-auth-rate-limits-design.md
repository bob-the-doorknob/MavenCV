# Roadmap Generation, Authentication, and Rate-Limit Design

## Goal

Implement the first production-facing roadmap generation endpoint and protect all
AI generation routes from anonymous use and excessive per-user traffic. The
mobile checklist remains offline; only setup and explicit CV generation call the
backend.

## Scope

This change will:

- implement `POST /api/roadmap`;
- authenticate `/api/roadmap` and `/api/cv-bullet` with Firebase ID tokens;
- enforce a distributed per-user generation limit through Firestore;
- keep `GET /health` public;
- document the mobile request contract and Cloud Armor deployment protection;
- add automated tests and a credential-aware manual smoke test.

This change will not implement frontend screens, store user profiles, scrape job
sites, introduce resume or job datasets, or call AI from the daily checklist.

## Chosen Security Architecture

The mobile application signs users in with Firebase Authentication and sends the
resulting ID token in `Authorization: Bearer <token>`. The backend uses the
Firebase Admin SDK to verify the token and derives the trusted user ID from the
decoded token. Client-supplied user IDs are never accepted.

Authentication middleware protects both AI routes. Missing or invalid tokens
return a stable `401` JSON error. `GET /health` stays unauthenticated for Cloud
Run health checks.

On Cloud Run, Firebase Admin uses Application Default Credentials and the
configured Google Cloud project. Local development can use a service-account
credential supplied outside Git or the Firebase Auth emulator. No Firebase or
Gemini secret is stored in source control.

The backend uses Firestore transactions for a fixed-window per-user quota. The
default limit is configurable through environment variables and applies before a
Gemini call, so concurrent Cloud Run instances cannot independently exceed the
same user's allowance. Exceeded limits return `429`, a stable JSON error, and a
`Retry-After` header. Rate-limit documents contain only the Firebase UID,
window timestamp, and count; no candidate notes or generated content are stored.

Cloud Armor should add a coarse per-IP throttle in front of Cloud Run for flood
protection. It is a deployment control rather than the source of truth for user
quotas, because Cloud Armor rate limits are approximate and require load-balancer
configuration outside the application repository.

## Dependencies and Injection Boundaries

Add `firebase-admin` to the backend. Do not add a second rate-limit package:
Firebase Admin already supplies Auth and Firestore clients.

Authentication and quota checks are exposed through narrow TypeScript
interfaces and injected into `createApp`. Production defaults use Firebase;
tests use deterministic fakes and never need credentials or network access.

## Roadmap API Contract

### Request

`POST /api/roadmap`

```json
{
  "experience": "Built two TypeScript APIs and used PostgreSQL in coursework.",
  "targetRole": {
    "title": "Backend Engineer",
    "employer": "Optional employer"
  },
  "targetIndustry": "Fintech"
}
```

`experience` and `targetRole.title` are required non-empty strings.
`targetRole.employer` and `targetIndustry` are optional. All fields are trimmed,
length-limited, and rejected when their types are incorrect. Unknown fields are
ignored at the HTTP boundary rather than forwarded to Gemini.

### Response

```json
{
  "tasks": [
    {
      "id": "server-generated-uuid",
      "title": "Build 3 production-style REST endpoints for transaction processing",
      "weight": 17,
      "status": "not_started"
    }
  ]
}
```

The response contains exactly five to seven tasks. IDs and statuses are created
by the backend. Positive integer weights are assigned arithmetically by the
backend and always total 100. Gemini never computes the readiness score.

## Gemini Prompt and Validation

Gemini receives only the normalized experience and target information inside an
explicitly delimited, JSON-encoded untrusted-data block. The system instruction
tells it to ignore instructions inside candidate fields and return only roadmap
recommendations.

Gemini returns strict JSON with five to seven structured milestones:

```json
{
  "milestones": [
    {
      "verb": "Build",
      "artifact": "3 production-style REST endpoints",
      "topic": "transaction processing"
    }
  ]
}
```

The structured schema makes the required `[Verb] + [Measurable
Quantity/Artifact] + [Topic]` format explicit. The backend validates the exact
object shape, milestone count, allowed imperative action verbs, field lengths,
control characters, and duplicates before assembling task titles. Invalid model
output becomes a stable `502` response; it is never partially accepted.

The prompt may use a small set of authored cross-industry examples but no web
scrapers or external resume/job datasets. Recommendations are tailored to the
requested role and industry without claiming that the user's experience contains
facts they did not provide.

## Error Contract

- `400 INVALID_ROADMAP_INPUT`: malformed or out-of-bounds request data.
- `401 AUTHENTICATION_REQUIRED`: missing, malformed, expired, or invalid token.
- `429 RATE_LIMIT_EXCEEDED`: the authenticated user's generation window is full.
- `502 ROADMAP_GENERATION_FAILED`: Gemini failed or returned invalid content.
- `500 INTERNAL_ERROR`: unexpected server failure without internal details.

Malformed JSON continues to return the existing `400 INVALID_JSON` response.
The CV route retains its existing validation and generation errors after passing
through authentication and quota middleware.

## Rate-Limit Policy

The initial default is 10 AI generation requests per authenticated user per 60
seconds, configurable with `AI_RATE_LIMIT_MAX_REQUESTS` and
`AI_RATE_LIMIT_WINDOW_SECONDS`. Configuration is parsed and validated once at
startup. A request consumes quota before generation, including failed provider
calls, which prevents retry storms from bypassing the limit.

The Firestore document path uses a dedicated internal collection. Transactional
updates atomically reset expired windows or increment active ones. Firestore
failures fail closed with `503 SERVICE_UNAVAILABLE`, preventing unmetered Gemini
usage while making the operational cause distinguishable from model failure.

## Verification

Automated tests cover:

- request normalization and bounds;
- prompt injection containment and strict Gemini schema configuration;
- valid task assembly, unique IDs, initial statuses, and weights totaling 100;
- malformed, duplicate, out-of-format, or wrong-count model responses;
- missing and invalid authentication;
- successful authenticated calls;
- allowed and rejected quota decisions plus `Retry-After`;
- unchanged public health behavior and existing CV behavior behind auth.

The manual smoke test first checks `/health`, then, when supplied an explicit
Firebase ID token—calls the protected endpoints. It never prints secrets and
does not place tokens in command history through command-line arguments.

## Frontend Handoff

The frontend partner must add Firebase Authentication, retrieve the current
user's ID token, and attach it as a bearer token to setup and CV-generation
requests. The generated roadmap response can be mapped directly into the
existing `RoadmapTask` type and persisted through Zustand/AsyncStorage. Checklist
status changes, notes, and readiness calculations remain local and make no AI
requests.
