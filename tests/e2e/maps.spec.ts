import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { createVerifiedUser } from "./support/accounts";
import { signIn, startReflection } from "./support/ui";

// The end-to-end build compiles in the deterministic Maps adapter, so these journeys exercise the
// real map surfaces without contacting Google. The "maps not configured" list-only branch stays
// covered by the component suite, where the build-time flag can be varied per test.

test.use({
  geolocation: { latitude: 47.6205, longitude: -122.3493 },
  permissions: ["geolocation"],
});

async function saveLocatedCheckIn(page: Page, label: string) {
  await startReflection(page);
  await page.getByRole("button", { name: "Add reflection check-in" }).click();
  await expect(page.getByRole("heading", { name: "Reflection check-in" })).toBeVisible();
  await page.getByRole("button", { name: "Use my current location" }).click();
  await expect(page.getByTestId("location-coordinates")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Approximate — rounded/ })).toBeChecked();
  await page.getByLabel("Place label").fill(label);
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(page.getByRole("heading", { name: "Reflection check-in" })).not.toBeVisible();
}

test.describe("map page", () => {
  test("located reflections appear on the deterministic map with a synchronized list", async ({
    page,
  }) => {
    const account = await createVerifiedUser("mapuser");
    await signIn(page, account);
    await saveLocatedCheckIn(page, "Harbor bench");
    await saveLocatedCheckIn(page, "Morning market");

    await page.goto("/app/map");
    await expect(page.getByRole("heading", { name: "Map", exact: true })).toBeVisible();

    // Markers render only after the asynchronous map load completes.
    await expect(page.locator('[data-e2e="fake-map"]')).toBeVisible();
    await expect(page.locator('[data-e2e="fake-marker"]')).toHaveCount(2);

    // The accessible list carries the labels, the honest approximate wording, and no raw
    // coordinates anywhere on the page.
    const list = page.locator('section[aria-label="Located reflections"]');
    await expect(list).toContainText("Harbor bench");
    await expect(list).toContainText("Morning market");
    await expect(list).toContainText("approximate");
    await expect(page.getByText(/47\.6\d/)).toHaveCount(0);
    await expect(page.getByText(/-122\.3\d/)).toHaveCount(0);

    // Clicking a marker selects exactly its list entry.
    await page.locator('[data-e2e="fake-marker"][data-title="Harbor bench"]').click();
    await expect(list.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(list.locator('[aria-current="true"]')).toContainText("Harbor bench");

    // The selected entry links back into the journal.
    await list.locator('[aria-current="true"]').getByRole("button", { name: "Open reflection" }).click();
    await expect(page).toHaveURL(/\/app\/journal\?session=/);
    await expect(page.getByLabel("Write your reflection")).toBeVisible();
  });

  test("a maps load failure falls back to the accessible list", async ({ page }) => {
    const account = await createVerifiedUser("mapfail");
    await signIn(page, account);
    await saveLocatedCheckIn(page, "Quiet courtyard");

    await page.evaluate(() => window.localStorage.setItem("cognaxis.e2e.maps", "fail"));
    await page.goto("/app/map");

    await expect(
      page.getByText(
        "The map could not be loaded right now. Your located reflections are still available in the list below.",
      ),
    ).toBeVisible();
    await expect(page.locator('[data-e2e="fake-map"]')).toHaveCount(0);
    const list = page.locator('section[aria-label="Located reflections"]');
    await expect(list).toContainText("Quiet courtyard");
  });
});
