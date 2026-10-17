// Routes /api/* to the handlers: tenant lookup, bearer-token auth, JSON body, error mapping.
import { isHardened } from './config.mjs';
import { ApiError, readJsonBody, sendEmpty, sendError, sendJson } from './http.mjs';
import { GENERAL_LIMIT, SENSITIVE_LIMIT, clientAddress, hit } from './rate-limit.mjs';
import * as handlers from './handlers.mjs';
import { DEFAULT_TENANT, getTenant, usernameForToken } from './store.mjs';

const TENANT_RE = /^[A-Za-z0-9_-]{1,64}$/;

// sensitive: true marks routes that hash a password (smaller rate-limit budget in public mode).
// auth: true means the handler needs a signed-in user; tenant: false means it touches no tenant data
// (so a request to it cannot create one).
const ROUTES = [
  { method: 'GET', pattern: /^\/api\/health$/, handler: handlers.health, tenant: false },
  { method: 'POST', pattern: /^\/api\/users$/, handler: handlers.register, sensitive: true },
  { method: 'POST', pattern: /^\/api\/sessions$/, handler: handlers.login, sensitive: true },
  { method: 'DELETE', pattern: /^\/api\/sessions$/, handler: handlers.logout, auth: true },
  { method: 'GET', pattern: /^\/api\/me$/, handler: handlers.getMe, auth: true },
  { method: 'PATCH', pattern: /^\/api\/me$/, handler: handlers.updateMe, auth: true },
  { method: 'DELETE', pattern: /^\/api\/me$/, handler: handlers.deleteMe, auth: true },
  { method: 'PUT', pattern: /^\/api\/me\/password$/, handler: handlers.changePassword, auth: true, sensitive: true },
  { method: 'GET', pattern: /^\/api\/tasks$/, handler: handlers.listTasks, auth: true },
  { method: 'POST', pattern: /^\/api\/tasks$/, handler: handlers.createTask, auth: true },
  { method: 'DELETE', pattern: /^\/api\/tasks$/, handler: handlers.clearCompletedTasks, auth: true },
  { method: 'PATCH', pattern: /^\/api\/tasks\/(?<id>\d+)$/, handler: handlers.updateTask, auth: true },
  { method: 'DELETE', pattern: /^\/api\/tasks\/(?<id>\d+)$/, handler: handlers.deleteTask, auth: true },
];

export const isApiPath = (pathname) => pathname === '/api' || pathname.startsWith('/api/');

function findRoute(method, pathname) {
  const matching = ROUTES.filter((route) => route.pattern.test(pathname));
  if (matching.length === 0) return { notFound: true };
  const route = matching.find((candidate) => candidate.method === method);
  if (route) return { route, params: pathname.match(route.pattern).groups ?? {} };
  return { allow: [...new Set(matching.map((candidate) => candidate.method))].join(', ') };
}

function tenantId(request) {
  // In public mode everyone shares the default tenant: a client-chosen tenant is just free storage.
  if (isHardened()) return DEFAULT_TENANT;
  const id = request.headers['x-tenant'] ?? DEFAULT_TENANT;
  if (!TENANT_RE.test(id)) throw new ApiError(400, 'invalid_tenant', 'X-Tenant must be 1-64 letters, digits, _ or -');
  return id;
}

function authenticate(tenant, request) {
  const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '');
  const token = match ? match[1] : null;
  const username = token === null ? undefined : usernameForToken(tenant, token);
  if (username === undefined) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
  return { token, username };
}

function enforceRateLimit(request, route) {
  if (!isHardened()) return;
  const address = clientAddress(request);
  const waitSeconds = Math.max(
    hit('api', address, GENERAL_LIMIT),
    route.sensitive ? hit('auth', address, SENSITIVE_LIMIT) : 0,
  );
  if (waitSeconds > 0) {
    throw new ApiError(429, 'rate_limited', 'Too many requests. Try again later.', undefined, {
      'Retry-After': String(waitSeconds),
    });
  }
}

async function dispatch(request, response, url) {
  const found = findRoute(request.method, url.pathname);
  if (found.notFound) throw new ApiError(404, 'not_found', 'No such endpoint');
  if (found.allow) {
    sendError(response, new ApiError(405, 'method_not_allowed', 'Method not allowed'), { Allow: found.allow });
    return;
  }

  enforceRateLimit(request, found.route);
  const tenant = found.route.tenant === false ? undefined : await getTenant(tenantId(request));
  const session = found.route.auth ? authenticate(tenant, request) : {};
  const hasBody = request.method !== 'GET' && request.method !== 'DELETE';
  const body = hasBody ? await readJsonBody(request) : {};
  const params = found.params.id === undefined ? {} : { id: Number(found.params.id) };

  const result = await found.route.handler({ tenant, body, params, query: url.searchParams, ...session });
  if (result.body === undefined) sendEmpty(response, result.status);
  else sendJson(response, result.status, result.body);
}

/** Handles one /api request. Never throws: failures become JSON error responses. */
export async function handleApi(request, response, url) {
  try {
    await dispatch(request, response, url);
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(response, error);
      return;
    }
    process.stderr.write(`API error on ${request.method} ${url.pathname}: ${error.stack ?? error}\n`);
    sendError(response, new ApiError(500, 'server_error', 'Something went wrong on the server'));
  }
}
