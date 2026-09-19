# Trajectory Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python placeholder with a strict TypeScript npm-workspaces scaffold for the Expo mobile app and Cloud Run backend.

**Architecture:** The repository root coordinates two independent npm workspaces. The mobile workspace owns offline domain state and native-service boundaries; the backend workspace owns all Gemini access and exposes health plus typed, deliberately unimplemented AI routes.

**Tech Stack:** Node.js 22.13+, npm workspaces, TypeScript, Expo SDK 57, React Native, Zustand, AsyncStorage, RevenueCat, Express, Google Gen AI SDK, Vitest, Supertest

**Spec:** `docs/superpowers/specs/2026-09-18-trajectory-project-scaffold-design.md`

## Global Constraints

- Never expose Gemini or RevenueCat secret keys in mobile code or Git history.
- All future Gemini calls must pass through the backend.
- Use React Native primitives and `StyleSheet.create`; do not use DOM APIs or inline styles.
- The checklist path remains offline and makes no AI calls.
- Readiness equals completed positive weight divided by all positive weight, rounded and constrained to 0–100.
- Use the `pro` RevenueCat entitlement.
- Do not implement product behavior beyond the approved scaffold.
- Do not run a full Expo bundle or native build.

---

### Task 1: Root workspace conversion

**Files:**
- Delete: `pyproject.toml`, `requirements.txt`, `requirements-dev.txt`, `src/trajectory/**`, `tests/**`
- Create: `package.json`
- Modify: `.gitignore`, `.env.example`, `README.md`

**Interfaces:**
- Produces: npm workspaces named `@trajectory/mobile` and `@trajectory/backend`; root `typecheck` and `test` scripts.

- [ ] **Step 1: Remove the Python placeholder files**

Delete only the explicitly approved Python package, Python tests, and Python dependency manifests. Preserve `SPECS.md`, `AGENTS.md`, governance files, and `data.txt`.

- [ ] **Step 2: Add the root workspace manifest**

```json
{
  "name": "trajectory",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["mobile", "backend"],
  "engines": { "node": ">=22.13.0" },
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "start:mobile": "npm run start --workspace @trajectory/mobile",
    "start:backend": "npm run dev --workspace @trajectory/backend"
  }
}
```

- [ ] **Step 3: Rewrite repository configuration and documentation**

Document Node 22.13+, workspace installation, environment variables, local commands, Expo Go Preview API behavior, and Cloud Run container usage. Ignore `.env`, `node_modules`, coverage, build output, Expo state, and native generated folders.

- [ ] **Step 4: Check the root diff**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore .env.example README.md pyproject.toml requirements.txt requirements-dev.txt src tests
git commit -m "chore: replace Python placeholder with npm workspace"
```

### Task 2: Mobile domain and service boundaries

**Files:**
- Create: `mobile/package.json`, `mobile/tsconfig.json`, `mobile/app.json`, `mobile/index.ts`
- Create: `mobile/src/types/index.ts`, `mobile/src/utils/readiness.ts`, `mobile/src/utils/readiness.test.ts`
- Create: `mobile/src/services/api.ts`, `mobile/src/services/revenueCat.ts`, `mobile/src/services/revenueCat.test.ts`, `mobile/src/services/notifications.ts`
- Create: `mobile/src/store/useAppStore.ts`, `mobile/src/theme/tokens.ts`

**Interfaces:**
- Produces: `TaskStatus`, `RoadmapTask`, `TargetRole`, `CvEntry`, `calculateReadiness(tasks): number`, `hasProEntitlement(customerInfo): boolean`, persisted `useAppStore`.

- [ ] **Step 1: Write readiness and entitlement tests**

```ts
expect(calculateReadiness([])).toBe(0);
expect(calculateReadiness([
  task({ weight: 1, status: 'done' }),
  task({ weight: 3, status: 'in_progress' }),
])).toBe(25);
expect(hasProEntitlement(customerInfoWithActivePro)).toBe(true);
expect(hasProEntitlement(customerInfoWithoutPro)).toBe(false);
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test --workspace @trajectory/mobile -- src/utils/readiness.test.ts src/services/revenueCat.test.ts`

Expected: failure because the modules do not yet exist.

- [ ] **Step 3: Implement strict domain contracts**

```ts
export type TaskStatus = 'not_started' | 'in_progress' | 'done';

