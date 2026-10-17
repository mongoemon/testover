import { test as base, type Page, type TestInfo } from '@playwright/test';
import { snapshotStorage } from './golden';

const ATTACHMENT_NAME = 'actual-localStorage.json';

function isAppPage(page: Page): boolean {
  return /^https?:/.test(page.url());
}

async function attachStorage(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  try {
    await testInfo.attach(name, {
      body: await snapshotStorage(page),
      contentType: 'application/json',
    });
  } catch (error) {
    await testInfo.attach(`${name}.error.txt`, {
      body: error instanceof Error ? error.message : String(error),
      contentType: 'text/plain',
    });
  }
}

/** One tenant per test attempt: the server keeps each tenant's users and tasks apart (see app/api/store.mjs). */
export function tenantFor(testInfo: TestInfo): string {
  // The run id (set once in playwright.config.ts) keeps a reused dev server from handing the
  // next run the accounts and tasks the previous run left behind.
  const runId = process.env.PW_RUN_ID ?? 'norun';
  return `${runId}-${testInfo.testId}-r${testInfo.retry}-x${testInfo.repeatEachIndex}`
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 64);
}

/**
 * `test` that sends a private X-Tenant header with every request, so tests running in parallel
 * against one server never share accounts or tasks, and that, once the body has finished, attaches the localStorage the app really holds
 * (same masking and key order as the golden masters) to the report, pass or fail.
 * Tests that never open an app page, e.g. request-only ones, attach nothing.
 */
export const test = base.extend<{ storageEvidence: void }>({
  // Applies to pages (browser requests) and to the `request` fixture alike.
  extraHTTPHeaders: async ({}, use, testInfo) => {
    await use({ 'X-Tenant': tenantFor(testInfo) });
  },
  storageEvidence: [
    async ({ context }, use, testInfo) => {
      await use();
      const pages = context.pages().filter(isAppPage);
      for (const [index, page] of pages.entries()) {
        const name = pages.length === 1 ? ATTACHMENT_NAME : `actual-localStorage-page${index + 1}.json`;
        await attachStorage(page, testInfo, name);
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
