# Sync contract — `/api/sync`

Status: **draft for backend implementation**. The mobile client is built against
this document and an in-memory mock of it; the backend implements it.

Maven is **local-first**. The phone's store is the source of truth for the user
in front of it. Sync exists so the same person can see the same roadmap and CV
bullets on a second device, and get them back after reinstalling. A failed or
slow sync must never block the app or lose local data.

This route **never calls Gemini** and never processes CV or experience text
beyond storing it. It does not require AI-processing consent, and it must not
share the AI routes' Gemini quota.

---

## 1. Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sync` | Read the user's stored snapshot. |
| `PUT` | `/api/sync` | Replace the stored snapshot, guarded by a version check. |

Both use the same headers as the AI routes:

```
Authorization: Bearer <Firebase ID token>
X-Firebase-AppCheck: <App Check token>
Content-Type: application/json   (PUT only)
```

### Who may sync

The snapshot is keyed by the Firebase `uid` from the verified ID token.

**Anonymous accounts may not sync.** An anonymous `uid` belongs to one install,
so a snapshot stored under it can never be reached from another device and
would only cost storage. The route checks the verified token's
`firebase.sign_in_provider` and answers `403 SYNC_ACCOUNT_REQUIRED` when it is
`anonymous`. When an anonymous user later links a real provider, Firebase keeps
the same `uid`, so nothing needs migrating.

(Current backend note: `authenticateAuthorization` in
`backend/src/security/auth.ts` returns only `uid`. The sync route needs
`sign_in_provider` as well; extend the verifier's return type rather than
loosening the AI routes.)

---

## 2. Snapshot shape

```ts
interface SyncSnapshot {
  schemaVersion: number;          // currently 1
  targets: SyncTarget[];          // live targets and target tombstones
  cvEntries: SyncCvEntry[];       // live entries and entry tombstones
  serverUpdatedAt: string | null; // server-assigned; null = nothing stored yet
}
```

### Records

Every record, live or deleted, carries:

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | 1–128 chars. Unique within its array. Never reused. |
| `updatedAt` | string | ISO 8601 UTC with milliseconds, e.g. `2026-10-02T09:14:03.120Z`. |
| `deletedAt` | string, optional | Present only on a tombstone. Same format. |

**A live target** is a full `Target` as defined in
`mobile/src/types/index.ts` — `roleId`, `level`, `experience`, `createdAt`,
`roadmap` (its milestones, each with their steps), `focusTaskIds`, and the
optional fields — plus `updatedAt`.

**A live CV entry** is a full `CvEntry` — `targetId`, `taskId`, `status`,
`text`, optional `suggestions`, `createdAt` — plus `updatedAt`.

**A tombstone** is the minimum needed to delete everywhere:

```json
{ "id": "t_8f2…", "updatedAt": "2026-10-02T09:14:03.120Z", "deletedAt": "2026-10-02T09:14:03.120Z" }
```

A CV-entry tombstone also carries `targetId`.

### What is not in the snapshot

These stay on the device that owns them, and clients strip them before a `PUT`:

- `activeTargetId` — which target this phone is showing.
- `onboardingDraft` — a half-finished onboarding on this phone.
- `RoadmapTask.notificationId` — a local notification scheduled on this phone.
- CV entries with `status: "pending"` — generation is queued on the device that
  created them. Sending them would make a second device generate the same
  bullet again. The entry appears everywhere once it becomes `ready` or
  `failed`.

The server does not enforce this list; it stores what it is sent.

---

## 3. `GET /api/sync`

**200** — always, including for a user with nothing stored:

```json
{ "schemaVersion": 1, "targets": [], "cvEntries": [], "serverUpdatedAt": null }
```

Never `404` for "no snapshot yet". The client treats `serverUpdatedAt: null` as
"the server has nothing".

---

## 4. `PUT /api/sync`

### Request

```ts
interface SyncPutRequest {
  schemaVersion: number;
  targets: SyncTarget[];
  cvEntries: SyncCvEntry[];
  baseServerUpdatedAt: string | null; // the serverUpdatedAt this snapshot was merged on top of
}
```

The body is the **complete** snapshot after the client has merged. It replaces
what is stored; the server does not merge.

### Version check (compare-and-set)

Inside one transaction:

1. Read the stored `serverUpdatedAt` (`null` if nothing is stored).
2. If it differs from `baseServerUpdatedAt`, write nothing and answer
   **409 `SYNC_CONFLICT`** (below).
