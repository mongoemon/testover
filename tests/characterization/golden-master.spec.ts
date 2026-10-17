// Golden Master characterization: after each scenario, the ENTIRE localStorage is compared
// with a committed text snapshot. Unlike the assertions in validation/resilience specs, this
// catches fields nobody thought to assert (new keys, changed ids, leaked values).
// If one fails, read the diff and decide: unintended -> fix the app; intended -> review the
// change, then run `npm run test:characterization -- --update-snapshots` and commit the diff.
import { expect, test } from '@playwright/test';
import { ALICE, AuthPage, DEMO, ProfilePage, TasksPage, signIn } from '../support/pages';
import { maskVolatile, snapshotStorage } from '../support/golden';

test.describe('Golden master of persisted state @characterization @golden', () => {
  test('first load seeds only the demo account', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    expect(await snapshotStorage(page)).toMatchSnapshot('first-load.json');
  });

  test('registering an account persists user and session', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register(ALICE);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    expect(await snapshotStorage(page)).toMatchSnapshot('after-register.json');
  });

  test('task lifecycle: add, complete, rename, delete', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    await tasks.add('Write release notes', 'High');
    await tasks.add('Review pull requests', 'Medium');
    await tasks.add('Water the plants', 'Low');
    await tasks.complete('Review pull requests');
    await tasks.rename('Water the plants', 'Water the ferns');
    await tasks.remove('Write release notes');
    await tasks.expectTitles(['Review pull requests', 'Water the ferns']);
    expect(await snapshotStorage(page)).toMatchSnapshot('task-lifecycle.json');
  });

  test('profile changes: display name, password and dark mode', async ({ page }) => {
    await signIn(page, DEMO);
    const profile = new ProfilePage(page);
    await profile.open();
    await profile.saveDisplayName('Demo Renamed');
    await expect(profile.status).toHaveText('Profile updated');
    await profile.changePassword(DEMO.password, 'brand-new-pw');
    await expect(profile.status).toHaveText('Password changed');
    await profile.darkMode.check();
    expect(await snapshotStorage(page)).toMatchSnapshot('profile-changes.json');
  });

  test('task board text for a mixed list', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    await tasks.add('Write release notes', 'High');
    await tasks.add('Water the plants', 'Low');
    await tasks.complete('Water the plants');
    await expect(tasks.count).not.toBeEmpty();
    const text = await page.getByRole('main').innerText();
    expect(`${maskVolatile(text)}\n`).toMatchSnapshot('task-board-text.txt');
  });
});
