import { expect, type Page } from "@playwright/test";
import type { SyntheticAccount } from "./accounts.js";

// Shared journeys through the real interface. Helpers always drive the visible controls a user
// would use and wait on visible state, never on time.

export async function openSignInScreen(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
}

export async function submitSignIn(page: Page, email: string, password: string): Promise<void> {
  const form = page.locator("form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
}

export async function signIn(page: Page, account: SyntheticAccount): Promise<void> {
  await openSignInScreen(page);
  await submitSignIn(page, account.email, account.password);
  // The journal shell renders differently per viewport, so arrival is keyed on the route.
  await expect(page).toHaveURL(/\/app\/journal$/);
  await expect(page.getByRole("main")).toBeVisible();
}

export function accountMenuTrigger(page: Page, account: SyntheticAccount) {
  return page.getByRole("button", { name: account.email });
}

export async function signOut(page: Page, account: SyntheticAccount): Promise<void> {
  await accountMenuTrigger(page, account).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: /Think clearly/ })).toBeVisible();
}

export async function startReflection(page: Page): Promise<void> {
  const createButton = page
    .getByRole("button", { name: /New reflection|Start your first reflection|Start a reflection/ })
    .first();
  const creation = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return (
      response.request().method() === "POST" &&
      /^\/api\/v1\/(?:sessions|organizations\/[^/]+\/sessions)$/.test(path)
    );
  });
  await createButton.click();
  // An existing composer can remain visible while the request creates a new reflection. Waiting
  // for the actual creation response avoids racing the next user action against that transition.
  await creation;
  await expect(page.getByLabel("Write your reflection")).toBeVisible();
}

export async function sendMessage(page: Page, content: string): Promise<void> {
  await page.getByLabel("Write your reflection").fill(content);
  await page.getByRole("button", { name: "Send message" }).click();
}

export async function expectAssistantReply(page: Page, text: string | RegExp): Promise<void> {
  await expect(
    page.getByRole("article", { name: "Message from Cognaxis" }).filter({ hasText: text }),
  ).toBeVisible();
}
