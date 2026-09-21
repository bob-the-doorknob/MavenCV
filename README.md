# Trajectory

Trajectory is an offline-first mobile career roadmap companion for university
students. This repository contains an Expo React Native client and a thin Cloud
Run backend that will own all Gemini interactions.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- Expo Go for UI and RevenueCat Preview API development
- An Expo development build when testing real in-app purchases

## Structure

```text
.
|-- mobile/    Expo and React Native application
|-- backend/   Express service for Cloud Run and Gemini
|-- AGENTS.md  Repository development rules
`-- SPECS.md   MVP product specification
```

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and provide local values. `GEMINI_API_KEY` is
backend-only. RevenueCat mobile keys are public platform SDK keys, never
RevenueCat secret keys.

## Development

```bash
npm run start:mobile
npm run start:backend
npm run check:backend
npm run typecheck
npm test
```

RevenueCat uses Preview API Mode in Expo Go. Real purchases require an Expo
development build.

`npm run check:backend` runs the backend TypeScript check and backend test suite
without making a live Gemini request. `npm run start:backend` loads the root
`.env` file when it exists.

## Development ownership

- Andrew owns the backend, API validation, Gemini integration, databases, and
  deployment infrastructure.
- Andrew's project partner owns the React Native frontend and connects it to the
  documented backend contracts.

The backend can be implemented and tested without the frontend. End-to-end
screen behavior, saved mobile preferences, navigation, and device UX require
the frontend integration.

## Roadmap API and frontend handoff

Both `POST /api/roadmap` and `POST /api/cv-bullet` require
`Authorization: Bearer <Firebase ID token>` from a signed-in user with a
verified email. The mobile app must refresh the ID token and include it on each
AI request. It should prompt sign-in again on `401`, and respect `Retry-After`
on `429`. Both routes share 10 requests per user per 60 seconds by default.
The daily checklist stays local and makes no AI requests.

`POST /api/roadmap` accepts:

```json
{
  "experience": "Built two TypeScript APIs and used PostgreSQL in coursework.",
  "targetRole": { "title": "Backend Engineer", "employer": "Optional employer" },
  "targetIndustry": "Fintech"
}
```

`employer` and `targetIndustry` are optional. A successful response has `tasks`
with 5–7 entries, each containing a server-generated `id`, a measurable
`title`, a positive integer `weight`, and `status: "not_started"`. Weights sum
to 100 and the tasks map directly to the mobile `RoadmapTask` type. Invalid
request data returns `400 INVALID_ROADMAP_INPUT`; invalid model output returns
`502 ROADMAP_GENERATION_FAILED`. A quota store failure returns
`503 SERVICE_UNAVAILABLE`. The API never returns raw provider errors.

## CV bullet API

`POST /api/cv-bullet` accepts:

```json
{
  "taskTitle": "Coordinate discharge planning",
  "notes": "Worked with five departments and standardized handoffs.",
  "targetRole": "Nurse",
  "targetIndustry": "Healthcare"
}
```

`targetRole` and `targetIndustry` are optional. Omitting or blanking the role
uses role-neutral language rather than guessing a profession. A successful
response preserves the original `bullet` field and may add suggestions:

```json
{
  "bullet": "Coordinated discharge planning across five departments by implementing standardized handoff protocols.",
  "suggestions": ["How much did handoff time or readmissions change?"]
}
```

The backend pins `gemini-3.8-flash`, treats task and note text as untrusted data,
and rejects invalid input or model output. Missing metrics use `[X]` with a
suggestion instead of invented evidence.

To test the live endpoint from PowerShell, start the backend and then run:

```powershell
$body = @{
  taskTitle = "Coordinate discharge planning"
  notes = "Worked with five departments and standardized handoffs."
  targetRole = "Nurse"
  targetIndustry = "Healthcare"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/api/cv-bullet" `
  -Headers @{ Authorization = "Bearer $env:TRAJECTORY_FIREBASE_ID_TOKEN" } `
  -ContentType "application/json" `
  -Body $body
```

The live command uses Gemini quota. Keep `GEMINI_API_KEY` in `.env` or Cloud Run
Secret Manager; never expose it through an `EXPO_PUBLIC_` variable.

Run `npm run smoke:backend` after starting the backend. It checks `/health`
without credentials. To check the protected roadmap, set
`TRAJECTORY_FIREBASE_ID_TOKEN` in the current process environment; the script
does not print it. Set `TRAJECTORY_API_URL` to check a deployed endpoint.

## Cloud Run

Build the backend container from the repository root so npm workspaces and the
root lockfile are available:

```bash
docker build -f backend/Dockerfile -t trajectory-backend .
docker run --env-file .env -p 8080:8080 trajectory-backend
```

Cloud Run supplies `PORT`; the server defaults to `8080` locally.

Firebase Admin uses Application Default Credentials locally and on Cloud Run.
Provision a Firebase project with email-verified sign-in and a Firestore
database. Give the dedicated Cloud Run service account only the Firestore
permissions needed for `_internal_ai_rate_limits`, configure Firestore TTL on
its `expiresAt` field, and supply `GEMINI_API_KEY` from Secret Manager. Rotate
any previously disclosed API key before public deployment. For public mobile
traffic, use Cloud Run ingress `internal-and-cloud-load-balancing` behind an
external Application Load Balancer with a Cloud Armor per-IP throttle. Cloud Run
allows platform-level unauthenticated invocation because Express verifies
Firebase ID tokens; the restricted ingress prevents direct public bypass.
Firebase App Check is a further abuse-control step before broad launch.

## Security

The mobile app never imports a Gemini SDK or receives `GEMINI_API_KEY`. All AI
requests will be routed through `backend/`. Local environment files are ignored
by Git.
