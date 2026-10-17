// Unit tests for the JSON API (app/api/). The router runs in-process on an ephemeral port, so
// these tests need no browser: they pin the status codes, error shapes and validation order
// that the UI and the Playwright suite depend on.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleApi, isApiPath } from '../app/api/router.mjs';
import { hashPassword, verifyPassword } from '../app/api/password.mjs';

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

/** A client bound to a fresh tenant, so every test starts from the seeded demo account only. */
function client() {
  tenantCounter += 1;
  const tenant = `unit-${tenantCounter}`;
  const call = async (method, path, { body, token, headers = {}, raw } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'X-Tenant': tenant,
        ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null };
  };
  const signIn = async (username = 'demo', password = 'demo1234') => {
    const { status, json } = await call('POST', '/api/sessions', { body: { username, password } });
    assert.equal(status, 201);
    return json.token;
  };
  return { call, signIn, tenant };
}

const errorOf = (result) => result.json.error;

describe('password hashing', () => {
  test('verifies the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correct horse');
    assert.match(stored, /^scrypt\$/);
    assert.equal(await verifyPassword('correct horse', stored), true);
    assert.equal(await verifyPassword('wrong horse', stored), false);
  });

  test('the same password hashes differently each time (random salt)', async () => {
    assert.notEqual(await hashPassword('same'), await hashPassword('same'));
  });

  test('a malformed stored hash never verifies', async () => {
    for (const stored of ['', 'plain', 'scrypt$only-salt', 'bcrypt$a$b']) {
      assert.equal(await verifyPassword('x', stored), false);
    }
  });
});

describe('request handling', () => {
  test('answers JSON with no-store caching on every response', async () => {
    const { call } = client();
    const ok = await call('GET', '/api/health');
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /^application\/json/);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
  });

  test('unknown endpoint is 404 and a wrong method is 405 with Allow', async () => {
    const { call } = client();
    assert.equal(errorOf(await call('GET', '/api/nope')).code, 'not_found');
    const wrong = await call('PUT', '/api/tasks');
    assert.equal(wrong.status, 405);
    assert.equal(wrong.headers.get('allow'), 'GET, POST, DELETE');
  });

  test('rejects an invalid X-Tenant header', async () => {
    const { call } = client();
    const result = await call('GET', '/api/me', { headers: { 'X-Tenant': 'bad tenant!' } });
    assert.equal(result.status, 400);
    assert.equal(errorOf(result).code, 'invalid_tenant');
  });

  test('rejects bodies that are not a JSON object', async () => {
    const { call } = client();
    assert.equal(errorOf(await call('POST', '/api/sessions', { raw: '{oops' })).code, 'invalid_json');
    assert.equal(errorOf(await call('POST', '/api/sessions', { raw: '[1,2]' })).code, 'invalid_body');
    assert.equal(errorOf(await call('POST', '/api/sessions', { raw: 'null' })).code, 'invalid_body');
  });

  test('rejects a body that is not declared as JSON', async () => {
    const { call } = client();
    const result = await call('POST', '/api/sessions', { raw: '{}', headers: { 'Content-Type': 'text/plain' } });
    assert.equal(result.status, 415);
  });

  test('rejects a body over the size limit', async () => {
    const { call } = client();
    const result = await call('POST', '/api/users', { raw: JSON.stringify({ displayName: 'x'.repeat(70_000) }) });
    assert.equal(result.status, 413);
    assert.equal(errorOf(result).code, 'payload_too_large');
  });
});

describe('tenants', () => {
  test('keep accounts, tasks and sessions apart', async () => {
    const one = client();
    const two = client();
    const token = await one.signIn();
    await one.call('POST', '/api/tasks', { token, body: { title: 'private' } });

    assert.equal((await two.call('GET', '/api/me', { token })).status, 401);
    const own = await two.signIn();
    assert.deepEqual((await two.call('GET', '/api/tasks', { token: own })).json.tasks, []);
  });

  test('a request without X-Tenant uses the shared default tenant', async () => {
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo', password: 'demo1234' }),
    });
    assert.equal(response.status, 201);
  });
});

