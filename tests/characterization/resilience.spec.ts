// Characterization of how the app boots from unexpected localStorage content, how the server
// numbers tasks, and how the router behaves. Records current behaviour, including surprising parts.
// Users and tasks live on the server now, so the only browser state that can be "unexpected" is the
// session token and the theme; malformed API input is characterized in unit/api.test.mjs.
import { expect, test } from '../support/evidence';
import { DEMO, TasksPage, signIn } from '../support/pages';
import { serverTasks } from '../support/server';
import { dumpStorage, readRaw, seedStorage } from '../support/storage';

const UNKNOWN_TOKEN = '3f1c0d0e-0000-4000-8000-000000000000';

test.describe('Boot from unexpected storage @characterization @resilience', () => {
  test('a first load stores nothing', async ({ page }) => {
    await seedStorage(page, {});
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(await dumpStorage(page)).toEqual({});
  });

  test('a session value that is not valid JSON counts as signed out', async ({ page }) => {
    await seedStorage(page, { 'tb.session': '{not json' });
    await page.goto('/#/tasks');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Please sign in to continue');
  });

  test('a non-string session counts as signed out', async ({ page }) => {
    await seedStorage(page, { 'tb.session': JSON.stringify({ username: 'demo' }) });
    await page.goto('/#/tasks');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Please sign in to continue');
  });

  test('a token the server does not know counts as signed out and is forgotten', async ({ page }) => {
    await seedStorage(page, { 'tb.session': JSON.stringify(UNKNOWN_TOKEN) });
    await page.goto('/#/tasks');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Please sign in to continue');
    expect(await readRaw(page, 'tb.session')).toBeNull();
  });

  test('a token that names a user (the old storage format) is not accepted', async ({ page }) => {
    await seedStorage(page, { 'tb.session': JSON.stringify('demo') });
    await page.goto('/#/tasks');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('keys written by the old localStorage version are ignored and left alone', async ({ page }) => {
    const legacy = {
      'tb.users': JSON.stringify({ demo: { password: 'old-secret', displayName: 'Old Demo' } }),
      'tb.tasks.demo': JSON.stringify([{ id: 1, title: 'from the old version', priority: 'low', done: false }]),
    };
    await seedStorage(page, legacy);
    await signIn(page, DEMO);
    await expect(page.locator('#greeting')).toHaveText('Hello, Demo User');
    await expect(page.locator('#task-empty')).toHaveText('No tasks yet. Add your first task above.');
    expect(await readRaw(page, 'tb.users')).toBe(legacy['tb.users']);
    expect(await readRaw(page, 'tb.tasks.demo')).toBe(legacy['tb.tasks.demo']);
  });

  test('theme: only "dark" turns dark mode on; anything else falls back to light', async ({ page }) => {
    for (const [value, expected] of [['"dark"', 'dark'], ['"purple"', 'light'], ['{oops', 'light']] as const) {
      await seedStorage(page, { 'tb.theme': value });
      await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
    }
  });
});

test.describe('Task ids @characterization @tasks', () => {
  test('ids keep counting up after a delete, not the count of tasks left', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    for (const title of ['one', 'two', 'three']) await tasks.add(title);
    await tasks.remove('one');
    await tasks.add('four');
    await tasks.expectTitles(['two', 'three', 'four']);
    expect((await serverTasks(page)).map((task) => task.id)).toEqual([2, 3, 4]);
  });

  test('GUARD: a deleted task id is never handed out again (the old localStorage version reused it)', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    await tasks.add('first');
    await tasks.add('second');
    await tasks.remove('second');
    await tasks.add('replacement');
    await tasks.expectTitles(['first', 'replacement']);
    expect((await serverTasks(page)).map((task) => task.id)).toEqual([1, 3]);
  });
});

test.describe('Routing rules @characterization @auth', () => {
  test('"/" goes to login when signed out', async ({ page }) => {
    await page.goto('/#/');
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('"/" goes to tasks when signed in', async ({ page }) => {
    await signIn(page, DEMO);
    await page.goto('/#/');
    await expect(page).toHaveURL(/#\/tasks$/);
  });

  test('login and register pages bounce a signed-in user to tasks', async ({ page }) => {
    await signIn(page, DEMO);
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
    await page.goto('/#/login');
    await expect(page).toHaveTitle('Task Board — Login');
    await page.goto('/#/register');
    await expect(page).toHaveTitle('Task Board — Register');
  });
});

test.describe('When the server cannot be reached @characterization @resilience', () => {
  test('a failing API shows a retry page instead of a blank screen', async ({ page }) => {
    await signIn(page, DEMO);
    await page.route('**/api/tasks', (route) => route.abort('connectionrefused'));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('Cannot reach the server. Check your connection and try again.');

    await page.unroute('**/api/tasks');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  });

  test('a failed change is reported and the list stays as it was', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    await tasks.add('keeps its place');
    await page.route('**/api/tasks/*', (route) =>
      route.fulfill({ status: 500, json: { error: { code: 'server_error', message: 'Something went wrong on the server' } } }),
    );
    await tasks.remove('keeps its place');
    await expect(tasks.alert).toHaveText('Something went wrong on the server');
    await tasks.expectTitles(['keeps its place']);
  });
});
