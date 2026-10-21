// C1: everything the app writes to localStorage must satisfy the shared schemas
// (contracts/schemas.mjs). State is produced by driving the real UI, not hand-built.
// Users and tasks are no longer stored in the browser; that rule is part of the contract.
import type { Page } from '@playwright/test';
import { expect, test } from '../support/evidence';
import { sessionTokenSchema, storageKeys, themeSchema } from '../../contracts/schemas.mjs';
import { ALICE, AuthPage, DEMO, ProfilePage, TasksPage, signIn } from '../support/pages';
import { dumpStorage, readJson } from '../support/storage';

/** Asserts storage holds only known keys and each one satisfies its schema. */
async function expectStorageHonoursContract(page: Page): Promise<void> {
  const dump = await dumpStorage(page);
  const allowed = [storageKeys.session, storageKeys.theme];
  expect(Object.keys(dump).filter((key) => !allowed.includes(key)), 'app wrote a key outside the contract').toEqual([]);
  if (dump[storageKeys.session] !== undefined) sessionTokenSchema.parse(JSON.parse(dump[storageKeys.session]));
  if (dump[storageKeys.theme] !== undefined) themeSchema.parse(JSON.parse(dump[storageKeys.theme]));
}

test.describe('localStorage contract @contract @persistence', { tag: '@p1' }, () => {
  test('a first load writes nothing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    expect(await dumpStorage(page)).toEqual({});
  });

  test('registering stores a session token and nothing about the user', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register(ALICE);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expectStorageHonoursContract(page);
    expect(sessionTokenSchema.parse(await readJson(page, storageKeys.session))).toBeTruthy();
    expect(JSON.stringify(await dumpStorage(page))).not.toContain(ALICE.password);
  });

  test('signing in stores a session token', async ({ page }) => {
    await signIn(page, DEMO);
    await expectStorageHonoursContract(page);
    expect(Object.keys(await dumpStorage(page))).toEqual([storageKeys.session]);
  });

  test('working with tasks adds nothing to storage', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    await tasks.add('one', 'Low');
    await tasks.add('two', 'High');
    await tasks.complete('two');
    await tasks.rename('one', 'one renamed');
    await tasks.remove('one renamed');
    await tasks.clearCompleted();
    await expectStorageHonoursContract(page);
    expect(Object.keys(await dumpStorage(page))).toEqual([storageKeys.session]);
  });

  test('the dark mode switch stores only the theme', async ({ page }) => {
    await signIn(page, DEMO);
    const profile = new ProfilePage(page);
    await profile.open();
    await profile.darkMode.check();
    await expectStorageHonoursContract(page);
    expect(themeSchema.parse(await readJson(page, storageKeys.theme))).toBe('dark');
  });

  test('logging out and deleting the account both remove the session', async ({ page }) => {
    await signIn(page, DEMO);
    await new AuthPage(page).logout();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(await readJson(page, storageKeys.session)).toBeUndefined();

    await signIn(page, DEMO);
    const profile = new ProfilePage(page);
    await profile.open();
    await profile.deleteAccount(true);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(await readJson(page, storageKeys.session)).toBeUndefined();
  });
});
