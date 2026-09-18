# Trajectory Project Scaffold Design

## Scope

This phase replaces the repository's Python placeholder with an installable,
strictly typed npm-workspaces monorepo for Trajectory. It establishes the
mobile and backend boundaries described in `SPECS.md` without implementing the
MVP's product flows, Gemini prompts, subscriptions, or notification behavior.

## Repository Structure

The repository root will own a single npm lockfile and workspace-level scripts.
The two workspaces will be:

- `mobile/`: an Expo Managed Workflow React Native application.
- `backend/`: a Node.js TypeScript service suitable for Cloud Run.

The existing Python placeholder package, tests, and requirement files will be
removed. Governance files, `AGENTS.md`, `SPECS.md`, and the MIT license will be
preserved. The README and environment example will be rewritten for
Trajectory.

## Mobile Workspace

The mobile workspace will contain the file layout required by `SPECS.md`:

- `App.tsx` as a minimal native application entry point.
- `src/types/index.ts` for shared domain contracts.
- `src/theme/tokens.ts` for centralized visual constants.
- `src/store/useAppStore.ts` for a typed Zustand store persisted through
  AsyncStorage.
- `src/services/api.ts` for the backend HTTP boundary.
- `src/services/revenueCat.ts` for RevenueCat configuration and the `pro`
  entitlement check.
- `src/services/notifications.ts` for a future notification boundary.
- `src/utils/readiness.ts` for deterministic weighted readiness arithmetic.
- The three specified screens and three specified components as compile-safe
  placeholders built only with React Native primitives and `StyleSheet.create`.

The scaffold will include Expo, React Native, Zustand, AsyncStorage, and
RevenueCat dependencies. It will not call Gemini, make checklist-time network
requests, or include web APIs or DOM elements.

## Backend Workspace

The backend workspace will contain:

- `src/index.ts` for the Express application and `/health` route.
- `src/data/targets.ts` for typed target-role seed definitions.
- `src/routes/ai.ts` for the future AI HTTP boundary.
- `src/services/gemini.ts` for server-only Gemini configuration.

The Gemini key will be read only from the backend process environment. The AI
route and service will expose typed, non-secret scaffolding but will not yet
generate roadmaps or CV bullets. The backend will include strict TypeScript
configuration, development and production scripts, a Cloud Run-compatible
Dockerfile, and a production start command that honors the `PORT` environment
variable.

## Configuration and Security

The root will use npm workspaces with one lockfile. Each workspace will keep its
own strict `tsconfig.json`, scripts, and package metadata. Secret-bearing local
environment files will remain ignored. `.env.example` will list safe variable
names for the backend URL, Gemini API key, and RevenueCat public SDK keys.

No credentials, service-account material, or RevenueCat secret keys will be
stored in source control. The mobile workspace may consume only public client
configuration and will never import the Gemini SDK.

## Verification

Dependencies will be installed only because the user explicitly approved the
installation. Verification will be limited to focused checks appropriate for
the scaffold:

1. Run strict TypeScript checks in both workspaces without emitting JavaScript.
2. Run focused unit tests for deterministic readiness scoring and entitlement
   detection.
3. Confirm that the backend health route starts and responds locally without a
   Gemini key.
4. Scan source and configuration for placeholder secrets, direct mobile Gemini
   imports, DOM APIs, and inline React Native styles.

No full Expo bundle or native build will be run during this phase.

## Deferred Work

Setup and onboarding behavior, AI gap analysis, daily checklist interactions,
CV bullet generation, navigation, notifications, purchase flows, and polished
visual design remain separate implementation phases. Their interfaces are
represented only where needed to keep this scaffold coherent and compilable.
