import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFailures, buildMessage } from '../scripts/notify.mjs';

const NOTIFY_PATH = fileURLToPath(new URL('../scripts/notify.mjs', import.meta.url));

const stats = (overrides = {}) => ({ expected: 5, unexpected: 0, flaky: 0, skipped: 0, ...overrides });

describe('collectFailures', () => {
  test('returns empty array for undefined or empty suites', () => {
    assert.deepEqual(collectFailures(undefined), []);
    assert.deepEqual(collectFailures([]), []);
  });

  test('lists only specs that are not ok, as "suite › spec"', () => {
    const suites = [
      {
        title: 'login.spec.ts',
        specs: [
          { title: 'logs in', ok: true },
          { title: 'rejects bad password', ok: false },
        ],
      },
    ];
    assert.deepEqual(collectFailures(suites), ['login.spec.ts › rejects bad password']);
  });

  test('walks nested suites and uses the innermost suite title', () => {
    const suites = [
      {
        title: 'outer',
        specs: [],
        suites: [{ title: 'inner', specs: [{ title: 'broken', ok: false }] }],
      },
    ];
    assert.deepEqual(collectFailures(suites), ['inner › broken']);
  });

  test('tolerates suites with missing specs/suites fields', () => {
    assert.deepEqual(collectFailures([{ title: 'bare' }]), []);
  });

  test('does not share state between calls', () => {
    const suites = [{ title: 's', specs: [{ title: 'x', ok: false }] }];
    collectFailures(suites);
    assert.deepEqual(collectFailures(suites), ['s › x']);
  });
});

describe('buildMessage', () => {
  test('reports PASS with counts when nothing failed', () => {
    const message = buildMessage({ stats: stats(), suites: [] }, '');
    assert.equal(
      message,
      '✅ PASS — weekend QA run\npassed: 5 | failed: 0 | flaky: 0 | skipped: 0',
    );
  });

  test('reports FAIL and lists failing specs when unexpected > 0', () => {
    const report = {
      stats: stats({ expected: 3, unexpected: 1, flaky: 1, skipped: 2 }),
      suites: [{ title: 'tasks.spec.ts', specs: [{ title: 'adds task', ok: false }] }],
    };
    assert.equal(
      buildMessage(report, ''),
      [
        '❌ FAIL — weekend QA run',
        'passed: 3 | failed: 1 | flaky: 1 | skipped: 2',
        '• tasks.spec.ts › adds task',
      ].join('\n'),
    );
  });

  test('appends the run URL as the last line when provided', () => {
    const message = buildMessage({ stats: stats(), suites: [] }, 'https://ci.example/run/1');
    assert.equal(message.split('\n').at(-1), 'https://ci.example/run/1');
  });

  test('omits the URL line when link is empty', () => {
    const message = buildMessage({ stats: stats(), suites: [] }, '');
    assert.equal(message.split('\n').length, 2);
  });

  test('flaky tests alone do not make the run FAIL', () => {
    const message = buildMessage({ stats: stats({ flaky: 2 }), suites: [] }, '');
    assert.match(message, /^✅ PASS/);
  });

  test('throws when report has no stats', () => {
    assert.throws(() => buildMessage({ suites: [] }, ''), TypeError);
  });
});

describe('notify CLI (contract with the webhook)', () => {
  let workDir;
  let webhook;
  let received;
  let respondWith;

  before(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'notify-test-'));
    webhook = createServer((request, response) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        received.push({
          method: request.method,
          contentType: request.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf8'),
        });
        response.writeHead(respondWith.status);
        response.end();
      });
    });
    await new Promise((resolve) => webhook.listen(0, '127.0.0.1', resolve));
  });

  after(async () => {
    await new Promise((resolve) => webhook.close(resolve));
    await rm(workDir, { recursive: true, force: true });
  });

  const webhookUrl = () => `http://127.0.0.1:${webhook.address().port}/hook`;

  const run = (env) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [NOTIFY_PATH], {
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => (stdout += data));
      child.stderr.on('data', (data) => (stderr += data));
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    });

  const writeReport = async (name, report) => {
    const path = join(workDir, name);
    await writeFile(path, typeof report === 'string' ? report : JSON.stringify(report));
    return path;
  };

  test('posts JSON with both "content" (Discord) and "text" (Slack)', async () => {
    received = [];
    respondWith = { status: 204 };
    const reportPath = await writeReport('ok.json', { stats: stats(), suites: [] });

    const result = await run({ REPORT_PATH: reportPath, WEBHOOK_URL: webhookUrl(), RUN_URL: 'https://ci/run' });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Notification sent\./);
    assert.equal(received.length, 1);
    assert.equal(received[0].method, 'POST');
    assert.equal(received[0].contentType, 'application/json');
    const payload = JSON.parse(received[0].body);
    assert.deepEqual(Object.keys(payload).sort(), ['content', 'text']);
    assert.equal(payload.content, payload.text);
    assert.match(payload.content, /^✅ PASS/);
    assert.match(payload.content, /https:\/\/ci\/run$/);
  });

  test('sends a FAIL message when the report file is missing', async () => {
    received = [];
    respondWith = { status: 204 };

    const result = await run({ REPORT_PATH: join(workDir, 'nope.json'), WEBHOOK_URL: webhookUrl() });

    assert.equal(result.code, 0);
    const payload = JSON.parse(received[0].body);
    assert.match(payload.content, /^❌ FAIL — weekend QA run produced no readable report/);
  });

  test('sends a FAIL message when the report is not valid JSON', async () => {
    received = [];
    respondWith = { status: 204 };
    const reportPath = await writeReport('broken.json', '{not json');

    const result = await run({ REPORT_PATH: reportPath, WEBHOOK_URL: webhookUrl() });

    assert.equal(result.code, 0);
    assert.match(JSON.parse(received[0].body).content, /^❌ FAIL/);
  });

  test('prints the message and skips sending when WEBHOOK_URL is unset', async () => {
    received = [];
    const reportPath = await writeReport('skip.json', { stats: stats(), suites: [] });

    const result = await run({ REPORT_PATH: reportPath });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /✅ PASS/);
    assert.match(result.stdout, /WEBHOOK_URL not set, skipping send/);
    assert.equal(received.length, 0);
  });

  test('exits 1 with a message when the webhook responds non-2xx', async () => {
    received = [];
    respondWith = { status: 500 };
    const reportPath = await writeReport('err.json', { stats: stats(), suites: [] });

    const result = await run({ REPORT_PATH: reportPath, WEBHOOK_URL: webhookUrl() });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /notify failed: Webhook responded 500/);
  });
});
