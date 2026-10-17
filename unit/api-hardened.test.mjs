// Public-mode behaviour (HARDENED=1, TRUST_PROXY=1) and the Content-Security-Policy builder.
// Same in-process setup as api.test.mjs; the env switches are read per request, so each test
// turns them on for itself and restores them afterwards.
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { handleApi, isApiPath } from '../app/api/router.mjs';
import { resetRateLimits } from '../app/api/rate-limit.mjs';
import { DEFAULT_TENANT, getTenant, resetDefaultTenant } from '../app/api/store.mjs';
import { policyFor } from '../app/csp.mjs';

let server;
let baseUrl;

before(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (isApiPath(url.pathname)) handleApi(request, response, url);
    else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

afterEach(() => {
  delete process.env.HARDENED;
  delete process.env.TRUST_PROXY;
  resetRateLimits();
  resetDefaultTenant();
});

const call = async (method, path, { body, token, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null };
};

const signInDemo = async (headers) => {
  const { status, json } = await call('POST', '/api/sessions', { body: { username: 'demo', password: 'demo1234' }, headers });
  assert.equal(status, 201);
  return json.token;
};

describe('public mode: the shared demo account', () => {
  test('cannot be renamed, re-passworded or deleted', async () => {
    process.env.HARDENED = '1';
    const token = await signInDemo();
    const attempts = [
      call('PATCH', '/api/me', { token, body: { displayName: 'Hacked' } }),
      call('PUT', '/api/me/password', { token, body: { currentPassword: 'demo1234', newPassword: 'hacked-pass1', confirmPassword: 'hacked-pass1' } }),
      call('DELETE', '/api/me', { token }),
    ];
    for (const result of await Promise.all(attempts)) {
      assert.equal(result.status, 403);
      assert.equal(result.json.error.code, 'demo_protected');
    }
    assert.equal((await call('GET', '/api/me', { token })).json.displayName, 'Demo User');
  });

  test('can still use its task list', async () => {
    process.env.HARDENED = '1';
    const token = await signInDemo();
    assert.equal((await call('POST', '/api/tasks', { token, body: { title: 'try it' } })).status, 201);
  });

  test('other accounts keep full control of their profile', async () => {
    process.env.HARDENED = '1';
    const created = await call('POST', '/api/users', { body: { username: 'visitor', displayName: 'Visitor', password: 'longenough1' } });
    const token = created.json.token;
    assert.equal((await call('PATCH', '/api/me', { token, body: { displayName: 'Renamed' } })).status, 200);
    assert.equal((await call('DELETE', '/api/me', { token })).status, 204);
  });

  test('without public mode the demo account can be changed (the test suite relies on it)', async () => {
    const token = await signInDemo();
    assert.equal((await call('PATCH', '/api/me', { token, body: { displayName: 'Changed' } })).status, 200);
  });
});

describe('public mode: tenants', () => {
  test('X-Tenant is ignored, so everyone shares the default tenant', async () => {
    process.env.HARDENED = '1';
    const token = await signInDemo({ 'X-Tenant': 'alpha' });
    assert.equal((await call('GET', '/api/me', { token, headers: { 'X-Tenant': 'beta' } })).status, 200);
    assert.equal((await call('GET', '/api/me', { token })).status, 200);
  });

  test('an invalid X-Tenant is not even looked at', async () => {
    process.env.HARDENED = '1';
    assert.equal((await call('GET', '/api/me', { headers: { 'X-Tenant': 'bad tenant!' } })).status, 401);
  });

  test('resetDefaultTenant wipes accounts, tasks and sessions', async () => {
    const before = await getTenant(DEFAULT_TENANT);
    before.users.set('visitor', { passwordHash: 'x', displayName: 'Visitor' });
    resetDefaultTenant();
    const after = await getTenant(DEFAULT_TENANT);
    assert.notEqual(after, before);
    assert.deepEqual([...after.users.keys()], ['demo']);
  });
});

describe('public mode: rate limits', () => {
  const badRegistration = (headers) => call('POST', '/api/users', { body: { username: 'x' }, headers });

  test('password-hashing routes allow 20 requests a minute per client', async () => {
    process.env.HARDENED = '1';
    for (let i = 0; i < 20; i += 1) assert.equal((await badRegistration()).status, 422);
    const blocked = await badRegistration();
    assert.equal(blocked.status, 429);
    assert.equal(blocked.json.error.code, 'rate_limited');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  });

  test('ordinary routes have a much larger budget', async () => {
    process.env.HARDENED = '1';
    for (let i = 0; i < 300; i += 1) assert.equal((await call('GET', '/api/health')).status, 200);
    assert.equal((await call('GET', '/api/health')).status, 429);
  });

  test('without public mode nothing is limited', async () => {
    for (let i = 0; i < 25; i += 1) assert.equal((await badRegistration()).status, 422);
  });

  test('behind a trusted proxy the limit follows the last X-Forwarded-For entry', async () => {
    process.env.HARDENED = '1';
    process.env.TRUST_PROXY = '1';
    // a visitor cannot dodge the limit by inventing the first entries; the proxy's own entry is last
    for (let i = 0; i < 20; i += 1) {
      assert.equal((await badRegistration({ 'X-Forwarded-For': `spoof-${i}, 10.0.0.1` })).status, 422);
    }
    assert.equal((await badRegistration({ 'X-Forwarded-For': 'anything, 10.0.0.1' })).status, 429);
    // a different client behind the same proxy has its own budget
    assert.equal((await badRegistration({ 'X-Forwarded-For': '1.2.3.4, 10.0.0.2' })).status, 422);
  });
});

describe('public mode: client address header', () => {
  const badRegistration = (headers) => call('POST', '/api/users', { body: { username: 'x' }, headers });

  test('CLIENT_IP_HEADER wins over X-Forwarded-For, whose entries may change between requests', async () => {
    process.env.HARDENED = '1';
    process.env.TRUST_PROXY = '1';
    process.env.CLIENT_IP_HEADER = 'CF-Connecting-IP';
    try {
      // the proxy chain's last entry differs every time (as with a CDN edge), the client does not
      for (let i = 0; i < 20; i += 1) {
        const headers = { 'CF-Connecting-IP': '5.6.7.8', 'X-Forwarded-For': `5.6.7.8, edge-${i}` };
        assert.equal((await badRegistration(headers)).status, 422);
      }
      const blocked = await badRegistration({ 'CF-Connecting-IP': '5.6.7.8', 'X-Forwarded-For': '5.6.7.8, edge-new' });
      assert.equal(blocked.status, 429);
      const other = await badRegistration({ 'CF-Connecting-IP': '9.9.9.9', 'X-Forwarded-For': '9.9.9.9, edge-0' });
      assert.equal(other.status, 422);
    } finally {
      delete process.env.CLIENT_IP_HEADER;
    }
  });

  test('falls back to X-Forwarded-For when the named header is missing', async () => {
    process.env.HARDENED = '1';
    process.env.TRUST_PROXY = '1';
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip';
    try {
      for (let i = 0; i < 20; i += 1) assert.equal((await badRegistration({ 'X-Forwarded-For': '1.1.1.1, 10.0.0.1' })).status, 422);
      assert.equal((await badRegistration({ 'X-Forwarded-For': '1.1.1.1, 10.0.0.1' })).status, 429);
    } finally {
      delete process.env.CLIENT_IP_HEADER;
    }
  });
});

describe('Content-Security-Policy', () => {
  const hash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

  test('allows exactly the inline scripts in the page, by hash', () => {
    const html = '<html><script>alert(1)</script><script src="/x.js"></script><script type="module">run()</script></html>';
    const policy = policyFor(html);
    assert.ok(policy.includes(`script-src ${hash('alert(1)')} ${hash('run()')};`), policy);
    assert.doesNotMatch(policy, /script-src[^;]*unsafe-inline/);
  });

  test('hashes a script the way the browser sees it: CRLF and CR become LF', () => {
    const lf = policyFor('<script>a();\nb();</script>');
    assert.equal(policyFor('<script>a();\r\nb();</script>'), lf);
    assert.equal(policyFor('<script>a();\rb();</script>'), lf);
  });

  test('a page without inline scripts allows none', () => {
    assert.match(policyFor('<html><p>hi</p></html>'), /script-src 'none'/);
  });

  test('blocks framing, plugins, other origins and base-tag tricks', () => {
    const policy = policyFor('<script>x()</script>');
    for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "connect-src 'self'"]) {
      assert.ok(policy.includes(directive), directive);
    }
  });
});
