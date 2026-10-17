// Characterization of how the app boots from unexpected localStorage content and
// how the router behaves. Records current behaviour, including surprising parts.
import { expect, test } from '../support/evidence';
import { DEMO, TasksPage } from '../support/pages';
import { dumpStorage, readJson, readRaw, seedStorage } from '../support/storage';

const users = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ demo: { password: DEMO.password, displayName: DEMO.displayName }, ...extra });

test.describe('Boot from unexpected storage @characterization @resilience', () => {
  test('corrupted tb.users is silently replaced by the seeded demo account', async ({ page }) => {
    await seedStorage(page, { 'tb.users': '{not json' });
    expect(await readJson(page, 'tb.users')).toEqual({ demo: { password: 'demo1234', displayName: 'Demo User' } });
  });

  test('an absent tb.users is seeded with the demo account on first load', async ({ page }) => {
    await seedStorage(page, {});
    expect(Object.keys((await readJson(page, 'tb.users')) as object)).toEqual(['demo']);
  });

  test('QUIRK: tb.users stored as an array is not replaced and locks everyone out', async ({ page }) => {
    await seedStorage(page, { 'tb.users': '[]' });
    expect(await readRaw(page, 'tb.users')).toBe('[]');
    await page.goto('/#/login');
    await page.getByLabel('Username', { exact: true }).fill('demo');
    await page.getByLabel('Password', { exact: true }).fill('demo1234');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('alert')).toHaveText('Username and password do not match');
  });

  test('a session that names an unknown user counts as signed out', async ({ page }) => {
    await seedStorage(page, { 'tb.users': users(), 'tb.session': JSON.stringify('ghost') });
    await page.goto('/#/tasks');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Please sign in to continue');
  });

  test('a non-string session counts as signed out', async ({ page }) => {
    await seedStorage(page, { 'tb.users': users(), 'tb.session': JSON.stringify({ username: 'demo' }) });
    await page.goto('/#/tasks');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Please sign in to continue');
  });

  test('only well-formed tasks are shown; the rest are ignored but not erased', async ({ page }) => {
    const mixed = [
      { id: 1, title: 'valid', priority: 'low', done: false },
      { id: '2', title: 'string id', priority: 'low', done: false },
      { id: 3, title: 'bad priority', priority: 'urgent', done: false },
      { id: 4, title: 'bad done', priority: 'low', done: 'no' },
      { id: 5.5, title: 'fractional id', priority: 'low', done: false },
      null,
      'text',
    ];
    await seedStorage(page, {
      'tb.users': users(),
      'tb.session': JSON.stringify('demo'),
      'tb.tasks.demo': JSON.stringify(mixed),
    });
    await page.goto('/#/tasks');
    const tasks = new TasksPage(page);
    await tasks.expectTitles(['valid']);
    expect(await readJson(page, 'tb.tasks.demo')).toEqual(mixed);
  });

  test('QUIRK: the first change after loading invalid tasks permanently drops them', async ({ page }) => {
    await seedStorage(page, {
      'tb.users': users(),
      'tb.session': JSON.stringify('demo'),
      'tb.tasks.demo': JSON.stringify([{ id: 1, title: 'ok', priority: 'low', done: false }, { id: 'x' }]),
    });
    await page.goto('/#/tasks');
    await new TasksPage(page).add('new one');
    expect(await readJson(page, 'tb.tasks.demo')).toEqual([
      { id: 1, title: 'ok', priority: 'low', done: false },
      { id: 2, title: 'new one', priority: 'medium', done: false },
    ]);
  });

  test('new ids continue after the highest stored id, not the count', async ({ page }) => {
    await seedStorage(page, {
      'tb.users': users(),
      'tb.session': JSON.stringify('demo'),
      'tb.tasks.demo': JSON.stringify([
        { id: 9, title: 'nine', priority: 'low', done: false },
        { id: 2, title: 'two', priority: 'low', done: true },
      ]),
    });
    await page.goto('/#/tasks');
    await new TasksPage(page).add('after');
    const stored = (await readJson(page, 'tb.tasks.demo')) as Array<{ id: number }>;
    expect(stored.map((task) => task.id)).toEqual([9, 2, 10]);
  });

  test('theme: only "dark" turns dark mode on; anything else falls back to light', async ({ page }) => {
    for (const [value, expected] of [['"dark"', 'dark'], ['"purple"', 'light'], ['{oops', 'light']] as const) {
      await seedStorage(page, { 'tb.theme': value });
      await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
    }
  });

  test('tasks are stored per user under their own key', async ({ page }) => {
    await seedStorage(page, {
      'tb.users': users({ other: { password: 'otherpass1', displayName: 'Other' } }),
      'tb.session': JSON.stringify('demo'),
      'tb.tasks.other': JSON.stringify([{ id: 1, title: 'not mine', priority: 'low', done: false }]),
    });
    await page.goto('/#/tasks');
    await expect(page.locator('#task-empty')).toHaveText('No tasks yet. Add your first task above.');
    expect(Object.keys(await dumpStorage(page)).sort()).toEqual(['tb.session', 'tb.tasks.other', 'tb.users']);
  });
});

test.describe('Routing rules @characterization @auth', () => {
  test('"/" goes to login when signed out', async ({ page }) => {
    await page.goto('/#/');
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('"/" goes to tasks when signed in', async ({ page }) => {
    await seedStorage(page, { 'tb.users': users(), 'tb.session': JSON.stringify('demo') });
    await page.goto('/#/');
    await expect(page).toHaveURL(/#\/tasks$/);
  });

  test('login and register pages bounce a signed-in user to tasks', async ({ page }) => {
    await seedStorage(page, { 'tb.users': users(), 'tb.session': JSON.stringify('demo') });
    for (const route of ['/#/login', '/#/register']) {
      await page.goto(route);
      await expect(page).toHaveURL(/#\/tasks$/);
    }
  });

  test('tasks and profile bounce an anonymous visitor to login with a notice', async ({ page }) => {
    for (const route of ['/#/tasks', '/#/profile']) {
      await page.goto(route);
      await expect(page).toHaveURL(/#\/login$/);
      await expect(page.getByRole('status')).toHaveText('Please sign in to continue');
    }
  });

  test('unknown routes show "Page not found" and hide the app header when signed out', async ({ page }) => {
    await page.goto('/#/nope');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveTitle('Task Board — Not found');
    await expect(page.locator('#app-header')).toBeHidden();
  });

  test('every page sets its own document title', async ({ page }) => {
    await seedStorage(page, { 'tb.users': users() });
    await page.goto('/#/login');
    await expect(page).toHaveTitle('Task Board — Login');
    await page.goto('/#/register');
    await expect(page).toHaveTitle('Task Board — Register');
  });
});