describe('registration', () => {
  const valid = { username: 'newcomer', displayName: 'New Comer', password: 'longenough1' };

  test('creates the user, signs them in and never echoes the password', async () => {
    const { call } = client();
    const result = await call('POST', '/api/users', { body: { ...valid, username: '  NewComer ', displayName: '  New Comer ' } });
    assert.equal(result.status, 201);
    assert.deepEqual(result.json.user, { username: 'newcomer', displayName: 'New Comer' });
    assert.match(result.json.token, /^[0-9a-f-]{36}$/);
    assert.equal(JSON.stringify(result.json).includes(valid.password), false);
    assert.equal((await call('GET', '/api/me', { token: result.json.token })).json.username, 'newcomer');
  });

  test('lists every problem at once, in the form order', async () => {
    const { call } = client();
    const result = await call('POST', '/api/users', { body: { username: 'x', displayName: '   ', password: 'short' } });
    assert.equal(result.status, 422);
    assert.deepEqual(errorOf(result).details, [
      'Username must be 3-20 characters (letters, numbers, underscore)',
      'Display name is required',
      'Password must be at least 8 characters',
    ]);
  });

  test('treats non-string fields as missing instead of crashing', async () => {
    const { call } = client();
    const result = await call('POST', '/api/users', { body: { username: 5, displayName: ['x'], password: { a: 1 } } });
    assert.equal(result.status, 422);
    assert.equal(errorOf(result).details.length, 3);
  });

  test('refuses a taken username in any letter case', async () => {
    const { call } = client();
    for (const username of ['demo', 'DEMO']) {
      const result = await call('POST', '/api/users', { body: { ...valid, username } });
      assert.equal(result.status, 409);
      assert.equal(errorOf(result).code, 'username_taken');
    }
  });

  test('limits the lengths that feed hashing and storage', async () => {
    const { call } = client();
    const longPassword = await call('POST', '/api/users', { body: { ...valid, password: 'p'.repeat(201) } });
    assert.equal(errorOf(longPassword).message, 'Password must be 200 characters or fewer');
    const longName = await call('POST', '/api/users', { body: { ...valid, displayName: 'n'.repeat(101) } });
    assert.equal(errorOf(longName).message, 'Display name must be 100 characters or fewer');
  });

  test('reserved-looking names register as ordinary users', async () => {
    const { call } = client();
    for (const username of ['constructor', '__proto__', 'hasownproperty']) {
      const result = await call('POST', '/api/users', { body: { ...valid, username } });
      assert.equal(result.status, 201, username);
      assert.equal(result.json.user.username, username);
    }
  });
});

describe('sessions', () => {
  test('log in is case-insensitive for the username and exact for the password', async () => {
    const { call } = client();
    assert.equal((await call('POST', '/api/sessions', { body: { username: ' DEMO ', password: 'demo1234' } })).status, 201);
    assert.equal((await call('POST', '/api/sessions', { body: { username: 'demo', password: 'DEMO1234' } })).status, 401);
  });

  test('an unknown user and a wrong password get the same answer', async () => {
    const { call } = client();
    const unknown = await call('POST', '/api/sessions', { body: { username: 'nobody', password: 'whatever1' } });
    const wrong = await call('POST', '/api/sessions', { body: { username: 'demo', password: 'whatever1' } });
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.json, wrong.json);
  });

  test('checks the username is present before the password', async () => {
    const { call } = client();
    assert.equal(errorOf(await call('POST', '/api/sessions', { body: {} })).message, 'Username is required');
    assert.equal(errorOf(await call('POST', '/api/sessions', { body: { username: 'demo' } })).message, 'Password is required');
  });

  test('requires a known bearer token, and logging out ends only that token', async () => {
    const { call, signIn } = client();
    assert.equal((await call('GET', '/api/me')).status, 401);
    assert.equal((await call('GET', '/api/me', { token: 'nope' })).status, 401);
    const first = await signIn();
    const second = await signIn();
    assert.equal((await call('DELETE', '/api/sessions', { token: first })).status, 204);
    assert.equal((await call('GET', '/api/me', { token: first })).status, 401);
    assert.equal((await call('GET', '/api/me', { token: second })).status, 200);
  });
});

