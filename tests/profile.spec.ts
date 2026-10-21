import { test, expect } from './support/evidence';
import { ALICE, AuthPage, DEMO, ProfilePage, TasksPage, signIn } from './support/pages';

test.describe('Profile', { tag: '@profile' }, () => {
  let profile: ProfilePage;
  let auth: AuthPage;

  test.beforeEach(async ({ page }) => {
    profile = new ProfilePage(page);
    auth = new AuthPage(page);
    await signIn(page, DEMO);
    await profile.open();
  });

  test('shows the signed-in username and marks the nav link as current', { tag: '@p1' }, async ({ page }) => {
    await expect(page.locator('#profile-username')).toHaveText('demo');
    await expect(page.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
  });

  test.describe('display name', () => {
    test('updates the display name in the header and keeps it after a reload', { tag: ['@persistence', '@p1'] }, async ({ page }) => {
      await profile.saveDisplayName('Demo Renamed');

      await expect(profile.status).toHaveText('Profile updated');
      await expect(page.locator('#greeting')).toHaveText('Hello, Demo Renamed');

      await page.reload();
      await expect(page.locator('#greeting')).toHaveText('Hello, Demo Renamed');
    });

    test('rejects a blank display name and leaves the header unchanged', { tag: ['@validation', '@p1'] }, async ({ page }) => {
      await profile.saveDisplayName('   ');

      await expect(profile.alert).toHaveText('Display name is required');
      await expect(page.locator('#greeting')).toHaveText('Hello, Demo User');
    });
  });

  test.describe('password', () => {
    const rejected = [
      { name: 'a wrong current password', args: ['nope-nope', 'newpass123'], message: 'Current password is incorrect' },
      { name: 'a new password under 8 characters', args: [DEMO.password, 'short'], message: 'New password must be at least 8 characters' },
      { name: 'a mismatched confirmation', args: [DEMO.password, 'newpass123', 'different1'], message: 'Passwords do not match' },
    ] as const;

    for (const { name, args, message } of rejected) {
      test(`rejects ${name}`, { tag: ['@validation', '@security', '@p1'] }, async () => {
        await profile.changePassword(...(args as [string, string, string?]));

        await expect(profile.alert).toHaveText(message);
      });
    }

    test('changes the password: old one stops working, new one works, form clears', { tag: ['@smoke', '@security', '@p0'] }, async ({ page }) => {
      await profile.changePassword(DEMO.password, 'brandnew99');

      await expect(profile.status).toHaveText('Password changed');
      await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('');

      await auth.logout();
      await auth.login(DEMO.username, DEMO.password);
      await expect(auth.alert).toHaveText('Username and password do not match');

      await auth.login(DEMO.username, 'brandnew99');
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    });
  });

  test.describe('appearance', () => {
    test('toggles dark mode and remembers it after a reload', { tag: ['@persistence', '@p2'] }, async ({ page }) => {
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', 'light');

      await profile.darkMode.check();
      await expect(html).toHaveAttribute('data-theme', 'dark');

      await page.reload();
      await expect(html).toHaveAttribute('data-theme', 'dark');
      await expect(profile.darkMode).toBeChecked();

      await profile.darkMode.uncheck();
      await expect(html).toHaveAttribute('data-theme', 'light');
    });
  });

  test.describe('delete account', () => {
    test('keeps the account when the confirmation is dismissed', { tag: ['@destructive', '@p2'] }, async ({ page }) => {
      const message = await profile.deleteAccount(false);

      expect(message).toBe('Delete your account and all tasks?');
      await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
      await expect(page.locator('#greeting')).toHaveText('Hello, Demo User');
    });

    test('removes the account and its tasks once confirmed', { tag: ['@destructive', '@p1'] }, async ({ page }) => {
      const tasks = new TasksPage(page);
      await page.getByRole('link', { name: 'Tasks' }).click();
      await tasks.add('Secret task');
      await profile.open();

      const message = await profile.deleteAccount(true);

      expect(message).toBe('Delete your account and all tasks?');
      await expect(page).toHaveURL(/#\/login$/);
      await expect(auth.status).toHaveText('Account deleted');

      await auth.login(DEMO.username, DEMO.password);
      await expect(auth.alert).toHaveText('Username and password do not match');

      // The username is free again and starts with a clean slate.
      await auth.gotoRegister();
      await auth.register({ ...ALICE, username: DEMO.username });
      await expect(tasks.emptyMessage).toHaveText('No tasks yet. Add your first task above.');
    });
  });
});
