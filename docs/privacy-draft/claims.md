> **DRAFT — working document for review.** Every factual statement in
> `docs/privacy-draft/PRIVACY.md` and `TERMS.md`, where it comes from, and whether it is
> true of the code **today** or only **after sync ships**. Line numbers were taken from
> the working tree on 2026-10-02 and will drift as code changes; re-check before
> publishing.
>
> **Status key**
> - **Today:** true of the code as it stands, including in a production build.
> - **After sync ships:** built and tested in the client, but not live. Production
>   builds have no Google provider (`realGoogleProvider` returns null) and the backend
>   has no `/api/sync` route. Launch is gated by `SYNC_COPY_REVIEWED = false`.
> - **Contract only:** specified in `docs/sync-contract.md`, but no backend code
>   implements it yet.
> - **Library behaviour:** behaviour of a dependency, taken from its documentation
>   rather than from code in this repo.

## Privacy draft

| # | Statement | Status | Source |
|---|---|---|---|
| P1 | Maven works without an account | Today | `mobile/src/services/anonymousAuth.ts:8` (anonymous Firebase sign-up, no user input); no sign-in UI in production: `mobile/src/utils/accountVisibility.ts` |
| P2 | Roadmaps, milestones, notes, CV bullets, onboarding draft are saved on the phone | Today | `mobile/src/store/useAppStore.ts:1353-1360` (`partialize`), AsyncStorage key `trajectory-app-state` at `:77` |
| P3 | Local storage is not encrypted by Maven | Today | AsyncStorage used directly, `useAppStore.ts:77`; also stated in `mobile/src/components/PrivacyControls.tsx:72` |
| P4 | AI-sharing choice and its time are saved on the phone | Today | `mobile/src/services/privacy.ts:5,31` |
| P5 | Pre-migration copy kept once, before an update changes the stored format | Today | `mobile/src/store/useAppStore.ts:83,130` (`savePreMigrationCopy`) |
| P6 | "Start fresh" keeps the unreadable data in a recovery copy | Today | `mobile/src/services/localData.ts:51-54`, key at `useAppStore.ts:85` |
| P7 | The copies can contain experience text, notes and CV bullets | Today | they are raw copies of the whole store: `useAppStore.ts:130`, `localData.ts:54` |
| P8 | The copies survive until Reset / Sign out and clear / Delete account; Start fresh keeps them | Today for Reset and Start fresh; after sync ships for the other two | `localData.ts:25-29,32,38` (`localCopyKeys`, `deleteLocalCopies`, `resetThisDevice`); `localData.ts:60`; `mobile/src/services/signOut.ts:38,56`; `mobile/src/services/account.ts:293` |
| P9 | Sign-in token and Google email are kept in secure storage | Token: today. Email: after sync ships | `anonymousAuth.ts` (SecureStore refresh token); `mobile/src/services/accountState.ts:10,17,65-69` |
| P10 | Sign-in details are kept in the phone's secure storage, separate from app data | Today | `expo-secure-store` used in `anonymousAuth.ts` and `accountState.ts:65` (the draft deliberately does not name Keychain/Keystore: that is library behaviour, not provable here) |
| P11 | Android automatic app-data backup is off | Today | `mobile/app.json:15` (`allowBackup: false`) |
| P12 | AI-sharing is off by default; nothing is sent until the user agrees | Today | `mobile/src/services/privacy.ts:7,38`; `docs/app-check-and-consent.md:34` |
| P13 | Consent is checked before, and again immediately before, each request | Today | `mobile/src/services/api.ts:160,167` |
| P14 | Withdrawing stops new requests and cannot recall sent ones | Today | `privacy.ts:24-35`; `PrivacyControls.tsx:73` |
| P15 | Withdraw in Settings → Privacy & AI, and on the setup experience screen | Today | `PrivacyControls` is rendered only in `SettingsScreen.tsx` and `AboutYouScreen.tsx`. **Note:** `docs/app-check-and-consent.md:35` says "the CV tab exposes the same controls", which is no longer true |
| P16 | Roadmap request sends experience, level, role title, employer | Today | `mobile/src/services/api.ts:304-321`; backend prompt `backend/src/services/roadmap.ts:100` |
| P17 | CV bullet request sends milestone title, notes, role title | Today | `api.ts:350-354` |
| P18 | CV PDF upload sends the PDF and the target role | Today | `api.ts:405-406`; PDF passed to Gemini `backend/src/services/cvProfile.ts:101` |
| P19 | Control characters are removed and text is cut to fixed limits before sending | Today | `api.ts:15,304-305`; `mobile/src/utils/sanitizeText.ts` |
| P20 | CV bullets are written when the CV tab is opened, not on the checklist | Today | `mobile/src/screens/task/MarkDoneSheet.tsx` (local completion only); `mobile/src/services/cvQueue.ts` runs from `CvVaultScreen` focus |
| P21 | PDFs are not stored by our server | Today (code) | `backend/src/services/cvProfile.ts` holds the PDF in memory only; no storage call in `backend/src`; body limit `backend/src/app.ts:13` |
| P22 | The app's temporary PDF copy is deleted after processing | Today | `mobile/src/services/filePicker.ts:34,55,65` |
| P23 | Our server asks Gemini not to store the request (`store: false`) | Today | `backend/src/services/gemini.ts:40,65` |
| P24 | `store: false` is not a zero-retention promise | Today (doc) | `docs/app-check-and-consent.md:28` |
| P25 | Every request carries a Firebase ID token and an App Check token | Today | `api.ts:176-178,1404-1405`; backend `backend/src/routes/ai.ts:4,7` |
| P26 | Server keeps per-account request counters that expire | Today (code); TTL deletion **needs confirmation** | `backend/src/security/rateLimit.ts:4,44,47,63,99` (`expiresAt` written; the Firestore TTL policy is console configuration) |
| P27 | Only Google-signed-in accounts sync; anonymous accounts never sync | After sync ships (client); contract only (server) | `mobile/src/services/syncAccount.ts:37-45`; `docs/sync-contract.md:37` |
| P28 | Synced contents: targets, experience, roadmaps, steps, notes, finished bullets, deletion markers | After sync ships / contract only | `docs/sync-contract.md` §2; `mobile/src/utils/syncMerge.ts:186-190` |
| P29 | Not synced: current target, onboarding draft, scheduled reminders, pending bullets | After sync ships | `docs/sync-contract.md:88` ("What is not in the snapshot"); `syncMerge.ts:177,190` |
| P30 | Deletion markers may be removed after 180 days | Contract only | `docs/sync-contract.md:400-402` |
| P31 | 30-day safety snapshots, at most three, on large removals | Contract only | `docs/sync-contract.md:214-231` (§4c) |
| P32 | Google sign-in uses Firebase Authentication, which keeps the email | After sync ships | `mobile/src/services/identityToolkit.ts:13`; `accountState.ts:17` |
| P33 | Reset all data clears the phone, including the copies | Today | `localData.ts:38`; `SettingsScreen.tsx` reset row |
| P34 | Sign out and clear: pushes unsynced changes first, asks if it can't, keeps the account | After sync ships | `mobile/src/services/signOut.ts:7,16,38,55-56` |
| P35 | Delete account: server deletes the copy and the Firebase user; the phone is cleared only after the server confirms; nothing is deleted on failure | After sync ships (client); contract only (server) | `account.ts:278-293`; `docs/sync-contract.md:164-172` |
| P36 | Clipboard and share-sheet copies are outside Maven's control | Today | `mobile/src/screens/cv/CvVaultScreen.tsx:105,119,126` |
| P37 | No analytics, advertising, crash-reporting or tracking tools in the app | Today | no such dependency in `mobile/package.json` or `backend/package.json`; no matches for common SDK names in `mobile/src` or `backend/src` |
| P38 | Server logs one line per request: ID, route, method, status, duration, error category; no content, tokens or account ID | Today (code) | `backend/src/observability/requestLog.ts:14-34` |
| P39 | Purchases are handled by RevenueCat | Today | `mobile/src/services/revenueCat.ts:20` |
| P40 | Maven does not request contacts, location, photos, camera, microphone or calendar | Today | no permission entries in `mobile/app.json` or `mobile/app.config.js`; the PDF comes from the system picker (`filePicker.ts`) |
| P41 | Export everything exists in Settings | Today | `SettingsScreen.tsx:136,470` |
| P42 | Mock (sample-data) mode cannot run in a release build | Today | `api.ts:61` |

