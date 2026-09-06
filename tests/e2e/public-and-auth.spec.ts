import { expect, test } from "./fixtures/test";
import { createUser, createVerifiedUser, listOobCodes, uniqueEmail } from "./support/accounts";
import { E2E_PASSWORD } from "./support/env";
import { openSignInScreen, signIn, signOut, submitSignIn } from "./support/ui";

test.describe("public pages and application shell", () => {
  test("landing page loads with navigation, sections, and no console errors", async ({ page }) => {
    const health = await page.request.get("/api/health");
    expect(health.status()).toBe(200);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Think clearly/ })).toBeVisible();

    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "How it works" }).click();
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Intelligence" }).click();
    await expect(page.getByRole("heading", { name: "A second brain that keeps context" })).toBeVisible();

    await expect(page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Privacy" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms" })).toBeVisible();
  });

  test("privacy and terms routes load with headings and working links", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI processing" })).toBeVisible();

    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
    await page.getByRole("link", { name: "privacy page" }).click();
    await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "← Back to Cognaxis" }).click();
    await expect(page.getByRole("heading", { name: /Think clearly/ })).toBeVisible();
  });

  test("light and dark themes apply and persist across refresh", async ({ page }) => {
    await page.goto("/");
    const root = page.locator("html");

    await page.getByRole("button", { name: /Change theme/ }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(root).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: /Change theme/ }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(root).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "light");
  });

  test("system theme follows the operating-system preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const root = page.locator("html");

    await page.getByRole("button", { name: /Change theme/ }).click();
    await page.getByRole("menuitemradio", { name: "System" }).click();
    await expect(root).toHaveAttribute("data-theme", "dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(root).toHaveAttribute("data-theme", "light");
  });

  test("a protected deep link sends a signed-out user to authentication and returns after sign-in", async ({
    page,
  }) => {
    const account = await createVerifiedUser("deeplink");

    // A signed-out visit to a protected path lands on the public entry with the intended path
    // remembered for after authentication.
    await page.goto("/app/insights");
    await expect(page.getByRole("heading", { name: /Think clearly/ })).toBeVisible();

    await page.getByRole("banner").getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await submitSignIn(page, account.email, account.password);
    await expect(page).toHaveURL(/\/app\/insights$/);
    await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
  });

  test("unknown routes redirect to the intended destinations", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /Think clearly/ })).toBeVisible();

    const account = await createVerifiedUser("unknownroute");
    await signIn(page, account);
    await page.goto("/app/no-such-section");
    await expect(page).toHaveURL(/\/app\/journal$/);
  });
});

