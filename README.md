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
  -ContentType "application/json" `
  -Body $body
```

The live command uses Gemini quota. Keep `GEMINI_API_KEY` in `.env` or Cloud Run
Secret Manager; never expose it through an `EXPO_PUBLIC_` variable.

## Cloud Run

Build the backend container from the repository root so npm workspaces and the
root lockfile are available:

```bash
docker build -f backend/Dockerfile -t trajectory-backend .
docker run --env-file .env -p 8080:8080 trajectory-backend
```

Cloud Run supplies `PORT`; the server defaults to `8080` locally.

## Security

The mobile app never imports a Gemini SDK or receives `GEMINI_API_KEY`. All AI
requests will be routed through `backend/`. Local environment files are ignored
by Git.
