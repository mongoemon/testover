// C1: everything the app writes to localStorage must satisfy the shared schemas
// (contracts/schemas.mjs). State is produced by driving the real UI, not hand-built.
import { expect, test, type Page } from '@playwright/test';
import {
  sessionSchema,
  storageKeys,
  tasksSchema,
  themeSchema,
  usersSchema,
} from '../../contracts/schemas.mjs';
import { ALICE, AuthPage, ProfilePage, TasksPage, DEMO, signIn } from '../support/pages';
import { dumpStorage, readJson } from '../support/storage';

/** Asserts every known key currently in storage satisfies its schema and the cross-key invariants. */
async function expectStorageHonoursContract(page: Page): Promise<void> {
  const dump = await dumpStorage(page);
  const keys = Object.keys(dump);

  const allowed = [storageKeys.users, storageKeys.session, storageKeys.theme];
  const unknown = keys.filter((key) => !allowed.includes(key) && !key.startsWith('tb.tasks.'));
  expect(unknown, 'app wrote a key outside the contract').toEqual([]);

  const users = usersSchema.parse(JSON.parse(dump[storageKeys.users]));
  if (dump[storageKeys.session] !== undefined) {
    const session = sessionSchema.parse(JSON.parse(dump[storageKeys.session]));
    expect(Object.keys(users), 'session must name an existing user').toContain(session);
  }
  if (dump[storageKeys.theme] !== undefined) themeSchema.parse(JSON.parse(dump[storageKeys.theme]));

  for (const key of keys.filter((k) => k.startsWith('tb.tasks.'))) {
    const tasks = tasksSchema.parse(JSON.parse(dump[key]));
    const ids = tasks.map((task) => task.id);
    expect(new Set(ids).size, `${key} has duplicate ids`).toBe(ids.length);
    expect(Object.keys(users), `${key} belongs to a user that does not exist`).toContain(key.slice('tb.tasks.'.length));
  }
}

test.describe('localStorage contract @contract @persistence', () => {
  test('the seeded first-load state honours the contract', async ({ page }) => {
    await page.goto('/');
    await expectStorageHonoursContract(page);
    expect(usersSchema.parse(await readJson(page, storageKeys.users))).toHaveProperty('demo');
  });

  test('registering writes a valid user record and session', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register(ALICE);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expectStorageHonoursContract(page);
    expect(usersSchema.parse(await readJson(page, storageKeys.users))[ALICE.username]).toEqual({
      password: ALICE.password,
      displayName: ALICE.displayName,
    });
    expect(await readJson(page, storageKeys.session)).toBe(ALICE.username);
  });

  test('adding, completing, editing and deleting tasks keeps the task list valid', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    await tasks.add('one', 'Low');
    await tasks.add('two', 'High');
    await tasks.add('three');
    await expectStorageHonoursContract(page);

    await tasks.complete('two');
    await tasks.rename('one', 'one renamed');
    await tasks.remove('three');
    await expectStorageHonoursContract(page);

    expect(tasksSchema.parse(await readJson(page, storageKeys.tasks('demo')))).toEqual([
      { id: 1, title: 'one renamed', priority: 'low', done: false },
      { id: 2, title: 'two', priority: 'high', done: true },
    ]);

    await tasks.clearCompleted();
    await expectStorageHonoursContract(page);
  });

  test('profile changes keep the user record valid', async ({ page }) => {
    await signIn(page, DEMO);
    const profile = new ProfilePage(page);
    await profile.open();
    await profile.saveDisplayName('Renamed Demo');
    await profile.changePassword(DEMO.password, 'another-pass1');
    await profile.darkMode.check();
    await expectStorageHonoursContract(page);
    expect(usersSchema.parse(await readJson(page, storageKeys.users)).demo).toEqual({
      password: 'another-pass1',
      displayName: 'Renamed Demo',
    });
    expect(themeSchema.parse(await readJson(page, storageKeys.theme))).toBe('dark');
  });

  test('deleting the account removes that user, their tasks and the session', async ({ page }) => {
    await signIn(page, DEMO);
    await new TasksPage(page).add('goodbye');
    const profile = new ProfilePage(page);
    await profile.open();
    await profile.deleteAccount(true);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expectStorageHonoursContract(page);
    expect(await readJson(page, storageKeys.session)).toBeUndefined();
    expect(await readJson(page, storageKeys.tasks('demo'))).toBeUndefined();
    expect(Object.keys(usersSchema.parse(await readJson(page, storageKeys.users)))).not.toContain('demo');
  });

  test('two users never share a task list', async ({ page }) => {
    await signIn(page, DEMO);
    await new TasksPage(page).add('demo task');
    await new AuthPage(page).logout();

    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register(ALICE);
    await new TasksPage(page).add('alice task');
    await expectStorageHonoursContract(page);

    const demo = tasksSchema.parse(await readJson(page, storageKeys.tasks('demo')));
    const alice = tasksSchema.parse(await readJson(page, storageKeys.tasks(ALICE.username)));
    expect(demo.map((task) => task.title)).toEqual(['demo task']);
    expect(alice.map((task) => task.title)).toEqual(['alice task']);
  });
});
