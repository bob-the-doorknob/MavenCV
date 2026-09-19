# SPECS.md — Trajectory (CV Companion)

> **Event:** Trajectory 2026 — Next Gen Award (Student-Only Track)
> **Deadline:** 10 Days from kick-off  
> **Target OS:** iOS & Android (Expo / React Native Managed Workflow)  
> **Monetization Requirement:** RevenueCat SDK (`react-native-purchases`)  
> **AI Architecture:** Thin Cloud Run backend wrapping Gemini 1.5 Flash (Strict JSON Schema)  
> **Client Storage:** Zustand + `@react-native-async-storage/async-storage` (Offline-First)

---

## 1. Product Summary & Core Mechanism

Students aiming for competitive internships (e.g., Jane Street, Google, McKinsey) fail not because they lack CV builders, but because they do not know what milestones to complete to become qualified.

**Trajectory** is an actionable career roadmap companion:
1. **Setup (One-time, ~2 min):** The student inputs current technical experience and selects a target role.
2. **Gap Analysis:** The backend prompts Gemini with verified industry requirements to generate 5–7 measurable, verifiable checklist items.
3. **Daily Companion (15-second check-in):** A persistent, offline living checklist tracks tasks (`Not Started` -> `In Progress` -> `Done`).
4. **Mathematical Readiness Score:** Real-time score calculated via deterministic arithmetic based on task weights (not AI hallucinations).
5. **Automated CV Extraction:** Marking a task `Done` prompts Gemini to compile the milestone and user notes into a single, high-impact resume bullet formatted with the Google XYZ formula: *"Accomplished [X], measured by [Y], by doing [Z]"*.
6. **Monetization (RevenueCat):** Trajectory Pro subscription ($4.99/mo) unlocks multiple concurrent target roles and unlimited CV line exports.

---

## 2. Directory Layout

The agent must structure the project as a monorepo or dual-folder repository:

```text
trajectory/
├── AGENTS.md
├── SPECS.md
├── README.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       ├── index.ts
│       ├── data/
│       │   └── targets.ts
│       ├── routes/
│       │   └── ai.ts
│       └── services/
│           └── gemini.ts
└── mobile/
    ├── app.json
    ├── package.json
    ├── tsconfig.json
    ├── App.tsx
    └── src/
        ├── types/
        │   └── index.ts
        ├── theme/
        │   └── tokens.ts
        ├── store/
        │   └── useAppStore.ts
        ├── services/
        │   ├── api.ts
        │   ├── revenueCat.ts
        │   └── notifications.ts
        ├── utils/
        │   └── readiness.ts
        ├── screens/
        │   ├── SetupScreen.tsx
        │   ├── ChecklistScreen.tsx
        │   └── CvVaultScreen.tsx
        └── components/
            ├── TaskCard.tsx
            ├── ReadinessBar.tsx
            └── PaywallModal.tsx
