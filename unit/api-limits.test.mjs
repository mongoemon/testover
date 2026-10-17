// Abuse limits of the JSON API (app/api/): failed-login lockout, size caps, session lifetime and
// the protection of the default tenant. Same in-process setup as api.test.mjs.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleApi, isApiPath } from '../app/api/router.mjs';
import { DEFAULT_TENANT, LIMITS, SESSION_TTL_MS, getTenant } from '../app/api/store.mjs';

let server;
let baseUrl;
let tenantCounter = 0;

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

function client() {
  tenantCounter += 1;
  const tenant = `limits-${tenantCounter}`;
  const call = async (method, path, { body, token } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'X-Tenant': tenant,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null };
  };
  const signIn = async () => {
    const { status, json } = await call('POST', '/api/sessions', { body: { username: 'demo', password: 'demo1234' } });
    assert.equal(status, 201);
    return json.token;
  };
  return { call, signIn, tenant };
}

const errorOf = (result) => result.json.error;
const wrongLogin = (call, password = 'wrong-password') =>
  call('POST', '/api/sessions', { body: { username: 'demo', password } });

describe('failed sign-ins', () => {
  test('ten failures lock that username for a while, even for the right password', async () => {
    const { call } = client();
    for (let i = 0; i < 10; i += 1) assert.equal((await wrongLogin(call, `wrong-${i}`)).status, 401);

    const locked = await call('POST', '/api/sessions', { body: { username: 'demo', password: 'demo1234' } });
    assert.equal(locked.status, 429);
    assert.equal(errorOf(locked).code, 'too_many_attempts');
    assert.ok(Number(locked.headers.get('retry-after')) > 0);

    const other = await call('POST', '/api/users', {
      body: { username: 'other', displayName: 'Other', password: 'longenough1' },
    });
    assert.equal(other.status, 201, 'other usernames are not affected');
  });

  test('a successful sign-in resets the failure count', async () => {
    const { call } = client();
    for (let round = 0; round < 3; round += 1) {
      for (let i = 0; i < 9; i += 1) await wrongLogin(call);
      const ok = await call('POST', '/api/sessions', { body: { username: 'demo', password: 'demo1234' } });
      assert.equal(ok.status, 201);
    }
  });

  test('an over-long password is rejected without being hashed', async () => {
    const { call } = client();
    const result = await wrongLogin(call, 'p'.repeat(5000));
    assert.equal(result.status, 401);
  });
});

describe('size limits', () => {
  test('refuses to register past the per-tenant account limit', async () => {
    const { call, tenant } = client();
    const data = await getTenant(tenant);
    for (let i = data.users.size; i < LIMITS.users; i += 1) {
      data.users.set(`filler_${i}`, { passwordHash: 'x', displayName: 'Filler' });
    }
    const result = await call('POST', '/api/users', {
      body: { username: 'one_more', displayName: 'One More', password: 'longenough1' },
    });
    assert.equal(result.status, 429);
    assert.equal(errorOf(result).code, 'limit_reached');
  });

  test('refuses more tasks than the per-user limit', async () => {
    const { call, signIn } = client();
    const token = await signIn();
    for (let i = 0; i < LIMITS.tasksPerUser; i += 1) {
      assert.equal((await call('POST', '/api/tasks', { token, body: { title: `t${i}` } })).status, 201);
    }
    const over = await call('POST', '/api/tasks', { token, body: { title: 'one too many' } });
    assert.equal(over.status, 422);
    assert.equal(errorOf(over).code, 'limit_reached');
  });
});

describe('sessions', () => {
  test('keeps only the newest sessions per user', async () => {
    const { call, signIn } = client();
    const first = await signIn();
    for (let i = 0; i < LIMITS.sessionsPerUser; i += 1) await signIn();
    assert.equal((await call('GET', '/api/me', { token: first })).status, 401);
  });

  test('a session older than the time limit stops working', async () => {
    const { call, signIn, tenant } = client();
    const token = await signIn();
    (await getTenant(tenant)).sessions.get(token).createdAt = Date.now() - SESSION_TTL_MS - 1;
    assert.equal((await call('GET', '/api/me', { token })).status, 401);
  });

  test('changing the password signs out every other session but keeps the current one', async () => {
    const { call, signIn } = client();
    const current = await signIn();
    const other = await signIn();
    const body = { currentPassword: 'demo1234', newPassword: 'longenough1', confirmPassword: 'longenough1' };
    assert.equal((await call('PUT', '/api/me/password', { token: current, body })).status, 204);
    assert.equal((await call('GET', '/api/me', { token: current })).status, 200);
    assert.equal((await call('GET', '/api/me', { token: other })).status, 401);
  });
});

describe('tenants', () => {
  test('flooding the server with made-up tenants cannot evict the default tenant', async () => {
    const before = await getTenant(DEFAULT_TENANT);
    for (let i = 0; i < 5200; i += 1) await getTenant(`flood-${i}`);
    assert.equal(await getTenant(DEFAULT_TENANT), before);
  });

  test('the health check does not create a tenant', async () => {
    const { call, tenant } = client();
    assert.equal((await call('GET', '/api/health')).status, 200);
    const data = await getTenant(tenant); // creates it now, with only the demo account
    assert.deepEqual([...data.users.keys()], ['demo']);
  });
});
