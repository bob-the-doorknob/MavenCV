import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const TODAY = '2026-10-02';

/** A via object the way `npm audit --json` writes it. */
const advisory = (id, name, severity, extra = {}) => ({
  source: 1,
  name,
  dependency: name,
  title: `${name} advisory`,
  url: `https://github.com/advisories/${id}`,
  severity,
  range: '<1.0.0',
  ...extra,
});

/** A report built from vulnerabilities, with matching counts. */
const report = (vulnerabilities = {}) => {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const entry of Object.values(vulnerabilities)) {
    counts[entry.severity] += 1;
    counts.total += 1;
  }
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } };
};

const FORGE = 'GHSA-86w9-cpqp-85rv';
const GRPC = 'GHSA-m9gg-hp2v-232j';
const OTHER = 'GHSA-aaaa-bbbb-cccc';

const forgeReport = (...extraAdvisories) =>
  report({
    'node-forge': { severity: 'high', via: [advisory(FORGE, 'node-forge', 'high'), ...extraAdvisories] },
    // A package that is vulnerable only because it depends on node-forge.
    '@expo/cli': { severity: 'high', via: ['node-forge'] },
  });

const entry = (overrides = {}) => ({
  advisory: FORGE,
  package: 'node-forge',
  severity: 'high',
  scope: 'dev-tooling',
  justification: 'Dev tooling only; no patched release.',
  owner: 'owner@example.com',
  expires: '2026-11-01',
  ...overrides,
});

/** Runs the real script. `exceptions` may be an array, a string (written as-is) or null (file absent). */
const run = (auditReport, { exceptions = [], auditExit = '1', today = TODAY } = {}) => {
  const folder = mkdtempSync(join(tmpdir(), 'maven-audit-test-'));
  try {
    const reportFile = join(folder, 'audit.json');
    writeFileSync(reportFile, typeof auditReport === 'string' ? auditReport : JSON.stringify(auditReport));
    const exceptionsFile = join(folder, 'exceptions.json');
    if (exceptions !== null) writeFileSync(exceptionsFile, typeof exceptions === 'string' ? exceptions : JSON.stringify(exceptions));
    const result = spawnSync(
      process.execPath,
      ['scripts/check-audit.mjs', reportFile, auditExit, exceptionsFile, `--today=${today}`],
      { encoding: 'utf8' },
    );
    return { ...result, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
};

// ---- the original severity rules, now with advisories behind them -------------

test('moderate findings are reported without blocking (exit 0)', () => {
  const result = run(report({ uuid: { severity: 'moderate', via: [advisory(OTHER, 'uuid', 'moderate')] } }));
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout.split('\n')[0]).moderate, 1);
});

test('an unexcepted high finding blocks (exit 1)', () => {
  const result = run(forgeReport());
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout.split('\n')[0]).high, 2);
  assert.match(result.stderr, new RegExp(FORGE, 'u'));
});

test('an unexcepted critical finding blocks (exit 1)', () => {
  const result = run(report({ evil: { severity: 'critical', via: [advisory(OTHER, 'evil', 'critical')] } }));
  assert.equal(result.status, 1);
});

test('a clean audit passes (exit 0)', () => {
  assert.equal(run(report(), { auditExit: '0' }).status, 0);
});

// ---- exceptions -------------------------------------------------------------------

test('an excepted high passes (exit 0), covers the package that only inherits it, and is printed', () => {
  const result = run(forgeReport(), { exceptions: [entry()] });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Active exceptions \(1\)/u);
  assert.match(result.stdout, /GHSA-86w9-cpqp-85rv node-forge \(high, dev-tooling\) — 30 days left, expires 2026-11-01, owner owner@example\.com/u);
  assert.match(result.stdout, /Dev tooling only; no patched release\./u);
  assert.match(result.stdout, /Packages passed by exception: @expo\/cli, node-forge/u);
});

test('the same exception, expired, fails (exit 1) and says why', () => {
  const result = run(forgeReport(), { exceptions: [entry({ expires: '2026-10-01' })] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /expired on 2026-10-01/u);
});

test('an exception is still valid on its last day (exit 0, 0 days left)', () => {
  const result = run(forgeReport(), { exceptions: [entry({ expires: TODAY })] });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /0 days left/u);
});

