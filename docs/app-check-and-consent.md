# App Check and AI consent setup

Code is implemented; live attestation, store purchase flows and device UI are not yet verified.

## Firebase and native builds

1. In the same Firebase project used by backend Auth, register Android and iOS apps matching `com.maven.app`. Download the client `google-services.json` and `GoogleService-Info.plist` files. They are ignored by Git. Never use a service-account JSON file in the mobile app.
2. Set `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICES_PLIST` to those file paths locally, or use EAS file environment variables. Keep `EXPO_PUBLIC_FIREBASE_API_KEY` in the same project. No secret keys belong in public variables.
3. Register Android App Check with Play Integrity, link the intended Play project, and register your actual signing certificate SHA-256. Register iOS with App Attest and DeviceCheck fallback, including the Apple configuration requested by Firebase. The config adds the production App Attest entitlement. Verify signing/provisioning on a real device.
4. Set backend `FIREBASE_APP_CHECK_APP_IDS` to comma-separated Firebase app IDs (for example `1:PROJECT_NUMBER:android:APP_HASH` and the iOS equivalent), not package names. Firebase Admin credentials must belong to the intended project. All AI routes fail closed without this allowlist and a valid token; health and roles stay public. Authentication and quotas remain independent checks.
5. Rebuild the development app with the new native packages. On simulators or sideloaded development apps, explicitly set `EXPO_PUBLIC_APP_CHECK_DEBUG=true`, privately register the generated device debug token in Firebase App Check, and restart. Treat debug tokens as secrets, never put them in public variables, Git, screenshots or shared logs. Use a separate staging project; revoke unused tokens. Release code never selects the debug provider.
6. Use Play-distributed Android builds and real iOS devices to verify production providers. Expo Go supports local mock API only, not real attestation or purchases. No native build was run as part of this patch.

Deploy this backend only after a compatible mobile build is ready. Existing clients lacking App Check will receive 403; there is deliberately no shared-secret or silent bypass mode. App Check is not a replacement for Cloud Armor, quotas or monitoring. Standard verified tokens can be replayed until expiry; token consumption/replay protection is not implemented.

## Privacy, terms and support

Publish three public HTTPS pages on a domain you control, then configure:

```
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://YOUR-DOMAIN/privacy
EXPO_PUBLIC_TERMS_URL=https://YOUR-DOMAIN/terms
EXPO_PUBLIC_SUPPORT_URL=https://YOUR-DOMAIN/support
```

These are patterns, not existing Maven pages. Production configuration rejects missing, insecure and common placeholder URLs; it cannot verify ownership, page contents or legal adequacy. The app does not invent a company identity, support address or provider retention policy.

Your privacy page must accurately identify the operator/contact, data sent to Gemini, Firebase and RevenueCat processing, applicable provider retention/training terms for the chosen billing tier, local unencrypted storage and OS backup behavior, deletion and consent withdrawal limits. `store:false` is not a promise of zero provider retention. Have the actual policies reviewed for the intended users and jurisdictions before launch.

In RevenueCat's hosted paywall editor, configure Privacy and Terms links to the same published URLs and verify them in the native purchase flow. The app adds links to the pre-purchase sheet; remote hosted-paywall contents are not changed by this patch. Configure subscription management/cancellation separately.

## Consent behavior and acceptance checks

- Consent defaults off for both new and existing installations. The experience screen explains data sharing and requires an explicit action before upload or continuing to AI generation. Extracted CV claims still require user review.
- The CV tab exposes the same controls, including withdrawal. Pending jobs stay pending when consent is absent. After granting consent, pull to retry. Offline checklists and existing saved bullets remain usable without AI consent.
- Every real AI request checks consent before acquiring credentials and again immediately before sending. Mock API calls do not transmit content and bypass this request guard. Requests already sent cannot be recalled by withdrawal.
- Only the consent version and acceptance timestamp are saved under the new `maven-ai-consent` local key. Existing product storage keys are untouched. Increment the consent version when the disclosed processing scope changes. This is a device preference, not a server-side consent audit ledger.
- Test fresh install, previous install, restart, failed storage write, consent withdrawal, queued CV jobs, PDF upload and navigation on both platforms. Verify policy links, keyboard, small screens and screen readers. Local unit tests mock native boundaries.
- In staging, verify no-token/invalid-token/wrong-app requests return 403 without consuming quota, valid App Check with invalid Auth returns 401, and valid credentials reach each AI route. Do not log tokens, PDFs or experience text.

Implementation references: [React Native Firebase App Check](https://rnfirebase.io/app-check/usage), [Firebase backend verification](https://firebase.google.com/docs/app-check/custom-resource-backend).
