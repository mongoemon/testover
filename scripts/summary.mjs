// Renders Playwright's JSON report as a markdown table on the GitHub Actions run page
// (the "Job summary"), so results are readable without downloading any artifact.
// Env: REPORT_PATH (default test-results/results.json), GITHUB_STEP_SUMMARY (set by Actions).
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REPORT_PATH = process.env.REPORT_PATH ?? 'test-results/results.json';
const MAX_LISTED = 30;

function walk(suites, visit, trail = []) {
  for (const suite of suites ?? []) {
    const path = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) visit(spec, path);
    walk(suite.suites, visit, path);
  }
}

function firstErrorLine(spec) {
  const message = spec.tests?.flatMap((t) => t.results ?? []).find((r) => r.error)?.error?.message ?? '';
  // Strip ANSI colour codes Playwright adds to messages.
  const clean = message.replace(/\u001b\[[0-9;]*m/g, '');
  return clean.split('\n').find((line) => line.trim()) ?? '';
}

function statusOf(spec) {
  const statuses = spec.tests?.map((t) => t.status) ?? [];
  if (statuses.includes('unexpected')) return 'failed';
  if (statuses.includes('flaky')) return 'flaky';
  return 'other';
}

export function buildSummary(report) {
  const { expected, unexpected, flaky, skipped } = report.stats;
  const failed = [];
  const flakyTests = [];
  walk(report.suites, (spec, path) => {
    const status = statusOf(spec);
    const entry = { name: [...path, spec.title].join(' › '), error: firstErrorLine(spec) };
    if (status === 'failed') failed.push(entry);
    else if (status === 'flaky') flakyTests.push(entry);
  });

  const lines = [
    `## ${unexpected === 0 ? '✅ Tests passed' : '❌ Tests failed'}`,
    '',
    '| Passed | Failed | Flaky | Skipped | Duration |',
    '| ---: | ---: | ---: | ---: | ---: |',
    `| ${expected} | ${unexpected} | ${flaky} | ${skipped} | ${((report.stats.duration ?? 0) / 1000).toFixed(1)}s |`,
  ];
  const section = (title, items) => {
    if (items.length === 0) return;
    lines.push('', `### ${title}`, '');
    for (const { name, error } of items.slice(0, MAX_LISTED)) {
      lines.push(`- **${name}**${error ? `\n  \`${error.replace(/`/g, "'").slice(0, 200)}\`` : ''}`);
    }
    if (items.length > MAX_LISTED) lines.push(`- …and ${items.length - MAX_LISTED} more`);
  };
  section('Failed', failed);
  section('Flaky (passed on retry)', flakyTests);
  return lines.join('\n');
}

async function main() {
  let markdown;
  try {
    markdown = buildSummary(JSON.parse(await readFile(REPORT_PATH, 'utf8')));
  } catch (error) {
    markdown = `## ❌ No readable test report\n\n\`${error.message}\``;
  }
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) await appendFile(target, `${markdown}\n`);
  else process.stdout.write(`${markdown}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`summary failed: ${error.message}\n`);
    process.exit(1);
  });
}
