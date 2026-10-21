// Characterization tests: pin down what the app does TODAY at its input boundaries.
// They record reality, not intent. If one fails, decide deliberately whether the
// behaviour change is wanted, then update the expectation.
import { expect, test } from '../support/evidence';
import { AuthPage, ProfilePage, TasksPage, signIn, DEMO, type Account } from '../support/pages';
import { loginStatus, serverTasks } from '../support/server';

test.describe('Registration boundaries @characterization @validation', { tag: '@p1' }, () => {
  const account = (username: string, password = 'longenough1'): Account => ({
    username,
    password,
    displayName: 'Boundary User',
  });

  const usernameRule = 'Username must be 3-20 characters (letters, numbers, underscore)';

  const cases: ReadonlyArray<{ name: string; username: string; accepted: boolean }> = [
    { name: '2 chars is too short', username: 'ab', accepted: false },
    { name: '3 chars is the minimum', username: 'abc', accepted: true },
    { name: '20 chars is the maximum', username: 'a'.repeat(20), accepted: true },
    { name: '21 chars is too long', username: 'a'.repeat(21), accepted: false },
    { name: 'hyphen is rejected', username: 'a-b-c', accepted: false },
    { name: 'space inside is rejected', username: 'a b c', accepted: false },
    { name: 'underscore and digits are allowed', username: 'a_1', accepted: true },
  ];

  for (const { name, username, accepted } of cases) {
    test(`username: ${name}`, async ({ page }) => {
      const auth = new AuthPage(page);
      await auth.gotoRegister();
      await auth.register(account(username));
      if (accepted) {
        await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
      } else {
        await expect(auth.alert).toContainText(usernameRule);
      }
    });
  }

  test('username is lower-cased and trimmed before it is stored', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register(account('  MiXeD_Case  '));
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await new ProfilePage(page).open();
    await expect(page.locator('#profile-username')).toHaveText('mixed_case');
  });

  test('password: 7 chars is rejected, 8 chars is accepted', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register(account('pwcheck', '1234567'));
    await expect(auth.alert).toContainText('Password must be at least 8 characters');

    await page.getByLabel('Password', { exact: true }).fill('12345678');
    await page.getByLabel('Confirm password', { exact: true }).fill('12345678');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  });

  test('reports every problem at once, in a fixed order', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register({ username: 'x', password: 'short', displayName: '   ' }, 'different');
    await expect(auth.alert.getByRole('listitem')).toHaveText([
      usernameRule,
      'Display name is required',
      'Password must be at least 8 characters',
      'Passwords do not match',
    ]);
  });

  test('an already-taken username is only reported once the other fields are valid', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register(account('demo', 'short'));
    await expect(auth.alert).toHaveText('Password must be at least 8 characters');

    await page.getByLabel('Password', { exact: true }).fill('longenough1');
    await page.getByLabel('Confirm password', { exact: true }).fill('longenough1');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(auth.alert).toHaveText('Username is already taken');
  });

  test('GUARD: reserved-looking names such as "__proto__" and "constructor" register safely as ordinary users', async ({ page, request }) => {
    const auth = new AuthPage(page);
    for (const username of ['constructor', '__proto__']) {
      await auth.gotoRegister();
      await auth.register(account(username));
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
      await auth.logout();
    }
    for (const username of ['constructor', '__proto__']) {
      expect(await loginStatus(request, username, 'longenough1')).toBe(201);
    }
  });
});

test.describe('Login boundaries @characterization @auth', { tag: '@p1' }, () => {
  test('username is case-insensitive and trimmed, the password is not', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await auth.login('  DEMO ', DEMO.password.toUpperCase());
    await expect(auth.alert).toHaveText('Username and password do not match');

    await auth.login('  DEMO ', DEMO.password);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  });

  test('checks the username is present before the password', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(auth.alert).toHaveText('Username is required');
    await page.getByLabel('Username', { exact: true }).fill('demo');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(auth.alert).toHaveText('Password is required');
  });

  test('unknown user and wrong password give the same message', async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await auth.login('nobody', 'whatever1');
    const unknownUser = await auth.alert.textContent();
    await auth.login('demo', 'whatever1');
    await expect(auth.alert).toHaveText(unknownUser ?? '');
  });
});

test.describe('Task title boundaries @characterization @tasks @validation', { tag: '@p1' }, () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, DEMO);
  });

  test('80 chars is accepted, 81 is rejected with the limit in the message', async ({ page }) => {
    const tasks = new TasksPage(page);
    await tasks.add('a'.repeat(80));
    await expect(tasks.list.getByRole('listitem')).toHaveCount(1);

    await tasks.add('b'.repeat(81));
    await expect(tasks.alert).toHaveText('Task title must be 80 characters or fewer');
    await expect(tasks.list.getByRole('listitem')).toHaveCount(1);
  });

  test('whitespace-only counts as empty and surrounding spaces are trimmed', async ({ page }) => {
    const tasks = new TasksPage(page);
    await tasks.add('    ');
    await expect(tasks.alert).toHaveText('Task title is required');

    await tasks.add('   padded   ');
    await tasks.expectTitles(['padded']);
    expect(await serverTasks(page)).toEqual([{ id: 1, title: 'padded', priority: 'medium', done: false }]);
  });

  test('a new task defaults to medium priority and resets the form after adding', async ({ page }) => {
    const tasks = new TasksPage(page);
    await tasks.add('urgent thing', 'High');
    await tasks.add('normal thing');
    expect((await serverTasks(page)).map((task) => task.priority)).toEqual(['high', 'medium']);
    await expect(page.getByLabel('Priority', { exact: true })).toHaveValue('medium');
  });

  test('the title limit applies to editing too', async ({ page }) => {
    const tasks = new TasksPage(page);
    await tasks.add('short');
    await tasks.rename('short', 'c'.repeat(81));
    await expect(tasks.alert).toHaveText('Task title must be 80 characters or fewer');
    await expect(page.getByLabel('Edit title', { exact: true })).toBeVisible();
  });
});

test.describe('Profile boundaries @characterization @profile', { tag: '@p1' }, () => {
  test('checks current password, then length, then confirmation', async ({ page }) => {
    await signIn(page, DEMO);
    const profile = new ProfilePage(page);
    await profile.open();

    await profile.changePassword('wrong-one', 'abc', 'xyz');
    await expect(profile.alert).toHaveText('Current password is incorrect');

    await profile.changePassword(DEMO.password, 'abc', 'xyz');
    await expect(profile.alert).toHaveText('New password must be at least 8 characters');

    await profile.changePassword(DEMO.password, 'longenough1', 'different1');
    await expect(profile.alert).toHaveText('Passwords do not match');
  });

  test('GUARD: after a password change only the new password signs in', async ({ page, request }) => {
    await signIn(page, DEMO);
    const profile = new ProfilePage(page);
    await profile.open();
    await profile.changePassword(DEMO.password, 'brand-new-pw');
    await expect(profile.status).toHaveText('Password changed');
    expect(await loginStatus(request, DEMO.username, 'brand-new-pw')).toBe(201);
    expect(await loginStatus(request, DEMO.username, DEMO.password)).toBe(401);
  });
});
