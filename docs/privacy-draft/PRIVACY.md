> **DRAFT — NOT IN EFFECT. Needs human and legal review before publication.**
> This draft describes Maven **after Google sign-in and account sync ship**. It must not
> replace `docs/PRIVACY.md` until every item in `docs/launch-checklist.md` is done.
> Every factual statement is traced in `docs/privacy-draft/claims.md`. Text in
> `[[double brackets]]` is a placeholder that a named person must answer
> (see "Open questions" at the end).

# Maven Privacy Policy

**Operator:** [[OPERATOR NAME]]
**Contact:** [[CONTACT EMAIL]]
**Effective date:** [[EFFECTIVE DATE]]

## In plain words

- **Maven works without an account.** Your roadmaps, milestones, notes and CV bullets are saved on your phone.
- **AI features only run if you turn them on.** When you do, the text needed for a request (your experience, role, level, milestone notes, or a CV PDF you choose) goes through our server to Google Gemini. Nothing is sent until you agree, and you can switch it off at any time.
- **Sync is optional.** If you sign in with Google, a copy of your roadmaps and CV bullets is stored on our server so you can use them on another phone.
- **You can delete everything.** "Delete account" removes your account and its stored copy. Some limited records may last a short time afterwards; this policy says which.
- **We do not sell your data**, show ads, or use analytics or tracking tools in the app.

## 1. What stays on your phone

Maven saves the following on your phone in the app's local storage. This storage is **not encrypted by Maven**.

- Your target roles, experience text, roadmaps, milestones, steps, completion notes and CV bullets.
- Unfinished onboarding answers, so you can pick up where you left off.
- Your AI-sharing choice (whether you agreed, and when).
- **Safety copies of your data:**
  - When an app update changes how data is stored, Maven first keeps one copy of your data as it was before the update (a "pre-migration copy").
  - If your saved data cannot be read and you choose "Start fresh", Maven keeps the unreadable data in a separate "recovery copy" so support can try to recover it.
  - Both copies can contain your experience text, notes and CV bullets. They stay on your phone until you choose **Reset all data**, **Sign out and clear this device**, or **Delete account**. "Start fresh" deliberately keeps them.
- Your sign-in details are kept in the phone's secure storage, separate from the data above: a sign-in token and, if you signed in with Google, your Google account email.

On Android, Maven turns off the system's automatic app-data backup. [[OWNER: Is Maven's local storage excluded from iCloud/iTunes device backups on iOS? If not, say so here.]]

## 2. What is sent to our server and to Google Gemini

### When AI is used, and your consent

AI-sharing is **off by default**. Nothing personal is sent for AI until you tap "I agree to AI processing". You can withdraw at any time in the app, in Settings → Privacy & AI (the same control is shown on the experience screen during setup). Withdrawing stops new requests; it cannot recall a request already sent. The app checks your choice before and immediately before each request.

With your permission, the app sends the following through our server to Google Gemini:

| When | What is sent |
| --- | --- |
| You generate or rebuild a roadmap | Your experience text, your level, the target role's title, and the employer if you entered one |
| You finish a milestone (the CV bullet is written when you open the CV tab) | The milestone title, your completion notes, and the role title |
| You choose to upload a CV PDF during setup | The PDF file, and the target role |

Before sending, the app removes invisible control characters from your text and shortens it to fixed limits.

- **PDFs are not stored** by our server. The app's temporary copy of the PDF is deleted after processing.
- Our server asks Gemini not to store the request (`store: false`). This is not a promise that Google keeps nothing: Google processes requests under the terms of our Gemini service. [[ANDREW: Which Gemini billing tier and data-use terms apply to our API key — is submitted data used for training, and how long does Google keep it?]]
- Please remove contact details and sensitive personal information before you submit text or a PDF.

### What every request to our server carries

To protect the service from abuse, each request carries:

- A **Firebase sign-in token**. Every install gets an anonymous Firebase account automatically, without asking for a name or email; if you sign in with Google, the token identifies that account instead.
- A **Firebase App Check token**, which tells our server the request comes from the genuine Maven app.

Our server keeps a request counter per account to apply rate limits. It stores only counts and time windows, which expire on their own. [[ANDREW: Confirm the Firestore TTL policy on `_internal_ai_rate_limits` / `_internal_ai_global_limits` is configured, and how quickly expired documents are removed.]]

## 3. What is stored on our server once you link an account

Sync only works for an account signed in with Google. Anonymous accounts never sync.

When sync is on, our server stores one copy of:

- your target roles, experience text, roadmaps, milestones, steps and completion notes;
- your finished CV bullets;
- small "deletion markers" that remember what you deleted, so another phone does not bring it back. These may be removed after 180 days.

It does **not** store which target you are currently viewing, unfinished onboarding answers, reminders scheduled on your phone, or CV bullets that are still being written.

