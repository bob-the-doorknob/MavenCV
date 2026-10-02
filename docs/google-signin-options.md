# Google sign-in for Maven — library options

Status: **comparison only. Nothing here is installed.** Maven's account system
is built behind `GoogleCredentialProvider`
(`mobile/src/services/googleCredential.ts`): three methods — `isAvailable()`,
`signIn()` returning a Google ID token, and `signOut()`. Whichever library we
choose is a leaf: implement those three methods, return the implementation from
`getGoogleProvider()`, and everything above it (Firebase linking, conflicts,
sync, deletion) is already built and tested.

Checked on **2 October 2026** for **Expo SDK 57 / React Native 0.86**. Every
claim below is marked:

- **✓ verified**: checked against a primary source (npm registry metadata, the
  published package files, the GitHub API, or the vendor's own docs), on the
  date above.
- **⚠ not verified**: inferred or remembered; check it before relying on it.

Sources are listed at the end.

---

## What every option needs regardless

- **A new development build per platform.** Every candidate below ships native
  code or needs a native URL scheme. ✓ verified for the native libraries (their
  docs say they do not run in Expo Go); ✓ verified that `expo-web-browser` ships
  a config plugin (native). After that one rebuild, iteration is JS-only.
- **Google Cloud OAuth clients** (Android client with the app's SHA-1, iOS
  client, and a web client whose ID is the token audience Firebase accepts),
  plus Google enabled as a provider in Firebase Auth. ⚠ not verified per
  library — exact client requirements differ; follow the chosen library's guide.
- **Apple App Store:** offering Google sign-in on iOS requires also offering an
  equivalent privacy-focused login (in practice Sign in with Apple), per
  guideline 4.8. ⚠ not verified against the current guideline text in this pass.

---

## Option A — `@react-native-google-signin/google-signin` (free, "public" version)

| | |
| --- | --- |
| Latest | 16.1.5, published 2026-09-03 ✓ verified |
| Licence / price | MIT, free ✓ verified |
| Expo SDK | peer `expo >= 52.0.40` ✓ verified — covers SDK 57. The project's docs give the supported range as "expo 52.0.40 – 57" ✓ verified (stated for the paid version; the free one shares the peer range) |
| Config plugin | Ships `app.plugin.js` ✓ verified |
| Android Credential Manager | **No.** Its own docs describe the free version as "built on the deprecated legacy Android Google Sign-In SDK" ✓ verified |
| Maintenance | Repo pushed 2026-09-29, ~3.5k stars, 23 open issues, not archived ✓ verified |

The incumbent. Expo's Google authentication guide lists it ("a widely used
library") ✓ verified. The risk is the Android side: it sits on an SDK Google
has deprecated, so its behaviour on future Android/Play Services versions is
outside our control. ⚠ not verified: a date by which the legacy SDK stops
working.

## Option A+ — Universal Sign In (paid version of the same project)

| | |
| --- | --- |
| Licence / price | Commercial: **$79/year** personal, **$249/year** team (≤15 devs); usable after the subscription ends ("self-hosted"); EAS customers may qualify for a free licence via a form ✓ verified (vendor pricing page) |
| Expo SDK | "Expo SDK 53 or newer", range 52.0.40 – 57 ✓ verified |
| Android Credential Manager | **Yes** — "Built with Credential Manager library" ✓ verified |
| Distribution | Private registry, not public npm ✓ verified (docs) |
| Config plugin | ⚠ not verified (could not inspect the private package) |

Same API family as Option A with the modern Android stack. Cost and a private
registry are the trade-offs; for a public open-source repo, contributors could
not install it without their own licence. ⚠ not verified: whether the licence
permits use in a public repository's CI.

## Option B — `react-native-nitro-google-signin`

| | |
| --- | --- |
| Latest | 2.3.0, published 2026-09-19 ✓ verified |
| Licence / price | MIT, free ✓ verified |
| Expo SDK | peer `expo >= 49.0.0`, `react-native >= 0.76` ✓ verified |
| Extra dependency | **Requires `react-native-nitro-modules` ≥ 0.36** as a second native package ✓ verified |
| Config plugin | Ships `app.plugin.js`; applies the Google Services Gradle plugin, copies `GoogleService-Info.plist`, adds the reversed-client-ID URL scheme ✓ verified (README) |
| Android Credential Manager | **Yes** — Credential Manager + Google ID (`GetGoogleIdOption` / `GetSignInWithGoogleOption`) ✓ verified |
| iOS | Google Sign-In SDK for iOS ✓ verified |
| Maintenance | Repo pushed 2026-09-24, ~50 stars, 14 open issues, not archived ✓ verified |

The free route to Credential Manager. Expo's Google authentication guide lists
it ("uses modern native APIs") ✓ verified. Trade-offs: a much smaller user base
than Option A, and Nitro as an additional native dependency (both need approval
under AGENTS.md). ⚠ not verified: behaviour on React Native 0.86 specifically —
the peer range allows it, but I found no release note naming 0.86.

## Option C — `react-native-credentials-manager`

| | |
| --- | --- |
| Latest | 0.9.0, published 2026-09-17 ✓ verified |
| Licence / price | MIT, free ✓ verified |
| Config plugin | Ships `app.plugin.js` ✓ verified |
| Android Credential Manager | **Yes** — it is a Credential Manager wrapper; Google sign-in on Android ✓ verified |
| iOS | Apple Sign In through AuthenticationServices — **not Google** on iOS ✓ verified (README) |
| Maintenance | Repo pushed 2026-09-17, ~95 stars, 1 open issue, pre-1.0 ✓ verified |

Not a Google sign-in library for both platforms: on iOS it gives Sign in with
Apple, not Google. Interesting only if we pair Android Google with iOS Apple,
which our Firebase linking would also need extending for. Listed so the option
is not rediscovered later.

## Option D — browser OAuth: `expo-auth-session` + `expo-web-browser`

| | |
| --- | --- |
| Latest | `expo-auth-session` 57.0.13 (2026-09-24), `expo-web-browser` 57.0.3 (2026-09-11) — both on the SDK 57 line ✓ verified |
| Licence / price | MIT, free, Expo-maintained ✓ verified |
| Config plugin | `expo-web-browser` ships one; `expo-auth-session` does not ✓ verified. Needs an app `scheme` in `app.json` (native) ⚠ not verified for this exact combination |
| Android Credential Manager | No — it is a browser flow ✓ (by construction) |
| **Android blocker** | Google: "Custom URI schemes are no longer supported on Android and Chrome apps", and the loopback-IP alternative is deprecated for Android too; Google directs Android apps to its Android identity APIs ✓ verified (Google OAuth native-app docs) |

On Android this route conflicts with Google's current OAuth policy, so it is the
weakest option here despite being Expo-native. Expo's own Google
authentication guide no longer lists it among its recommendations — it names
Options A and B ✓ verified (the guide does not mention `expo-auth-session` at
all; it does not explicitly call it deprecated).

---

## Recommendation

**Option B (`react-native-nitro-google-signin`)**, if adding Nitro as a second
native dependency is acceptable: free, MIT, Credential Manager on Android,
config plugin that matches the Firebase files App Check already requires, and
listed by Expo.

**Option A** if a larger user base matters more than the Android SDK it sits
on — knowing that SDK is deprecated by Google.

Avoid D (Android policy) and C (no Google on iOS). A+ is the polished choice if
the subscription and private registry are acceptable for an open-source repo.

Whichever is chosen: one dev-build rebuild per platform, a config-plugin entry,
and a ~30-line `GoogleCredentialProvider` implementation. Nothing above the
interface changes.

## Sources

- npm registry metadata (`registry.npmjs.org`) for every package above: latest
  version, publish date, licence, peer dependencies.
- Published package files via unpkg: presence of `app.plugin.js`, package
  descriptions and READMEs.
- GitHub API (`api.github.com/repos/...`): last push, stars, open issues,
  archived flag.
- react-native-google-signin docs, install page:
  https://react-native-google-signin.github.io/docs/install
- Universal Sign In pricing: https://universal-sign-in.com
- Expo, Google authentication guide: https://docs.expo.dev/guides/google-authentication/
- Google, OAuth 2.0 for iOS & desktop apps (custom URI scheme policy):
  https://developers.google.com/identity/protocols/oauth2/native-app
