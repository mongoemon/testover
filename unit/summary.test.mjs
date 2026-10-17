import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary } from '../scripts/summary.mjs';

const stats = { expected: 3, unexpected: 1, flaky: 1, skipped: 0, duration: 4200 };

const report = {
  stats,
  suites: [
    {
      title: 'login.spec.ts',
      specs: [
        {
          title: 'rejects bad password',
          tests: [{ status: 'unexpected', results: [{ error: { message: '\u001b[31mExpected: 1\u001b[39m\nReceived: 2' } }] }],
        },
        { title: 'is flaky', tests: [{ status: 'flaky', results: [] }] },
        { title: 'works', tests: [{ status: 'expected', results: [] }] },
      ],
    },
  ],
};

test('shows counts and lists failed and flaky tests', () => {
  const md = buildSummary(report);
  assert.match(md, /❌ Tests failed/);
  assert.match(md, /\| 3 \| 1 \| 1 \| 0 \| 4\.2s \|/);
  assert.match(md, /login\.spec\.ts › rejects bad password/);
  assert.match(md, /Expected: 1/);
  assert.doesNotMatch(md, /\u001b/);
  assert.match(md, /Flaky[\s\S]*is flaky/);
});

test('reports success when nothing failed', () => {
  const md = buildSummary({ stats: { ...stats, unexpected: 0, flaky: 0 }, suites: [] });
  assert.match(md, /✅ Tests passed/);
  assert.doesNotMatch(md, /### Failed/);
});
