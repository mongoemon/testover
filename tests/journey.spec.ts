import { test, expect } from '@playwright/test';
import { ALICE, AuthPage, DEMO, ProfilePage, TasksPage, signIn } from './support/pages';

test.describe('User journeys', { tag: '@journey' }, () => {
  test('a new user goes from sign-up to account deletion', async ({ page }) => {
    const auth = new AuthPage(page);
    const tasks = new TasksPage(page);
    const profile = new ProfilePage(page);
    const newPassword = 'n3wpassw0rd';

    await test.step('register a new account', async () => {
      await auth.gotoRegister();
      await auth.register(ALICE);
      await expect(auth.status).toHaveText('Welcome, Alice Tester!');
      await expect(tasks.emptyMessage).toBeVisible();
    });

    await test.step('plan the week', async () => {
      await tasks.add('Write report', 'High');
      await tasks.add('Book flights', 'Low');
      await tasks.add('Pay rent');
      await tasks.expectTitles(['Write report', 'Book flights', 'Pay rent']);
      await expect(tasks.count).toHaveText('3 tasks left');
    });

    await test.step('work through the list', async () => {
      await tasks.complete('Pay rent');
      await tasks.rename('Book flights', 'Book train tickets');
      await expect(tasks.count).toHaveText('2 tasks left');

      await tasks.filter('Active');
      await tasks.expectTitles(['Write report', 'Book train tickets']);
      await tasks.filter('Completed');
      await tasks.expectTitles(['Pay rent']);
      await tasks.filter('All');

      await tasks.search('train');
      await tasks.expectTitles(['Book train tickets']);
      await tasks.search('');
    });

    await test.step('tidy up completed work', async () => {
      await tasks.clearCompleted();
      await tasks.expectTitles(['Write report', 'Book train tickets']);
    });

    await test.step('sign out and back in: data is still there', async () => {
      await auth.logout();
      await expect(auth.status).toHaveText('You have been signed out');
      await auth.login(ALICE.username, ALICE.password);

      await tasks.expectTitles(['Write report', 'Book train tickets']);
      await expect(tasks.item('Write report').locator('.badge')).toHaveText('High');
    });

    await test.step('update the profile', async () => {
      await profile.open();
      await profile.saveDisplayName('Alice T.');
      await expect(page.locator('#greeting')).toHaveText('Hello, Alice T.');
    });

    await test.step('rotate the password', async () => {
      await profile.changePassword(ALICE.password, newPassword);
      await expect(profile.status).toHaveText('Password changed');

      await auth.logout();
      await auth.login(ALICE.username, ALICE.password);
      await expect(auth.alert).toHaveText('Username and password do not match');

      await auth.login(ALICE.username, newPassword);
      await expect(page.locator('#greeting')).toHaveText('Hello, Alice T.');
    });

    await test.step('delete the account', async () => {
      await profile.open();
      await profile.deleteAccount(true);
      await expect(page).toHaveURL(/#\/login$/);
      await expect(auth.status).toHaveText('Account deleted');

      await auth.login(ALICE.username, newPassword);
      await expect(auth.alert).toHaveText('Username and password do not match');
    });
  });

  test('a returning user finishes a quick daily routine', { tag: '@smoke' }, async ({ page }) => {
    const auth = new AuthPage(page);
    const tasks = new TasksPage(page);

    await signIn(page, DEMO);
    await tasks.add('Daily standup notes');
    await tasks.complete('Daily standup notes');
    await tasks.clearCompleted();
    await expect(tasks.emptyMessage).toBeVisible();

    await auth.logout();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('two users on the same browser never see each other’s tasks', { tag: '@security' }, async ({ page }) => {
    const auth = new AuthPage(page);
    const tasks = new TasksPage(page);

    await auth.gotoRegister();
    await auth.register(ALICE);
    await tasks.add('Alice private task');
    await auth.logout();

    await auth.login(DEMO.username, DEMO.password);
    await expect(tasks.emptyMessage).toBeVisible();
    await tasks.add('Demo task');
    await auth.logout();

    await auth.login(ALICE.username, ALICE.password);
    await tasks.expectTitles(['Alice private task']);
  });

  test('keeps working on a phone-sized screen without horizontal scrolling', { tag: '@responsive' }, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const tasks = new TasksPage(page);

    await signIn(page, DEMO);
    await tasks.add('A reasonably long task title that has to wrap on narrow screens', 'High');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });

  test.describe('resilience to bad stored data', { tag: '@resilience' }, () => {
    test('recovers from corrupted task storage and stays usable', async ({ page }) => {
      const tasks = new TasksPage(page);
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('tb.tasks.demo', '{not valid json'));

      await signIn(page, DEMO);

      await expect(tasks.emptyMessage).toHaveText('No tasks yet. Add your first task above.');
      await tasks.add('Recovered');
      await tasks.expectTitles(['Recovered']);
    });

    test('ignores malformed task entries but keeps the valid ones', async ({ page }) => {
      const tasks = new TasksPage(page);
      await page.goto('/');
      await page.evaluate(() =>
        localStorage.setItem(
          'tb.tasks.demo',
          JSON.stringify([
            { id: 1, title: 'Valid', priority: 'low', done: false },
            { id: 'x', title: 42 },
            null,
          ]),
        ),
      );

      await signIn(page, DEMO);

      await tasks.expectTitles(['Valid']);
    });
  });
});
