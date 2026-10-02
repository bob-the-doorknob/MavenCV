import { describe, expect, it } from 'vitest';

import { MockSyncServer, SYNC_MAX_BODY_BYTES, utf8Length } from './syncMockServer';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

const liveTarget = (overrides: Record<string, unknown> = {}) => ({
  id: 't1',
  roleId: 'software-engineer',
  level: 'internship',
  experience: 'x',
  createdAt: iso(NOW - 1_000),
  updatedAt: iso(NOW),
  roadmap: [],
  focusTaskIds: [],
  ...overrides,
});

const put = (server: MockSyncServer, body: Record<string, unknown>) =>
  server.put(JSON.stringify({ schemaVersion: 1, targets: [], cvEntries: [], baseServerUpdatedAt: null, ...body }));

const code = (response: { body: unknown }): string =>
  (response.body as { error: { code: string } }).error.code;

describe('MockSyncServer', () => {
  it('returns an empty snapshot, never a 404, before anything is stored', () => {
    expect(new MockSyncServer(() => NOW).get()).toEqual({
      status: 200,
      body: { schemaVersion: 1, targets: [], cvEntries: [], serverUpdatedAt: null },
    });
  });

  it('stores a snapshot and returns it with a new server version', () => {
    const server = new MockSyncServer(() => NOW);
    const response = put(server, { targets: [liveTarget()] });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ targets: [liveTarget()], serverUpdatedAt: iso(NOW) });
    expect(server.get().body).toEqual(response.body);
  });

  it('issues strictly increasing versions within one millisecond', () => {
    const server = new MockSyncServer(() => NOW);
    const first = put(server, {}).body as { serverUpdatedAt: string };
    const second = put(server, { baseServerUpdatedAt: first.serverUpdatedAt }).body as { serverUpdatedAt: string };
    expect(second.serverUpdatedAt > first.serverUpdatedAt).toBe(true);
  });

  it('answers a stale base with 409 and the stored snapshot, writing nothing', () => {
    const server = new MockSyncServer(() => NOW);
    put(server, { targets: [liveTarget()] });

    const response = put(server, { targets: [], baseServerUpdatedAt: null });

    expect(response.status).toBe(409);
    expect(code(response)).toBe('SYNC_CONFLICT');
    expect((response.body as { snapshot: { targets: unknown[] } }).snapshot.targets).toEqual([liveTarget()]);
    expect((server.get().body as { targets: unknown[] }).targets).toHaveLength(1);
  });

  it('refuses a body over 900 KB before parsing it', () => {
    const response = new MockSyncServer(() => NOW).put('x'.repeat(SYNC_MAX_BODY_BYTES + 1));
    expect(response.status).toBe(413);
    expect(code(response)).toBe('SYNC_PAYLOAD_TOO_LARGE');
  });

  it('counts multi-byte characters as UTF-8', () => {
    expect(utf8Length('aé€😀')).toBe(1 + 2 + 3 + 4);
  });

  it('tells a timestamp over 24 h ahead apart from other bad input', () => {
    const server = new MockSyncServer(() => NOW);
    const future = put(server, { targets: [liveTarget({ updatedAt: iso(NOW + 25 * 60 * 60 * 1_000) })] });
    const garbled = put(server, { targets: [liveTarget({ updatedAt: 'yesterday' })] });

    expect(future.status).toBe(400);
    expect(code(future)).toBe('SYNC_CLOCK_SKEW');
    expect(code(garbled)).toBe('INVALID_SYNC_INPUT');
  });

  it('accepts a few minutes of skew', () => {
    const response = put(new MockSyncServer(() => NOW), { targets: [liveTarget({ updatedAt: iso(NOW + 5 * 60_000) })] });
    expect(response.status).toBe(200);
  });

  it.each([
    ['a duplicated id', { targets: [liveTarget(), liveTarget()] }],
    ['a live target without a roadmap', { targets: [liveTarget({ roadmap: undefined })] }],
    ['an unknown level', { targets: [liveTarget({ level: 'senior' })] }],
    ['an unknown entry status', { cvEntries: [{ id: 'e', targetId: 't', taskId: 'k', status: 'done', text: '', createdAt: iso(NOW), updatedAt: iso(NOW) }] }],
    ['a non-integer schema version', { schemaVersion: 1.5 }],
  ])('rejects %s', (_label, body) => {
    const response = put(new MockSyncServer(() => NOW), body);
    expect(response.status).toBe(400);
    expect(code(response)).toBe('INVALID_SYNC_INPUT');
  });

  it('rejects a schema version it does not know', () => {
    const response = put(new MockSyncServer(() => NOW), { schemaVersion: 2 });
    expect(code(response)).toBe('SYNC_SCHEMA_UNSUPPORTED');
  });

  it('accepts tombstones and keeps unknown record fields', () => {
    const server = new MockSyncServer(() => NOW);
    const response = put(server, {
      targets: [{ id: 'gone', updatedAt: iso(NOW), deletedAt: iso(NOW) }, liveTarget({ futureField: 42 })],
    });
    expect(response.status).toBe(200);
    expect((server.get().body as { targets: Array<Record<string, unknown>> }).targets[1]?.futureField).toBe(42);
  });

  describe('count limits', () => {
    const tomb = (id: string) => ({ id, updatedAt: iso(NOW), deletedAt: iso(NOW) });
    const targets = (count: number) => Array.from({ length: count }, (_, index) => liveTarget({ id: `t${index}` }));

    it('accept exactly the limit of live records', () => {
      expect(put(new MockSyncServer(() => NOW), { targets: targets(50) }).status).toBe(200);
    });

    it('refuse one more live target with SYNC_LIMIT_EXCEEDED, not INVALID_SYNC_INPUT', () => {
      const response = put(new MockSyncServer(() => NOW), { targets: targets(51) });
      expect(response.status).toBe(400);
      expect(code(response)).toBe('SYNC_LIMIT_EXCEEDED');
    });

    it('do not count tombstones: deleting always makes room', () => {
      const withTombstones = [...targets(50), ...Array.from({ length: 30 }, (_, index) => tomb(`gone${index}`))];
      expect(put(new MockSyncServer(() => NOW), { targets: withTombstones }).status).toBe(200);
    });

    it('apply to CV entries and to milestones per target', () => {
      const entry = (id: string) => ({ id, targetId: 't', taskId: 'k', status: 'ready', text: 'x', createdAt: iso(NOW), updatedAt: iso(NOW) });
      expect(code(put(new MockSyncServer(() => NOW), { cvEntries: Array.from({ length: 2_001 }, (_, i) => entry(`e${i}`)) }))).toBe('SYNC_LIMIT_EXCEEDED');
      expect(put(new MockSyncServer(() => NOW), { cvEntries: [...Array.from({ length: 2_000 }, (_, i) => entry(`e${i}`)), tomb('old')] }).status).toBe(200);
      const roadmap = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `k${i}`, status: 'not_started' }));
      expect(code(put(new MockSyncServer(() => NOW), { targets: [liveTarget({ roadmap: roadmap(201) })] }))).toBe('SYNC_LIMIT_EXCEEDED');
      expect(put(new MockSyncServer(() => NOW), { targets: [liveTarget({ roadmap: roadmap(200) })] }).status).toBe(200);
    });

    it('still reject malformed data as INVALID_SYNC_INPUT, even when over a limit', () => {
      const response = put(new MockSyncServer(() => NOW), { targets: [...targets(51), liveTarget({ id: 't0' })] });
      expect(code(response)).toBe('INVALID_SYNC_INPUT');
    });
  });
});
