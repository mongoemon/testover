import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildMessage } from '../scripts/notify.mjs';
import { playwrightReportSchema, webhookPayloadSchema } from '../contracts/schemas.mjs';

const NOTIFY_PATH = fileURLToPath(new URL('../scripts/notify.mjs', import.meta.url));
const fixturePath = (name) => fileURLToPath(new URL(`../tests/fixtures/reports/${name}.json`, import.meta.url));
const REAL_REPORT = fileURLToPath(new URL('../test-results/results.json', import.meta.url));
const loadFixture = async (name) => JSON.parse(await readFile(fixturePath(name), 'utf8'));

describe('C2: Playwright report -> notify.mjs', () => {
  for (const name of ['pass', 'fail-nested', 'empty']) {
    test(`fixture "${name}" satisfies the report contract`, async () => {
      assert.equal(playwrightReportSchema.safeParse(await loadFixture(name)).success, true);
    });
  }

  // Skipped locally when no run has happened yet. CI sets REQUIRE_REAL_REPORT=1 after
  // Playwright ran, so a missing or malformed real report fails the build instead of skipping.
  const requireReal = Boolean(process.env.REQUIRE_REAL_REPORT);
  test('the report from the last real Playwright run satisfies the contract', { skip: !requireReal && !existsSync(REAL_REPORT) }, async () => {
    const report = JSON.parse(await readFile(REAL_REPORT, 'utf8'));
    const result = playwrightReportSchema.safeParse(report);
    assert.equal(result.success, true, result.success ? '' : result.error.message);
  });

  test('rejects reports notify.mjs could not summarise', () => {
    const missingStats = { suites: [] };
    const stringCounts = { stats: { expected: '1', unexpected: 0, flaky: 0, skipped: 0 }, suites: [] };
    const untitledSuite = { stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }, suites: [{ specs: [] }] };
    for (const bad of [missingStats, stringCounts, untitledSuite]) {
      assert.equal(playwrightReportSchema.safeParse(bad).success, false);
    }
  });

  test('characterizes the exact message built from each fixture', async () => {
    assert.equal(
      buildMessage(await loadFixture('pass'), ''),
      '✅ PASS — weekend QA run\npassed: 3 | failed: 0 | flaky: 1 | skipped: 2',
    );
    assert.equal(
      buildMessage(await loadFixture('fail-nested'), ''),
      [
        '❌ FAIL — weekend QA run',
        'passed: 1 | failed: 2 | flaky: 0 | skipped: 0',
        '• filtering › filters active',
        '• login.spec.ts › logs in',
      ].join('\n'),
    );
  });

  test('characterizes: a run with zero tests is reported as PASS', async () => {
    assert.match(buildMessage(await loadFixture('empty'), ''), /^✅ PASS/);
  });
});

describe('C3: notify.mjs -> webhook body', () => {
  let server;
  let bodies;
  let requests = [];

  before(async () => {
    server = createServer((request, response) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        requests.push({ method: request.method, url: request.url, contentType: request.headers['content-type'], raw });
        bodies.push(JSON.parse(raw));
        response.writeHead(204);
        response.end();
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  const send = (reportName, extraEnv = {}) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [NOTIFY_PATH], {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          ...extraEnv,
          REPORT_PATH: fixturePath(reportName),
          WEBHOOK_URL: `http://127.0.0.1:${server.address().port}/hook`,
        },
      });
      child.on('close', resolve);
    });

  for (const name of ['pass', 'fail-nested', 'empty']) {
    test(`body sent for "${name}" satisfies the webhook contract`, async () => {
      bodies = [];
      assert.equal(await send(name), 0);
      assert.equal(bodies.length, 1);
      const result = webhookPayloadSchema.safeParse(bodies[0]);
      assert.equal(result.success, true, result.success ? '' : result.error.message);
    });
  }

  // Characterization: pins the whole request as it goes over the wire today, not just its shape.
  // If one fails, decide whether the new wording/format is intended, then update the expectation.
  const RUN_URL = 'https://ci.example/run/42';
  const wirePayloads = {
    pass: ['✅ PASS — weekend QA run', 'passed: 3 | failed: 0 | flaky: 1 | skipped: 2', RUN_URL].join('\n'),
    'fail-nested': [
      '❌ FAIL — weekend QA run',
      'passed: 1 | failed: 2 | flaky: 0 | skipped: 0',
      '• filtering › filters active',
      '• login.spec.ts › logs in',
      RUN_URL,
    ].join('\n'),
    empty: ['✅ PASS — weekend QA run', 'passed: 0 | failed: 0 | flaky: 0 | skipped: 0', RUN_URL].join('\n'),
  };

  for (const [name, message] of Object.entries(wirePayloads)) {
    test(`characterizes: the exact request sent for "${name}"`, async () => {
      bodies = [];
      requests = [];
      assert.equal(await send(name, { RUN_URL }), 0);
      assert.equal(requests.length, 1);
      assert.deepEqual(
        { method: requests[0].method, url: requests[0].url, contentType: requests[0].contentType },
        { method: 'POST', url: '/hook', contentType: 'application/json' },
      );
      // The raw string pins key order and absence of extra whitespace as well as the values.
      assert.equal(requests[0].raw, JSON.stringify({ content: message, text: message }));
    });
  }

  test('contract rejects a body Discord or Slack would not accept', () => {
    assert.equal(webhookPayloadSchema.safeParse({ content: 'x' }).success, false);
    assert.equal(webhookPayloadSchema.safeParse({ content: 'x', text: 'y' }).success, false);
    assert.equal(webhookPayloadSchema.safeParse({ content: 'x', text: 'x', extra: 1 }).success, false);
    assert.equal(webhookPayloadSchema.safeParse({ content: '', text: '' }).success, false);
  });
});