export interface RoadmapTask {
  id: string;
  title: string;
  weight: number;
  status: TaskStatus;
  notes?: string;
  completedAt?: string;
}

export interface TargetRole {
  id: string;
  title: string;
  employer?: string;
  tasks: RoadmapTask[];
  createdAt: string;
}

export interface CvEntry {
  id: string;
  targetRoleId: string;
  sourceTaskId: string;
  text: string;
  createdAt: string;
}
```

- [ ] **Step 4: Implement deterministic readiness and RevenueCat helpers**

Filter to finite positive weights, return zero for an empty denominator, use completed weight over total weight, round, and constrain the result to 0–100. Configure RevenueCat from platform-specific `EXPO_PUBLIC_REVENUECAT_*_KEY` values only when a key exists; check `customerInfo.entitlements.active.pro` without making a network request.

- [ ] **Step 5: Implement persisted store and service boundaries**

Persist `targetRoles`, `activeTargetRoleId`, and `cvEntries` under `trajectory-app-state` at schema version 1. Provide typed setters and task upsert behavior. Add a backend fetch helper that uses `EXPO_PUBLIC_API_URL`. Define notification capability types without installing or invoking a notification SDK.

- [ ] **Step 6: Add Expo configuration**

Use Expo SDK 57 with its matching React 19.2.3 and React Native 0.86 line, strict TypeScript, and no generated native folders. Register `App` from `index.ts` with `registerRootComponent`.

- [ ] **Step 7: Run focused tests and typecheck**

Run: `npm test --workspace @trajectory/mobile -- src/utils/readiness.test.ts src/services/revenueCat.test.ts`

Run: `npm run typecheck --workspace @trajectory/mobile`

Expected: all tests pass and TypeScript emits no errors.

- [ ] **Step 8: Commit**

```bash
git add mobile
git commit -m "feat: scaffold mobile domain and services"
```

### Task 3: Mobile native UI shell

**Files:**
- Create: `mobile/App.tsx`
- Create: `mobile/src/components/TaskCard.tsx`, `mobile/src/components/ReadinessBar.tsx`, `mobile/src/components/PaywallModal.tsx`
- Create: `mobile/src/screens/SetupScreen.tsx`, `mobile/src/screens/ChecklistScreen.tsx`, `mobile/src/screens/CvVaultScreen.tsx`

**Interfaces:**
- Consumes: mobile domain contracts, theme tokens, `calculateReadiness`.
- Produces: compile-safe native components with typed props and no network-triggering checklist behavior.

- [ ] **Step 1: Implement theme-driven components**

`TaskCard` displays task title and status, `ReadinessBar` displays an accessible 0–100 progress value, and `PaywallModal` presents a native modal controlled by props. Every style must come from `StyleSheet.create` and theme tokens.

- [ ] **Step 2: Implement the three screen shells**

`SetupScreen` explains the future setup flow, `ChecklistScreen` accepts local role/task data and renders readiness plus task cards, and `CvVaultScreen` renders locally supplied CV entries. No screen performs an AI call.

- [ ] **Step 3: Implement the app entry shell**

Render a safe-area-aware native welcome shell using `SetupScreen` and `StatusBar`; call RevenueCat configuration once on mount, with missing public keys treated as an unconfigured development state.

- [ ] **Step 4: Typecheck the mobile workspace**

Run: `npm run typecheck --workspace @trajectory/mobile`

Expected: TypeScript emits no errors.

- [ ] **Step 5: Scan forbidden patterns**

Run: `rg -n "<div|<span|window\.|localStorage|style=\{\{" mobile`

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add mobile/App.tsx mobile/src/components mobile/src/screens
git commit -m "feat: add native mobile shell"
```

