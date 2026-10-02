import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Dependency audit gate.
 *
 *   node scripts/check-audit.mjs <npm-audit.json> <npm-audit-exit-code> [exceptions.json] [--today=YYYY-MM-DD]
 *
 * Blocks (exit 1) on a high or critical vulnerable package whose EFFECTIVE
 * severity is still high or critical. Effective severity is the highest
 * severity among the advisories behind the package — its own and those it
 * inherits — that have no valid, unexpired exception in
 * scripts/audit-exceptions.json. Moderate and low advisories never block and
 * need no exception; they are listed as informational. Critical advisories
 * can never be excepted. Fails closed (exit 2) on a malformed report or
 * exceptions file. Exit 0 otherwise.
 * `--today` exists for the regression tests only; CI never passes it.
 *
 * Exceptions are matched per ADVISORY, not per package, to the package the
 * advisory is on. A new high advisory on an excepted package therefore blocks
 * until someone reads it; a new moderate or low one is shown, not blocking.
 */

const COUNT_FIELDS = ['info', 'low', 'moderate', 'high', 'critical', 'total'];
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const SCOPES = ['dev-tooling', 'unreachable'];
const ENTRY_FIELDS = ['advisory', 'package', 'severity', 'scope', 'justification', 'owner', 'expires'];
/** An exception is a short-term decision to revisit, not a permanent waiver. */
export const MAX_EXCEPTION_DAYS = 90;
const DAY_MS = 86_400_000;
const GHSA_ID = /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/iu;
const GHSA_IN_URL = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/iu;

/** A problem that must fail the gate closed. `kind` says which input was at fault. */
class GateError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** GitHub writes the prefix in capitals and the rest in lower case; ids are compared lower-cased. */
const showId = (id) => (id.startsWith('ghsa-') ? `GHSA${id.slice(4)}` : id);

/** YYYY-MM-DD → whole days since the epoch, or null if it is not a real calendar date. */
const dayNumber = (text) => {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const ms = Date.UTC(year, month - 1, day);
  return new Date(ms).toISOString().slice(0, 10) === text ? ms / DAY_MS : null;
};

// ---- the audit report -------------------------------------------------------

const advisoryId = (via) => {
  const match = GHSA_IN_URL.exec(typeof via.url === 'string' ? via.url : '');
  // No GHSA id means nothing can match it, so it can only block.
  return match ? match[0].toLowerCase() : `source:${String(via.source)}`;
};

export const parseReport = (text) => {
  const bad = (reason) => new GateError('report', reason);
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw bad('not JSON');
  }
  if (!isObject(report) || report.error) throw bad('not an audit report');

  const counts = report.metadata?.vulnerabilities;
  if (!isObject(counts) || COUNT_FIELDS.some((key) => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) {
    throw bad('bad counts');
  }
  if (COUNT_FIELDS.slice(0, -1).reduce((sum, key) => sum + counts[key], 0) !== counts.total) throw bad('counts do not add up');

  const vulnerabilities = report.vulnerabilities ?? {};
  if (!isObject(vulnerabilities)) throw bad('bad vulnerabilities');
  const names = Object.keys(vulnerabilities);
  if (names.length !== counts.total) throw bad('vulnerabilities do not match counts');

  const tally = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const name of names) {
    const entry = vulnerabilities[name];
    if (!isObject(entry) || !(entry.severity in RANK) || !Array.isArray(entry.via)) throw bad('bad vulnerability');
    tally[entry.severity] += 1;
    for (const via of entry.via) {
      if (typeof via === 'string') continue;
      if (!isObject(via) || typeof via.name !== 'string' || !(via.severity in RANK)) throw bad('bad advisory');
    }
  }
  if (Object.keys(tally).some((key) => tally[key] !== counts[key])) throw bad('severity counts do not match');

  return { counts, vulnerabilities };
};

/**
 * Every advisory behind a package: its own, plus those of the vulnerable
 * packages it depends on (npm lists those as plain strings in `via`).
 */
const advisoriesBehind = (name, vulnerabilities, seen = new Set()) => {
  if (seen.has(name)) return [];
  seen.add(name);
  const found = new Map();
  for (const via of vulnerabilities[name]?.via ?? []) {
    if (typeof via === 'string') {
      for (const inherited of advisoriesBehind(via, vulnerabilities, seen)) found.set(`${inherited.id}|${inherited.package}`, inherited);
    } else {
      const advisory = { id: advisoryId(via), package: via.name, severity: via.severity, title: via.title, url: via.url };
      found.set(`${advisory.id}|${advisory.package}`, advisory);
    }
  }
  return [...found.values()];
};

