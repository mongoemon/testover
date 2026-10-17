import type { Page } from '@playwright/test';
import { dumpStorage } from './storage';

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Replaces values that change on every run so a golden master stays comparable. */
export function maskVolatile(text: string): string {
  return text.replace(ISO_TIMESTAMP, '<TIMESTAMP>').replace(UUID, '<UUID>');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, sortKeys(inner)]),
    );
  }
  return value;
}

/** Parses a stored value when it is JSON, otherwise keeps the raw string. */
function parseStored(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * The whole localStorage as stable, masked, key-sorted JSON text, ready for toMatchSnapshot().
 * Records everything the app persisted, not just the fields a test author thought to assert.
 */
export async function snapshotStorage(page: Page): Promise<string> {
  const raw = await dumpStorage(page);
  const parsed = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, parseStored(value)]));
  return `${maskVolatile(JSON.stringify(sortKeys(parsed), null, 2))}\n`;
}
