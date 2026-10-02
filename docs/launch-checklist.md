# Launch checklist — Google sign-in and account sync

## Do not enable Google sign-in in any shipped build until all of these are true

Today a production build has no Google provider (`getGoogleProvider()` returns
the unavailable stub), so it shows no sign-in, no Account section and no Sync
section, and makes no account or sync requests. Everything below is what must
be true **before that changes**.

The guard: `SYNC_COPY_REVIEWED` in `mobile/src/config/launch.ts` is `false`, and
`mobile/src/config/launch.test.ts` fails the build if a real Google provider is
wired into `getGoogleProvider()` while it is. Flip it to `true` **in the same
change that wires the provider in, and only when every box below is ticked.**

### Privacy and disclosure

- [ ] **`PrivacyControls` text rewritten.** `mobile/src/components/PrivacyControls.tsx`
      line 72 currently says data "stay[s] on this device in storage that Maven
      does not encrypt or cloud-sync". Once an account is linked that is false.
      It must say that, with an account linked, roadmaps, experience text and CV
      bullets are stored on our servers, and how to delete them.
- [ ] **`docs/PRIVACY.md` rewritten.** Section 2 says "We do not sync this data
      to external cloud servers." Replace with an accurate description of what
      is stored on our servers once an account is linked, where, for how long,
      who can access it, and how deletion works.
- [ ] **A separate sync disclosure or consent.** Linking an account must not
      reuse the AI-processing consent. The user is told, at the moment of
      linking, that their data will be stored on our servers, and agrees to that
      specifically. Declining must leave the app fully usable without an account.
- [ ] **Privacy policy published at a URL** (HTTPS, publicly reachable), set as
      `EXPO_PUBLIC_PRIVACY_POLICY_URL`, and reflecting the rewritten text above.
      `app.config.js` already refuses demo and production builds without it.
- [ ] **Play Data Safety form updated** (and the equivalent App Store privacy
      "nutrition label"): account identifiers (email, Firebase UID) and
      user-generated content (roadmaps, experience text, CV bullets) collected
      and stored; purpose app functionality; deletion available in-app.

### Backend

- [ ] **`DELETE /api/sync` deployed and tested against real Firebase.** It must
      delete the stored snapshot **and** the Firebase user (revoking sessions on
      every device), answer 204, be idempotent, and answer 5xx if the user
      deletion fails. Verify with a real account, on two devices: after deletion
      the other device can no longer sync and does not recreate the account.
      See `docs/sync-contract.md` §4a.
- [ ] **`GET` / `PUT /api/sync` deployed** to the contract, including the 900 KB
      limit, the compare-and-set `409`, `SYNC_CLOCK_SKEW`, and refusal of
      anonymous accounts (`SYNC_ACCOUNT_REQUIRED`).

### Sign-in

- [ ] **A Google sign-in library chosen**, and its **Expo SDK 57 compatibility
      verified** on a real development build for both platforms — not just the
      peer-dependency range. See `docs/google-signin-options.md` for the
      comparison; items marked "not verified" there are still open.
- [ ] **Already-linked detection verified against live Firebase.** When a Google
      account already belongs to another Firebase user, `accounts:signInWithIdp`
      with a linking `idToken` must be observed to fail in **both** forms the
      client handles: an HTTP **400** with `FEDERATED_USER_ID_ALREADY_LINKED`,
      and an HTTP **200** whose body carries `errorMessage`. Today this is only
      tested against our own mock (`identityToolkit.test.ts`).
- [ ] **Sign in with Apple** offered alongside Google on iOS (App Store
      guideline 4.8), and in-app account deletion present (guideline 5.1.1(v)) —
      verify against the current guideline text before submission.

### Data safety

- [ ] **The legacy "Keep this phone's" path has a server-side safety net.**
      Choosing the phone's copy over an account's existing copy replaces the
      account copy for every device by pushing deletion markers for every cloud
      record the phone lacks, and those deletions are permanent (tombstones are
      terminal, `docs/sync-contract.md` §7). The server must therefore keep the
      previous snapshot after any `PUT` that removes a large share of live
      records, as specified in `docs/sync-contract.md` §4c (per-type thresholds,
      last 3 snapshots per user, 30 days each). Implement it, and test a manual
      restore from a saved snapshot before launch.

---

When every item above is ticked: wire the provider in
`mobile/src/services/googleCredential.ts` (`realGoogleProvider`), set
`SYNC_COPY_REVIEWED = true` in `mobile/src/config/launch.ts`, and link this
checklist in the release PR.