// ---- the exceptions file ----------------------------------------------------

export const parseExceptions = (text) => {
  const bad = (reason) => new GateError('exceptions', reason);
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    throw bad('not JSON');
  }
  if (!Array.isArray(list)) throw bad('must be a list of entries');

  const seen = new Set();
  return list.map((entry, index) => {
    const at = `entry ${index + 1}`;
    if (!isObject(entry)) throw bad(`${at} is not an object`);
    for (const key of Object.keys(entry)) if (!ENTRY_FIELDS.includes(key)) throw bad(`${at} has an unknown field "${key}"`);
    for (const key of ENTRY_FIELDS) if (typeof entry[key] !== 'string') throw bad(`${at} is missing "${key}"`);
    if (!GHSA_ID.test(entry.advisory)) throw bad(`${at} advisory is not a GHSA id`);
    if (!entry.package.trim()) throw bad(`${at} package is empty`);
    if (!(entry.severity in RANK)) throw bad(`${at} severity is not valid`);
    if (!SCOPES.includes(entry.scope)) throw bad(`${at} scope must be one of ${SCOPES.join(', ')}`);
    if (dayNumber(entry.expires) === null) throw bad(`${at} expires is not a YYYY-MM-DD date`);
    const key = `${entry.advisory.toLowerCase()}|${entry.package}`;
    if (seen.has(key)) throw bad(`${at} repeats ${entry.advisory} for ${entry.package}`);
    seen.add(key);
    return { ...entry, advisory: entry.advisory.toLowerCase(), key };
  });
};

/** Why an entry can never be used, whatever advisory it is matched to. Null if it can. */
const entryProblem = (entry, today) => {
  if (!entry.justification.trim()) return 'it has no justification';
  if (!entry.owner.trim()) return 'it has no owner';
  const expires = dayNumber(entry.expires);
  if (expires < today) return `it expired on ${entry.expires}`;
  if (expires - today > MAX_EXCEPTION_DAYS) return `it expires more than ${MAX_EXCEPTION_DAYS} days from today (${entry.expires})`;
  return null;
};

// ---- the decision ------------------------------------------------------------

/** Pure: no I/O, no clock. `todayText` is YYYY-MM-DD. */
export const evaluate = ({ report, exceptions, todayText }) => {
  const today = dayNumber(todayText);
  if (today === null) throw new GateError('today', 'today is not a valid date');
  const { counts, vulnerabilities } = report;
  const byKey = new Map(exceptions.map((entry) => [entry.key, entry]));

  /** Why this advisory is not excepted, or null if it is. */
  const uncoveredReason = (advisory) => {
    const entry = byKey.get(`${advisory.id}|${advisory.package}`);
    if (!entry) return 'not listed in the exceptions file';
    if (advisory.severity === 'critical') return 'critical advisories cannot be excepted';
    const problem = entryProblem(entry, today);
    if (problem) return `its exception is rejected: ${problem}`;
    if (RANK[entry.severity] < RANK[advisory.severity]) {
      return `its exception says ${entry.severity}, but the advisory is ${advisory.severity}`;
    }
    return null;
  };

  const blockers = [];
  const passedByException = new Set();
  const covered = new Set();
  const informational = new Map();
  const everyAdvisoryKey = new Set();

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    const advisories = advisoriesBehind(name, vulnerabilities);
    const uncovered = [];
    for (const advisory of advisories) {
      const key = `${advisory.id}|${advisory.package}`;
      everyAdvisoryKey.add(key);
      const reason = uncoveredReason(advisory);
      if (reason) uncovered.push({ advisory, reason });
      else covered.add(key);
      // Below high, an advisory never blocks. Show it so it is not forgotten.
      if (reason && RANK[advisory.severity] < RANK.high) informational.set(key, advisory);
    }
    if (RANK[vulnerability.severity] < RANK.high) continue;

    if (advisories.length === 0) {
      blockers.push({ package: name, severity: vulnerability.severity, uncovered: [], note: 'npm gave no advisory to match an exception against' });
      continue;
    }
    // Effective severity: the worst advisory that still has no valid exception.
    const blocking = uncovered.filter(({ advisory }) => RANK[advisory.severity] >= RANK.high);
    if (blocking.length > 0) {
      const effective = blocking.reduce((worst, { advisory }) => (RANK[advisory.severity] > RANK[worst] ? advisory.severity : worst), 'high');
      blockers.push({ package: name, severity: effective, uncovered: blocking });
    } else if (advisories.some((advisory) => covered.has(`${advisory.id}|${advisory.package}`))) {
      passedByException.add(name);
    }
  }

  const active = exceptions
    .filter((entry) => covered.has(entry.key))
    .map((entry) => ({ entry, daysLeft: dayNumber(entry.expires) - today }));
  const stale = exceptions.filter((entry) => !everyAdvisoryKey.has(entry.key));

  return {
    counts,
    blockers,
    active,
    stale,
    exceptedPackages: [...passedByException].sort(),
    informational: [...informational.values()].sort((a, b) => a.package.localeCompare(b.package) || a.id.localeCompare(b.id)),
  };
};

