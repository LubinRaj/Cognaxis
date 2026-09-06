import { expect, hardenContext, test } from "./fixtures/test";
import { createVerifiedUser } from "./support/accounts";
import { MODEL_ERROR_TRIGGER, MODEL_SLOW_TRIGGER } from "./support/deterministic-models";
import { expectAssistantReply, sendMessage, signIn, startReflection } from "./support/ui";

test.describe("personal journal", () => {
  test("personal memory refreshes, answers with evidence, and remains isolated from another user", async ({ page, browser }) => {
    const owner = await createVerifiedUser("memoryowner");
    const stranger = await createVerifiedUser("memorystranger");
    await signIn(page, owner);
    await startReflection(page);
    await sendMessage(page, "I decided to ship the onboarding checklist on Friday.");
    await expectAssistantReply(page, "Test reflection response 1");

    await page.goto("/app/ask");
    await page.getByRole("button", { name: "Refresh saved memory" }).click();
    await expect(page.getByText(/recent capture.*ready to search/i)).toBeVisible();
    await page.getByLabel("What would you like to remember or understand?").fill("When is the onboarding checklist planned?");
    await page.getByRole("button", { name: "Ask me", exact: true }).click();
    await expect(page.getByText("A grounded personal memory answer.")).toBeVisible();
    await expect(page.getByText(/Based on your reflections/)).toBeVisible();

    const strangerContext = await browser.newContext();
    const strangerReport = await hardenContext(strangerContext, /Failed to load resource/);
    const strangerPage = await strangerContext.newPage();
    await signIn(strangerPage, stranger);
    await strangerPage.goto("/app/ask");
    await strangerPage.getByLabel("What would you like to remember or understand?").fill("When is the onboarding checklist planned?");
    await strangerPage.getByRole("button", { name: "Ask me", exact: true }).click();
    await expect(strangerPage.getByText(/couldn't find enough/i)).toBeVisible();
    await expect(strangerPage.getByText("A grounded personal memory answer.")).toHaveCount(0);
    expect(strangerReport.errors).toEqual([]);
    await strangerContext.close();
  });

  test("one complete journey: write, converse, persist, summarize, and delete", async ({
    page,
  }) => {
    const account = await createVerifiedUser("journal");
    await signIn(page, account);
    await startReflection(page);

    // Media stays in the same private session scope and is submitted explicitly with the text.
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "context.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(page.getByText("Image attached")).toBeVisible();

    // Two exchanges with the deterministic assistant, in visible order.
    await sendMessage(page, "First thought about my day.");
    await expectAssistantReply(page, "Test reflection response 1");
    await expect(page.getByRole("img", { name: "Attached image" })).toBeVisible();
    await sendMessage(page, "A second, deeper thought.");
    await expectAssistantReply(page, "Test reflection response 2");

    const articles = page.getByRole("article");
    await expect(articles).toHaveCount(4);
    await expect(articles.nth(0)).toContainText("First thought about my day.");
    await expect(articles.nth(1)).toContainText("Test reflection response 1");
    await expect(articles.nth(2)).toContainText("A second, deeper thought.");
    await expect(articles.nth(3)).toContainText("Test reflection response 2");

    // The conversation survives a full reload.
    await page.reload();
    await expect(page.getByRole("article")).toHaveCount(4);
    await expectAssistantReply(page, "Test reflection response 2");
    await expect(page.getByRole("img", { name: "Attached image" })).toBeVisible();

    // Reopen the same session through the visible history.
    const history = page.getByRole("navigation", { name: "Reflection history" }).first();
    await expect(history.getByRole("heading", { name: /Recent reflections \(1\)/ })).toBeVisible();
    await history.getByRole("list").getByRole("button").first().click();
    await expect(page.getByRole("article")).toHaveCount(4);

    // Deterministic summary.
    await page.getByRole("button", { name: "Create summary" }).first().click();
    const summary = page.locator("section", {
      has: page.getByRole("heading", { name: "Reflection summary" }),
    });
    await expect(summary.getByText("A deterministic summary produced for automated end-to-end tests.")).toBeVisible();
    await expect(summary.getByRole("heading", { name: "Themes" })).toBeVisible();
    await expect(summary.getByText("clarity")).toBeVisible();

    // Delete through the confirmation dialog and confirm it is gone everywhere.
    await page.getByRole("button", { name: "More reflection actions" }).click();
    await page.getByRole("menuitem", { name: "Delete reflection" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Delete this reflection?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Delete reflection" }).click();

    await expect(page.getByRole("heading", { name: "Start your first reflection" })).toBeVisible();
    await expect(history.getByRole("heading", { name: /Recent reflections \(0\)/ })).toBeVisible();

    // A deleted session cannot be reopened from a stale deep link either.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Start your first reflection" })).toBeVisible();
  });

  test("submit controls are disabled while a request is in flight", async ({ page }) => {
    const account = await createVerifiedUser("inflight");
    await signIn(page, account);
    await startReflection(page);

    await sendMessage(page, `${MODEL_SLOW_TRIGGER} Take your time with this.`);

    // While the deterministic model holds the reply open, the composer reports the wait and the
    // pending indicator is visible; a second send is impossible.
    await expect(page.getByTestId("response-pending")).toBeVisible();
    await expect(page.getByLabel("Write your reflection")).toBeDisabled();

    await expectAssistantReply(page, "Test reflection response 1");
    await expect(page.getByLabel("Write your reflection")).toBeEnabled();
  });

  test.describe("model failure", () => {
    test.use({ expectedConsoleErrors: /Failed to load resource/ });

    test("a failed reply keeps the user's input recoverable", async ({ page }) => {
      const account = await createVerifiedUser("modelfail");
      await signIn(page, account);
      await startReflection(page);

      const failingMessage = `${MODEL_ERROR_TRIGGER} An important thought that must not be lost.`;
      await sendMessage(page, failingMessage);

      await expect(page.getByText(/could not be sent|could not be completed/i).first()).toBeVisible();

      // The message did not silently persist, and the text is still available to retry.
      const composer = page.getByLabel("Write your reflection");
      const composerValue = await composer.inputValue();
      const visibleFailedText = page.getByText("An important thought that must not be lost.");
      expect(
        composerValue.includes("An important thought that must not be lost.") ||
          (await visibleFailedText.count()) > 0,
        "the failed input must remain recoverable on screen or in the composer",
      ).toBe(true);

      // The conversation contains no assistant reply for the failed exchange.
      await expect(page.getByRole("article", { name: "Message from Cognaxis" })).toHaveCount(0);
    });
  });
});
