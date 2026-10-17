// Golden Master of network traffic. Two angles:
//  1. what the server answers for a fixed list of routes (status, stable headers, small bodies);
//  2. what the browser requests while a user works (the app is client-side, so a new fetch/XHR
//     appearing here is a real behavior change, e.g. a tracker or a new backend call).
// Failure workflow is the same as golden-master.spec.ts: read the diff, then fix the app or run
// `npm run test:characterization -- --update-snapshots` and commit the reviewed change.
import { expect, test } from '@playwright/test';
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
];

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
    expect(log).not.toMatch(/\[(fetch|xhr|websocket|eventsource)\]/);
    expect(log).toMatchSnapshot('browser-traffic.txt');
  });

  test('browser traffic for a returning demo user', async ({ page }) => {
    const traffic = recordTraffic(page);
    await signIn(page, DEMO);
    expect(traffic.stop()).toMatchSnapshot('browser-traffic-login.txt');
  });
});
