import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const run = (report, auditExit = '0') => {
  const folder = mkdtempSync(join(tmpdir(), 'maven-audit-test-'));
  try {
    const file = join(folder, 'audit.json');
    writeFileSync(file, typeof report === 'string' ? report : JSON.stringify(report));
    return spawnSync(process.execPath, ['scripts/check-audit.mjs', file, auditExit], { encoding: 'utf8' });
  } finally { rmSync(folder, { recursive: true, force: true }); }
};
const report = (counts = {}) => ({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...counts } } });

test('moderate findings are reported without blocking', () => {
  const result = run(report({ moderate: 13, total: 13 }), '1');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /"moderate":13/u);
});
test('high and critical findings block CI', () => {
  for (const severity of ['high', 'critical']) {
    const result = run(report({ [severity]: 1, total: 1 }), '1');
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout)[severity], 1);
  }
});
test('invalid reports and registry failures fail closed without echoing raw data', () => {
  for (const input of ['PRIVATE_BAD_JSON', { error: { message: 'PRIVATE_REGISTRY_TOKEN' } }, report({ high: -1 }), report({ total: 1 })]) {
    const result = run(input);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_/u);
  }
  assert.equal(run(report(), '2').status, 2);
  assert.equal(run(report(), '1').status, 2);
});
