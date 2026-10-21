// Record & replay with Playwright's built-in HAR support (no extra tool).
//
//   record: HAR_RECORD=1 npx playwright test tests/har      (needs the real server; rewrites the .har)
//   replay: npx playwright test tests/har                   (the browser never reaches /api)
//
// What it is good for: running the FRONT END against frozen back-end answers, and noticing when the
// front end starts asking for something nobody recorded (replay aborts unknown requests).
// What it is not: a back-end test. The recording only proves what the server said on the day.
import { expect, test } from '../support/evidence';
import { DEMO, ProfilePage, TasksPage, signIn } from '../support/pages';

const HAR_PATH = 'tests/har/fixtures/demo-journey.har';
const recording = process.env.HAR_RECORD === '1';

test.describe('HAR replay of the demo journey @har', { tag: '@p2' }, () => {
  test.beforeEach(async ({ page, request }) => {
    if (recording) {
      // Prepare the server state the recording should see. These calls are not part of the HAR:
      // routeFromHAR only watches the browser.
      const login = await request.post('/api/sessions', { data: { username: DEMO.username, password: DEMO.password } });
      const headers = { Authorization: `Bearer ${(await login.json()).token}` };
      await request.post('/api/tasks', { headers, data: { title: 'Write release notes', priority: 'high' } });
      await request.post('/api/tasks', { headers, data: { title: 'Water the plants', priority: 'low' } });
    }
    await page.routeFromHAR(HAR_PATH, {
      url: '**/api/**',
      update: recording,
      updateContent: 'embed',
      notFound: 'abort', // replay: a request that is not in the recording fails loudly
    });
  });

  test('signs in and shows the recorded tasks without the API', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    await tasks.expectTitles(['Write release notes', 'Water the plants']);
    await expect(tasks.count).toHaveText('2 tasks left');
    await expect(page.locator('#greeting')).toHaveText('Hello, Demo User');

    await new ProfilePage(page).open();
    await expect(page.locator('#profile-username')).toHaveText('demo');
  });

  test('a request nobody recorded is aborted and shown as a server problem', async ({ page }) => {
    test.skip(recording, 'only meaningful when replaying');
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    await tasks.expectTitles(['Write release notes', 'Water the plants']);

    await tasks.add('A task the recording has never seen');

    // POST /api/tasks is not in the HAR, so the page cannot reach "the server" for it
    await expect(tasks.alert).toHaveText('Cannot reach the server. Check your connection and try again.');
    await tasks.expectTitles(['Write release notes', 'Water the plants']);
  });
});
