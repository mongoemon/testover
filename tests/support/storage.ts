import type { Page } from '@playwright/test';

/**
 * Replaces localStorage with `entries` (raw strings, so corrupted values can be seeded)
 * and reloads, so the app boots from exactly that state.
 */
export async function seedStorage(page: Page, entries: Record<string, string>): Promise<void> {
  await page.goto('/');
  await page.evaluate((data) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
  }, entries);
  await page.reload();
}

/** Raw string stored under `key`, or null when absent. */
export function readRaw(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/** Parsed JSON stored under `key`, or undefined when absent. */
export async function readJson(page: Page, key: string): Promise<unknown> {
  const raw = await readRaw(page, key);
  return raw === null ? undefined : JSON.parse(raw);
}

/** Every key/value currently in localStorage. */
export function dumpStorage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
}
