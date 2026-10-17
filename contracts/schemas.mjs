// Executable contracts for the boundaries the project crosses.
//   C1 localStorage data written/read by app/index.html (session token and theme)
//   C2 the slice of Playwright's JSON report that scripts/notify.mjs reads
//   C3 the body POSTed to the webhook
//   C4 the JSON the API (app/api/) sends to the browser
// Plain ESM so node:test (unit/) and Playwright (tests/) can both import it.
import { z } from 'zod';

// ---------- C1: localStorage (the browser keeps only the session token and the theme) ----------
export const PRIORITY_VALUES = ['low', 'medium', 'high'];

export const storageKeys = {
  session: 'tb.session',
  theme: 'tb.theme',
};

/** `tb.session`: the bearer token the API issued at login or registration. */
export const sessionTokenSchema = z.string().uuid();

/** `tb.theme` */
export const themeSchema = z.enum(['light', 'dark']);

// ---------- C4: JSON API (see contracts/openapi.yaml) ----------
// Strict on purpose: a new field in a response must be a conscious contract change,
// and `.parse()` must not silently strip it before a test compares the result.
const isTrimmed = (value) => value === value.trim();

/** Mirrors USERNAME_RE in app/api/validation.mjs. */
export const usernameSchema = z.string().regex(/^[a-z0-9_]{3,20}$/);

export const userSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().min(1).refine(isTrimmed, 'displayName must be trimmed'),
  })
  .strict();

export const sessionResponseSchema = z.object({ token: sessionTokenSchema, user: userSchema }).strict();

export const taskSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().min(1).max(80).refine(isTrimmed, 'title must be trimmed'), // MAX_TITLE = 80
    priority: z.enum(PRIORITY_VALUES),
    done: z.boolean(),
  })
  .strict();

export const tasksResponseSchema = z.object({ tasks: z.array(taskSchema) }).strict();

export const errorResponseSchema = z
  .object({
    error: z
      .object({ code: z.string().min(1), message: z.string().min(1), details: z.array(z.string()).optional() })
      .strict(),
  })
  .strict();

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
