import { test, expect } from './support/evidence';
import { ALICE, DEMO, AuthPage, signIn } from './support/pages';

test.describe('Registration', { tag: '@auth' }, () => {
  let auth: AuthPage;

  test.beforeEach(async ({ page }) => {
    auth = new AuthPage(page);
    await auth.gotoRegister();
  });

  test('creates an account and lands on an empty task board', { tag: '@smoke' }, async ({ page }) => {
    await auth.register(ALICE);

    await expect(page).toHaveURL(/#\/tasks$/);
    await expect(auth.status).toHaveText('Welcome, Alice Tester!');
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expect(page.locator('#greeting')).toHaveText('Hello, Alice Tester');
    await expect(page.locator('#task-empty')).toHaveText('No tasks yet. Add your first task above.');
  });

  const invalidRegistrations = [
    { name: 'username shorter than 3 characters', account: { ...ALICE, username: 'ab' }, message: 'Username must be 3-20 characters' },
    { name: 'username longer than 20 characters', account: { ...ALICE, username: 'a'.repeat(21) }, message: 'Username must be 3-20 characters' },
    { name: 'username with spaces or symbols', account: { ...ALICE, username: 'bad name!' }, message: 'Username must be 3-20 characters' },
    { name: 'blank display name', account: { ...ALICE, displayName: '   ' }, message: 'Display name is required' },
    { name: 'password shorter than 8 characters', account: { ...ALICE, password: 'short' }, message: 'Password must be at least 8 characters' },
  ];

  for (const { name, account, message } of invalidRegistrations) {
    test(`rejects ${name}`, { tag: '@validation' }, async ({ page }) => {
      await auth.register(account);

      await expect(auth.alert).toContainText(message);
      await expect(page).toHaveURL(/#\/register$/);
    });
  }

  test('rejects mismatched password confirmation', { tag: '@validation' }, async ({ page }) => {
    await auth.register(ALICE, 'something-else');

    await expect(auth.alert).toHaveText('Passwords do not match');
    await expect(page).toHaveURL(/#\/register$/);
  });

  test('lists every problem at once when the form is empty', { tag: '@validation' }, async ({ page }) => {
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(auth.alert.getByRole('listitem')).toHaveText([
      'Username must be 3-20 characters (letters, numbers, underscore)',
      'Display name is required',
      'Password must be at least 8 characters',
    ]);
  });

  for (const taken of ['demo', 'DEMO']) {
    test(`rejects the already-registered username "${taken}"`, { tag: '@validation' }, async () => {
      await auth.register({ ...ALICE, username: taken });

      await expect(auth.alert).toHaveText('Username is already taken');
    });
  }

  test('treats usernames as case-insensitive when signing in later', async ({ page }) => {
    await auth.register({ ...ALICE, username: 'Alice_QA' });
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await auth.logout();

    await auth.login('ALICE_qa', ALICE.password);
    await expect(page.locator('#greeting')).toHaveText('Hello, Alice Tester');
  });

  test('links to the login page and back', async ({ page }) => {
    await page.getByRole('link', { name: 'Back to login' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
  });
});

test.describe('Login and logout', { tag: '@auth' }, () => {
  let auth: AuthPage;

  test.beforeEach(async ({ page }) => {
    auth = new AuthPage(page);
    await auth.gotoLogin();
  });

  test('signs in with valid credentials', { tag: '@smoke' }, async ({ page }) => {
    await auth.login(DEMO.username, DEMO.password);

    await expect(page).toHaveURL(/#\/tasks$/);
    await expect(page.locator('#greeting')).toHaveText('Hello, Demo User');
    await expect(page.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  });

  test('accepts the username in any letter case', async ({ page }) => {
    await auth.login('DEMO', DEMO.password);

    await expect(page).toHaveURL(/#\/tasks$/);
  });

  const badCredentials = [
    { name: 'a wrong password', username: DEMO.username, password: 'wrong_password' },
    { name: 'an unknown user', username: 'nobody', password: DEMO.password },
  ];

  for (const { name, username, password } of badCredentials) {
    test(`shows one generic error for ${name}`, { tag: ['@validation', '@security'] }, async ({ page }) => {
      await auth.login(username, password);

      await expect(auth.alert).toHaveText('Username and password do not match');
      await expect(page).toHaveURL(/#\/login$/);
    });
  }

  test('requires a username', { tag: '@validation' }, async () => {
    await auth.login('', DEMO.password);

    await expect(auth.alert).toHaveText('Username is required');
  });

  test('requires a password', { tag: '@validation' }, async () => {
    await auth.login(DEMO.username, '');

    await expect(auth.alert).toHaveText('Password is required');
  });

  test('logs out, confirms it, and blocks the board afterwards', { tag: '@security' }, async ({ page }) => {
    await auth.login(DEMO.username, DEMO.password);
    await auth.logout();

    await expect(page).toHaveURL(/#\/login$/);
    await expect(auth.status).toHaveText('You have been signed out');
    await expect(page.locator('#app-header')).toBeHidden();

    await page.goto('/#/tasks');
    await expect(page).toHaveURL(/#\/login$/);
    await expect(auth.status).toHaveText('Please sign in to continue');
  });
});

test.describe('Routing and session', { tag: '@auth' }, () => {
  for (const route of ['/tasks', '/profile']) {
    test(`redirects anonymous visitors from ${route} to the login page`, { tag: '@security' }, async ({ page }) => {
      await page.goto(`/#${route}`);

      await expect(page).toHaveURL(/#\/login$/);
      await expect(new AuthPage(page).status).toHaveText('Please sign in to continue');
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    });
  }

  test('sends signed-in users away from the login and register pages', async ({ page }) => {
    await signIn(page, DEMO);

    await page.goto('/#/login');
    await expect(page).toHaveURL(/#\/tasks$/);
    await page.goto('/#/register');
    await expect(page).toHaveURL(/#\/tasks$/);
  });

  test('keeps the session after a full page reload', { tag: '@persistence' }, async ({ page }) => {
    await signIn(page, DEMO);

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expect(page.locator('#greeting')).toHaveText('Hello, Demo User');
  });

  test('treats a session for a missing user as signed out', { tag: ['@security', '@resilience'] }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('tb.session', JSON.stringify('ghost')));

    await page.goto('/#/tasks');
    await page.reload();

    await expect(page).toHaveURL(/#\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('shows a not-found page for unknown routes', async ({ page }) => {
    await page.goto('/#/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('sets a descriptive page title per route', { tag: '@a11y' }, async ({ page }) => {
    await page.goto('/#/login');
    await expect(page).toHaveTitle(/Login/);
    await page.goto('/#/register');
    await expect(page).toHaveTitle(/Register/);

    await signIn(page, DEMO);
    await expect(page).toHaveTitle(/Tasks/);
    await page.getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveTitle(/Profile/);
  });

  test('supports browser back and forward between pages', async ({ page }) => {
    await signIn(page, DEMO);
    await page.getByRole('link', { name: 'Profile' }).click();
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  });
});
