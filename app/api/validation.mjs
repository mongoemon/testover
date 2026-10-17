// Input rules for the API. The messages match the ones the UI shows, so a rejected request
// reads the same whether the browser or the server caught it.
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200; // bounds the cost of hashing a hostile request
export const MAX_DISPLAY_NAME = 100;
export const MAX_TITLE = 80;
export const PRIORITIES = ['low', 'medium', 'high'];

const isString = (value) => typeof value === 'string';

export const normalizeUsername = (value) => (isString(value) ? value.trim().toLowerCase() : '');

/** Returns the title problem as a message, or '' when the title is acceptable (after trimming). */
export function titleProblem(title) {
  if (!isString(title) || title.trim() === '') return 'Task title is required';
  if (title.trim().length > MAX_TITLE) return `Task title must be ${MAX_TITLE} characters or fewer`;
  return '';
}

export function displayNameProblem(displayName) {
  if (!isString(displayName) || displayName.trim() === '') return 'Display name is required';
  if (displayName.trim().length > MAX_DISPLAY_NAME) {
    return `Display name must be ${MAX_DISPLAY_NAME} characters or fewer`;
  }
  return '';
}

export function passwordProblem(password, label = 'Password') {
  if (!isString(password) || password.length < MIN_PASSWORD) {
    return `${label} must be at least ${MIN_PASSWORD} characters`;
  }
  if (password.length > MAX_PASSWORD) return `${label} must be ${MAX_PASSWORD} characters or fewer`;
  return '';
}

/** All problems with a registration body, in the order the form lists them. */
export function registrationProblems(body) {
  const problems = [];
  if (!USERNAME_RE.test(normalizeUsername(body.username))) {
    problems.push('Username must be 3-20 characters (letters, numbers, underscore)');
  }
  problems.push(displayNameProblem(body.displayName), passwordProblem(body.password));
  return problems.filter(Boolean);
}

export function taskPriorityProblem(priority) {
  return PRIORITIES.includes(priority) ? '' : `Priority must be one of: ${PRIORITIES.join(', ')}`;
}

export const isBoolean = (value) => typeof value === 'boolean';
