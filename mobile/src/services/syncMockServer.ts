/**
 * An in-memory stand-in for GET/PUT /api/sync, implementing
 * docs/sync-contract.md closely enough that the client can be exercised
 * end to end without a backend: compare-and-set with 409 + snapshot, the
 * 900 KB limit, structural validation, and the 24-hour clock check.
 *
 * Used by api.ts in mock mode, and directly by tests. Nothing here touches
 * React Native, storage or the network.
 */

export const SYNC_MAX_BODY_BYTES = 900 * 1_024;
export const SYNC_MAX_FUTURE_MS = 24 * 60 * 60 * 1_000;
const SUPPORTED_SCHEMA_VERSION = 1;
const MAX_TARGETS = 50;
const MAX_TASKS_PER_TARGET = 200;
const MAX_CV_ENTRIES = 2_000;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/u;

export interface MockSyncResponse {
  status: number;
  body: unknown;
}

interface StoredSnapshot {
  schemaVersion: number;
  targets: unknown[];
  cvEntries: unknown[];
  serverUpdatedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const errorBody = (code: string, message: string): { error: { code: string; message: string } } => ({
  error: { code, message },
});

/** UTF-8 length without TextEncoder, which older Hermes builds lack. */
export const utf8Length = (text: string): number => {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
};

type Check =
  | { ok: true }
  | { ok: false; code: 'INVALID_SYNC_INPUT' | 'SYNC_CLOCK_SKEW' | 'SYNC_LIMIT_EXCEEDED'; message: string };

const invalid = (message: string): Check => ({ ok: false, code: 'INVALID_SYNC_INPUT', message });
const overLimit = (message: string): Check => ({ ok: false, code: 'SYNC_LIMIT_EXCEEDED', message });

const checkTimestamp = (value: unknown, field: string, now: number): Check => {
  if (typeof value !== 'string' || !ISO_UTC.test(value) || Number.isNaN(Date.parse(value))) {
    return invalid(`${field} must be an ISO 8601 UTC timestamp`);
  }
  if (Date.parse(value) - now > SYNC_MAX_FUTURE_MS) {
    return { ok: false, code: 'SYNC_CLOCK_SKEW', message: `${field} is more than 24 hours in the future` };
  }
  return { ok: true };
};

const checkRecords = (
  records: unknown[],
  kind: 'target' | 'cvEntry',
  now: number,
): Check => {
  const seen = new Set<string>();
  for (const record of records) {
    if (!isRecord(record)) return invalid(`${kind} is not an object`);
    if (typeof record.id !== 'string' || record.id.length < 1 || record.id.length > 128) {
      return invalid(`${kind}.id must be 1-128 characters`);
    }
    if (seen.has(record.id)) return invalid(`duplicate ${kind} id`);
    seen.add(record.id);

    for (const field of ['updatedAt', 'deletedAt', 'createdAt'] as const) {
      if (record[field] === undefined && field !== 'updatedAt') continue;
      const check = checkTimestamp(record[field], `${kind}.${field}`, now);
      if (!check.ok) return check;
    }
    if (typeof record.deletedAt === 'string') continue;

    if (kind === 'target') {
      if (typeof record.roleId !== 'string' || typeof record.experience !== 'string') {
        return invalid('live target lacks roleId or experience');
      }
      if (record.level !== 'internship' && record.level !== 'entry-level') return invalid('invalid level');
      if (!Array.isArray(record.roadmap)) return invalid('live target lacks a roadmap');
      if (record.roadmap.length > MAX_TASKS_PER_TARGET) return overLimit('too many milestones');
      const badTask = record.roadmap.some(
        (task) =>
          !isRecord(task) ||
          (task.status !== 'not_started' && task.status !== 'in_progress' && task.status !== 'done'),
      );
      if (badTask) return invalid('invalid milestone status');
    } else {
      if (typeof record.targetId !== 'string' || typeof record.taskId !== 'string' || typeof record.text !== 'string') {
        return invalid('live CV entry lacks targetId, taskId or text');
      }
      if (record.status !== 'pending' && record.status !== 'ready' && record.status !== 'failed') {
        return invalid('invalid CV entry status');
      }
    }
  }
  return { ok: true };
};

export class MockSyncServer {
  private stored: StoredSnapshot | null = null;
  private lastIssued = 0;

  public constructor(private readonly now: () => number = Date.now) {}

