import { readFileSync } from 'node:fs';

// Validate npm's report, not its prose. A registry outage is never a clean audit.
try {
  const [file, auditExit] = process.argv.slice(2);
  if (!file || !['0', '1'].includes(auditExit)) throw new Error();
  const report = JSON.parse(readFileSync(file, 'utf8'));
  if (report.error) throw new Error();
  const counts = report.metadata?.vulnerabilities;
  const fields = ['info', 'low', 'moderate', 'high', 'critical', 'total'];
  if (!counts || fields.some((key) => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) throw new Error();
  if (fields.slice(0, -1).reduce((sum, key) => sum + counts[key], 0) !== counts.total) throw new Error();
  if (auditExit === '1' && counts.total === 0) throw new Error();
  console.log(JSON.stringify(Object.fromEntries(fields.map((key) => [key, counts[key]]))));
  process.exitCode = counts.high > 0 || counts.critical > 0 ? 1 : 0;
} catch {
  console.error('Dependency audit unavailable or invalid. CI fails closed; inspect the audit artifact.');
  process.exitCode = 2;
}