## Terms draft

| # | Statement | Status | Source |
|---|---|---|---|
| T1 | Readiness score uses arithmetic only | Today | `mobile/src/utils/readiness.ts:3`; `AGENTS.md` |
| T2 | Maven never invents a number for a CV bullet; it marks bullets that need one | Today | `mobile/src/utils/cvBullets.test.ts:34`; "Needs a number" card in `CvVaultScreen.tsx` |
| T3 | AI runs through Maven's server, only with consent | Today | `api.ts:160,167`; `AGENTS.md` ("ALL AI CALLS VIA BACKEND") |
| T4 | Sync limits: 50 roadmaps, 200 milestones per roadmap, 2,000 CV bullets, and the app says so | Client caps today; sync after it ships | `mobile/src/utils/limits.ts:6-8`; `docs/sync-contract.md` §5 |
| T5 | Saved data keeps working offline | Today | `docs/app-check-and-consent.md:35`; the checklist screen makes no network calls (`AGENTS.md`) |
| T6 | Security, App Check and rate limits are enforced | Today | `backend/src/routes/ai.ts:4-8`; `backend/src/security/rateLimit.ts:28-29` |
| T7 | Deleting the account does not cancel a store subscription | Store behaviour; the app has no cancel call | `PrivacyControls.tsx:73` says withdrawal "cannot … cancel a subscription"; subscriptions are managed by the store |

