# Record & replay tools tried on testover

Thai: [traffic-recording.md](traffic-recording.md)

This page summarises what happened when three tools were tried on this project's API (13 endpoints, spec in [contracts/openapi.yaml](../contracts/openapi.yaml)) and what each is good for. Not every tool that was mentioned was tried (see the last section).

## In short

| Tool | What it does | What actually happened | Keep using it? |
|---|---|---|---|
| **Prism** (proxy mode) | Validates every request and response of the real API against the spec | All 9 cases of `api.spec.ts` passed, no response broke the spec, and it was shown to catch drift | **Yes**, to keep spec and code in step |
| **Playwright `routeFromHAR`** | Records one conversation with the API and replays it to the page with no backend | Records, replays, and unrecorded requests are cut off visibly | **Yes**, for read-only flows |
| **Mockoon** | Builds a mock server from the spec | Imported all 13 routes, but generated values are blank and it keeps no state | Fine for front-end development; not in the test suite yet |

## 1. Prism: does the real API match the spec?

```bash
npm run contract:prism
```

[scripts/prism-check.mjs](../scripts/prism-check.mjs) starts the app on a free port, puts Prism in front of it (proxy mode), runs `tests/contracts/api.spec.ts` through Prism, and fails if Prism saw a **response** that breaks the spec. The first run needs internet (npx downloads Prism).

- Result: 9 cases passed and no response broke the spec.
- Does it bite? Yes. A copy of the spec with `done` removed from Task made Prism complain at once: `Response body must NOT have additional properties; found 'done'` (spec and code disagreeing).
- Worth knowing: Prism validates **requests** too. Cases that send bad input on purpose (to see the error answers) therefore produce "request violations" as a matter of course, so the script looks only at responses. With `--errors`, Prism answers with its own error instead of the server's, which breaks the error-path tests although nothing is wrong.
- Limit: it only checks what the tests call. An endpoint with no test is invisible to it.

## 2. HAR: replay the conversation to the page

```bash
npm run test:har      # replay (no API needed)
npm run har:record    # re-record from the real server
```

[tests/har/replay.spec.ts](../tests/har/replay.spec.ts) uses `page.routeFromHAR` on `**/api/**`. The recording is `tests/har/fixtures/demo-journey.har` (4 requests: sign in, profile, tasks, profile again).

- During replay the browser never touches `/api`, yet the task board renders fully, so the front end can be tested apart from the back end.
- `notFound: 'abort'` is set, so when the page asks for something that was not recorded (for example adding a task) it fails visibly. The second case in the file proves it. Use it as an alarm that the front end has started talking to the API differently.
- Limit: a HAR holds only "what the server said that day". A sequence where state changes (add a task, then list) cannot be replayed correctly, so it suits read-only flows, and it does not test the back end at all.
- The data in this HAR is made up (the demo account, tokens that are long dead). If you record from a real system, strip tokens and passwords before committing.

## 3. Mockoon: a mock server from the spec

```bash
npx @mockoon/cli import --input contracts/openapi.yaml --output mocks/mockoon.json
npx @mockoon/cli start --data mocks/mockoon.json --port 3001
```

- All 13 routes were imported with a response per status in the spec (file [mocks/mockoon.json](../mocks/mockoon.json)).
- Example values come out blank, for instance `"username": ""`, which breaks our own schema (`username` must be 3-20 characters). The examples have to be edited by hand to be useful.
- The mock keeps no state: a wrong password still gets 201 and the task list is random. It cannot exercise real flows. It is good for keeping a front end moving while the back end is unfinished.
- So it is not wired into CI.

## Not tried, and why

- **Speedscale / Akita** are built to sit as a sidecar and capture the traffic of a multi-service staging environment. This project has one server and no staging, so they would not pay off here. Both need an account or infrastructure from the vendor, and Akita has been folded into Postman, so check its current status before deciding.

## Takeaway

The claim in the original text, "capture traffic and get regression tests for free", is only partly true: a HAR gives a repeatable result but tests nothing on the back end, and an auto-generated mock still needs a person to tune it. The most useful of the three was Prism, because it works from a spec written as an agreement beforehand rather than from recorded traffic.