test.describe("authentication", () => {
  test("the sign-in screen offers the configured Google provider", async ({ page }) => {
    await openSignInScreen(page);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("link", { name: "terms" })).toBeVisible();
    await expect(page.getByRole("link", { name: "privacy page" })).toBeVisible();
  });

  test("sign-up rejects invalid input with accessible messages", async ({ page }) => {
    await openSignInScreen(page);
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.getByRole("heading", { name: "Create your private space" })).toBeVisible();

    const form = page.locator("form");
    await form.getByLabel("Email").fill("not-an-email");
    await form.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await form.getByLabel("Confirm password", { exact: true }).fill(`${E2E_PASSWORD}-different`);
    await form.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Both passwords must match.")).toBeVisible();
  });

  test.describe("sign-up journey", () => {
    // The Auth emulator answers some optional endpoints (password policy) with 501; the browser
    // logs those as resource errors even though the flow is unaffected.
    test.use({ expectedConsoleErrors: /Failed to load resource/ });

    test("email sign-up, verification blocking, and the real verification link", async ({
      page,
    }) => {
      const email = uniqueEmail("signup");

      await openSignInScreen(page);
      await page.getByRole("button", { name: "Create an account" }).click();
      const form = page.locator("form");
      await form.getByLabel("Email").fill(email);
      await form.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
      await form.getByLabel("Confirm password", { exact: true }).fill(E2E_PASSWORD);
      await form.getByRole("button", { name: "Create account" }).click();

      // The account exists but is unverified: the private application must stay closed.
      await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
      await page.goto("/app/journal");
      await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();

      // Follow the exact action link the user would receive, through the application's own
      // /auth/action surface. If no mail was recorded yet, request one through the visible
      // resend control first.
      let oob = (await listOobCodes()).find(
        (code) => code.email === email && code.requestType === "VERIFY_EMAIL",
      );
      if (!oob) {
        await page.getByRole("button", { name: "Resend verification email" }).click();
        await expect(page.getByText("Verification email sent.")).toBeVisible();
        oob = (await listOobCodes()).find(
          (code) => code.email === email && code.requestType === "VERIFY_EMAIL",
        );
      }
      expect(oob, "the emulator should have recorded a verification mail").toBeTruthy();
      await page.goto(`/auth/action?mode=verifyEmail&oobCode=${oob?.oobCode ?? ""}`);
      await expect(page.getByRole("heading", { name: "Your email is verified" })).toBeVisible();

      // The signed-in session still holds pre-verification claims, so the application asks the
      // user to confirm; the visible re-check refreshes the token and opens the journal.
      await page.getByRole("button", { name: "Continue to Cognaxis" }).click();
      const journalHeading = page.getByRole("heading", { name: "Your personal space" });
      const recheck = page.getByRole("button", { name: "I've verified my email" });
      await expect(journalHeading.or(recheck).first()).toBeVisible();
      if (await recheck.isVisible()) {
        await recheck.click();
      }
      await expect(journalHeading).toBeVisible();
    });
  });

  test("verified sign-in survives refresh, and sign-out blocks back navigation", async ({
    page,
  }) => {
    const account = await createVerifiedUser("session");
    await signIn(page, account);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Your personal space" })).toBeVisible();

    await signOut(page, account);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Your personal space" })).not.toBeVisible();
    await expect(page.getByLabel("Write your reflection")).toHaveCount(0);
  });

  test.describe("failure states", () => {
    test.use({ expectedConsoleErrors: /Failed to load resource|identitytoolkit/ });

    test("invalid credentials get one generic message with no account enumeration", async ({
      page,
    }) => {
      const account = await createVerifiedUser("enum");

      await openSignInScreen(page);
      await submitSignIn(page, account.email, "Wrong-password-1");
      await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

      await submitSignIn(page, uniqueEmail("never-registered"), "Wrong-password-1");
      await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    });

    test("forgot password confirms safely without revealing whether an account exists", async ({
      page,
    }) => {
      await openSignInScreen(page);
      await page.getByRole("button", { name: "Forgot password?" }).click();
      await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();

      await page.locator("form").getByLabel("Email").fill(uniqueEmail("no-account"));
      await page.getByRole("button", { name: "Send reset instructions" }).click();
      await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
      await expect(
        page.getByText("If an account is available for that email, Firebase has sent"),
      ).toBeVisible();
    });

    test("an invalid or expired action link shows the safe failure state", async ({ page }) => {
      await page.goto("/auth/action?mode=resetPassword&oobCode=invalid-e2e-code");
      await expect(page.getByRole("heading", { name: "This link cannot be used" })).toBeVisible();
      await expect(
        page.getByText("This password reset link is invalid, has expired, or has already been used."),
      ).toBeVisible();
      await page.getByRole("button", { name: "Return to sign in" }).click();
      await expect(
        page.getByRole("heading", { name: /Think clearly|Welcome back/ }).first(),
      ).toBeVisible();
    });
  });

  test("an unverified account created outside the form is still blocked", async ({ page }) => {
    const account = await createUser("unverified", false);
    await openSignInScreen(page);
    await submitSignIn(page, account.email, account.password);
    await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "I've verified my email" })).toBeVisible();
  });
});
