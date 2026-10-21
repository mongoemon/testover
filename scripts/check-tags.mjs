// Fails when a Playwright case does not carry exactly one priority tag (@p0, @p1 or @p2).
// The pipeline picks what to run from these tags (see docs/pipeline-plan.md), so a case with
// none would never run on a pull request and a case with two would run in two tiers.
// Usage: npm run check:tags   (lists the cases with `playwright test --list`, runs no test).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PRIORITIES = ['p0', 'p1', 'p2'];

function walk(suites, visit, trail = []) {
  for (const suite of suites ?? []) {
    const path = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) visit(spec, path);
    walk(suite.suites, visit, path);
  }
}

// Native tags come without the "@"; tags written in a describe title (the characterization
// files do this) are read from the title trail.
function tagsOf(spec, path) {
  const fromTitles = [...path, spec.title].flatMap((t) => [...t.matchAll(/@(\w+)/g)].map((m) => m[1]));
  const native = (spec.tags ?? []).map((t) => t.replace(/^@/, ''));
  return new Set([...native, ...fromTitles]);
}

function prioritiesOf(spec, path) {
  const tags = tagsOf(spec, path);
  return PRIORITIES.filter((p) => tags.has(p));
}

export function findPriorityProblems(report) {
  const problems = [];
  walk(report.suites, (spec, path) => {
    const found = prioritiesOf(spec, path);
    const name = [...path, spec.title].join(' › ');
    if (found.length === 0) problems.push(`${name}: no priority tag (add one of ${PRIORITIES.map((p) => `@${p}`).join(', ')})`);
    else if (found.length > 1) problems.push(`${name}: more than one priority tag (${found.map((p) => `@${p}`).join(', ')})`);
  });
  return problems;
}

export function countByPriority(report) {
  const counts = { p0: 0, p1: 0, p2: 0, none: 0 };
  walk(report.suites, (spec, path) => {
    const [first] = prioritiesOf(spec, path);
    counts[first ?? 'none'] += 1;
  });
  return counts;
}

function listReport() {
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const run = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`playwright --list failed: ${run.stderr || run.stdout}`);
  return JSON.parse(run.stdout);
}

function main() {
  const report = listReport();
  const counts = countByPriority(report);
  process.stdout.write(`p0=${counts.p0} p1=${counts.p1} p2=${counts.p2} untagged=${counts.none}\n`);
  const problems = findPriorityProblems(report);
  for (const problem of problems) process.stderr.write(`✖ ${problem}\n`);
  if (problems.length > 0) {
    process.stderr.write(`\n${problems.length} case(s) break the priority rule.\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`check-tags failed: ${error.message}\n`);
    process.exit(1);
  }
}