// ---- the command line ---------------------------------------------------------

const defaultExceptionsPath = join(dirname(fileURLToPath(import.meta.url)), 'audit-exceptions.json');

const parseArguments = (argv) => {
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const [file, auditExit, exceptionsPath = defaultExceptionsPath] = positional;
  if (!file || !['0', '1'].includes(auditExit) || positional.length > 3) throw new GateError('report', 'bad arguments');
  let todayText = new Date().toISOString().slice(0, 10);
  for (const flag of flags) {
    if (!flag.startsWith('--today=')) throw new GateError('report', 'bad arguments');
    todayText = flag.slice('--today='.length);
  }
  return { file, auditExit, exceptionsPath, todayText };
};

const main = () => {
  try {
    const { file, auditExit, exceptionsPath, todayText } = parseArguments(process.argv.slice(2));
    // Validate npm's report, not its prose. A registry outage is never a clean audit.
    const report = parseReport(readFileSync(file, 'utf8'));
    if (auditExit === '1' && report.counts.total === 0) throw new GateError('report', 'npm failed but reported nothing');

    let exceptions;
    try {
      exceptions = parseExceptions(readFileSync(exceptionsPath, 'utf8'));
    } catch (error) {
      if (error instanceof GateError) throw error;
      throw new GateError('exceptions', 'cannot be read');
    }

    const result = evaluate({ report, exceptions, todayText });
    const { counts } = result;
    console.log(JSON.stringify(Object.fromEntries(COUNT_FIELDS.map((key) => [key, counts[key]]))));

    if (result.active.length > 0) {
      console.log(`Active exceptions (${result.active.length}) — advisories excepted:`);
      for (const { entry, daysLeft } of result.active) {
        console.log(
          `  ${showId(entry.advisory)} ${entry.package} (${entry.severity}, ${entry.scope}) — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left, expires ${entry.expires}, owner ${entry.owner}\n    ${entry.justification}`,
        );
      }
      if (result.exceptedPackages.length > 0) console.log(`Packages passed by exception: ${result.exceptedPackages.join(', ')}`);
    }
    if (result.informational.length > 0) {
      console.log(`Informational (${result.informational.length}) — below high, never blocking, no exception needed:`);
      for (const advisory of result.informational) {
        console.log(`  ${showId(advisory.id)} on ${advisory.package} (${advisory.severity}): ${advisory.title ?? 'no title'}`);
      }
    }
    for (const entry of result.stale) {
      console.log(`WARNING: exception ${showId(entry.advisory)} for ${entry.package} matches no current finding. Remove it from scripts/audit-exceptions.json.`);
    }

    if (result.blockers.length > 0) {
      console.error(`Dependency audit blocked: ${result.blockers.length} package(s) still have a high or critical advisory with no valid exception.`);
      const advisories = new Map();
      for (const blocker of result.blockers) {
        console.error(`  ${blocker.package} (effective severity ${blocker.severity})${blocker.note ? `: ${blocker.note}` : ''}`);
        for (const { advisory, reason } of blocker.uncovered) {
          advisories.set(`${advisory.id}|${advisory.package}`, true);
          console.error(`    ${showId(advisory.id)} on ${advisory.package} (${advisory.severity}) — ${reason}`);
        }
      }
      console.error(`Unmatched advisories: ${advisories.size}`);
    }
    process.exitCode = result.blockers.length > 0 ? 1 : 0;
  } catch (error) {
    if (error instanceof GateError && error.kind === 'exceptions') {
      console.error(`Audit exceptions file invalid (${error.message}). CI fails closed; fix scripts/audit-exceptions.json.`);
    } else {
      console.error('Dependency audit unavailable or invalid. CI fails closed; inspect the audit artifact.');
    }
    process.exitCode = 2;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
