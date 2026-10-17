// One function per endpoint. Each gets a context { tenant, body, query, params, token, username }
// and returns { status, body? }; the router turns that into a response.
import { randomUUID } from 'node:crypto';
import { isHardened } from './config.mjs';
import { ApiError } from './http.mjs';
import { hashPassword, verifyPassword } from './password.mjs';
import {
  DEMO_ACCOUNT,
  LIMITS,
  clearFailedLogins,
  endSessions,
  loginRetryAfter,
  openSession,
  recordFailedLogin,
  removeUser,
  takeTaskId,
  tasksOf,
} from './store.mjs';
import {
  MAX_PASSWORD,
  displayNameProblem,
  isBoolean,
  normalizeUsername,
  passwordProblem,
  registrationProblems,
  taskPriorityProblem,
  titleProblem,
} from './validation.mjs';

// A well-formed hash that matches nothing: lets an unknown username cost one hash like a known one.
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const publicUser = (username, record) => ({ username, displayName: record.displayName });
const ok = (body, status = 200) => ({ status, body });
const noContent = { status: 204 };
const invalid = (details) => new ApiError(422, 'validation_failed', details[0], details);
const requiredField = (label) => invalid([`${label} is required`]);
const usernameTaken = () => new ApiError(409, 'username_taken', 'Username is already taken');
const invalidCredentials = () => new ApiError(401, 'invalid_credentials', 'Username and password do not match');
const sessionGone = () => new ApiError(401, 'unauthenticated', 'Sign in to continue');

// In public mode the demo account is shared by every visitor, so it must not be renamed,
// re-passworded or deleted by one of them.
function assertNotSharedDemo(username) {
  if (isHardened() && username === DEMO_ACCOUNT.username) {
    throw new ApiError(403, 'demo_protected', 'The shared demo account cannot be changed. Create your own account.');
  }
}

function startSession(tenant, username) {
  const token = randomUUID();
  openSession(tenant, username, token);
  return token;
}

// ---------- health ----------
export const health = () => ok({ status: 'ok' });

// ---------- users and sessions ----------
export async function register({ tenant, body }) {
  const problems = registrationProblems(body);
  if (problems.length > 0) throw invalid(problems);
  const username = normalizeUsername(body.username);
  if (tenant.users.has(username)) throw usernameTaken();
  if (tenant.users.size >= LIMITS.users) {
    throw new ApiError(429, 'limit_reached', `This demo allows at most ${LIMITS.users} accounts`);
  }
  const record = { passwordHash: await hashPassword(body.password), displayName: body.displayName.trim() };
  // hashing is async: another request may have claimed the name or filled the tenant meanwhile
  if (tenant.users.has(username)) throw usernameTaken();
  if (tenant.users.size >= LIMITS.users) {
    throw new ApiError(429, 'limit_reached', `This demo allows at most ${LIMITS.users} accounts`);
  }
  tenant.users.set(username, record);
  return ok({ token: startSession(tenant, username), user: publicUser(username, record) }, 201);
}

export async function login({ tenant, body }) {
  const username = normalizeUsername(body.username);
  if (username === '') throw requiredField('Username');
  if (typeof body.password !== 'string' || body.password === '') throw requiredField('Password');

  const retryAfter = loginRetryAfter(tenant, username);
  if (retryAfter > 0) {
    throw new ApiError(429, 'too_many_attempts', 'Too many failed sign-in attempts. Try again later.', undefined, {
      'Retry-After': String(retryAfter),
    });
  }

  const record = tenant.users.get(username);
  const checkable = body.password.length <= MAX_PASSWORD;
  const matches = checkable && (await verifyPassword(body.password, record?.passwordHash ?? DUMMY_HASH));
  // the account may have been deleted while the hash was being checked
  if (!record || !matches || tenant.users.get(username) !== record) {
    recordFailedLogin(tenant, username);
    throw invalidCredentials();
  }
  clearFailedLogins(tenant, username);
  return ok({ token: startSession(tenant, username), user: publicUser(username, record) }, 201);
}

export function logout({ tenant, token }) {
  tenant.sessions.delete(token);
  return noContent;
}

