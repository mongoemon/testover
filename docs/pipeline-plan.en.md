# Pipeline plan by time window

[ไทย](pipeline-plan.md) · Tag guide: [tags.md](tags.md) (Thai, section 8: Priority)

This page answers "which tests should run when", using the tags `@p0`, `@p1` and `@p2` to pick the set.
Every number was measured, not guessed, except where it says "estimate".

## 1. What was measured

| What | Result | Measured on |
|---|---|---|
| `@p0` | 17 cases, 6.1 s | local machine, 2 workers, retries 0 |
| `@p0` + `@p1` | 120 cases, 22.6 s | same |
| everything except `@visual` | 151 cases, 32.5 s | same |
| unit | 122 cases, ~6 s | `node --test` |
| Latest passing PR (Smoke) | whole run 2 min 8 s, the `smoke` check done at 1 min 45 s | GitHub Actions run 39194593232 (2026-10-19) |

Job times in that run:

| Job | Setup (npm ci + browser) | Actual tests |
|---|---:|---:|
| unit | 8 s | 3 s |
| contract | 24 s | 6 s |
| smoke-e2e | 24 s | 6 s |
| characterization | 36 s | 15 s |
| report (Allure) | 10 s + Java | 6 s |

**The key finding:** all tests together take under 40 seconds, yet a PR waits 1 min 45 s because
(1) every job installs everything again (24–36 s) and (2) jobs run in a chain (unit/contract → smoke-e2e/characterization).
The bottleneck today is the shape of the pipeline, not the number of tests. Priorities prepare the suite for growth;
today's speed-up comes from merging jobs (section 3).

## 2. Plan by time window

| When | Trigger | What runs | Time goal | On failure |
|---|---|---|---|---|
| Before push | developer machine | `npm run test:p0` | < 20 s | fix before pushing |
| Pull request | `pull_request` | unit + `check:tags` + `@p0\|@p1` in **one job** | ~1 min (estimate) | blocks merge (required check `smoke`) |
| After merge | push to `main` | every case including `@p2` and `@visual` | ~2 min | webhook alert, fix at once |
| Weekend | cron Sat–Sun 09:00 Thailand (already exists) | everything + Allure report + Pages publish + notification | ~3 min | webhook alert |
| Before a release | `workflow_dispatch` | everything (tag can be picked: `@p0`, `@p0\|@p1`) | ~3 min | do not release |
| Flaky probe (optional) | daily cron | `@p0` repeated `--repeat-each=5` `--retries=0` | ~1 min | move the case to `@flaky` |

Why the PR runs `@p0|@p1` even though the fast tier is `@p0`: at this size `@p0|@p1` takes 22.6 s against 6.1 s for `@p0`.
That is 16 s more for almost every feature, which is worth it. Drop to `@p0` once a threshold in section 4 is hit.

## 3. Keeping it smooth

1. **One job for the PR:** install once (~30 s), then run unit followed by Playwright.
   Estimate: 30 + 3 + 23 + upload ~2 = ~1 min, down from 1 min 45 s (not yet tried on Actions).
2. **Take the Allure report off the critical path:** the `report` job already does not block the `smoke` check, but it makes the run 25 s longer.
   Build it only after merge or when tests fail.
3. **Fail fast:** run unit first inside the same job so a failure never opens a browser, and use `--max-failures=5` on PRs so a broken build does not wait for everything.
4. **`concurrency` + `cancel-in-progress`:** already there, keep it.
5. **Always tagged:** the `npm run check:tags` step in the `unit` job fails the PR when a new case has no priority or two.
6. **Flaky cases:** CI sets `retries: 2`, which hides unstable cases. `summary.mjs` already lists "Flaky" ones.
   If a case shows up repeatedly, move it out of the gate with `@flaky` and fix it. Do not add retries.

## 4. When to change the plan as the suite grows

| Symptom | Action |
|---|---|
| the PR test job passes 5 minutes | PR runs only `@p0`, `@p1` moves to after merge |
| passes 10 minutes | shard with `--shard=1/N` across a matrix and combine reports with `merge-reports` |
| `@p0` is over 20% of all cases | review: everything is turning into p0, demote cases that never catch bugs |
| a case fails at random twice in a month | tag it `@flaky` and find the cause |
| many tests but a small change | consider path filters or test impact analysis (careful: a required check must still report) |

## 5. Not done yet

- The job layout of `smoke.yml` is unchanged (merging jobs) because it is a required branch-protection check; decide together first.
- No daily cron and no `@flaky` tag yet.
- A push to `main` still runs the same set as a PR (Smoke); everything including `@p2`/`@visual` runs only on weekends or by hand. The "After merge" row is a target, not something already set up.
- The "single job" timing is an estimate and needs a real run on Actions to confirm.
