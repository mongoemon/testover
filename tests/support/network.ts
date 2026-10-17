import type { APIRequestContext, Page, Request } from '@playwright/test';
import { maskVolatile } from './golden';

/** Response headers worth pinning; everything else (Date, Connection, ...) varies per run. */
const STABLE_HEADERS = ['content-type', 'allow', 'location'] as const;

export interface RouteProbe {
  readonly method: 'GET' | 'HEAD' | 'POST' | 'DELETE';
  readonly path: string;
}

/**
 * Calls each route and returns the response "shape" as stable JSON text for toMatchSnapshot().
 * HTML/markdown bodies are reduced to ETag presence + non-empty flag so editing a doc does not
 * break the golden; small text bodies (404/405) are kept verbatim.
 */
export async function snapshotResponses(request: APIRequestContext, probes: readonly RouteProbe[]): Promise<string> {
  const entries: Record<string, unknown>[] = [];
  for (const probe of probes) {
    const response = await request.fetch(probe.path, { method: probe.method, maxRedirects: 0 });
    const headers = response.headers();
    const body = await response.text();
    const isText = (headers['content-type'] ?? '').startsWith('text/plain');
    entries.push({
      request: `${probe.method} ${probe.path}`,
      status: response.status(),
      headers: Object.fromEntries(STABLE_HEADERS.filter((name) => name in headers).map((name) => [name, headers[name]])),
      hasEtag: 'etag' in headers,
      body: isText ? body : body.length > 0 ? '<non-empty>' : '<empty>',
    });
  }
  return `${maskVolatile(JSON.stringify(entries, null, 2))}\n`;
}

/**
 * Starts recording every request the page makes. `stop()` returns the sorted, de-duplicated
 * list ("GET / [document]") so the golden does not depend on request timing or order.
 */
export function recordTraffic(page: Page): { stop: () => string } {
  const seen = new Set<string>();
  const onRequest = (req: Request): void => {
    const url = new URL(req.url());
    seen.add(`${req.method()} ${url.pathname}${url.search} [${req.resourceType()}]`);
  };
  page.on('request', onRequest);
  return {
    stop: () => {
      page.off('request', onRequest);
      return `${[...seen].sort().join('\n')}\n`;
    },
  };
}
