import type { APIRequestContext, Page } from '@playwright/test';
import { readJson } from './storage';

export interface ServerTask {
  readonly id: number;
  readonly title: string;
  readonly priority: string;
  readonly done: boolean;
}

/** The bearer token the app keeps in localStorage, or undefined when signed out. */
export async function sessionToken(page: Page): Promise<string | undefined> {
  const token = await readJson(page, 'tb.session');
  return typeof token === 'string' ? token : undefined;
}

/**
 * What the server holds for the signed-in user, read through the API with the app's own token.
 * (page.request carries the same per-test X-Tenant header as the page.)
 */
export async function serverTasks(page: Page): Promise<ServerTask[]> {
  const token = await sessionToken(page);
  if (token === undefined) throw new Error('serverTasks needs a signed-in page');
  const response = await page.request.get('/api/tasks', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok()) throw new Error(`GET /api/tasks answered ${response.status()}`);
  return ((await response.json()) as { tasks: ServerTask[] }).tasks;
}

/** HTTP status of a login attempt made straight against the API. */
export async function loginStatus(request: APIRequestContext, username: string, password: string): Promise<number> {
  const response = await request.post('/api/sessions', { data: { username, password } });
  return response.status();
}