3. Otherwise store the snapshot, set a new `serverUpdatedAt`, and answer
   **200** with the stored snapshot, in the same shape `GET` returns.

`serverUpdatedAt` is assigned by the server and is strictly increasing per user.
Clients compare it **by equality only** and never parse or order it, so the
server may use a timestamp, a counter, or both.

### 409 conflict body

The stored snapshot comes back with the error, so the client can merge and
retry without a second round trip:

```json
{
  "error": { "code": "SYNC_CONFLICT", "message": "The stored snapshot changed since your last sync." },
  "snapshot": { "schemaVersion": 1, "targets": [], "cvEntries": [], "serverUpdatedAt": "2026-10-02T09:14:05.002Z" }
}
```

The client merges its local snapshot with `snapshot`, then retries the `PUT`
with `baseServerUpdatedAt` set to `snapshot.serverUpdatedAt`.

---

## 5. Validation

The server validates **structure**, not product rules. Migration on the client
is deliberately lenient, and a stricter server would strand old data. Reject
with **400 `INVALID_SYNC_INPUT`** when:

- the body is not a JSON object, or `targets` / `cvEntries` is not an array;
- `schemaVersion` is not a positive integer;
- `baseServerUpdatedAt` is neither `null` nor a string;
- any record lacks `id` or `updatedAt`, or either is the wrong type;
- an `id` appears twice in the same array;
- a timestamp (`updatedAt`, `deletedAt`, `createdAt`) is not ISO 8601 UTC;
- a live target lacks `roleId`, `level`, `experience`, `createdAt` or a
  `roadmap` array, or a live CV entry lacks `targetId`, `taskId`, `status` or
  `text`;
- `level` is not `internship` or `entry-level`; a task `status` is not
  `not_started`, `in_progress` or `done`; a CV entry `status` is not `pending`,
  `ready` or `failed`.

A timestamp (`updatedAt`, `deletedAt`, `createdAt`) more than **24 hours ahead**
of server time is rejected with **400 `SYNC_CLOCK_SKEW`** — a separate code, not
`INVALID_SYNC_INPUT`, because the fix is on the user's side ("check your device
date") and the client must not retry it in a loop. A broken clock would
otherwise win every future merge.

Unknown fields inside a record are **kept and returned unchanged**. A newer
client may add fields an older server does not know yet; dropping them would
silently lose data on the next round trip.

The server does **not** check that a CV entry's `targetId` points at a stored
target. The client treats entries of a deleted target as deleted (§7); an entry
whose target is simply absent is kept and is harmless.

### Size and count limits

| Limit | Value | Response |
| --- | --- | --- |
| Request body | **900 KB** (921,600 bytes, UTF-8) | `413 SYNC_PAYLOAD_TOO_LARGE` |
| Targets (live + tombstones) | 50 | `400 INVALID_SYNC_INPUT` |
| Milestones per target | 200 | `400 INVALID_SYNC_INPUT` |
| CV entries (live + tombstones) | 2,000 | `400 INVALID_SYNC_INPUT` |

900 KB leaves headroom under Firestore's 1 MiB document limit if the snapshot is
stored as one document (`sync/{uid}`). The body-size limit must be enforced
before parsing, at the JSON body parser.

### Schema version

The server stores `schemaVersion` as sent. A `PUT` with a `schemaVersion` higher
than the server supports is rejected with **400 `SYNC_SCHEMA_UNSUPPORTED`**. A
client that receives a snapshot with a higher `schemaVersion` than it supports
stops syncing and keeps its local data; it does not merge.

---

## 6. Errors

Same envelope as the AI routes: `{ "error": { "code": string, "message": string } }`.
Messages are for logs; the app shows its own copy.

