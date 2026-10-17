// In-memory data, split into isolated "tenants". Real visitors share the "default" tenant;
// the test suite sends a unique X-Tenant header per test so parallel tests never see each other.
// State is lost on restart on purpose: this is a demo backend.
import { hashPassword } from './password.mjs';

const MAX_TENANTS = 5000;
export const DEFAULT_TENANT = 'default';
export const DEMO_ACCOUNT = { username: 'demo', password: 'demo1234', displayName: 'Demo User' };

// Size limits per tenant, so one client cannot grow the process without bound.
export const LIMITS = { users: 50, tasksPerUser: 200, sessionsPerUser: 10 };
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const tenants = new Map();
let demoHash = null;

// Hashed once for the whole process: every tenant starts with the same demo credentials.
const demoPasswordHash = () => {
  demoHash ??= hashPassword(DEMO_ACCOUNT.password).catch((error) => {
    demoHash = null; // do not keep a failed attempt forever
    throw error;
  });
  return demoHash;
};

function newTenant(passwordHash) {
  return {
    users: new Map([[DEMO_ACCOUNT.username, { passwordHash, displayName: DEMO_ACCOUNT.displayName }]]),
    sessions: new Map(), // token -> { username, createdAt }
    tasks: new Map(), // username -> task[]
    nextTaskIds: new Map(), // username -> next id; only grows, so a deleted task's id is never reused
    failedLogins: new Map(), // username -> { count, since }
  };
}

// The cap only applies to named tenants: the default tenant (real visitors) is never evicted,
// so flooding the server with made-up X-Tenant values cannot wipe it.
function evictOldestNamedTenant() {
  for (const id of tenants.keys()) {
    if (id !== DEFAULT_TENANT) {
      tenants.delete(id);
      return;
    }
  }
}

/** The tenant's data, created (with the demo account) on first use. Least recently used goes first. */
export async function getTenant(id) {
  const passwordHash = await demoPasswordHash();
  const tenant = tenants.get(id) ?? newTenant(passwordHash);
  tenants.delete(id);
  tenants.set(id, tenant);
  if (tenants.size > MAX_TENANTS) evictOldestNamedTenant();
  return tenant;
}

export const tasksOf = (tenant, username) => tenant.tasks.get(username) ?? [];

/** Reserves the next task id for the user. */
export function takeTaskId(tenant, username) {
  const id = tenant.nextTaskIds.get(username) ?? 1;
  tenant.nextTaskIds.set(username, id + 1);
  return id;
}

/** Starts a session; the user's oldest sessions are dropped beyond the per-user limit. */
export function openSession(tenant, username, token) {
  tenant.sessions.set(token, { username, createdAt: Date.now() });
  const own = [...tenant.sessions].filter(([, session]) => session.username === username);
  for (const [oldToken] of own.slice(0, Math.max(0, own.length - LIMITS.sessionsPerUser))) {
    tenant.sessions.delete(oldToken);
  }
}

/** The username a token belongs to, or undefined when it is unknown or older than the TTL. */
export function usernameForToken(tenant, token) {
  const session = tenant.sessions.get(token);
  if (session === undefined) return undefined;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    tenant.sessions.delete(token);
    return undefined;
  }
  return tenant.users.has(session.username) ? session.username : undefined;
}

/** Ends every session of the user except `keepToken` (if given). */
export function endSessions(tenant, username, keepToken) {
  for (const [token, session] of tenant.sessions) {
    if (session.username === username && token !== keepToken) tenant.sessions.delete(token);
  }
}

/** Forgets everything in the default tenant (public mode wipes it on a timer). */
export function resetDefaultTenant() {
  tenants.delete(DEFAULT_TENANT);
}

export function removeUser(tenant, username) {
  tenant.users.delete(username);
  tenant.tasks.delete(username);
  tenant.nextTaskIds.delete(username);
  endSessions(tenant, username);
}

// ---------- failed-login throttle (per tenant and username) ----------
export const LOGIN_THROTTLE = { maxFailures: 10, windowMs: 60_000 };

/** Seconds until another attempt is allowed, or 0 when the user may try. */
export function loginRetryAfter(tenant, username) {
  const entry = tenant.failedLogins.get(username);
  if (!entry) return 0;
  const elapsed = Date.now() - entry.since;
  if (elapsed >= LOGIN_THROTTLE.windowMs) {
    tenant.failedLogins.delete(username);
    return 0;
  }
  return entry.count >= LOGIN_THROTTLE.maxFailures ? Math.ceil((LOGIN_THROTTLE.windowMs - elapsed) / 1000) : 0;
}

export function recordFailedLogin(tenant, username) {
  const entry = tenant.failedLogins.get(username);
  const fresh = !entry || Date.now() - entry.since >= LOGIN_THROTTLE.windowMs;
  tenant.failedLogins.set(username, fresh ? { count: 1, since: Date.now() } : { ...entry, count: entry.count + 1 });
}

export function clearFailedLogins(tenant, username) {
  tenant.failedLogins.delete(username);
}