**Safety snapshots.** If one change would remove a large part of your stored data (for example, choosing "Keep this phone's" when your phone and your account disagree), our server first keeps the previous copy for **30 days**, at most three at a time, so support can restore it if that was a mistake.

[[ANDREW: Where is the synced copy stored (service and region)? Are database backups taken, and for how long are they kept? Who can access stored data, and how is access controlled?]]

Google sign-in is handled by **Firebase Authentication** (Google). When you sign in, Firebase receives the identity token from your Google account and keeps your Firebase account, which includes your Google email. [[ANDREW: Confirm Firebase Authentication's data location and retention for our project.]]

## 4. Deleting your data

| Action | What it does | What it does not do |
| --- | --- | --- |
| **Reset all data** (no account) | Deletes everything Maven saved on this phone, including the pre-migration and recovery copies. | — |
| **Sign out and clear this device** | Signs out, then deletes everything Maven saved on this phone, including the copies. First tries to send any changes not yet synced; if it can't, it asks before going ahead. | Does not delete your account or its stored copy; signing in again restores it. |
| **Delete account** | Asks our server to delete your stored copy and your Firebase account, which signs you out on every device. Only once the server confirms does the app clear this phone. If the server call fails, nothing is deleted and the app tells you. | [[ANDREW: Does deleting the account also delete the up-to-3 safety snapshots kept for 30 days? If not, they remain until their 30 days end — say so here.]] Request logs (section 5) and Google's handling of earlier AI requests are not affected. |

Other ways your data can leave the app, which Maven cannot delete for you: CV bullets you copied to the clipboard, and anything you shared through your phone's share sheet.

## 5. Logs and analytics

- **The app contains no analytics, advertising, crash-reporting or tracking tools.**
- **Our server logs one line per request** with: a random request ID, the endpoint, the HTTP method, the status code, how long it took, and a general error category. These logs **do not contain** your text, PDFs, CV bullets, tokens or account ID.
- [[ANDREW: How long are request logs kept, and where? Does the hosting platform (Cloud Run, load balancer) keep additional logs, such as IP addresses or user agents, and for how long?]]

## 6. Purchases

Maven Pro is sold through the App Store or Google Play and managed by **RevenueCat**. RevenueCat receives purchase and subscription information from the store. [[OWNER: Once sign-in ships, will the app link purchases to your account (RevenueCat `logIn` with your account ID)? If so, describe what RevenueCat receives. Link RevenueCat's privacy policy.]]

## 7. Things Maven does not access

Maven does not ask for or read your contacts, location, photos, camera, microphone or calendar. You choose a CV PDF yourself through the system file picker; Maven only reads the file you pick.

## 8. Children

[[OWNER/LEGAL: Who is Maven for (for example, university students aged 18+)? State the minimum age and how it applies in each country you publish in. Do not describe Maven as safe for children unless that has been reviewed.]]

## 9. Your rights

[[LEGAL: Rights to access, correct, export and delete personal data depend on where users live. List them, and how to exercise them through [[CONTACT EMAIL]].]]

Inside the app you can already: see and edit all your data; export it as plain text (Settings → Export everything); withdraw AI consent; and delete your data as described in section 4.

## 10. Service providers

| Provider | Purpose |
| --- | --- |
| Google (Gemini API) | Generating roadmaps and CV bullets, and reading a CV PDF you choose |
| Google (Firebase Authentication, App Check) | Accounts, sign-in, and confirming requests come from the genuine app |
| [[ANDREW: storage provider for synced data and rate-limit counters (Firestore?), and hosting (Cloud Run?)]] | Storing synced data and request counters; running our server |
| RevenueCat | Managing Maven Pro purchases |
| Apple App Store / Google Play | Distribution and payments |

We do not sell, rent or share your data for advertising.

## 11. Changes

We will update this policy when what Maven does with data changes, and change the effective date. [[LEGAL: How will users be notified of material changes?]]

## 12. Contact

[[OPERATOR NAME]] — [[CONTACT EMAIL]]

---

## Open questions (placeholders) and who must answer them

| Placeholder | Who answers |
| --- | --- |
| [[OPERATOR NAME]], [[CONTACT EMAIL]], [[EFFECTIVE DATE]] | Owner (Kevin) |
| iOS backup behaviour of local storage | Owner (Kevin), verified on a device |
| Gemini tier, training use and Google's retention | Andrew |
| Firestore TTL on the rate-limit collections | Andrew |
| Storage service, region, backups, access control for synced data | Andrew |
| Firebase Authentication data location and retention | Andrew |
| Whether Delete account removes the 30-day safety snapshots | Andrew (also missing from `docs/sync-contract.md` §4a) |
| Request-log retention, and any platform logs (IP, user agent) | Andrew |
| Hosting and storage providers in section 10 | Andrew |
| RevenueCat `logIn` and what RevenueCat receives | Owner (Kevin) |
| Intended audience and minimum age | Owner (Kevin), with legal |
| Users' rights by jurisdiction; how changes are notified | Legal reviewer |
