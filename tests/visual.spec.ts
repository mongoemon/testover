// Visual snapshot tests: compare key screens pixel-by-pixel against committed baselines.
// Baselines must be generated on Linux (see scripts/visual.mjs), never on a developer's OS,
// because fonts and anti-aliasing differ and would fail CI.
import { expect, test, type Page } from '@playwright/test';
import { AuthPage, ProfilePage, TasksPage, signIn, DEMO } from './support/pages';

// The version badge changes every release; keep it out of the pixel comparison.
const MASK_VERSION_BADGE = (page: Page) => ({ mask: [page.locator('#version-badge')] });

const SEED_TASKS = [
  { title: 'Write release notes', priority: 'High' as const },
  { title: 'Review pull requests', priority: 'Medium' as const },
  { title: 'Water the plants', priority: 'Low' as const },
];

test.describe('Visual snapshots @visual', () => {
  test('login page', async ({ page }) => {
    await new AuthPage(page).gotoLogin();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    await expect(page).toHaveScreenshot('login.png', MASK_VERSION_BADGE(page));
  });

  test('register page with a validation error', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register({ username: 'ab', password: 'longenough1', displayName: 'Visual User' });
    await expect(auth.alert).toBeVisible();
    await expect(page).toHaveScreenshot('register-error.png', MASK_VERSION_BADGE(page));
  });

  test('task board with active and completed tasks', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    for (const { title, priority } of SEED_TASKS) await tasks.add(title, priority);
    await tasks.complete('Water the plants');
    await expect(tasks.item('Water the plants').getByRole('checkbox')).toBeChecked();
    await expect(page).toHaveScreenshot('tasks.png', MASK_VERSION_BADGE(page));
  });

  test('task board in dark theme', async ({ page }) => {
    await signIn(page, DEMO);
    const tasks = new TasksPage(page);
    for (const { title, priority } of SEED_TASKS) await tasks.add(title, priority);
    const profile = new ProfilePage(page);
    await profile.open();
    await profile.darkMode.check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('link', { name: 'Tasks' }).click();
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expect(page).toHaveScreenshot('tasks-dark.png', MASK_VERSION_BADGE(page));
  });

  test('profile page', async ({ page }) => {
    await signIn(page, DEMO);
    await new ProfilePage(page).open();
    await expect(page).toHaveScreenshot('profile.png', MASK_VERSION_BADGE(page));
  });
});
