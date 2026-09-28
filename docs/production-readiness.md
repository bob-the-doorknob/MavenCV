# Production readiness — 24 September 2026

The code fixes are not evidence of a deployed, working payment or AI service.
No production deployment, purchase, provider request or credential change was performed.

## Release gates still open

1. **Cloud infrastructure:** provision Firebase Anonymous Auth and Firestore in the intended project; deploy the backend with a dedicated service account and Secret Manager binding. Configure quota collection TTLs and deny direct client access. Verify identity/token revocation checks and Firestore transactions in staging. The Dockerfile and build context are hardened, but the image has not been built or run here.
2. **Abuse protection:** configure restricted Cloud Run ingress behind a load balancer and Cloud Armor IP throttles. Global application quotas limit AI requests, not all infrastructure spending or denial of service. Native App Check and backend verification are now implemented, but Firebase registration, native configuration files, backend app-ID allowlisting and real-device attestation tests remain open. All AI routes fail closed; older clients without App Check will receive 403. Follow [App Check setup](app-check-and-consent.md). Never ship a static shared secret in Expo public variables as a substitute.
3. **AI provider:** confirm the configured `gemini-3.6-flash` model is available to the production project, enable adequate billing/quota, and run one real roadmap, CV bullet and PDF extraction test. Earlier provider tests were rate limited; unit tests do not establish provider availability. The maximum two 45-second attempts fit inside the mobile 120-second request deadline. Configure Cloud Run request timeout above 120 seconds. Monitor latency and 429/5xx without logging CV text, PDF bodies, tokens or secrets.
4. **Payments:** configure the iOS and Android apps, store products, current offering, hosted paywall and exact `pro` entitlement in RevenueCat. Supply public platform SDK keys, never secret or Test Store keys. Test purchase, cancellation, pending payment, restore, expiry and refund on a development/store build. Confirm an upgrade immediately unlocks bulk copy and additional targets. Premium restrictions are client-side for this local-only MVP; server-paid features would need trusted server entitlement verification.
5. **Device acceptance:** rebuild the development app for SecureStore and native Firebase App Check. Test old-install migration, offline start, malformed storage recovery, expired auth, attestation failure, consent persistence/withdrawal, PDF cancellation/cleanup, two rapid taps, navigation away during generation, small screens, keyboard and screen-reader access on iOS and Android. Expo Go supports mock API mode, not real attestation or purchases. Automated checks mock native boundaries; no device-rendering pass has been completed here.
6. **Privacy and store submission:** explicit, versioned AI consent and withdrawal controls are implemented in onboarding and the CV tab, with request-boundary enforcement and legal links on the pre-purchase sheet. Publish accurate privacy/terms/support pages and configure their public URLs; production config rejects missing URLs and common placeholders. Configure the links inside the RevenueCat hosted paywall separately, complete store privacy disclosures, and verify provider retention terms for the selected billing tier. `store:false` disables interaction storage, not necessarily all provider processing/retention. Configure subscription cancellation/management links and store review instructions. Notifications, cloud sync, account linking and AI bullet rewrites are not implemented and must not be advertised.
7. **Operations:** structured allowlist-only request logs and `.github/workflows/ci.yml` are now implemented. CI covers TypeScript, backend/mobile tests, production configuration contracts, redacted history secret scanning, dependency audit reporting/gating and a Docker build/health check. The workflow still needs its first GitHub run and required-check branch protection. Configure alerts for 5xx/429/latency/quota failures, log retention/access controls, budget alerts, max instance limits, secret rotation, incident ownership and a rollback revision. See [logging and CI setup](logging-and-ci.md). Run a staging load/concurrency check and verify daily caps against expected traffic. Global counter documents are appropriate for the low-volume MVP, not an unbounded scale design.
8. **Dependency review:** Vitest was updated to 4.1.11 to remove its critical advisory. After the approved App Check dependency installation, the fresh npm audit reports 13 moderate entries (zero high/critical), including the Expo/xcode/uuid and Google Cloud storage/gaxios/uuid chains. Triage actual reachability and use supported upstream fixes. Do not apply npm's suggested Expo downgrade to SDK 46 or force major transitive overrides without compatibility tests. Audit status is not a clean security bill of health.

## Configuration boundary

