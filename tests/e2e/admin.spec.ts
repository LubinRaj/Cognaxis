import type { Page } from "@playwright/test";
import { expect, hardenContext, test } from "./fixtures/test";
import { createVerifiedUser } from "./support/accounts";
import { SUPER_ADMIN } from "./support/env";
import { sendMessage, signIn, startReflection } from "./support/ui";

const CANARY = "CANARY-E2E-PRIVATE-JOURNAL-PHRASE";
const REASON = "Automated end-to-end verification run";

async function confirmWithReason(page: Page, confirmLabel: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Operational reason").fill(REASON);
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await expect(page.getByText("Change applied and recorded in the audit trail.")).toBeVisible();
}

test.describe("super admin", () => {
  test("an ordinary user has no admin surface", async ({ page }) => {
    const account = await createVerifiedUser("ordinary");
    await signIn(page, account);

    const nav = page.getByRole("navigation", { name: "Cognaxis sections" }).first();
    await expect(nav.getByRole("link", { name: "Journal" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);

    await page.goto("/app/admin");
    await expect(
      page.getByRole("heading", { name: "Platform administration is not available" }),
    ).toBeVisible();
  });

  test("suspends and restores a user with an audited reason, exposing no private content", async ({
    page,
    browser,
  }) => {
    const target = await createVerifiedUser("target");

    // The target user writes private journal content containing a canary phrase, in their own
    // session.
    const targetContext = await browser.newContext();
    const targetReport = await hardenContext(targetContext, /Failed to load resource/);
    const targetPage = await targetContext.newPage();
    await signIn(targetPage, target);
    await startReflection(targetPage);
    await sendMessage(targetPage, `A private thought: ${CANARY}`);
    await expect(targetPage.getByText("Test reflection response 1")).toBeVisible();

    // Capture every admin API response body for the canary check. The promises are collected
    // and awaited before the assertion so no body is still unread — and a body that cannot be
    // read is itself a failure, never a silent gap in coverage.
    const adminBodyPromises: Array<Promise<string>> = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/admin")) {
        adminBodyPromises.push(
          response.text().catch((error: unknown) => {
            throw new Error(
              `could not read the admin response body for ${response.url()}: ${String(error)}`,
            );
          }),
        );
      }
    });

    await signIn(page, SUPER_ADMIN);
    const nav = page.getByRole("navigation", { name: "Cognaxis sections" }).first();
    await nav.getByRole("link", { name: "Admin" }).click();
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
    await expect(page.getByText("Application users")).toBeVisible();
    await expect(page.getByText("Active organizations")).toBeVisible();

    // Directory search finds the target; suspension requires a written reason.
    await page.getByRole("tab", { name: "Users" }).click();
    await page.getByLabel("Find by exact email or user ID").fill(target.email);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText(target.email).first()).toBeVisible();

    await page.getByRole("button", { name: `Manage ${target.email}` }).click();
    await page.getByRole("menuitem", { name: "Suspend application access" }).click();
    await expect(page.getByRole("heading", { name: "Suspend this account?" })).toBeVisible();
    await confirmWithReason(page, "Suspend");
    await expect(page.getByText("suspended", { exact: true }).first()).toBeVisible();

    // The suspended user's live session is cut off on its next request.
    await targetPage.reload();
    await expect(
      targetPage.getByRole("heading", { name: "This account is suspended" }),
    ).toBeVisible();
    await expect(targetPage.getByRole("button", { name: "Sign out" })).toBeVisible();

    // Restore access.
    await page.getByRole("button", { name: `Manage ${target.email}` }).click();
    await page.getByRole("menuitem", { name: "Restore application access" }).click();
    await expect(page.getByRole("heading", { name: "Restore this account?" })).toBeVisible();
    await confirmWithReason(page, "Restore");

    await targetPage.reload();
    await expect(targetPage.getByText("Test reflection response 1")).toBeVisible();

    // Both mutations are in the audit trail with the operational reason.
    await page.getByRole("tab", { name: "Audit" }).click();
    await expect(page.getByText(`Reason: ${REASON}`).first()).toBeVisible();

    // No private journal content leaked into the admin DOM or any admin response body.
    await expect(page.locator("body")).not.toContainText(CANARY);
    const adminBodies = await Promise.all(adminBodyPromises);
    expect(adminBodies.length).toBeGreaterThan(0);
    expect(adminBodies.some((body) => body.includes(CANARY))).toBe(false);
    expect(targetReport.errors).toEqual([]);
    await targetContext.close();
  });

  test("suspends and restores an organization", async ({ page, browser }) => {
    const owner = await createVerifiedUser("orgowner");

    const ownerContext = await browser.newContext();
    const ownerReport = await hardenContext(ownerContext, /Failed to load resource/);
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, owner);
    await ownerPage.goto("/app/organizations");
    await ownerPage.getByRole("button", { name: "New organization" }).first().click();
    const createDialog = ownerPage.getByRole("dialog");
    await createDialog.getByLabel("Name", { exact: true }).fill("Suspendable Org");
    await createDialog.getByRole("button", { name: "Create organization" }).click();
    await expect(ownerPage.getByRole("heading", { name: "Suspendable Org" })).toBeVisible();

    await signIn(page, SUPER_ADMIN);
    await page.goto("/app/admin");
    await page.getByRole("tab", { name: "Organizations" }).click();
    const orgRow = page.locator("li", { hasText: "Suspendable Org" });
    await orgRow.getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByRole("heading", { name: "Suspend this organization?" })).toBeVisible();
    await confirmWithReason(page, "Suspend");
    await expect(orgRow).toContainText("suspended");

    await ownerPage.reload();
    await expect(
      ownerPage.getByRole("heading", { name: "This organization is suspended" }),
    ).toBeVisible();

    await orgRow.getByRole("button", { name: "Restore" }).click();
    await confirmWithReason(page, "Restore");

    await ownerPage.reload();
    await expect(ownerPage.getByRole("heading", { name: "Suspendable Org" })).toBeVisible();

    expect(ownerReport.errors).toEqual([]);
    await ownerContext.close();
  });
});
