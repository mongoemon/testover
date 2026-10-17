import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SERVER_PATH = fileURLToPath(new URL('../app/server.mjs', import.meta.url));
const INDEX_PATH = fileURLToPath(new URL('../app/index.html', import.meta.url));

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function startServer(extraEnv = {}) {
  const port = await getFreePort();
  const child = spawn(process.execPath, [SERVER_PATH], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      PORT: String(port),
      ...extraEnv,
    },
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`server exited early (${code})`)));
    child.stdout.on('data', (data) => {
      if (String(data).includes('listening')) resolve();
    });
  });
  child.removeAllListeners('exit');
  return { port, stop: () => child.kill() };
}

// Raw http.request: unlike fetch it does not normalize the path or follow redirects.
const send = (port, { method = 'GET', path = '/', headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.once('error', reject);
    req.end();
  });

describe('app/server.mjs', () => {
  let server;
  let indexHtml;

  before(async () => {
    indexHtml = await readFile(INDEX_PATH, 'utf8');
    server = await startServer();
  });

  after(() => server?.stop());

  describe('200 OK', () => {
    for (const path of ['/', '/index.html']) {
      test(`GET ${path} serves index.html as UTF-8 HTML`, async () => {
        const res = await send(server.port, { path });
        assert.equal(res.status, 200);
        assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
        assert.equal(res.body, indexHtml);
      });
    }

    test('query string is ignored when routing', async () => {
      const res = await send(server.port, { path: '/?x=1' });
      assert.equal(res.status, 200);
    });

    test('HEAD returns headers (with ETag) and no body', async () => {
      const res = await send(server.port, { method: 'HEAD' });
      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
      assert.match(res.headers.etag, /^"[0-9a-f]{40}"$/);
      assert.equal(res.body, '');
    });
  });

  describe('docs', () => {
    test('GET /docs/overview.html serves the docs page as UTF-8 HTML', async () => {
      const expected = await readFile(new URL('../docs/overview.html', import.meta.url), 'utf8');
      const res = await send(server.port, { path: '/docs/overview.html' });
      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
      assert.equal(res.body, expected);
    });

    for (const path of ['/docs/tags.md', '/README.md']) {
      test(`GET ${path} serves Markdown as UTF-8 text`, async () => {
        const res = await send(server.port, { path });
        assert.equal(res.status, 200);
        assert.equal(res.headers['content-type'], 'text/markdown; charset=utf-8');
      });
    }

    for (const path of ['/docs', '/docs/']) {
      test(`${path} redirects to the overview`, async () => {
        const res = await send(server.port, { path });
        assert.equal(res.status, 301);
        assert.equal(res.headers.location, '/docs/overview.html');
      });
    }

    for (const path of ['/docs/missing.html', '/docs/../package.json', '/docs/%2e%2e/package.json', '/docs/x.json']) {
      test(`${path} returns 404`, async () => {
        const res = await send(server.port, { path });
        assert.equal(res.status, 404);
      });
    }
  });

  describe('301 Moved Permanently', () => {
    test('/index.htm redirects to /', async () => {
      const res = await send(server.port, { path: '/index.htm' });
      assert.equal(res.status, 301);
      assert.equal(res.headers.location, '/');
    });
  });

  describe('304 Not Modified', () => {
    test('matching If-None-Match returns 304 with no body', async () => {
      const first = await send(server.port);
      const res = await send(server.port, { headers: { 'If-None-Match': first.headers.etag } });
      assert.equal(res.status, 304);
      assert.equal(res.body, '');
    });

    test('stale If-None-Match returns full 200', async () => {
      const res = await send(server.port, { headers: { 'If-None-Match': '"stale"' } });
      assert.equal(res.status, 200);
      assert.equal(res.body, indexHtml);
    });
  });

  describe('400 Bad Request', () => {
    test('malformed request target "//" is rejected', async () => {
      const res = await send(server.port, { path: '//' });
      assert.equal(res.status, 400);
      assert.equal(res.body, 'Bad request');
    });
  });

  describe('404 Not Found', () => {
    test('unknown path returns plain text', async () => {
      const res = await send(server.port, { path: '/nope' });
      assert.equal(res.status, 404);
      assert.equal(res.headers['content-type'], 'text/plain');
      assert.equal(res.body, 'Not found');
    });

    test('unknown path with a non-GET method is still 404, not 405', async () => {
      const res = await send(server.port, { method: 'POST', path: '/nope' });
      assert.equal(res.status, 404);
    });
  });

  describe('405 Method Not Allowed', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      test(`${method} / returns 405 with Allow header`, async () => {
        const res = await send(server.port, { method });
        assert.equal(res.status, 405);
        assert.equal(res.headers.allow, 'GET, HEAD');
      });
    }
  });

  describe('500 Internal Server Error', () => {
    test('returns 500 without leaking the reason when index file is unreadable', async () => {
      const broken = await startServer({ INDEX_PATH: 'Z:\\definitely\\missing\\index.html' });
      try {
        const res = await send(broken.port);
        assert.equal(res.status, 500);
        assert.equal(res.body, 'Server error');
      } finally {
        broken.stop();
      }
    });
  });
});
