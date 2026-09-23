# SPECS.md — Maven (CV Companion)

> **Event:** Maven 2026 — Next Gen Award (Student-Only Track)
> **Deadline:** 10 Days from kick-off  
> **Target OS:** iOS & Android (Expo / React Native Managed Workflow)  
> **Monetization Requirement:** RevenueCat SDK (`react-native-purchases`)  
> **AI Architecture:** Thin Cloud Run backend wrapping Gemini 3.6 Flash (Strict JSON Schema)
> **Client Storage:** Zustand + `@react-native-async-storage/async-storage` (Offline-First)

---

## 1. Product Summary & Core Mechanism

Students aiming for competitive internships (e.g., Jane Street, Google, McKinsey) fail not because they lack CV builders, but because they do not know what milestones to complete to become qualified.

**Maven** is an actionable career roadmap companion:
1. **Setup (One-time, ~2 min):** The student selects a target role and can provide a PDF CV. The backend extracts relevant experience from it for the student to review and edit before roadmap generation. Manual experience entry remains available when no CV is provided.
2. **Gap Analysis:** The backend uses model general knowledge and repository-authored cross-industry examples to generate 5–7 measurable, verifiable checklist items. No scraped or bundled job dataset is used.
3. **Daily Companion (15-second check-in):** A persistent, offline living checklist tracks tasks (`Not Started` -> `In Progress` -> `Done`).
4. **Mathematical Readiness Score:** Real-time score calculated via deterministic arithmetic based on task weights (not AI hallucinations).
5. **Automated CV Extraction:** The backend uses the candidate's task, notes, explicit target role, and optional industry to produce one cross-industry resume bullet using Google's XYZ formula. It never invents evidence; missing metrics use `[X]` with a follow-up suggestion.
6. **Monetization (RevenueCat):** Maven Pro subscription ($4.99/mo) unlocks multiple concurrent target roles and unlimited CV line exports.

---

## 2. Directory Layout

The agent must structure the project as a monorepo or dual-folder repository:

```text
maven/
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
```

---

## 3. Onboarding — Experience Screen

The Experience screen has two modes:
- **"Upload CV (PDF)"** — sends the file to `POST /api/extract-profile` and fills the experience text box with the returned summary.
- **"Write it myself"** — the student types directly into the same text box.

Upload fills the same text box the manual mode uses, and the student can edit the result before generating a roadmap. Upload is a **stretch goal**, scheduled after the core loop (setup → roadmap → checklist → readiness → CV bullet) works end to end. The text box ships first.

---

## 4. Planned Backend Endpoints

- `POST /api/extract-profile` — accepts a PDF (max 2 MB), returns `{ experienceText: string }`. The uploaded file is never persisted.
