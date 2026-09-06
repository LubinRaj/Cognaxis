import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/test";
import { createVerifiedUser } from "./support/accounts";
import { signIn, startReflection } from "./support/ui";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
}

async function expectMobileNavigationIsVisible(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const navigation = [...document.querySelectorAll<HTMLElement>(
          'nav[aria-label="Cognaxis sections"]',
        )].find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const account = navigation?.querySelector<HTMLButtonElement>(
          'button[aria-label^="Your account"]',
        );
        if (!navigation || !account) return false;
        const navigationRect = navigation.getBoundingClientRect();
        const accountRect = account.getBoundingClientRect();
        return (
          navigationRect.top >= -1 &&
          navigationRect.bottom <= window.innerHeight + 1 &&
          accountRect.top >= navigationRect.top - 1 &&
          accountRect.bottom <= navigationRect.bottom + 1
        );
      }),
    )
    .toBe(true);
}

async function expectFloatingActionIsCentered(page: Page) {
  // The desktop reflection drawer remains mounted but hidden on a phone, so select the visible
  // floating action explicitly instead of allowing the hidden drawer button to win the locator.
  const action = page.locator('button[aria-label="New reflection"]:visible').first();
  await expect(action).toBeVisible();
  await expect
    .poll(() =>
      action.evaluate((button) => {
        const buttonRect = button.getBoundingClientRect();
        const icon = button.querySelector("svg");
        if (!icon) return false;
        const iconRect = icon.getBoundingClientRect();
        const buttonIsCircular = Math.abs(buttonRect.width - buttonRect.height) <= 1;
        const iconIsCentered =
          Math.abs(iconRect.left + iconRect.width / 2 - (buttonRect.left + buttonRect.width / 2)) <= 1 &&
          Math.abs(iconRect.top + iconRect.height / 2 - (buttonRect.top + buttonRect.height / 2)) <= 1;
        return buttonIsCircular && buttonRect.width >= 52 && iconIsCentered;
      }),
    )
    .toBe(true);
}

async function expectMoreMenuIsInViewport(page: Page) {
  await page.getByRole("button", { name: "More Cognaxis sections" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect
    .poll(() =>
      page.getByRole("menu").evaluate((menu) => {
        const rect = menu.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1;
      }),
    )
    .toBe(true);
}

test.describe("mobile layout", () => {
  test("keeps the personal workspace, navigation, and core pages usable on a phone", async ({
    page,
  }) => {
    const account = await createVerifiedUser("mobilelayout");
    await signIn(page, account);

    await expect(page.getByRole("navigation", { name: "Cognaxis sections" })).toBeVisible();
    await expect(page.getByRole("button", { name: account.email })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMobileNavigationIsVisible(page);

    await startReflection(page);
    await expect(page.getByLabel("Write your reflection")).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    await expectMobileNavigationIsVisible(page);

    // The production 10-per-second burst guard is intentional. Let the initial workspace reads
    // settle before deliberately navigating across separate feature surfaces.
    await page.waitForTimeout(1_100);
    await page.getByRole("link", { name: "Ask me" }).click();
    await expect(page.getByRole("heading", { name: "Ask me" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMobileNavigationIsVisible(page);
    await expectFloatingActionIsCentered(page);

    await page.getByRole("link", { name: "Insights" }).click();
    await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMobileNavigationIsVisible(page);
    await expectFloatingActionIsCentered(page);

    await expectMoreMenuIsInViewport(page);
    await page.getByRole("menuitem", { name: "Places" }).click();
    await expect(page.getByRole("heading", { name: "Map" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMobileNavigationIsVisible(page);
    await expectFloatingActionIsCentered(page);

    await expectMoreMenuIsInViewport(page);
    await page.getByRole("menuitem", { name: "Teams" }).click();
    await expect(page.getByRole("heading", { name: "Teams", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMobileNavigationIsVisible(page);
  });
});
