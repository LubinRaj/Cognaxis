import { expect, test, type Page } from "@playwright/test";

// Explicitly invoked deployed-environment smoke suite: `npm run test:prod-smoke` with
//   PROD_SMOKE_BASE_URL   the deployed Cloud Run URL (required)
//   PROD_SMOKE_EMAIL      a dedicated synthetic email/password test account (optional; the
//   PROD_SMOKE_PASSWORD   authenticated journey is skipped without it)
//   PROD_SMOKE_LIVE_AI=1  additionally send one harmless synthetic Gemini message (optional)
//
// This suite deliberately does NOT use the hermetic local fixtures: it talks to the real
// deployment and real Google services. It only ever touches the one session it created itself —
// identified by the exact id captured from the creation response and associated with a unique
// run id — through the signed-in dedicated account's own UI. It never uses a real person's
// account or data, and cleanup can never reach any other record.

const baseUrl = process.env.PROD_SMOKE_BASE_URL ?? "";
const accountEmail = process.env.PROD_SMOKE_EMAIL ?? "";
const accountPassword = process.env.PROD_SMOKE_PASSWORD ?? "";
const runId = `e2e-${Date.now().toString(36)}`;

async function signInDedicatedAccount(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/`);
  await page.getByRole("banner").getByRole("button", { name: "Sign in" }).click();
  const form = page.locator("form");
  await form.getByLabel("Email").fill(accountEmail);
  await form.getByLabel("Password", { exact: true }).fill(accountPassword);
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app\/journal$/);
}

async function deleteOpenSessionThroughUi(page: Page): Promise<void> {
  await page.getByRole("button", { name: "More reflection actions" }).click();
  await page.getByRole("menuitem", { name: "Delete reflection" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete reflection" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

// A deleted session must be unreachable through its own deep link: the workspace never opens it,
// so the session actions control does not appear and no conversation is rendered.
async function sessionIsGone(page: Page, sessionId: string): Promise<boolean> {
  await page.goto(`${baseUrl}/app/journal?session=${sessionId}`);
  await expect(page.getByRole("main")).toBeVisible();
  const stillOpens = await page
    .getByRole("button", { name: "More reflection actions" })
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  const renderedMessages = await page.getByRole("article").count();
  return !stillOpens && renderedMessages === 0;
}

test.describe("production smoke", () => {
  test.skip(
    process.env.PROD_SMOKE !== "1" || baseUrl === "",
    "invoked only via npm run test:prod-smoke with PROD_SMOKE_BASE_URL set",
  );

  test("public surfaces respond with application HTML and no severe console errors", async ({
    page,
  }) => {
    const health = await page.request.get(`${baseUrl}/api/health`);
    expect(health.status()).toBe(200);

    const severeErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") severeErrors.push(message.text());
    });

    for (const path of ["/", "/privacy", "/terms", "/app/journal"]) {
      const response = await page.goto(`${baseUrl}${path}`);
      expect(response?.status(), `status for ${path}`).toBeLessThan(500);
      await expect(page.locator("#root > *").first()).toBeVisible();
    }
    expect(severeErrors).toEqual([]);
  });

  test("a dedicated synthetic account can write, reload, and clean up one reflection", async ({
    page,
  }) => {
    test.skip(accountEmail === "" || accountPassword === "", "no dedicated test account configured");

    await signInDedicatedAccount(page);

    let sessionId = "";
    let cleanedUp = false;
    try {
      // Create exactly one session and capture its id from the creation response, so cleanup
      // can only ever target this record.
      const [creationResponse] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes("/api/v1/sessions") &&
            response.request().method() === "POST" &&
            response.status() < 300,
        ),
        page
          .getByRole("button", {
            name: /New reflection|Start your first reflection|Start a reflection/,
          })
          .first()
          .click(),
      ]);
      const creationBody = (await creationResponse.json()) as { session?: { id?: string } };
      sessionId = creationBody.session?.id ?? "";
      expect(sessionId, "the creation response must contain the new session id").not.toBe("");
      console.log(`production smoke run ${runId}: created session ${sessionId} for ${accountEmail}`);

      const composer = page.getByLabel("Write your reflection");
      await expect(composer).toBeVisible();

      if (process.env.PROD_SMOKE_LIVE_AI === "1") {
        await composer.fill(`${runId}: a harmless synthetic smoke-test message.`);
        await page.getByRole("button", { name: "Send message" }).click();
        await expect(page.getByRole("article", { name: "Message from Cognaxis" })).toBeVisible({
          timeout: 30_000,
        });
        await page.reload();
        await expect(page.getByText(runId)).toBeVisible();
      }

      // Delete through the visible confirmation flow and prove the session is really gone.
      await deleteOpenSessionThroughUi(page);
      expect(
        await sessionIsGone(page, sessionId),
        `session ${sessionId} must be unreachable after deletion`,
      ).toBe(true);
      cleanedUp = true;

      // The ordinary test account must not reach the admin surface.
      await page.goto(`${baseUrl}/app/admin`);
      await expect(
        page.getByRole("heading", { name: "Platform administration is not available" }),
      ).toBeVisible();
    } finally {
      // Narrow best-effort cleanup: only the exact session this run created, only through the
      // signed-in dedicated account's own UI. Nothing else can be affected.
      if (!cleanedUp && sessionId !== "") {
        try {
          await page.goto(`${baseUrl}/app/journal?session=${sessionId}`);
          const stillOpens = await page
            .getByRole("button", { name: "More reflection actions" })
            .isVisible({ timeout: 5_000 })
            .catch(() => false);
          if (stillOpens) {
            await deleteOpenSessionThroughUi(page);
          }
          cleanedUp = await sessionIsGone(page, sessionId);
        } catch {
          // The failure report below carries every identifier needed for manual cleanup.
        }
      }
      if (!cleanedUp) {
        console.error(
          `PRODUCTION SMOKE CLEANUP FAILED: session "${sessionId || "unknown"}" created by run ` +
            `${runId} and owned by ${accountEmail} may remain and must be removed manually.`,
        );
      }
    }
    expect(
      cleanedUp,
      `cleanup incomplete: session "${sessionId}", run ${runId}, account ${accountEmail}`,
    ).toBe(true);
  });

  test("maps either loads or presents the documented list fallback", async ({ page }) => {
    test.skip(accountEmail === "" || accountPassword === "", "no dedicated test account configured");

    await signInDedicatedAccount(page);
    await page.goto(`${baseUrl}/app/map`);
    await expect(
      page
        .getByRole("heading", { name: "Map", exact: true })
        .or(page.getByText("The interactive map is not configured"))
        .first(),
    ).toBeVisible();
  });
});
