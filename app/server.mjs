// Tiny static server for the demo app (no dependencies).
//
// Status codes:
//   200 GET/HEAD /, /index.html      304 conditional GET with matching If-None-Match
//   301 /index.htm -> /              400 malformed request URL
//   404 unknown path                 405 other methods on a known path (Allow: GET, HEAD)
//   500 index file unreadable
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
const indexPath =
  process.env.INDEX_PATH ?? join(dirname(fileURLToPath(import.meta.url)), 'index.html');

const INDEX_PATHS = new Set(['/', '/index.html']);
const REDIRECTS = new Map([['/index.htm', '/']]);
const ALLOWED_METHODS = 'GET, HEAD';

function send(response, status, headers = {}, body = '') {
  response.writeHead(status, headers);
  response.end(body);
}

function parsePathname(rawUrl) {
  try {
    return new URL(rawUrl ?? '', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const pathname = parsePathname(request.url);
  if (pathname === null) {
    send(response, 400, { 'Content-Type': 'text/plain' }, 'Bad request');
    return;
  }

  if (REDIRECTS.has(pathname)) {
    send(response, 301, { Location: REDIRECTS.get(pathname) });
    return;
  }

  if (!INDEX_PATHS.has(pathname)) {
    send(response, 404, { 'Content-Type': 'text/plain' }, 'Not found');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, { 'Content-Type': 'text/plain', Allow: ALLOWED_METHODS }, 'Method not allowed');
    return;
  }

  try {
    const html = await readFile(indexPath);
    const etag = `"${createHash('sha1').update(html).digest('hex')}"`;
    if (request.headers['if-none-match'] === etag) {
      send(response, 304, { ETag: etag });
      return;
    }
    const headers = { 'Content-Type': 'text/html; charset=utf-8', ETag: etag };
    send(response, 200, headers, request.method === 'HEAD' ? '' : html);
  } catch (error) {
    send(response, 500, { 'Content-Type': 'text/plain' }, `Server error: ${error.message}`);
  }
});

server.listen(PORT, () => {
  process.stdout.write(`App listening on http://localhost:${PORT}\n`);
});
