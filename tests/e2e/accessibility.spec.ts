import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { createVerifiedUser } from "./support/accounts";
import { scanForSeriousViolations } from "./support/axe";
import { SUPER_ADMIN } from "./support/env";
import { openSignInScreen, sendMessage, signIn, signOut, startReflection } from "./support/ui";

async function expectNoSeriousViolations(page: Page, surface: string): Promise<void> {
  const violations = await scanForSeriousViolations(page);
  expect(
    violations.map(
      (violation) =>
        `${surface}: [${violation.impact}] ${violation.id} — ${violation.help} @ ${JSON.stringify(
          violation.nodes.map((node) => node.target),
        )}`,
    ),
    `serious or critical accessibility violations on ${surface}`,
  ).toEqual([]);
}

test.describe("accessibility scans", () => {
  test("public surfaces pass the serious/critical scan", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Think freely/ })).toBeVisible();
    await expectNoSeriousViolations(page, "landing");

    await openSignInScreen(page);
    await expectNoSeriousViolations(page, "authentication");
  });

  test("personal workspace, check-in dialog, and insights pass the scan", async ({ page }) => {
    const account = await createVerifiedUser("axepersonal");
    await signIn(page, account);
    await startReflection(page);
    await sendMessage(page, "An accessible reflection.");
    await expect(page.getByText("Test reflection response 1")).toBeVisible();
    await expectNoSeriousViolations(page, "journal workspace");

    await page.getByRole("button", { name: "Add reflection check-in" }).click();
    await expect(page.getByRole("heading", { name: "Reflection check-in" })).toBeVisible();
    await expectNoSeriousViolations(page, "check-in dialog");
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.goto("/app/insights");
    await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
    await expectNoSeriousViolations(page, "insights dashboard");
  });

  test("organization and admin surfaces pass the scan", async ({ page }) => {
    const owner = await createVerifiedUser("axeorg");
    await signIn(page, owner);
    await page.goto("/app/organizations");
    await page.getByRole("button", { name: "New organization" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill("Accessible Org");
    await dialog.getByRole("button", { name: "Create organization" }).click();
    await expect(page.getByRole("heading", { name: "Accessible Org" })).toBeVisible();

    await page.getByRole("tab", { name: /Members/ }).click();
    await expectNoSeriousViolations(page, "organization members");
    await page.getByRole("tab", { name: "Invites" }).click();
    await expect(page.getByRole("heading", { name: "Invite someone" })).toBeVisible();
    await expectNoSeriousViolations(page, "organization invites");

    await page.goto("/app/journal");
    await signOut(page, owner);
    await signIn(page, SUPER_ADMIN);
    await page.goto("/app/admin");
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
    await expectNoSeriousViolations(page, "admin overview");

    await page.getByRole("tab", { name: "Users" }).click();
    await page.getByLabel("Find by exact email or user ID").fill(owner.email);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: `Manage ${owner.email}` }).click();
    await page.getByRole("menuitem", { name: "Suspend application access" }).click();
    await expect(page.getByRole("heading", { name: "Suspend this account?" })).toBeVisible();
    await expectNoSeriousViolations(page, "admin confirmation dialog");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  });
});

test.describe("keyboard interaction", () => {
  test("dialogs trap focus and restore it on escape", async ({ page }) => {
    const account = await createVerifiedUser("keyboard");
    await signIn(page, account);
    await startReflection(page);

    const trigger = page.getByRole("button", { name: "Add reflection check-in" });
    await trigger.click();
    await expect(page.getByRole("heading", { name: "Reflection check-in" })).toBeVisible();

    // Focus starts inside the dialog and tabbing stays inside it.
    const inDialog = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return dialog?.contains(document.activeElement) ?? false;
      });
    expect(await inDialog()).toBe(true);
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      expect(await inDialog()).toBe(true);
    }

    // Escape closes the dialog and returns focus to the opening control.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Reflection check-in" })).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("the theme menu opens, selects, and dismisses from the keyboard", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: /Change theme/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Theme" });
    await expect(menu).toBeVisible();

    await menu.getByRole("menuitemradio", { name: "Dark" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("the skip link and Enter-to-send keep the journal fully keyboard operable", async ({
    page,
  }) => {
    const account = await createVerifiedUser("kbjournal");
    await signIn(page, account);
    await startReflection(page);

    // The skip link stays invisible until keyboard focus reaches it, then jumps straight to the
    // reflection content when activated.
    const skipLink = page.getByRole("link", { name: "Skip to your reflection" });
    await expect(skipLink).not.toBeInViewport();
    await skipLink.focus();
    await expect(skipLink).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#reflection-main$/);

    // Enter submits the composer; Shift+Enter does not.
    const composer = page.getByLabel("Write your reflection");
    await composer.focus();
    await composer.pressSequentially("A keyboard-only thought");
    await page.keyboard.press("Shift+Enter");
    await composer.pressSequentially("with a second line");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Test reflection response 1")).toBeVisible();
  });
});
