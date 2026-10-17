import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './support/evidence';
import { AuthPage, DEMO, ProfilePage, TasksPage, signIn } from './support/pages';

/** Conformance levels checked: WCAG 2.0 and 2.1, levels A and AA. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function violationsOf(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map((violation) => {
    const targets = violation.nodes.map((node) => node.target.join(' ')).join(' | ');
    return `${violation.id} [${violation.impact ?? 'n/a'}]: ${violation.help} -> ${targets}`;
  });
}

async function expectAccessible(page: Page): Promise<void> {
  expect(await violationsOf(page)).toEqual([]);
}

test.describe('Accessibility (axe, WCAG 2.1 A/AA)', { tag: '@a11y' }, () => {
  test.describe('signed out', () => {
    test('login page has no violations', async ({ page }) => {
      await new AuthPage(page).gotoLogin();
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

      await expectAccessible(page);
    });

    test('login page with an error message has no violations', async ({ page }) => {
      const auth = new AuthPage(page);
      await auth.gotoLogin();
      await auth.login(DEMO.username, 'wrong-password');
      await expect(auth.alert).toBeVisible();

      await expectAccessible(page);
    });

    test('register page has no violations', async ({ page }) => {
      await new AuthPage(page).gotoRegister();
      await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();

      await expectAccessible(page);
    });

    test('register page with validation errors has no violations', async ({ page }) => {
      const auth = new AuthPage(page);
      await auth.gotoRegister();
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(auth.alert).toBeVisible();

      await expectAccessible(page);
    });

    test('not-found page has no violations', async ({ page }) => {
      await page.goto('/#/does-not-exist');
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

      await expectAccessible(page);
    });
  });

  test.describe('signed in', () => {
    let tasks: TasksPage;

    test.beforeEach(async ({ page }) => {
      tasks = new TasksPage(page);
      await signIn(page, DEMO);
    });

    test('empty task board has no violations', async ({ page }) => {
      await expect(tasks.emptyMessage).toBeVisible();

      await expectAccessible(page);
    });

    test('task board with tasks in every state has no violations', async ({ page }) => {
      await tasks.add('Low priority task', 'Low');
      await tasks.add('Medium priority task');
      await tasks.add('High priority task', 'High');
      await tasks.complete('Medium priority task');
      await tasks.expectTitles(['Low priority task', 'Medium priority task', 'High priority task']);

      await expectAccessible(page);
    });

    test('task board while editing a task has no violations', async ({ page }) => {
      await tasks.add('Editable task');
      await tasks.startEdit('Editable task');
      await expect(page.getByLabel('Edit title', { exact: true })).toBeVisible();

      await expectAccessible(page);
    });

    test('task board with a validation error has no violations', async ({ page }) => {
      await tasks.add('');
      await expect(tasks.alert).toBeVisible();

      await expectAccessible(page);
    });

    test('task board with an active filter and no matches has no violations', async ({ page }) => {
      await tasks.add('Something');
      await tasks.filter('Completed');
      await expect(tasks.emptyMessage).toHaveText('No matching tasks');

      await expectAccessible(page);
    });

    test('profile page has no violations', async ({ page }) => {
      await new ProfilePage(page).open();

      await expectAccessible(page);
    });

    test('profile page with an error and with a success message has no violations', async ({ page }) => {
      const profile = new ProfilePage(page);
      await profile.open();

      await profile.saveDisplayName('   ');
      await expect(profile.alert).toBeVisible();
      await expectAccessible(page);

      await profile.saveDisplayName('Renamed');
      await expect(profile.status).toBeVisible();
      await expectAccessible(page);
    });

    test('dark theme keeps enough contrast on the task board and the profile', async ({ page }) => {
      const profile = new ProfilePage(page);
      await profile.open();
      await profile.darkMode.check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expectAccessible(page);

      await page.getByRole('link', { name: 'Tasks' }).click();
      await tasks.add('Dark mode task', 'High');
      await tasks.complete('Dark mode task');
      await expectAccessible(page);
    });
  });

  test('the scanner really detects a known violation (guards against a silent false pass)', async ({ page }) => {
    await new AuthPage(page).gotoLogin();
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
      document.body.append(img);
    });

    const violations = await violationsOf(page);

    expect(violations.some((message) => message.startsWith('image-alt'))).toBe(true);
  });
});
