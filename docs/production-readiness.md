# Production readiness — 24 September 2026

The code fixes are not evidence of a deployed, working payment or AI service.
No production deployment, purchase, provider request or credential change was performed.

## Release gates still open

1. **Cloud infrastructure:** provision Firebase Anonymous Auth and Firestore in the intended project; deploy the backend with a dedicated service account and Secret Manager binding. Configure quota collection TTLs and deny direct client access. Verify identity/token revocation checks and Firestore transactions in staging. The Dockerfile and build context are hardened, but the image has not been built or run here.
2. **Abuse protection:** configure restricted Cloud Run ingress behind a load balancer and Cloud Armor IP throttles. Global application quotas limit AI requests, not all infrastructure spending or denial of service. App Check is not integrated: implement native attestation and backend verification before broad untrusted distribution, or explicitly accept the residual risk for a restricted pilot. Never ship a static shared secret in Expo public variables as a substitute.
3. **AI provider:** confirm the configured `gemini-3.6-flash` model is available to the production project, enable adequate billing/quota, and run one real roadmap, CV bullet and PDF extraction test. Earlier provider tests were rate limited; unit tests do not establish provider availability. The maximum two 45-second attempts fit inside the mobile 120-second request deadline. Configure Cloud Run request timeout above 120 seconds. Monitor latency and 429/5xx without logging CV text, PDF bodies, tokens or secrets.
4. **Payments:** configure the iOS and Android apps, store products, current offering, hosted paywall and exact `pro` entitlement in RevenueCat. Supply public platform SDK keys, never secret or Test Store keys. Test purchase, cancellation, pending payment, restore, expiry and refund on a development/store build. Confirm an upgrade immediately unlocks bulk copy and additional targets. Premium restrictions are client-side for this local-only MVP; server-paid features would need trusted server entitlement verification.
5. **Device acceptance:** rebuild the development app for SecureStore. Test old-install migration, offline start, malformed storage recovery, expired auth, PDF cancellation/cleanup, two rapid taps, navigation away during generation, small screens, keyboard and screen-reader access on iOS and Android. Expo Go does not test actual purchases. Automated checks mock native boundaries; no device-rendering pass has been completed here.
6. **Privacy and store submission:** publish accurate privacy/terms/support URLs, configure paywall links and store privacy disclosures, review consent for sending CV content to Gemini, and verify provider retention terms for the selected billing tier. `store:false` disables interaction storage, not necessarily all provider processing/retention. Configure subscription cancellation/management links and store review instructions. Notifications, cloud sync, account linking and AI bullet rewrites are not implemented and must not be advertised.
7. **Operations:** establish CI gates (no `.github` workflow exists yet), protected release branches, structured redacted logs, alerting for 5xx/429/latency/quota failures, budget alerts, max instance limits, secret rotation, incident ownership and a rollback revision. Run a staging load/concurrency check and verify daily caps against expected traffic. Global counter documents are appropriate for the low-volume MVP, not an unbounded scale design.
8. **Dependency review:** Vitest was updated to 4.1.11 to remove its critical advisory. The npm audit still reports 11 moderate entries, mostly the Expo/xcode/uuid chain and a Google Cloud storage/gaxios/uuid chain. Triage actual reachability and use supported upstream fixes. Do not apply npm's suggested Expo downgrade to SDK 46 or force major transitive overrides without compatibility tests. Audit status is not a clean security bill of health.

## Configuration boundary

| Location | Values |
| --- | --- |
| Root `.env` locally / Cloud Run Secret Manager | `GEMINI_API_KEY` (secret) |
| Backend runtime | `GOOGLE_CLOUD_PROJECT`, `PORT`, UID and global quota settings from root `.env.example` |
| `mobile/.env` locally / EAS production environment | `EXPO_PUBLIC_API_BASE_URL` (HTTPS), `EXPO_PUBLIC_FIREBASE_API_KEY`, public RevenueCat platform keys |
| Production build | `EXPO_PUBLIC_USE_MOCK_API=false`; `app.config.js` checks missing public values and obvious test/secret keys |

Never copy backend secrets into EAS public variables. Production configuration validation is not a test that the URL or keys work.

## Data and recovery

- Roadmaps, experience and CV bullets remain in AsyncStorage on this device, as required by the MVP. They are not encrypted by the app and are not cloud-backed-up by Maven. Android app backup is disabled. Review iOS backup behavior and disclosures before launch.
- The existing `trajectory-app-state` key is retained. Both known shapes migrate; a pre-migration backup is retained in `trajectory-app-state-pre-migration-backup` and refreshed on subsequent saves so deleted personal data is not left in a stale backup. Invalid state blocks navigation instead of silently resetting. Recovery should inspect this local copy; do not tell users to uninstall as a first step.
- Firebase refresh tokens migrate to SecureStore with read-back verification before deleting the old plaintext credential key. ID tokens stay in memory. Network failures do not create replacement anonymous identities; definitively invalid refresh tokens can.
- Deleting a target explicitly removes its local roadmap and CV bullets. This does not cancel a store subscription. Cloud auth identity deletion and cross-device identity recovery are not implemented.
- CV PDFs are limited to 2,000,000 bytes, transmitted inline, not saved by the backend, and the picker cache copy is removed after processing. Users review extracted claims before generating a roadmap.

## Verification and rollback

Local verification on 24 September: both TypeScript projects pass; 263 tests pass across 17 focused regression files; four production configuration checks pass; `git diff --check` is clean. Native APIs are mocked in unit tests. No app bundle, Docker image or live provider/store transaction was tested.

Reproduce the targeted check from the repository root:

```powershell
npm.cmd run typecheck
node node_modules/vitest/vitest.mjs run backend/src/app.test.ts backend/src/security/rateLimit.test.ts backend/src/services/roadmap.test.ts backend/src/services/gemini.test.ts backend/src/services/cvProfile.test.ts backend/src/services/cvBullet.test.ts mobile/src/services/api.test.ts mobile/src/services/mergeContracts.test.ts mobile/src/services/anonymousAuth.test.ts mobile/src/services/cvQueue.test.ts mobile/src/services/revenueCat.test.ts mobile/src/services/purchaseFlow.test.ts mobile/src/services/filePicker.test.ts mobile/src/services/errorMessages.test.ts mobile/src/store/useAppStore.test.ts mobile/src/utils/readiness.test.ts mobile/src/utils/schedule.test.ts
```

In staging, separately verify `GET /health`, authenticated generation, 401, malformed-input 400, UID/global/provider 429 and quota-store failure 503.

Keep the prior Cloud Run revision and exact image digest for rollback. Deploy backend contract changes before mobile releases. The new mobile reader tolerates older compact roadmap responses; new backend generation requires rich metadata. Avoid rolling the mobile app back to the old schema reader after users have created new-format data. Preserve local backups and test downgrade behavior before any rollback campaign.

References: [RevenueCat Expo testing](https://www.revenuecat.com/docs/getting-started/installation/expo), [Firebase App Check](https://firebase.google.com/docs/app-check), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
