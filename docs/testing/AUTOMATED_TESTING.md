# Automated Testing

Cognaxis is protected by four test layers. A behavior is tested at the lowest layer that can
prove it reliably; browser tests cover what a user can see and click, not every internal branch.

| Layer | Tool | Command | What lives here |
|---|---|---|---|
| Unit + component | Vitest, Testing Library | `npm test` | Schemas, dates/periods, role matrix, services, repositories (in-memory twins), hooks, dialogs, components |
| API integration | Vitest + Supertest | `npm test` | Authentication, validation, owner boundaries, RBAC, error contracts, rate limits, concurrency races with controllable barriers |
| Firebase emulator | Emulator Suite + rules-unit-testing | `npm run test:emulator` | Deny-all Security Rules, real Firestore repository transactions and races |
| Browser end-to-end | Playwright (Chromium) | `npm run test:e2e` | Visible journeys: public pages, auth, journal, check-ins, insights, maps, organizations, admin, settings; plus accessibility scans and keyboard paths |

## Command surface

```
npm test                 unit, component, and API integration suite
npm run test:e2e         local Chromium functional suite (starts everything itself)
npm run test:e2e:headed  the same suite in a visible browser
npm run test:e2e:ui      Playwright UI mode
npm run test:all         typecheck, lint, unit/API tests, build, security check, browser suite
npm run test:emulator    optional: Security Rules + Firestore repository tests (needs Java)
npm run test:prod-smoke  explicitly invoked smoke of the published Cloud Run URL
```

There is no CI/CD pipeline: publishing happens from Google AI Studio, and every suite above is
local development tooling. Nothing here is required to deploy; run what is useful before
pushing.

## End-to-end architecture

`npm run test:e2e` launches, in order, with no manual steps:

1. A build of the real browser bundle into `dist/client` with a synthetic demo configuration
   (`demo-cognaxis-e2e`), the Auth-emulator flag, and the deterministic Maps adapter compiled in
   (`tests/e2e/support/global-setup.ts`). Run `npm run build` afterwards if you need a deployable
   bundle again.
2. The Firebase **Auth emulator** (`firebase-tools` dev dependency; no Java needed) — the browser
   performs real Firebase sign-up/sign-in against it.
3. The **end-to-end server** (`tests/e2e/support/e2e-server.ts`): the production `createApp`
   pipeline — middleware, CSP, rate limits, static serving — with only the outermost
   integrations substituted through the existing dependency-injection seams: in-memory
   repositories, deterministic Gemini models, and token verification against the Auth emulator.

Safety guards, all enforced in code:

- The server refuses to start without `FIREBASE_AUTH_EMULATOR_HOST`, builds its configuration
  from fixed literals (never the developer's shell), keeps the `demo-` project prefix the
  Firebase CLI recognises as emulator-only, and drops ambient Google credentials.
- The browser connects to the Auth emulator only when the flag was compiled in **and** the page
  is served from a loopback host; deployed builds never define the flag.
- Every test context blocks requests to non-loopback hosts, so the suite cannot contact real
  Google services by accident, and fails on unexpected browser console errors.
- Deterministic model markers (`[e2e:model-error]`, `[e2e:model-slow]`) exercise failure and
  in-flight states without timing tricks; `localStorage["cognaxis.e2e.maps"]="fail"` exercises
  the maps fallback.
- Each test creates its own synthetic accounts (unique emails) against the emulator; a seeded
  super admin (`superadmin@cognaxis-e2e.test`) exists only inside the test stack.
- Per-user server rate limits stay fully active; each test presents a unique synthetic client IP
  the same way distinct real clients would appear behind Cloud Run's proxy.

## Java for the emulator suite

The Firestore emulator requires a Java runtime (the Auth emulator used by the browser suite does
not, so `npm run test:e2e` never needs Java). Either install a JRE (e.g.
`brew install --cask temurin@21`) or use a self-contained one:

```
export JAVA_HOME="$(echo "$PWD"/.tools/*/Contents/Home)"   # if a JRE was unpacked into .tools/
export PATH="$JAVA_HOME/bin:$PATH"
npm run test:emulator
```

## Production smoke

`npm run test:prod-smoke` is separate from every local/CI gate and never runs automatically. It
requires explicit environment values:

```
PROD_SMOKE_BASE_URL   the deployed Cloud Run URL
PROD_SMOKE_EMAIL      a dedicated synthetic email/password account created only for testing
PROD_SMOKE_PASSWORD   its password (from protected secrets, never committed)
PROD_SMOKE_LIVE_AI=1  optionally send one harmless synthetic Gemini message
```

It loads public pages, signs in with the dedicated account only, creates at most one reflection
prefixed with a unique run id, deletes it through the visible flow, and verifies the ordinary
account cannot open the admin area. If cleanup fails it prints the run id and fails the test.
Never point it at a real person's account. Real Google OAuth, verification-mail delivery, and
invitation-mail delivery remain manual checks.

## Test-driven change workflow

1. Reproduce the bug or describe the new behavior with the smallest failing test, at the lowest
   layer that can prove it.
2. Confirm it fails for the right reason, make the smallest change, and run the focused test.
3. Run the surrounding module's tests, then `npm run test:all` before pushing.
4. Add a browser test only when the user can observe the behavior.

## Stability rules

- E2E tests run with one worker, are order-independent, and never reuse another test's records.
- No arbitrary sleeps: tests wait on visible state, URL changes, or deterministic gates.
- No retries anywhere: the root cause of any flake must be fixed, not hidden.
- Unexpected browser console errors fail the test that produced them.
- Before declaring the suite stable, the complete normal suite must pass five consecutive runs.

## Intentionally not automated in the browser

- The full role/action matrix, token matrices, idempotency, cross-user and concurrency cases —
  covered deterministically at unit/API level.
- The admin "Unavailable" metric state and the maps "not configured" fallback branch — both need
  build- or failure-time variation and stay covered by component tests.
- Real Google account login, real inbox flows, load testing, cross-engine browser sweeps.
