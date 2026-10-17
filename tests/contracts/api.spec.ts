// C4: the JSON the API sends must satisfy the shared schemas (contracts/schemas.mjs), for
// successes and for errors, and the API must keep users apart. Calls go straight to /api;
// the per-test X-Tenant header (tests/support/evidence.ts) keeps every test's data private.
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect, test } from '../support/evidence';
import {
  errorResponseSchema,
  sessionResponseSchema,
  taskSchema,
  tasksResponseSchema,
  userSchema,
} from '../../contracts/schemas.mjs';

const DEMO_LOGIN = { username: 'demo', password: 'demo1234' };
const NEW_USER = { username: 'contract_user', displayName: 'Contract User', password: 'longenough1' };

const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

async function signIn(request: APIRequestContext, login = DEMO_LOGIN): Promise<string> {
  const response = await request.post('/api/sessions', { data: login });
  expect(response.status()).toBe(201);
  return sessionResponseSchema.parse(await response.json()).token;
}

async function expectError(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(errorResponseSchema.parse(await response.json()).error.code).toBe(code);
}

test.describe('API contract @contract @api', () => {
  test('GET /api/health', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('registering answers 201 with a session and the public user', async ({ request }) => {
    const response = await request.post('/api/users', { data: NEW_USER });
    expect(response.status()).toBe(201);
    const body = sessionResponseSchema.parse(await response.json());
    expect(body.user).toEqual({ username: NEW_USER.username, displayName: NEW_USER.displayName });
    expect(JSON.stringify(body)).not.toContain(NEW_USER.password);
  });

  test('signing in answers 201 with a session; GET /api/me returns the same user', async ({ request }) => {
    const login = await request.post('/api/sessions', { data: { username: 'DEMO ', password: 'demo1234' } });
    expect(login.status()).toBe(201);
    const session = sessionResponseSchema.parse(await login.json());
    const me = await request.get('/api/me', { headers: bearer(session.token) });
    expect(me.status()).toBe(200);
    expect(userSchema.parse(await me.json())).toEqual(session.user);
  });

  test('tasks: create, list, update, delete and clear completed', async ({ request }) => {
    const headers = bearer(await signIn(request));

    const created = await request.post('/api/tasks', { headers, data: { title: '  write contract  ', priority: 'high' } });
    expect(created.status()).toBe(201);
    expect(taskSchema.parse(await created.json())).toEqual({ id: 1, title: 'write contract', priority: 'high', done: false });

    const second = await request.post('/api/tasks', { headers, data: { title: 'second' } });
    expect(taskSchema.parse(await second.json()).priority).toBe('medium');

    const patched = await request.patch('/api/tasks/1', { headers, data: { done: true, title: 'renamed' } });
    expect(patched.status()).toBe(200);
    expect(taskSchema.parse(await patched.json())).toEqual({ id: 1, title: 'renamed', priority: 'high', done: true });

    const listed = await request.get('/api/tasks', { headers });
    expect(tasksResponseSchema.parse(await listed.json()).tasks.map((task) => task.id)).toEqual([1, 2]);

    expect((await request.delete('/api/tasks?completed=true', { headers })).status()).toBe(204);
    expect((await request.delete('/api/tasks/2', { headers })).status()).toBe(204);
    expect(tasksResponseSchema.parse(await (await request.get('/api/tasks', { headers })).json()).tasks).toEqual([]);
  });

  test('profile: rename, change password, delete account', async ({ request }) => {
    const token = await signIn(request);
    const headers = bearer(token);

    const renamed = await request.patch('/api/me', { headers, data: { displayName: ' Renamed ' } });
    expect(userSchema.parse(await renamed.json()).displayName).toBe('Renamed');

    const changed = await request.put('/api/me/password', {
      headers,
      data: { currentPassword: 'demo1234', newPassword: 'another-pass1', confirmPassword: 'another-pass1' },
    });
    expect(changed.status()).toBe(204);
    expect((await request.post('/api/sessions', { data: DEMO_LOGIN })).status()).toBe(401);
    await signIn(request, { username: 'demo', password: 'another-pass1' });

    expect((await request.delete('/api/me', { headers })).status()).toBe(204);
    await expectError(await request.get('/api/me', { headers }), 401, 'unauthenticated');
  });

  test('signing out ends that token only', async ({ request }) => {
    const first = await signIn(request);
    const second = await signIn(request);
    expect((await request.delete('/api/sessions', { headers: bearer(first) })).status()).toBe(204);
    await expectError(await request.get('/api/me', { headers: bearer(first) }), 401, 'unauthenticated');
    expect((await request.get('/api/me', { headers: bearer(second) })).status()).toBe(200);
  });

  test('errors share one shape', async ({ request }) => {
    const headers = bearer(await signIn(request));
    await expectError(await request.post('/api/sessions', { data: { username: 'demo', password: 'nope' } }), 401, 'invalid_credentials');
    await expectError(await request.post('/api/users', { data: { username: 'demo', displayName: 'X', password: 'longenough1' } }), 409, 'username_taken');
    await expectError(await request.post('/api/users', { data: { username: 'x' } }), 422, 'validation_failed');
    await expectError(await request.get('/api/tasks'), 401, 'unauthenticated');
    await expectError(await request.patch('/api/tasks/99', { headers, data: { done: true } }), 404, 'task_not_found');
    await expectError(await request.delete('/api/tasks', { headers }), 400, 'missing_filter');
    await expectError(await request.get('/api/nope'), 404, 'not_found');
    await expectError(await request.put('/api/tasks', { headers, data: {} }), 405, 'method_not_allowed');
  });

  test('two users never share a task list', async ({ request }) => {
    const demo = bearer(await signIn(request));
    const alice = bearer(
      sessionResponseSchema.parse(await (await request.post('/api/users', { data: NEW_USER })).json()).token,
    );
    await request.post('/api/tasks', { headers: demo, data: { title: 'demo task' } });
    await request.post('/api/tasks', { headers: alice, data: { title: 'alice task' } });

    const titles = async (headers: { Authorization: string }): Promise<string[]> =>
      tasksResponseSchema.parse(await (await request.get('/api/tasks', { headers })).json()).tasks.map((task) => task.title);
    expect(await titles(demo)).toEqual(['demo task']);
    expect(await titles(alice)).toEqual(['alice task']);
  });

  test('a token is useless in another tenant', async ({ request, playwright, baseURL }) => {
    const token = await signIn(request);
    const elsewhere = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'X-Tenant': 'someone-else' } });
    await expectError(await elsewhere.get('/api/me', { headers: bearer(token) }), 401, 'unauthenticated');
    await elsewhere.dispose();
  });
});
