// The Content-Security-Policy (app/csp.mjs) must be strict AND the app must still work under it:
// no inline script is allowed except the ones hashed into the policy, and nothing is blocked.
import { expect, test } from './support/evidence';
import { ALICE, AuthPage, DEMO, TasksPage, signIn } from './support/pages';

test.describe('Content-Security-Policy', { tag: ['@security', '@p1'] }, () => {
  test('the app page carries a hash-based policy that forbids unsafe-inline scripts', async ({ request }) => {
    const response = await request.get('/');
    const policy = response.headers()['content-security-policy'] ?? '';
    expect(policy).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(response.headers()['x-frame-options']).toBe('DENY');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('every docs page ships its own policy', async ({ request }) => {
    const response = await request.get('/docs/overview.html');
    expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
  });

  test('registering, adding a task and signing out raise no CSP violation', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
    });
    page.on('pageerror', (error) => violations.push(error.message));

    const auth = new AuthPage(page);
    await auth.gotoRegister();
    await auth.register(ALICE);
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await new TasksPage(page).add('under csp');
    await auth.logout();
    await signIn(page, DEMO);

    expect(violations).toEqual([]);
  });

  test('an injected inline script does not run', async ({ page }) => {
    await page.goto('/');
    const ran = await page.evaluate(() => {
      (window as unknown as { injected?: boolean }).injected = false;
      const script = document.createElement('script');
      script.textContent = 'window.injected = true';
      document.body.append(script);
      return (window as unknown as { injected?: boolean }).injected;
    });
    expect(ran).toBe(false);
  });
});