export function getMe({ tenant, username }) {
  return ok(publicUser(username, tenant.users.get(username)));
}

export function updateMe({ tenant, username, body }) {
  assertNotSharedDemo(username);
  const problem = displayNameProblem(body.displayName);
  if (problem) throw invalid([problem]);
  const record = { ...tenant.users.get(username), displayName: body.displayName.trim() };
  tenant.users.set(username, record);
  return ok(publicUser(username, record));
}

// Checks run in the order the old form used: current password, then length, then confirmation.
export async function changePassword({ tenant, username, token, body }) {
  assertNotSharedDemo(username);
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const record = tenant.users.get(username);
  if (current.length > MAX_PASSWORD || !(await verifyPassword(current, record.passwordHash))) {
    throw new ApiError(403, 'wrong_password', 'Current password is incorrect');
  }
  const problem = passwordProblem(body.newPassword, 'New password');
  if (problem) throw invalid([problem]);
  if (body.newPassword !== body.confirmPassword) throw invalid(['Passwords do not match']);

  const passwordHash = await hashPassword(body.newPassword);
  // read the record again: it may have been renamed or deleted while the hashes were computed
  const latest = tenant.users.get(username);
  if (!latest) throw sessionGone();
  tenant.users.set(username, { ...latest, passwordHash });
  endSessions(tenant, username, token); // a changed password signs every other device out
  return noContent;
}

export function deleteMe({ tenant, username }) {
  assertNotSharedDemo(username);
  removeUser(tenant, username);
  return noContent;
}

// ---------- tasks ----------
export function listTasks({ tenant, username }) {
  return ok({ tasks: tasksOf(tenant, username) });
}

export function createTask({ tenant, username, body }) {
  const priority = body.priority ?? 'medium';
  const problems = [titleProblem(body.title), taskPriorityProblem(priority)].filter(Boolean);
  if (problems.length > 0) throw invalid(problems);
  const tasks = tasksOf(tenant, username);
  if (tasks.length >= LIMITS.tasksPerUser) {
    throw new ApiError(422, 'limit_reached', `You can have at most ${LIMITS.tasksPerUser} tasks`);
  }
  const task = { id: takeTaskId(tenant, username), title: body.title.trim(), priority, done: false };
  tenant.tasks.set(username, [...tasks, task]);
  return ok(task, 201);
}

function taskChanges(body) {
  const changes = {};
  const problems = [];
  if ('title' in body) {
    const problem = titleProblem(body.title);
    if (problem) problems.push(problem);
    else changes.title = body.title.trim();
  }
  if ('priority' in body) {
    const problem = taskPriorityProblem(body.priority);
    if (problem) problems.push(problem);
    else changes.priority = body.priority;
  }
  if ('done' in body) {
    if (isBoolean(body.done)) changes.done = body.done;
    else problems.push('done must be true or false');
  }
  if (problems.length === 0 && Object.keys(changes).length === 0) {
    problems.push('Provide at least one of: title, priority, done');
  }
  return { changes, problems };
}

export function updateTask({ tenant, username, params, body }) {
  const tasks = tasksOf(tenant, username);
  const existing = tasks.find((task) => task.id === params.id);
  if (!existing) throw new ApiError(404, 'task_not_found', 'Task not found');
  const { changes, problems } = taskChanges(body);
  if (problems.length > 0) throw invalid(problems);
  const updated = { ...existing, ...changes };
  tenant.tasks.set(username, tasks.map((task) => (task.id === existing.id ? updated : task)));
  return ok(updated);
}

export function deleteTask({ tenant, username, params }) {
  const tasks = tasksOf(tenant, username);
  if (!tasks.some((task) => task.id === params.id)) throw new ApiError(404, 'task_not_found', 'Task not found');
  tenant.tasks.set(username, tasks.filter((task) => task.id !== params.id));
  return noContent;
}

export function clearCompletedTasks({ tenant, username, query }) {
  if (query.get('completed') !== 'true') {
    throw new ApiError(400, 'missing_filter', 'Add ?completed=true to say which tasks to delete');
  }
  tenant.tasks.set(username, tasksOf(tenant, username).filter((task) => !task.done));
  return noContent;
}