test('a second HIGH advisory on an excepted package blocks (exit 1), and the package inheriting it too', () => {
  const result = run(forgeReport(advisory(OTHER, 'node-forge', 'high')), { exceptions: [entry()] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GHSA-aaaa-bbbb-cccc on node-forge \(high\)/u);
  assert.match(result.stderr, /not listed/u);
  assert.match(result.stderr, /@expo\/cli \(effective severity high\)/u);
});

test('a second CRITICAL advisory on an excepted package blocks (exit 1)', () => {
  const result = run(forgeReport(advisory(OTHER, 'node-forge', 'critical')), { exceptions: [entry()] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /effective severity critical/u);
});

test('an exception for one package cannot cover the same advisory id on another', () => {
  const result = run(forgeReport(), { exceptions: [entry({ package: 'something-else' })] });
  assert.equal(result.status, 1);
});

test('a critical advisory cannot be excepted, even by an entry that says critical (exit 1)', () => {
  const critical = report({ evil: { severity: 'critical', via: [advisory(OTHER, 'evil', 'critical')] } });
  for (const severity of ['critical', 'high']) {
    const result = run(critical, { exceptions: [entry({ advisory: OTHER, package: 'evil', severity })] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /critical advisories cannot be excepted/u);
  }
});

test('an entry whose severity is lower than the advisory fails (exit 1)', () => {
  for (const severity of ['moderate', 'low', 'info']) {
    const result = run(forgeReport(), { exceptions: [entry({ severity })] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /says .*, but the advisory is high/u);
  }
});

test('an entry with a blank justification or owner is never used (exit 1)', () => {
  for (const [field, reason] of [['justification', /no justification/u], ['owner', /no owner/u]]) {
    const result = run(forgeReport(), { exceptions: [entry({ [field]: '   ' })] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, reason);
  }
});

test('an entry with no justification or owner field at all is a malformed file (exit 2)', () => {
  for (const field of ['justification', 'owner']) {
    const broken = entry();
    delete broken[field];
    const result = run(forgeReport(), { exceptions: [broken] });
    assert.equal(result.status, 2);
    assert.match(result.stderr, new RegExp(`missing "${field}"`, 'u'));
  }
});

test('an expiry more than 90 days away is never used (exit 1); exactly 90 days is allowed (exit 0)', () => {
  const tooFar = run(forgeReport(), { exceptions: [entry({ expires: '2027-01-01' })] }); // 91 days
  assert.equal(tooFar.status, 1);
  assert.match(tooFar.stderr, /more than 90 days/u);
  const limit = run(forgeReport(), { exceptions: [entry({ expires: '2026-12-31' })] }); // 90 days
  assert.equal(limit.status, 0);
});

const grpcReport = () =>
  report({
    '@grpc/grpc-js': { severity: 'high', via: [advisory(GRPC, '@grpc/grpc-js', 'high'), advisory('GHSA-f596-whhp-79r4', '@grpc/grpc-js', 'low')] },
  });
const grpcEntry = (overrides = {}) => entry({ advisory: GRPC, package: '@grpc/grpc-js', scope: 'unreachable', ...overrides });

test('an excepted high plus an unexcepted LOW advisory passes (exit 0); the low is informational', () => {
  // Was exit 1 before the effective-severity rule: the low advisory needed its own entry.
  const result = run(grpcReport(), { exceptions: [grpcEntry()] });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Informational \(1\)/u);
  assert.match(result.stdout, /GHSA-f596-whhp-79r4 on @grpc\/grpc-js \(low\)/u);
  assert.match(result.stdout, /Packages passed by exception: @grpc\/grpc-js/u);
});

test('an excepted high plus an unexcepted MODERATE advisory passes (exit 0); the moderate is informational', () => {
  const moderate = report({
    'node-forge': { severity: 'high', via: [advisory(FORGE, 'node-forge', 'high'), advisory(OTHER, 'node-forge', 'moderate')] },
  });
  const result = run(moderate, { exceptions: [entry()] });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Informational \(1\)/u);
  assert.match(result.stdout, /GHSA-aaaa-bbbb-cccc on node-forge \(moderate\)/u);
});

test('an excepted high plus an unexcepted HIGH advisory blocks (exit 1)', () => {
  const twoHighs = report({
    '@grpc/grpc-js': { severity: 'high', via: [advisory(GRPC, '@grpc/grpc-js', 'high'), advisory(OTHER, '@grpc/grpc-js', 'high')] },
  });
  const result = run(twoHighs, { exceptions: [grpcEntry()] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GHSA-aaaa-bbbb-cccc on @grpc\/grpc-js \(high\)/u);
  // The excepted one is not blamed.
  assert.doesNotMatch(result.stderr, /GHSA-m9gg-hp2v-232j on/u);
});

test('an EXPIRED high entry plus a moderate blocks (exit 1): the high is uncovered again', () => {
  const result = run(grpcReport(), { exceptions: [grpcEntry({ expires: '2026-10-01' })] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GHSA-m9gg-hp2v-232j on @grpc\/grpc-js \(high\)/u);
  assert.match(result.stderr, /expired on 2026-10-01/u);
  assert.match(result.stderr, /effective severity high/u);
});

test('an unexcepted high with only a low entry still blocks (exit 1)', () => {
  const result = run(grpcReport(), { exceptions: [grpcEntry({ advisory: 'GHSA-f596-whhp-79r4', severity: 'low' })] });
  assert.equal(result.status, 1);
});

test('a moderate-only package never blocks (exit 0) and needs no exception', () => {
  const result = run(report({ uuid: { severity: 'moderate', via: [advisory(OTHER, 'uuid', 'moderate')] } }), { exceptions: [] });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Informational \(1\)/u);
});

test('a package flagged high only through a moderate dependency passes (exit 0)', () => {
  const inherited = report({
    uuid: { severity: 'moderate', via: [advisory(OTHER, 'uuid', 'moderate')] },
    expo: { severity: 'high', via: ['uuid'] },
  });
  const result = run(inherited);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GHSA-aaaa-bbbb-cccc on uuid \(moderate\)/u);
});

test('a high advisory reaching a package through a dependency still blocks without an exception (exit 1)', () => {
  const result = run(forgeReport(), { exceptions: [] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /@expo\/cli \(effective severity high\)/u);
});

test('a valid entry for a moderate advisory is allowed and shown as active, not informational', () => {
  const moderate = report({ uuid: { severity: 'moderate', via: [advisory(OTHER, 'uuid', 'moderate')] } });
  const result = run(moderate, { exceptions: [entry({ advisory: OTHER, package: 'uuid', severity: 'moderate' })] });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Active exceptions \(1\)/u);
  assert.doesNotMatch(result.stdout, /Informational/u);
});

test('advisory ids match regardless of case', () => {
  const result = run(forgeReport(), { exceptions: [entry({ advisory: FORGE.toUpperCase().replace('GHSA', 'GHSA') })] });
  assert.equal(result.status, 0);
});

test('a stale entry only warns (exit 0) and is not counted as active', () => {
  const result = run(report(), { exceptions: [entry()], auditExit: '0' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /WARNING: exception GHSA-86w9-cpqp-85rv for node-forge matches no current finding/u);
  assert.doesNotMatch(result.stdout, /Active exceptions/u);
});

test('an expired entry that matches nothing only warns (exit 0)', () => {
  const result = run(report(), { exceptions: [entry({ expires: '2020-01-01' })], auditExit: '0' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /WARNING/u);
});

// ---- fail closed ------------------------------------------------------------------

test('a malformed exceptions file exits 2', () => {
  const cases = [
    'NOT JSON',
    '{}',
    '[1]',
    [entry({ expires: '2026-13-45' })],
    [entry({ expires: 'soon' })],
    [entry({ advisory: 'CVE-2026-0001' })],
    [entry({ scope: 'whatever' })],
    [entry({ severity: 'huge' })],
    [{ ...entry(), extra: 'typo guard' }],
    [entry(), entry()],
  ];
  for (const exceptions of cases) {
    const result = run(forgeReport(), { exceptions });
    assert.equal(result.status, 2, JSON.stringify(exceptions));
    assert.match(result.stderr, /Audit exceptions file invalid/u);
  }
});

test('a missing exceptions file exits 2', () => {
  assert.equal(run(forgeReport(), { exceptions: null }).status, 2);
});

test('invalid reports and registry failures exit 2 without echoing raw data', () => {
  const inputs = [
    'PRIVATE_BAD_JSON',
    { error: { message: 'PRIVATE_REGISTRY_TOKEN' } },
    { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: -1, critical: 0, total: -1 } } },
    { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 1 } } },
  ];
  for (const input of inputs) {
    const result = run(input, { auditExit: '0' });
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.out, /PRIVATE_/u);
  }
  assert.equal(run(report(), { auditExit: '2' }).status, 2);
  assert.equal(run(report(), { auditExit: '1' }).status, 2);
});