  public get(): MockSyncResponse {
    return {
      status: 200,
      body: this.stored ?? { schemaVersion: SUPPORTED_SCHEMA_VERSION, targets: [], cvEntries: [], serverUpdatedAt: null },
    };
  }

  /** `rawBody` is the JSON text, so the size limit is checked before parsing, as the contract asks. */
  public put(rawBody: string): MockSyncResponse {
    if (utf8Length(rawBody) > SYNC_MAX_BODY_BYTES) {
      return { status: 413, body: errorBody('SYNC_PAYLOAD_TOO_LARGE', 'Snapshot exceeds 900 KB') };
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: errorBody('INVALID_SYNC_INPUT', 'Body is not JSON') };
    }
    if (!isRecord(body) || !Array.isArray(body.targets) || !Array.isArray(body.cvEntries)) {
      return { status: 400, body: errorBody('INVALID_SYNC_INPUT', 'targets and cvEntries must be arrays') };
    }
    const { schemaVersion, baseServerUpdatedAt, targets, cvEntries } = body;
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
      return { status: 400, body: errorBody('INVALID_SYNC_INPUT', 'schemaVersion must be a positive integer') };
    }
    if (schemaVersion > SUPPORTED_SCHEMA_VERSION) {
      return { status: 400, body: errorBody('SYNC_SCHEMA_UNSUPPORTED', 'schemaVersion is newer than this server') };
    }
    if (!(baseServerUpdatedAt === null || typeof baseServerUpdatedAt === 'string')) {
      return { status: 400, body: errorBody('INVALID_SYNC_INPUT', 'baseServerUpdatedAt must be a string or null') };
    }
    const now = this.now();
    // Structure first: an over-limit answer should mean the data was otherwise fine.
    for (const check of [checkRecords(targets, 'target', now), checkRecords(cvEntries, 'cvEntry', now)]) {
      if (!check.ok) return { status: 400, body: errorBody(check.code, check.message) };
    }
    // Live records only: tombstones never count, so deleting always makes room.
    const live = (records: unknown[]): number =>
      records.filter((record) => isRecord(record) && typeof record.deletedAt !== 'string').length;
    if (live(targets) > MAX_TARGETS || live(cvEntries) > MAX_CV_ENTRIES) {
      return { status: 400, body: errorBody('SYNC_LIMIT_EXCEEDED', 'Too many live records') };
    }

    // Compare-and-set: the whole point of baseServerUpdatedAt.
    const current = this.stored?.serverUpdatedAt ?? null;
    if (current !== baseServerUpdatedAt) {
      return {
        status: 409,
        body: {
          ...errorBody('SYNC_CONFLICT', 'The stored snapshot changed since your last sync.'),
          snapshot: this.get().body,
        },
      };
    }

    // Strictly increasing, even if two writes land in the same millisecond.
    this.lastIssued = Math.max(now, this.lastIssued + 1);
    this.stored = {
      schemaVersion,
      targets,
      cvEntries,
      serverUpdatedAt: new Date(this.lastIssued).toISOString(),
    };
    return { status: 200, body: this.stored };
  }

  /** DELETE: forget everything stored. Idempotent, like the contract asks. */
  public delete(): MockSyncResponse {
    this.stored = null;
    return { status: 204, body: {} };
  }

  /** Test helper: what a second device would have pushed. */
  public seed(snapshot: Omit<StoredSnapshot, 'serverUpdatedAt'>): string {
    this.lastIssued = Math.max(this.now(), this.lastIssued + 1);
    this.stored = { ...snapshot, serverUpdatedAt: new Date(this.lastIssued).toISOString() };
    return this.stored.serverUpdatedAt;
  }

  public reset(): void {
    this.stored = null;
    this.lastIssued = 0;
  }
}

/** The one instance mock mode talks to. Memory only: it is gone on reload, by design. */
export const mockSyncServer = new MockSyncServer();

/**
 * Mock mode's per-account storage: one snapshot per Firebase UID, as the real
 * backend keys it. `mockSyncServer` stays as the default for callers that
 * have no UID (single-account tests).
 */
const serversByUid = new Map<string, MockSyncServer>();
export const mockSyncServerFor = (uid: string): MockSyncServer => {
  let server = serversByUid.get(uid);
  if (!server) {
    server = new MockSyncServer();
    serversByUid.set(uid, server);
  }
  return server;
};
export const resetMockSyncServers = (): void => {
  serversByUid.clear();
  mockSyncServer.reset();
};
