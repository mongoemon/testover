// Checks that the real API still matches contracts/openapi.yaml, using Stoplight Prism as a proxy.
//
//   npm run contract:prism
//
// It starts the app on a spare port, puts Prism in front of it (proxy mode: every request and
// response is validated against the spec), runs the API contract tests through the proxy, then
// fails if Prism saw a RESPONSE that breaks the spec. Request violations are expected: the
// tests send bad input on purpose to see the error answers.
// Needs network access the first time (npx downloads Prism).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const PRISM_VERSION = '5.14.2';
const spec = fileURLToPath(new URL('../contracts/openapi.yaml', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));
const isWindows = process.platform === 'win32';

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function waitFor(url, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not come up at ${url}`);
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (isWindows) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

const appPort = await freePort();
const prismPort = await freePort();
const app = spawn(process.execPath, ['app/server.mjs'], { cwd: root, env: { ...process.env, PORT: String(appPort) }, stdio: 'ignore' });
const prismOutput = [];
const prism = spawn(
  isWindows ? 'npx.cmd' : 'npx',
  ['--yes', `@stoplight/prism-cli@${PRISM_VERSION}`, 'proxy', spec, `http://127.0.0.1:${appPort}`, '--port', String(prismPort)],
  { cwd: root, shell: isWindows },
);
prism.stdout.on('data', (chunk) => prismOutput.push(String(chunk)));
prism.stderr.on('data', (chunk) => prismOutput.push(String(chunk)));

let exitCode = 1;
try {
  await waitFor(`http://127.0.0.1:${appPort}/api/health`, 'the app');
  await waitFor(`http://127.0.0.1:${prismPort}/api/health`, 'Prism');

  const tests = spawn(isWindows ? 'npx.cmd' : 'npx', ['playwright', 'test', 'tests/contracts/api.spec.ts'], {
    cwd: root,
    shell: isWindows,
    stdio: 'inherit',
    env: { ...process.env, BASE_URL: `http://127.0.0.1:${prismPort}` },
  });
  const testsExit = await new Promise((resolve) => tests.on('close', resolve));

  // Prism prints colour codes; strip them before looking for violations.
  const log = prismOutput.join('').replace(/\x1b\[[0-9;]*m/g, '');
  const responseViolations = log.split('\n').filter((line) => /Violation: response/.test(line));
  if (responseViolations.length > 0) {
    process.stderr.write(`\nPrism found ${responseViolations.length} response(s) that break contracts/openapi.yaml:\n`);
    for (const line of new Set(responseViolations)) process.stderr.write(`  ${line.trim()}\n`);
  } else {
    process.stdout.write('\nPrism: no response broke contracts/openapi.yaml\n');
  }
  exitCode = testsExit === 0 && responseViolations.length === 0 ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error.message}\n${prismOutput.join('').slice(-1500)}\n`);
} finally {
  stop(prism);
  stop(app);
}
process.exit(exitCode);
