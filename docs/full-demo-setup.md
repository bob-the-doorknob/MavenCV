# Full live demo setup

This guide is for a controlled staging demo, not a production release. It uses
real Firebase authentication and Gemini generation, staging App Check debug
tokens, and sandbox store purchases. Never use production Firebase, AI quota,
RevenueCat, or store credentials for a demo build.

## What the demo build enforces

`eas build --profile demo` creates a native development client for internal
distribution. Its config rejects missing Firebase app files, Firebase/API
settings, HTTPS API and legal URLs, and store-specific public RevenueCat SDK
keys. It also refuses mock AI mode and requires debug App Check. The debug
provider is only for a registered staging device; it is not production-grade
attestation and must never be enabled in a release build.

## Accounts and staging services you must configure

1. **Firebase:** Create/use a staging Firebase project. Enable Anonymous
   Authentication and create Firestore. Register iOS and Android apps as
   `com.maven.app`; download `GoogleService-Info.plist` and
   `google-services.json`. Register both apps in App Check. Use a development
   debug provider for the demo device and register its generated debug token
   privately in Firebase. Do not send that token in chat or commit it.
2. **Gemini and backend:** Enable Gemini API access and sufficient staging
   quota. Deploy `backend/` to a staging Cloud Run service in the same Google
   project as Firebase. Give it a dedicated service account with only the
   Firestore quota permissions it needs; store `GEMINI_API_KEY` in Secret
   Manager. Set `GOOGLE_CLOUD_PROJECT` and `FIREBASE_APP_CHECK_APP_IDS` to the
   staging Firebase project and its registered app IDs. Configure Firestore
   TTL on quota `expiresAt` fields. Set the Cloud Run request timeout above
   the mobile 120-second deadline, and set a low max-instance limit and budget
   alert. Verify `GET /health` after deployment.
3. **RevenueCat and stores:** Create a separate staging RevenueCat project (or
   clearly isolated staging apps), configure the matching iOS/Android apps,
   sandbox subscription products, current offering, hosted paywall and exact
   `pro` entitlement. Use only the public platform SDK keys in the app. Set up
   Apple/Google sandbox testers and follow each store's current requirements
   for sandbox purchase testing. The EAS internal APK alone does not prove a
   Google Play sandbox transaction; use the store's tester distribution path
   when validating billing.
4. **Public pages:** Publish accurate HTTPS privacy, terms and support pages
   and configure them both in the app environment and RevenueCat's hosted
   paywall. The files under `docs/` are not published legal pages. In
   particular, `docs/PRIVACY.md` currently needs correction: its claim that
   Maven does not send personal identifiers externally does not accurately
   describe anonymous Firebase authentication and user-entered AI content.
   Add the real operator/contact and reviewed provider-retention disclosures;
   do not publish invented details.

## Configure the EAS `preview` environment

In Expo's EAS dashboard, set these variables in the `preview` environment used
by the `demo` build profile:

| Variable | Value / type |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | HTTPS staging Cloud Run URL |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Public Firebase Web API key from the same staging project |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | iOS public SDK key for the staging app |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Android public SDK key for the staging app |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | Published HTTPS privacy page |
| `EXPO_PUBLIC_TERMS_URL` | Published HTTPS terms page |
| `EXPO_PUBLIC_SUPPORT_URL` | Published HTTPS support page |
| `GOOGLE_SERVICES_PLIST` | EAS file variable containing the staging iOS plist |
| `GOOGLE_SERVICES_JSON` | EAS file variable containing the staging Android JSON |

Keep Firebase client files and debug tokens scoped to staging. Never put a
Firebase service-account file or Gemini/RevenueCat secret key in EAS mobile
variables. Keep the backend Gemini key in Cloud Run Secret Manager only.

## Build, register the device, and run

From the repository root, run the local checks. Log in to EAS, then run its
build commands from `mobile/` so the Expo app and its EAS project are selected:

```powershell
npm.cmd run typecheck
npm.cmd test --workspace @trajectory/mobile -- app.config.test.ts
Set-Location mobile
eas build --profile demo --platform android
eas build --profile demo --platform ios
```

Build only for the platforms you can configure and test. Install the build on a
device, open it once, and retrieve the Firebase App Check debug token from the
native development logs. Register that token in the staging Firebase project's
App Check debug-token list, then restart the app. Treat the token as a secret.
The app requires explicit AI consent before real AI requests. Use a synthetic
CV, not a real person's CV, for the walkthrough.

Walk the whole path: fresh onboarding and consent; manual experience and PDF
extraction; generated role roadmap; local checklist completion and readiness
score; CV bullet generation and editing; target limit/Pro paywall; sandbox
purchase and entitlement unlock; restore purchase; consent withdrawal; and
offline checklist use. Also deliberately verify invalid/missing App Check,
backend offline, AI quota/rate-limit errors, and canceled PDF picking. Confirm
no CV text, PDF, auth token or debug token appears in backend logs or screen
recordings.

## Still requires you

- Create/configure the Firebase, Google Cloud, RevenueCat and store accounts.
- Enter private credentials and EAS file variables in their proper consoles.
- Register each staging debug token on its device.
- Supply the genuine operator/contact details and publish reviewed legal/support
  pages.
- Build and run on real devices, complete sandbox transactions, and tell me
  which checks fail. I cannot verify external account setup or live billing from
  this repository alone.
