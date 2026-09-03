import { test as base, expect, type BrowserContext } from "@playwright/test";

export { expect };

// Every test context is hardened the same way:
// - requests may only reach loopback (the app under test and the Auth emulator); anything else is
//   answered with an empty success so the suite is hermetic and cannot contact real services;
// - a unique synthetic client IP is presented per test so the platform-wide IP rate limit sees
//   distinct clients, exactly as distinct real users would appear behind Cloud Run's proxy;
// - browser console errors and uncaught page errors fail the test unless a test explicitly
//   declares them expected (deliberate failure-state journeys).

let syntheticClientCounter = 0;

function nextSyntheticClientIp(): string {
  syntheticClientCounter += 1;
  const high = Math.floor(syntheticClientCounter / 200) % 200;
  const low = (syntheticClientCounter % 200) + 1;
  return `10.77.${high}.${low}`;
}

export type ConsoleErrorReport = { errors: string[] };

export async function hardenContext(
  context: BrowserContext,
  expectedConsoleErrors: RegExp | null = null,
): Promise<ConsoleErrorReport> {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": nextSyntheticClientIp() });

  await context.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });

  const report: ConsoleErrorReport = { errors: [] };
  const record = (text: string) => {
    if (!expectedConsoleErrors?.test(text)) {
      report.errors.push(text);
    }
  };
  context.on("weberror", (webError) => record(`pageerror: ${webError.error().message}`));
  context.on("console", (message) => {
    if (message.type() === "error") record(`console.error: ${message.text()}`);
  });
  return report;
}

type E2EFixtures = {
  // A single pattern (use alternation) matching console errors the test deliberately provokes.
  expectedConsoleErrors: RegExp | null;
  consoleErrors: ConsoleErrorReport;
};

export const test = base.extend<E2EFixtures>({
  expectedConsoleErrors: [null, { option: true }],

  consoleErrors: [
    async ({ context, expectedConsoleErrors }, use) => {
      const report = await hardenContext(context, expectedConsoleErrors);
      await use(report);
      expect(report.errors, "Unexpected browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});
