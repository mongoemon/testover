// Tiny static server for the demo app (no dependencies).
//
// Status codes:
//   200 GET/HEAD /, /index.html, /docs/<name>.html|.md, /README.md
//   304 conditional GET with matching If-None-Match
//   301 /index.htm -> /, /docs and /docs/ -> /docs/overview.html
//   400 malformed request URL
//   404 unknown path (including a docs file that does not exist)
//   405 other methods on a known path (Allow: GET, HEAD)
//   500 index file unreadable
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
const appDir = dirname(fileURLToPath(import.meta.url));
const indexPath = process.env.INDEX_PATH ?? join(appDir, 'index.html');
const rootDir = join(appDir, '..');
const docsDir = join(rootDir, 'docs');

const INDEX_PATHS = new Set(['/', '/index.html']);
const REDIRECTS = new Map([
  ['/index.htm', '/'],
  ['/docs', '/docs/overview.html'],
  ['/docs/', '/docs/overview.html'],
]);
const ALLOWED_METHODS = 'GET, HEAD';

const HTML = 'text/html; charset=utf-8';
const MARKDOWN = 'text/markdown; charset=utf-8';
// Flat file names only (no slashes or "..") so a request can never leave docs/.
const DOC_RE = /^\/docs\/([a-z0-9][a-z0-9.-]*\.(html|md))$/;

function resolveFile(pathname) {
  if (INDEX_PATHS.has(pathname)) return { path: indexPath, type: HTML, required: true };
  if (pathname === '/README.md') return { path: join(rootDir, 'README.md'), type: MARKDOWN };
  const doc = DOC_RE.exec(pathname);
  if (doc) return { path: join(docsDir, doc[1]), type: doc[2] === 'md' ? MARKDOWN : HTML };
  return null;
}

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

  const file = resolveFile(pathname);
  if (!file) {
    send(response, 404, { 'Content-Type': 'text/plain' }, 'Not found');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, { 'Content-Type': 'text/plain', Allow: ALLOWED_METHODS }, 'Method not allowed');
    return;
  }

  try {
    const body = await readFile(file.path);
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
    if (request.headers['if-none-match'] === etag) {
      send(response, 304, { ETag: etag });
      return;
    }
    const headers = { 'Content-Type': file.type, ETag: etag };
    send(response, 200, headers, request.method === 'HEAD' ? '' : body);
  } catch (error) {
    // A missing docs file is just an unknown page; only the app's own index is a server fault.
    if (!file.required && error.code === 'ENOENT') {
      send(response, 404, { 'Content-Type': 'text/plain' }, 'Not found');
      return;
    }
    send(response, 500, { 'Content-Type': 'text/plain' }, `Server error: ${error.message}`);
  }
});

server.listen(PORT, () => {
  process.stdout.write(`App listening on http://localhost:${PORT}\n`);
});
