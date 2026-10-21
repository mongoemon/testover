import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPriorityProblems, countByPriority } from '../scripts/check-tags.mjs';

const spec = (title, tags = []) => ({ title, tags, tests: [] });
const report = (...suites) => ({ suites });

test('accepts a case with exactly one native priority tag', () => {
  const r = report({ title: 'a.spec.ts', specs: [spec('works', ['smoke', 'p0'])] });
  assert.deepEqual(findPriorityProblems(r), []);
});

test('reads a priority written in a describe title, as the characterization files do', () => {
  const r = report({
    title: 'a.spec.ts',
    suites: [{ title: 'Boundaries @characterization @p1', specs: [spec('ok')] }],
  });
  assert.deepEqual(findPriorityProblems(r), []);
});

test('reports a case with no priority', () => {
  const r = report({ title: 'a.spec.ts', specs: [spec('naked', ['auth'])] });
  const [problem] = findPriorityProblems(r);
  assert.match(problem, /a\.spec\.ts › naked/);
  assert.match(problem, /no priority/i);
});

test('reports a case with two priorities, which would run in two tiers', () => {
  const r = report({ title: 'a.spec.ts', specs: [spec('greedy', ['p0', 'p2'])] });
  const [problem] = findPriorityProblems(r);
  assert.match(problem, /greedy/);
  assert.match(problem, /more than one/i);
});

test('does not mistake a longer tag for a priority', () => {
  const r = report({ title: 'a.spec.ts', specs: [spec('x', ['p10', 'p1'])] });
  assert.deepEqual(findPriorityProblems(r), []);
});

test('counts cases per priority', () => {
  const r = report({
    title: 'a.spec.ts',
    specs: [spec('a', ['p0']), spec('b', ['p1']), spec('c', ['p1']), spec('d', [])],
  });
  assert.deepEqual(countByPriority(r), { p0: 1, p1: 2, p2: 0, none: 1 });
});
