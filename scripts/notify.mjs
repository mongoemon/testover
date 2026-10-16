// Reads Playwright's JSON report and posts a pass/fail summary to a webhook.
// Env: WEBHOOK_URL (Discord/Slack-compatible), RUN_URL (optional link to the CI run).
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REPORT_PATH = process.env.REPORT_PATH ?? 'test-results/results.json';
const webhookUrl = process.env.WEBHOOK_URL;
const runUrl = process.env.RUN_URL ?? '';

export function collectFailures(suites, failures = []) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      if (!spec.ok) failures.push(`${suite.title} › ${spec.title}`);
    }
    collectFailures(suite.suites, failures);
  }
  return failures;
}

export function buildMessage(report, link = runUrl) {
  const { expected, unexpected, flaky, skipped } = report.stats;
  const passed = unexpected === 0;
  const failures = collectFailures(report.suites);
  const lines = [
    `${passed ? '✅ PASS' : '❌ FAIL'} — weekend QA run`,
    `passed: ${expected} | failed: ${unexpected} | flaky: ${flaky} | skipped: ${skipped}`,
    ...failures.map((name) => `• ${name}`),
  ];
  if (link) lines.push(link);
  return lines.join('\n');
}

async function main() {
  let message;
  try {
    const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
    message = buildMessage(report);
  } catch (error) {
    message = `❌ FAIL — weekend QA run produced no readable report (${error.message})${
      runUrl ? `\n${runUrl}` : ''
    }`;
  }

  if (!webhookUrl) {
    process.stdout.write(`${message}\n(WEBHOOK_URL not set, skipping send)\n`);
    return;
  }

  // "content" is Discord's field; "text" is Slack's. Sending both works for either.
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message, text: message }),
  });
  if (!response.ok) {
    throw new Error(`Webhook responded ${response.status} ${response.statusText}`);
  }
  process.stdout.write('Notification sent.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`notify failed: ${error.message}\n`);
    process.exit(1);
  });
}
