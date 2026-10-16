// Executable contracts for the boundaries the project crosses.
//   C1 localStorage data written/read by app/index.html
//   C2 the slice of Playwright's JSON report that scripts/notify.mjs reads
//   C3 the body POSTed to the webhook
// Plain ESM so node:test (unit/) and Playwright (tests/) can both import it.
import { z } from 'zod';

// ---------- C1: localStorage ----------
export const PRIORITY_VALUES = ['low', 'medium', 'high'];

export const storageKeys = {
  users: 'tb.users',
  session: 'tb.session',
  theme: 'tb.theme',
  tasks: (username) => `tb.tasks.${username}`,
};

// Strict on purpose: a new field written by the app must be a conscious contract change,
// and `.parse()` must not silently strip it before a test compares the result.
const isTrimmed = (value) => value === value.trim();

export const userRecordSchema = z
  .object({
    password: z.string().min(8), // the app enforces >= 8 on register and password change
    displayName: z.string().min(1).refine(isTrimmed, 'displayName must be trimmed'),
  })
  .strict();

/** Mirrors USERNAME_RE in app/index.html. */
export const usernameSchema = z.string().regex(/^[a-z0-9_]{3,20}$/);

/** `tb.users`: username -> record. */
export const usersSchema = z.record(usernameSchema, userRecordSchema);

/** `tb.session`: the signed-in username. */
export const sessionSchema = z.string();

/** `tb.theme` */
export const themeSchema = z.enum(['light', 'dark']);

export const taskSchema = z
  .object({
    id: z.number().int(),
    title: z.string().min(1).max(80).refine(isTrimmed, 'title must be trimmed'), // MAX_TITLE = 80
    priority: z.enum(PRIORITY_VALUES),
    done: z.boolean(),
  })
  .strict();

/** `tb.tasks.<username>` */
export const tasksSchema = z.array(taskSchema);

// ---------- C2: Playwright JSON report (only the fields notify.mjs depends on) ----------
export const reportSuiteSchema = z.lazy(() =>
  z.object({
    title: z.string(),
    specs: z.array(z.object({ title: z.string(), ok: z.boolean() })).optional(),
    suites: z.array(reportSuiteSchema).optional(),
  }),
);

export const playwrightReportSchema = z.object({
  stats: z.object({
    expected: z.number().int().nonnegative(),
    unexpected: z.number().int().nonnegative(),
    flaky: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  suites: z.array(reportSuiteSchema),
});

// ---------- C3: webhook body (Discord reads `content`, Slack reads `text`) ----------
export const webhookPayloadSchema = z
  .object({ content: z.string().min(1), text: z.string().min(1) })
  .strict()
  .refine((payload) => payload.content === payload.text, {
    message: 'content and text must carry the same message',
  });
