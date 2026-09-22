# AGENTS.md — CV Companion (Maven)

This repository contains the source code for **Maven**, a mobile app built for the RevenueCat Shipaton 2026 Next Gen Award. It guides university students from "unprepared" to "interview-ready" through a live roadmap, math-driven readiness scoring, and automated CV bullet point generation upon task completion.

---

### Critical Constraints & Security (Zero Tolerance)
- **PUBLIC REPO COMPLIANCE:** This repository is open source. **NEVER** hardcode, commit, or expose API keys (Gemini, RevenueCat secret keys, etc.) in frontend code or Git history.
- **ALL AI CALLS VIA BACKEND:** The mobile app must NEVER call Gemini directly. All prompts route through our thin Cloud Run backend.
- **NO WEB CODE:** This is a mobile app. Do not use DOM elements (`<div>`, `<span>`, `window`, `localStorage`). Use React Native primitives (`<View>`, `<Text>`, `@react-native-async-storage/async-storage`).
- **NO FEATURE CREEP:** PDF CV upload is allowed ONLY as an optional shortcut that pre-fills the experience text on the onboarding Experience screen. The backend extracts a plain-text experience summary with Gemini and returns it; uploaded files are never stored. Everything after that uses the normal experience text flow. Do not implement social feeds, job boards, or mock interviews. Build ONLY what is in the MVP spec.

---

### Do
- Use **TypeScript** with strict types. No `any`.
- Use **Expo (Managed Workflow)** and React Native core components.
- Use **Zustand** for global client state combined with **AsyncStorage** for persistent local storage.
- Calculate the **Readiness Score purely with arithmetic** (sum of weights of done tasks / sum of weights of all tasks * 100, rounded, 0 for an empty roadmap). Do NOT use AI for math.
- Ensure all AI-generated roadmap items follow the strict format: `[Verb] + [Measurable Quantity/Artifact] + [Topic]`.
- Use **RevenueCat (`react-native-purchases`)** for paywall/entitlements. Guard premium features (`pro` entitlement) with client check: `customerInfo.entitlements.active['pro']`.
- Keep diffs minimal, modular, and focused on single responsibilities.

### Don't
- Do NOT install dependencies without approval. We use an Expo development build (expo-dev-client) because react-native-purchases requires native code. Do not add other native dependencies without approval. revenueCat.ts must not crash when running in Expo Go (detect with expo-constants executionEnvironment === 'storeClient' and fall back to a mock).
- Do NOT use inline styles. Use `StyleSheet.create` or our centralized theme constants.
- Do NOT trigger AI calls on the daily checklist screen (Screen 2). Daily interactions must be 100% offline, local, and sub-second.
- Do NOT rebuild full project bundles to test a syntax or type change.
- Do NOT delete existing local database keys without an explicit migration check.

---

### File-Scoped Commands

Run checks **only** on edited files to save cycles and prevent context exhaustion:

```bash
# Typecheck single file / whole project without emitting JS
npx tsc --noEmit

# Format specific file
npx prettier --write <path/to/file.tsx>

# Lint specific file with autofix
npx eslint --fix <path/to/file.tsx>

# Run unit tests on single target
npm test -- <path/to/file.test.ts>

# Run Expo local server (interactive)
npx expo start
