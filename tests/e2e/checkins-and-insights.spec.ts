import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { createVerifiedUser } from "./support/accounts";
import { sendMessage, signIn, startReflection } from "./support/ui";

async function openCheckInDialog(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Add reflection check-in|Edit reflection check-in/ })
    .click();
  await expect(page.getByRole("heading", { name: "Reflection check-in" })).toBeVisible();
}

async function saveCheckIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.getByRole("heading", { name: "Reflection check-in" })).not.toBeVisible();
}

test.describe("check-ins", () => {
  test("add, edit, and remove a check-in on an owned reflection", async ({ page }) => {
    const account = await createVerifiedUser("checkin");
    await signIn(page, account);
    await startReflection(page);

    await openCheckInDialog(page);
    await page.getByRole("radiogroup", { name: "Mood" }).getByRole("radio", { name: "Good", exact: true }).check({ force: true });
    await page
      .getByRole("radiogroup", { name: "Energy" })
      .getByRole("radio", { name: "Steady", exact: true })
      .check({ force: true });
    await page.getByRole("button", { name: "Calm" }).click();
    await page.getByRole("button", { name: "Focused" }).click();
    await page.getByLabel(/Private note/).fill("A synthetic note about this moment.");
    await saveCheckIn(page);

    const savedRow = page.locator('section[aria-label="Saved check-in"]');
    await expect(savedRow).toContainText("Mood: Good");
    await expect(savedRow).toContainText("Energy: Steady");
    await expect(savedRow).toContainText("Note saved");

    // Reopen and edit.
    await savedRow.getByRole("button", { name: "Edit" }).click();
    await expect(
      page.getByRole("radiogroup", { name: "Mood" }).getByRole("radio", { name: "Good", exact: true }),
    ).toBeChecked();
    await expect(page.getByLabel(/Private note/)).toHaveValue(
      "A synthetic note about this moment.",
    );
    await page
      .getByRole("radiogroup", { name: "Mood" })
      .getByRole("radio", { name: "Very good", exact: true })
      .check({ force: true });
    await saveCheckIn(page);
    await expect(savedRow).toContainText("Mood: Very good");

    // Remove it.
    await savedRow.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Remove check-in" }).click();
    await expect(page.getByRole("heading", { name: "Reflection check-in" })).not.toBeVisible();
    await expect(savedRow).toHaveCount(0);
  });

  test.describe("failure state", () => {
    test.use({ expectedConsoleErrors: /Failed to load resource/ });

    test("a failed save keeps every entered value in the dialog", async ({ page }) => {
      const account = await createVerifiedUser("checkinfail");
      await signIn(page, account);
      await startReflection(page);

      let failNextSave = true;
      await page.route("**/api/v1/sessions/*/signals", async (route) => {
        if (failNextSave && route.request().method() === "PUT") {
          failNextSave = false;
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
            }),
          });
          return;
        }
        await route.fallback();
      });

      await openCheckInDialog(page);
      await page.getByRole("radiogroup", { name: "Mood" }).getByRole("radio", { name: "Low", exact: true }).check({ force: true });
      await page.getByRole("button", { name: "Stressed" }).click();
      await page.getByLabel(/Private note/).fill("This entry must survive the failure.");
      await page.getByRole("button", { name: "Save check-in" }).click();

      await expect(
        page.getByRole("alert").filter({ hasText: /could not be (saved|completed)/ }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "Reflection check-in" })).toBeVisible();
      await expect(
        page.getByRole("radiogroup", { name: "Mood" }).getByRole("radio", { name: "Low", exact: true }),
      ).toBeChecked();
      await expect(page.getByRole("button", { name: "Stressed" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByLabel(/Private note/)).toHaveValue(
        "This entry must survive the failure.",
      );

      // The retry goes through unchanged.
      await saveCheckIn(page);
      await expect(page.locator('section[aria-label="Saved check-in"]')).toContainText("Mood: Low");
    });
  });
});

test.describe("insights dashboard and recaps", () => {
  test("range switching keeps gaps visible instead of fabricating zeroes", async ({ page }) => {
    const account = await createVerifiedUser("dashboard");
    await signIn(page, account);

    const moods = ["Good", "Low", "Very good"];
    for (const mood of moods) {
      await startReflection(page);
      await openCheckInDialog(page);
      await page.getByRole("radiogroup", { name: "Mood" }).getByRole("radio", { name: mood, exact: true }).check({ force: true });
      await page
        .getByRole("radiogroup", { name: "Energy" })
        .getByRole("radio", { name: "Steady", exact: true })
        .check({ force: true });
      await saveCheckIn(page);
    }

    await page.goto("/app/insights");
    await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();

    const rangeGroup = page.getByRole("group", { name: "Time range" });
    for (const range of ["30 days", "90 days", "7 days"]) {
      await rangeGroup.getByRole("button", { name: range }).click();
      await expect(rangeGroup.getByRole("button", { name: range })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByText("Reflections", { exact: true })).toBeVisible();
    }

    // Three same-day check-ins render the trend chart; every other day in the range must read as
    // an explicit gap, never a zero score.
    await expect(page.getByRole("figure").first()).toBeVisible();
    await page.locator("details > summary").first().click();
    const table = page.getByRole("table").first();
    await expect(table.getByRole("cell", { name: "No check-in" }).first()).toBeVisible();
    await expect(table.getByRole("cell", { name: "0", exact: true })).toHaveCount(0);
  });

  test("a recap is generated on demand, survives refresh, goes stale, and can be updated", async ({
    page,
  }) => {
    const account = await createVerifiedUser("recap");
    await signIn(page, account);
    await startReflection(page);
    await sendMessage(page, "Something worth recapping today.");
    await expect(page.getByRole("article")).toHaveCount(2);
    await openCheckInDialog(page);
    await page.getByRole("radiogroup", { name: "Mood" }).getByRole("radio", { name: "Good", exact: true }).check({ force: true });
    await saveCheckIn(page);

    await page.goto("/app/insights");
    await page.getByRole("button", { name: /Create today.s recap/ }).click();
    const recap = page.getByRole("article", { name: /Daily recap: A steady period/ });
    await expect(recap).toBeVisible();
    await expect(recap.getByRole("heading", { name: "Possible patterns" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("article", { name: /Daily recap: A steady period/ })).toBeVisible();

    // Changing today's source content marks the recap stale.
    await page.goto("/app/journal");
    await page
      .getByRole("navigation", { name: "Reflection history" })
      .first()
      .getByRole("list")
      .getByRole("button")
      .first()
      .click();
    await sendMessage(page, "A new thought that outdates the recap.");
    await expect(page.getByRole("article")).toHaveCount(4);

    await page.goto("/app/insights");
    const staleRecap = page.getByRole("article", { name: /Daily recap: A steady period/ });
    await expect(staleRecap.getByText("Out of date")).toBeVisible();

    await staleRecap.getByRole("button", { name: "Update recap" }).click();
    await expect(staleRecap.getByText("Out of date")).toHaveCount(0);
  });
});