### Task 4: Backend Cloud Run shell

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/Dockerfile`
- Create: `backend/src/index.ts`, `backend/src/app.ts`, `backend/src/app.test.ts`
- Create: `backend/src/data/targets.ts`, `backend/src/routes/ai.ts`, `backend/src/services/gemini.ts`

**Interfaces:**
- Produces: `createApp(): Express`, `createGeminiClient(apiKey?): GoogleGenAI`, `GET /health`, `POST /api/roadmap`, `POST /api/cv-bullet`.

- [ ] **Step 1: Write HTTP contract tests**

```ts
expect((await request(createApp()).get('/health')).body).toEqual({
  status: 'ok',
  service: 'trajectory-backend',
});
expect((await request(createApp()).post('/api/roadmap').send({})).status).toBe(501);
expect((await request(createApp()).post('/api/cv-bullet').send({})).status).toBe(501);
```

- [ ] **Step 2: Run the backend test and confirm it fails**

Run: `npm test --workspace @trajectory/backend -- src/app.test.ts`

Expected: failure because `createApp` does not yet exist.

- [ ] **Step 3: Implement routes and server startup**

Create an Express app with JSON parsing, the health route, and an `/api` router. Both AI endpoints return a typed error body with code `NOT_IMPLEMENTED`. Bind the server to `0.0.0.0` and `Number(process.env.PORT ?? 8080)` only from `index.ts`.

- [ ] **Step 4: Implement backend-only Gemini boundary and target seeds**

Use the current `@google/genai` package. `createGeminiClient` must reject an empty API key and instantiate `GoogleGenAI` only on the server. Export typed generic seed roles for Software Engineer, Quantitative Trader, and Management Consultant.

- [ ] **Step 5: Add Cloud Run container configuration**

Use a Node 22 Alpine multi-stage build, install from the root lockfile/workspaces, compile the backend, copy production dependencies and `backend/dist`, expose port 8080, and run `node backend/dist/index.js`.

- [ ] **Step 6: Run focused backend verification**

Run: `npm test --workspace @trajectory/backend -- src/app.test.ts`

Run: `npm run typecheck --workspace @trajectory/backend`

Run: `npm run build --workspace @trajectory/backend`

Expected: tests pass, TypeScript emits no errors, and `backend/dist` is produced.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat: scaffold Cloud Run backend"
```

### Task 5: Install and final verification

**Files:**
- Create: `package-lock.json`
- Modify: dependency versions only if Expo's compatibility checker requires it.

**Interfaces:**
- Consumes: both workspace manifests.
- Produces: reproducible dependency graph and verified scaffold.

- [ ] **Step 1: Install dependencies**

Run: `npm install`

Expected: one root `package-lock.json`; no workspace-local lockfiles.

- [ ] **Step 2: Check Expo dependency compatibility**

Run: `npx expo install --check --project-dir mobile`

Expected: dependencies match Expo SDK 57. If Expo reports mismatches, use its exact compatible versions and rerun the check.

- [ ] **Step 3: Run workspace checks**

Run: `npm run typecheck`

Run: `npm test`

Expected: both commands succeed.

- [ ] **Step 4: Run security and platform scans**

Run: `rg -n "AIza|sk-|GEMINI_API_KEY\s*=\s*[^<[:space:]]|REVENUECAT.*SECRET|@google/genai" mobile`

Run: `rg -n "<div|<span|window\.|localStorage|style=\{\{" mobile`

Expected: no matches.

- [ ] **Step 5: Check final diff and status**

Run: `git diff --check`

Run: `git status --short`

Expected: only intended scaffold changes remain; the user-owned untracked `SPECS.md` remains untouched.

- [ ] **Step 6: Commit**

```bash
git add package-lock.json package.json mobile/package.json backend/package.json README.md .env.example .gitignore CONTEXT.md docs/superpowers
git commit -m "chore: verify Trajectory scaffold"
```
