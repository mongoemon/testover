// Golden Master of network traffic. Two angles:
//  1. what the server answers for a fixed list of routes (status, stable headers, small bodies);
//  2. what the browser requests while a user works (a new fetch/XHR appearing here is a real
//     behavior change, e.g. a tracker or a new backend call; every one must go to our own /api).
// Failure workflow is the same as golden-master.spec.ts: read the diff, then fix the app or run
// `npm run test:characterization -- --update-snapshots` and commit the reviewed change.
import { expect, test } from '../support/evidence';
import { ALICE, AuthPage, DEMO, TasksPage, signIn } from '../support/pages';
import { recordTraffic, snapshotResponses, type RouteProbe } from '../support/network';

const PROBES: readonly RouteProbe[] = [
  { method: 'GET', path: '/' },
  { method: 'HEAD', path: '/' },
  { method: 'GET', path: '/index.html' },
  { method: 'GET', path: '/index.htm' },
  { method: 'GET', path: '/docs' },
  { method: 'GET', path: '/docs/overview.html' },
  { method: 'GET', path: '/README.md' },
  { method: 'GET', path: '/docs/missing.html' },
  { method: 'GET', path: '/nope' },
  { method: 'POST', path: '/' },
  { method: 'DELETE', path: '/index.html' },
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/me' },
  { method: 'GET', path: '/api/tasks' },
  { method: 'GET', path: '/api/nope' },
  { method: 'PUT', path: '/api/tasks' },
  { method: 'POST', path: '/api/sessions' },
];

/** Every fetch/XHR line must be a call to our own /api (no trackers, no third-party hosts). */
const ownApiOnly = (log: string): boolean =>
  log
    .split('\n')
    .filter((line) => /\[(fetch|xhr)\]$/.test(line))
    .every((line) => /^[A-Z]+ \/api\//.test(line));

test.describe('Golden master of network traffic @characterization @golden', () => {
  test('server responses for known and unknown routes', async ({ request }) => {
    expect(await snapshotResponses(request, PROBES)).toMatchSnapshot('server-responses.json');
  });

  test('browser traffic while registering and managing tasks', async ({ page }) => {
    const traffic = recordTraffic(page);
    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register(ALICE);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    const tasks = new TasksPage(page);
    await tasks.add('Write release notes', 'High');
    await tasks.complete('Write release notes');
    await tasks.remove('Write release notes');
    const log = traffic.stop();
    expect(log).not.toMatch(/\[(websocket|eventsource)\]/);
    expect(ownApiOnly(log)).toBe(true);
    expect(log).toMatchSnapshot('browser-traffic.txt');
  });

  test('browser traffic for a returning demo user', async ({ page }) => {
    const traffic = recordTraffic(page);
    await signIn(page, DEMO);
    expect(traffic.stop()).toMatchSnapshot('browser-traffic-login.txt');
  });
});
