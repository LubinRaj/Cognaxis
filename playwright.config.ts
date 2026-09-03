/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";
import { AUTH_EMULATOR_HOST, E2E_BASE_URL, E2E_PROJECT_ID } from "./tests/e2e/support/env";

// Chromium-only by design: the suite favours a small, fast, stable matrix. Firefox/WebKit can be
// added once this suite has proven itself. The production-smoke project never starts local
// servers and is selected only by `npm run test:prod-smoke` with PROD_SMOKE=1.
const productionSmoke = process.env.PROD_SMOKE === "1";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  globalSetup: productionSmoke ? undefined : "./tests/e2e/support/global-setup",
  fullyParallel: false,
  // Tests mutate shared server-side state, so they run strictly one at a time.
  workers: 1,
  // No retries: a flaky test must be fixed, not hidden.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: productionSmoke ? process.env.PROD_SMOKE_BASE_URL : E2E_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "functional",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/production-smoke.spec.ts"],
    },
    {
      name: "production-smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/production-smoke.spec.ts",
    },
  ],
  webServer: productionSmoke
    ? undefined
    : [
        {
          command: `npx firebase emulators:start --only auth --project ${E2E_PROJECT_ID}`,
          url: `http://${AUTH_EMULATOR_HOST}/`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "ignore",
          gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
        },
        {
          command: "npx tsx tests/e2e/support/e2e-server.ts",
          url: `${E2E_BASE_URL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR_HOST },
          gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
        },
      ],
});