## Needs confirmation (not provable from the repo)

| Item | Placeholder in drafts | Who |
|---|---|---|
| Operator identity, contact email, effective date | [[OPERATOR NAME]], [[CONTACT EMAIL]], [[EFFECTIVE DATE]] | Owner (Kevin) |
| Whether local storage is excluded from iOS device backups | [[OWNER: Is Maven's local storage excluded…]] | Owner, on a device |
| Gemini billing tier, training use, Google's retention | [[ANDREW: Which Gemini billing tier…]] | Andrew |
| Firestore TTL on rate-limit collections actually configured | [[ANDREW: Confirm the Firestore TTL policy…]] | Andrew |
| Where synced data is stored (service, region), backups, access control | [[ANDREW: Where is the synced copy stored…]] | Andrew |
| Firebase Authentication data location and retention | [[ANDREW: Confirm Firebase Authentication's…]] | Andrew |
| Whether Delete account removes the 30-day safety snapshots (`docs/sync-contract.md` §4a does not say) | [[ANDREW: Does deleting the account also delete…]] | Andrew |
| Request-log retention; platform logs such as IP or user agent | [[ANDREW: How long are request logs kept…]] | Andrew |
| Hosting and storage providers | [[ANDREW: storage provider…]] | Andrew |
| RevenueCat `logIn(uid)` after sign-in, and what RevenueCat receives | [[OWNER: Once sign-in ships…]] | Owner (Kevin) |
| Intended audience and minimum age | [[OWNER/LEGAL: Who is Maven for…]] | Owner, with legal |
| Users' rights; notice of changes; licence; warranty and liability; termination; governing law | [[LEGAL: …]] | Legal reviewer |

## Contradictions found while drafting

- `docs/app-check-and-consent.md:35` says the CV tab shows the AI consent controls. Today it doesn't; they are in Settings and onboarding only. The draft follows the code.
- The current `docs/PRIVACY.md` says Maven manages local notifications based on items in progress for over 14 days. `mobile/src/services/notifications.ts:7-8` says notification scheduling is not implemented. The draft omits notifications.