| HTTP | `code` | Client `ApiErrorKind` | Client behaviour |
| --- | --- | --- | --- |
| 400 | `INVALID_SYNC_INPUT` | `invalid_response` | Stop retrying; status `error`. |
| 400 | `SYNC_SCHEMA_UNSUPPORTED` | `invalid_response` | Stop retrying; status `error`. |
| 400 | `SYNC_CLOCK_SKEW` | `invalid_response` | Stop retrying; status `clock_skew` until the app returns to the foreground. |
| 401 | `AUTHENTICATION_REQUIRED` | `auth` | Retry with backoff after a token refresh. |
| 401/403 | `APP_CHECK_REQUIRED` | `auth` | Retry with backoff. |
| 403 | `SYNC_ACCOUNT_REQUIRED` | `auth` | Stop until the account is linked. |
| 409 | `SYNC_CONFLICT` | — (handled internally) | Merge with `snapshot`, retry once immediately. |
| 413 | `SYNC_PAYLOAD_TOO_LARGE` | `invalid_response` | Stop retrying; status `error`. Local data untouched. |
| 429 | `RATE_LIMIT_EXCEEDED` | `rate_limited` | Retry with backoff. |
| 500 | `INTERNAL_ERROR` | `server` | Retry with backoff. |
| 503 | `SERVICE_UNAVAILABLE` | `server` | Retry with backoff. |
| — | (no response, timeout) | `network` | Status `offline`; retry with backoff. |

`409` is not a failure and is never surfaced to the user.

Suggested limit: **60 sync requests per user per minute**, counted separately
from the AI quota. The client debounces pushes to about one per 3 seconds of
activity, so a real user stays well under it.

---

## 7. Conflict policy

The **client** merges; the server only arbitrates who writes next. Both devices
run the same pure function (`mobile/src/utils/syncMerge.ts`) so any two
devices that have seen the same records converge on the same result.

### Targets — last write wins, per target

For each target `id` in the union of local and remote:

1. Present on one side only → keep it.
2. Either side is a tombstone → **the tombstone wins** (§ Deletions).
3. Both live → the one with the later `updatedAt` wins **whole**, including its
   entire roadmap.

Per-target granularity is deliberate: a roadmap's order, focus and schedule are
interdependent, and mixing milestones from two versions can produce a roadmap
neither device ever showed. The cost: if two devices edit *different*
milestones of the *same* target while both offline, the earlier edit is lost.
For one person switching between their own devices this is rare.

### CV entries — merge by id, newer wins

For each entry `id` in the union:

1. Present on one side only → keep it.
2. Either side is a tombstone → the tombstone wins.
3. Both live → the later `updatedAt` wins.
4. An entry whose `targetId` is a **tombstoned target** is deleted too —
   deleting a target deletes its bullets, as it does on the phone today.

### Deletions — tombstones are terminal

A delete writes a tombstone instead of removing the record. **A tombstone beats
a live record regardless of timestamps.** Ids are random and never reused, so
nothing legitimate can ever need to come back under a deleted id.

Without this, a phone that had been offline would push its stale copy and
resurrect something deleted elsewhere. The trade-off: an edit made on device B
*after* device A deleted the same target (before B heard about it) is
discarded. Deleting is the more deliberate act, so it wins.

### Identical timestamps

When both sides have the same `updatedAt` and the same kind (both live or both
tombstones), the winner is the one whose **canonical JSON** (keys sorted,
no whitespace) sorts **later**. Any rule works as long as it is symmetric, so
that device A merging B gives the same answer as B merging A.

### Clock skew

`updatedAt` is the device's wall clock, so a device whose clock runs fast wins
ties it should not. Two rules keep this bounded:

- **Monotonic stamps.** A client never stamps a record earlier than the
  `updatedAt` it already holds: `updatedAt = max(now, previous + 1 ms)`. An edit
  made after seeing a record therefore always beats that record, even if this
  device's clock is minutes behind the one that wrote it.
- The server rejects timestamps more than 24 hours in the future (§5).
- Before every push the client re-stamps anything more than **1 hour** ahead of
  its own clock to "now". While the clock is still wrong this changes nothing
  and the server keeps refusing; once the user fixes the date it brings the
  wrongly stamped records back into range, so sync recovers on its own.

Skew of a few minutes can still decide a genuine race between two devices
editing the same target within those minutes. That is accepted.

### Tombstone retention

Clients and server may discard tombstones older than **180 days**. A device
that has not synced for longer than that could resurrect a record deleted in the
meantime. Accepted, and documented here so it is a known limit rather than a
surprise.

---

## 8. Client behaviour the server can rely on

Documented so the backend can size and alert sensibly; the server must not
depend on it for correctness.

- Pushes are debounced (about 3 s after the last local change) and retried with
  exponential backoff, capped at a few minutes.
- The client pulls on app foreground and right after sign-in.
- A persisted "dirty" flag means a force-quit before a push completes is
  retried on next launch, not lost.
- No sync request is made at all unless the user is signed in with a
  non-anonymous account.
- A failed sync never deletes or rolls back local data.
