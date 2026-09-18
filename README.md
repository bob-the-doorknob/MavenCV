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
npm run typecheck
npm test
```

RevenueCat uses Preview API Mode in Expo Go. Real purchases require an Expo
development build.

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