test('an unknown report shape exits 2', () => {
  const good = forgeReport();
  const shapes = [
    // counts say 2 highs but there is no vulnerabilities object
    { metadata: good.metadata },
    // vulnerabilities do not match the counts
    { ...good, metadata: { vulnerabilities: { ...good.metadata.vulnerabilities, high: 1, total: 1 } } },
    // a severity npm does not use
    report({ x: { severity: 'catastrophic', via: [] } }),
    // via is not a list
    { ...report({ x: { severity: 'high', via: [] } }), vulnerabilities: { x: { severity: 'high', via: 'node-forge' } } },
    // an advisory with no package name
    report({ x: { severity: 'high', via: [{ severity: 'high', url: `https://github.com/advisories/${FORGE}` }] } }),
  ];
  for (const shape of shapes) assert.equal(run(shape, { exceptions: [entry()] }).status, 2, JSON.stringify(shape).slice(0, 80));
});

test('a high package with no advisory to match cannot be excepted (exit 1)', () => {
  const result = run(report({ orphan: { severity: 'high', via: ['not-in-this-report'] } }), { exceptions: [entry()] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no advisory/u);
});

test('an advisory with no GHSA id in its url cannot be excepted (exit 1)', () => {
  const noId = report({ odd: { severity: 'high', via: [advisory(FORGE, 'odd', 'high', { url: 'https://example.com/no-id' })] } });
  assert.equal(run(noId, { exceptions: [entry({ package: 'odd' })] }).status, 1);
});

test('a bad --today value exits 2', () => {
  assert.equal(run(forgeReport(), { exceptions: [entry()], today: 'tomorrow' }).status, 2);
});