describe('profile', () => {
  test('renames the user, trimming the name', async () => {
    const { call, signIn } = client();
    const token = await signIn();
    const result = await call('PATCH', '/api/me', { token, body: { displayName: '  Renamed  ' } });
    assert.deepEqual(result.json, { username: 'demo', displayName: 'Renamed' });
    assert.equal(errorOf(await call('PATCH', '/api/me', { token, body: { displayName: ' ' } })).message, 'Display name is required');
  });

  test('changing the password checks current password, then length, then confirmation', async () => {
    const { call, signIn } = client();
    const token = await signIn();
    const change = (body) => call('PUT', '/api/me/password', { token, body });

    const wrong = await change({ currentPassword: 'wrong-one', newPassword: 'abc', confirmPassword: 'xyz' });
    assert.equal(wrong.status, 403);
    assert.equal(errorOf(wrong).message, 'Current password is incorrect');
    assert.equal(
      errorOf(await change({ currentPassword: 'demo1234', newPassword: 'abc', confirmPassword: 'xyz' })).message,
      'New password must be at least 8 characters',
    );
    assert.equal(
      errorOf(await change({ currentPassword: 'demo1234', newPassword: 'longenough1', confirmPassword: 'different1' })).message,
      'Passwords do not match',
    );
    assert.equal((await change({ currentPassword: 'demo1234', newPassword: 'longenough1', confirmPassword: 'longenough1' })).status, 204);
    assert.equal((await call('POST', '/api/sessions', { body: { username: 'demo', password: 'longenough1' } })).status, 201);
    assert.equal((await call('POST', '/api/sessions', { body: { username: 'demo', password: 'demo1234' } })).status, 401);
  });

  test('deleting the account removes the user, their tasks and every session', async () => {
    const { call, signIn } = client();
    const token = await signIn();
    const other = await signIn();
    await call('POST', '/api/tasks', { token, body: { title: 'gone soon' } });
    assert.equal((await call('DELETE', '/api/me', { token })).status, 204);
    assert.equal((await call('GET', '/api/me', { token: other })).status, 401);
    assert.equal((await call('POST', '/api/sessions', { body: { username: 'demo', password: 'demo1234' } })).status, 401);
    const again = await call('POST', '/api/users', { body: { username: 'demo', displayName: 'Fresh', password: 'longenough1' } });
    assert.equal(again.status, 201);
    assert.deepEqual((await call('GET', '/api/tasks', { token: again.json.token })).json.tasks, []);
  });
});