| Location | Values |
| --- | --- |
| Root `.env` locally / Cloud Run Secret Manager | `GEMINI_API_KEY` (secret) |
| Backend runtime | `GOOGLE_CLOUD_PROJECT`, `FIREBASE_APP_CHECK_APP_IDS`, `PORT`, UID and global quota settings from root `.env.example` |
| `mobile/.env` locally / EAS production environment | `EXPO_PUBLIC_API_BASE_URL` (HTTPS), `EXPO_PUBLIC_FIREBASE_API_KEY`, public RevenueCat platform keys |
| Native build / EAS file variables | `GOOGLE_SERVICES_JSON`, `GOOGLE_SERVICES_PLIST`; client Firebase config files, never service-account secrets |
| Legal pages / mobile public environment | `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_URL` |
| Production build | `EXPO_PUBLIC_USE_MOCK_API=false`; `app.config.js` checks missing public values, native config paths, legal URLs, debug App Check and obvious test/secret keys |

Never copy backend secrets into EAS public variables. Production configuration validation is not a test that the URL or keys work.

## Data and recovery

- Roadmaps, experience and CV bullets remain in AsyncStorage on this device, as required by the MVP. They are not encrypted by the app and are not cloud-backed-up by Maven. Android app backup is disabled. Review iOS backup behavior and disclosures before launch.
- The existing `trajectory-app-state` key is retained. Both known shapes migrate; a pre-migration backup is retained in `trajectory-app-state-pre-migration-backup` and refreshed on subsequent saves so deleted personal data is not left in a stale backup. Invalid state blocks navigation instead of silently resetting. Recovery should inspect this local copy; do not tell users to uninstall as a first step.
- Firebase refresh tokens migrate to SecureStore with read-back verification before deleting the old plaintext credential key. ID tokens stay in memory. Network failures do not create replacement anonymous identities; definitively invalid refresh tokens can.
- Deleting a target explicitly removes its local roadmap and CV bullets. This does not cancel a store subscription. Cloud auth identity deletion and cross-device identity recovery are not implemented.
- CV PDFs are limited to 2,000,000 bytes, transmitted inline, not saved by the backend, and the picker cache copy is removed after processing. Users review extracted claims before generating a roadmap.

## Verification and rollback

App Check/consent patch: both TypeScript projects pass and 131 focused tests pass across 11 files, including new backend attestation, mobile consent/transmission boundaries and production-config checks. Native attestation, builds, UI rendering and live provider/store transactions remain untested. See [setup and acceptance checks](app-check-and-consent.md).

Local verification on 24 September: both TypeScript projects pass; 263 tests pass across 17 focused regression files; four production configuration checks pass; `git diff --check` is clean. Native APIs are mocked in unit tests. No app bundle, Docker image or live provider/store transaction was tested.

Reproduce the targeted check from the repository root:

```powershell
npm.cmd run typecheck
node node_modules/vitest/vitest.mjs run backend/src/app.test.ts backend/src/security/rateLimit.test.ts backend/src/services/roadmap.test.ts backend/src/services/gemini.test.ts backend/src/services/cvProfile.test.ts backend/src/services/cvBullet.test.ts mobile/src/services/api.test.ts mobile/src/services/mergeContracts.test.ts mobile/src/services/anonymousAuth.test.ts mobile/src/services/cvQueue.test.ts mobile/src/services/revenueCat.test.ts mobile/src/services/purchaseFlow.test.ts mobile/src/services/filePicker.test.ts mobile/src/services/errorMessages.test.ts mobile/src/store/useAppStore.test.ts mobile/src/utils/readiness.test.ts mobile/src/utils/schedule.test.ts
```

In staging, separately verify `GET /health`, attested/authenticated generation, missing/invalid/wrong-app App Check 403, invalid user Auth 401 with valid App Check, malformed-input 400, UID/global/provider 429 and quota-store failure 503.

Keep the prior Cloud Run revision and exact image digest for rollback. Deploy backend contract changes before mobile releases. The new mobile reader tolerates older compact roadmap responses; new backend generation requires rich metadata. Avoid rolling the mobile app back to the old schema reader after users have created new-format data. Preserve local backups and test downgrade behavior before any rollback campaign.

References: [RevenueCat Expo testing](https://www.revenuecat.com/docs/getting-started/installation/expo), [Firebase App Check](https://firebase.google.com/docs/app-check), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
