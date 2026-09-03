import { expect, test } from "./fixtures/test";
import { createVerifiedUser } from "./support/accounts";
import { accountMenuTrigger, signIn, startReflection } from "./support/ui";

test.describe("settings and account controls", () => {
  test.describe("timezone", () => {
    test.use({ timezoneId: "Pacific/Auckland" });

    test("the insights page offers the device timezone and persists the choice", async ({
      page,
    }) => {
      const account = await createVerifiedUser("timezone");
      await signIn(page, account);
      await startReflection(page);
      await page.getByRole("button", { name: "Add reflection check-in" }).click();
      await page
        .getByRole("radiogroup", { name: "Mood" })
        .getByRole("radio", { name: "Okay", exact: true })
        .check({ force: true });
      await page.getByRole("button", { name: "Save check-in" }).click();

      await page.goto("/app/insights");
      await expect(page.getByText("Your device reports Pacific/Auckland.")).toBeVisible();
      await page.getByRole("button", { name: "Use Pacific/Auckland" }).click();
      await expect(page.getByText("Your device reports Pacific/Auckland.")).toHaveCount(0);

      // The preference is stored server-side, so a fresh load no longer nudges.
      await page.reload();
      await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
      await expect(page.getByText("Your device reports Pacific/Auckland.")).toHaveCount(0);
    });
  });

  test("the account menu controls theme, explains protection, and dismisses from the keyboard", async ({
    page,
  }) => {
    const account = await createVerifiedUser("accountmenu");
    await signIn(page, account);

    // Theme switch through the account menu applies immediately.
    await accountMenuTrigger(page, account).click();
    const menu = page.getByRole("menu", { name: "Account and appearance" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // The protection explainer opens and closes.
    await accountMenuTrigger(page, account).click();
    await menu.getByRole("menuitem", { name: "How your journal is protected" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("How your journal is protected")).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    // Escape dismisses the menu without activating anything.
    await accountMenuTrigger(page, account).click();
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