describe('tasks', () => {
  async function withTasks(...titles) {
    const api = client();
    const token = await api.signIn();
    for (const title of titles) await api.call('POST', '/api/tasks', { token, body: { title } });
    return { ...api, token };
  }

  test('creates with a trimmed title, default priority and done=false', async () => {
    const { call, token } = await withTasks();
    const result = await call('POST', '/api/tasks', { token, body: { title: '  padded  ' } });
    assert.equal(result.status, 201);
    assert.deepEqual(result.json, { id: 1, title: 'padded', priority: 'medium', done: false });
  });

  test('accepts an 80 character title and rejects 81, blank and non-string titles', async () => {
    const { call, token } = await withTasks();
    assert.equal((await call('POST', '/api/tasks', { token, body: { title: 'a'.repeat(80) } })).status, 201);
    assert.equal(errorOf(await call('POST', '/api/tasks', { token, body: { title: 'b'.repeat(81) } })).message, 'Task title must be 80 characters or fewer');
    for (const title of ['    ', '', 42, null, undefined]) {
      const result = await call('POST', '/api/tasks', { token, body: { title } });
      assert.equal(errorOf(result).message, 'Task title is required', String(title));
    }
  });

  test('rejects an unknown priority', async () => {
    const { call, token } = await withTasks();
    const result = await call('POST', '/api/tasks', { token, body: { title: 'x', priority: 'urgent' } });
    assert.equal(result.status, 422);
    assert.match(errorOf(result).message, /Priority must be one of/);
  });

  test('ids only grow: a deleted task id is never handed out again', async () => {
    const { call, token } = await withTasks('one', 'two', 'three');
    await call('DELETE', '/api/tasks/1', { token });
    const four = await call('POST', '/api/tasks', { token, body: { title: 'four' } });
    assert.equal(four.json.id, 4);
    await call('DELETE', '/api/tasks/4', { token });
    const next = await call('POST', '/api/tasks', { token, body: { title: 'next' } });
    assert.equal(next.json.id, 5);
  });

  test('updates only the fields that are sent', async () => {
    const { call, token } = await withTasks('before');
    const result = await call('PATCH', '/api/tasks/1', { token, body: { done: true } });
    assert.deepEqual(result.json, { id: 1, title: 'before', priority: 'medium', done: true });
    const renamed = await call('PATCH', '/api/tasks/1', { token, body: { title: ' after ', priority: 'low' } });
    assert.deepEqual(renamed.json, { id: 1, title: 'after', priority: 'low', done: true });
  });

  test('rejects an empty update, a non-boolean done and a bad title', async () => {
    const { call, token } = await withTasks('x');
    assert.equal(errorOf(await call('PATCH', '/api/tasks/1', { token, body: {} })).message, 'Provide at least one of: title, priority, done');
    assert.equal(errorOf(await call('PATCH', '/api/tasks/1', { token, body: { done: 'yes' } })).message, 'done must be true or false');
    assert.equal(errorOf(await call('PATCH', '/api/tasks/1', { token, body: { title: ' ' } })).message, 'Task title is required');
  });

  test('a task that does not exist is 404 for update and delete', async () => {
    const { call, token } = await withTasks('x');
    assert.equal(errorOf(await call('PATCH', '/api/tasks/9', { token, body: { done: true } })).code, 'task_not_found');
    assert.equal(errorOf(await call('DELETE', '/api/tasks/9', { token })).code, 'task_not_found');
  });

  test('clearing completed tasks needs the explicit filter and keeps open tasks', async () => {
    const { call, token } = await withTasks('keep', 'drop');
    await call('PATCH', '/api/tasks/2', { token, body: { done: true } });
    const unfiltered = await call('DELETE', '/api/tasks', { token });
    assert.equal(unfiltered.status, 400);
    assert.equal(errorOf(unfiltered).code, 'missing_filter');
    assert.equal((await call('GET', '/api/tasks', { token })).json.tasks.length, 2);

    assert.equal((await call('DELETE', '/api/tasks?completed=true', { token })).status, 204);
    assert.deepEqual((await call('GET', '/api/tasks', { token })).json.tasks.map((task) => task.title), ['keep']);
  });

  test('users never see each other’s tasks', async () => {
    const { call, token } = await withTasks('demo task');
    const other = await call('POST', '/api/users', { body: { username: 'second', displayName: 'Second', password: 'longenough1' } });
    assert.deepEqual((await call('GET', '/api/tasks', { token: other.json.token })).json.tasks, []);
    assert.equal(errorOf(await call('PATCH', '/api/tasks/1', { token: other.json.token, body: { done: true } })).code, 'task_not_found');
    assert.equal((await call('GET', '/api/tasks', { token })).json.tasks[0].done, false);
  });
});
