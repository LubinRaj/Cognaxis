import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type * as FirebaseAuthModule from "firebase/auth";

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof FirebaseAuthModule>();
  const harness = await import("./support/firebase-harness");
  return { ...actual, ...harness.firebaseAuthMocks };
});

vi.mock("../../src/client/lib/firebase", async () => {
  const harness = await import("./support/firebase-harness");
  return harness.firebaseModuleMock;
});

const { resetHarness } = await import("./support/firebase-harness");
const { renderSignedOut, renderUnverifiedUser } = await import("./support/render-app");

// jsdom has no layout engine, so rules that depend on rendered geometry cannot produce a
// trustworthy result and are excluded rather than silently passed.
const layoutDependentRules = {
  "color-contrast": { enabled: false },
  "target-size": { enabled: false },
} as const;

async function scan(): Promise<axe.Result[]> {
  const results = await axe.run(document.body, {
    rules: layoutDependentRules,
    resultTypes: ["violations"],
  });
  return results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
}

function describeViolations(violations: axe.Result[]): string {
  return violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n");
}

async function openSignIn() {
  const user = userEvent.setup();
  await renderSignedOut();
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Welcome back" });
  return user;
}

describe("authentication accessibility and theming", () => {
  beforeEach(() => {
    resetHarness();
  });

  it("reports no serious or critical violations on the landing page", async () => {
    await renderSignedOut();
    const violations = await scan();
    expect(describeViolations(violations)).toBe("");
  });

  it("reports no serious or critical violations on the sign-in screen", async () => {
    await openSignIn();
    const violations = await scan();
    expect(describeViolations(violations)).toBe("");
  });

  it("reports no serious or critical violations on the create-account screen", async () => {
    const user = await openSignIn();
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await screen.findByRole("heading", { name: "Create your private space" });

    const violations = await scan();
    expect(describeViolations(violations)).toBe("");
  });

  it("reports no serious or critical violations on the forgot-password screen", async () => {
    const user = await openSignIn();
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await screen.findByRole("heading", { name: "Reset your password" });

    const violations = await scan();
    expect(describeViolations(violations)).toBe("");
  });

  it("reports no serious or critical violations on the verification screen", async () => {
    await renderUnverifiedUser();
    const violations = await scan();
    expect(describeViolations(violations)).toBe("");
  });

  it("reports no serious or critical violations while an error is displayed", async () => {
    const user = await openSignIn();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Enter a valid email address.");

    const violations = await scan();
    expect(describeViolations(violations)).toBe("");
  });

  it("associates each field error with its input", async () => {
    const user = await openSignIn();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const email = await screen.findByLabelText("Email");
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));

    const describedBy = email.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const message = document.getElementById(describedBy!.split(" ")[0]);
    expect(message).toHaveTextContent("Enter a valid email address.");
    expect(message).toHaveAttribute("role", "alert");
  });

  it("uses a single heading level one per authentication screen", async () => {
    await openSignIn();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("completes sign-in navigation with the keyboard only", async () => {
    const user = await openSignIn();

    await user.tab();
    let guard = 0;
    while (document.activeElement !== screen.getByLabelText("Email") && guard < 30) {
      await user.tab();
      guard += 1;
    }
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));

    await user.keyboard("person@example.test");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Password"));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show password" }));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Forgot password?" }));

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
  });

  it("keeps focus order aligned with the visual order of the card", async () => {
    await openSignIn();

    const google = screen.getByRole("button", { name: /Continue with Google/i });
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    const submit = screen.getByRole("button", { name: "Sign in" });

    const order = [google, email, password, submit];
    for (let index = 1; index < order.length; index += 1) {
      const relation = order[index - 1].compareDocumentPosition(order[index]);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("changes theme without a reload and never stores anything sensitive", async () => {
    const user = await openSignIn();
    await user.type(screen.getByLabelText("Email"), "person@example.test");
    await user.type(screen.getByLabelText("Password"), "a-secret-passphrase");

    await user.click(screen.getByRole("button", { name: /Change theme/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark"),
    );
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("person@example.test");

    await user.click(screen.getByRole("button", { name: /Change theme/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("light"),
    );

    const stored = Object.entries({ ...window.localStorage })
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("|");
    expect(stored).toContain("cognaxis_theme_preference=light");
    expect(stored).not.toContain("a-secret-passphrase");
    expect(stored).not.toContain("person@example.test");
  });

  it("closes the theme menu with Escape and restores focus to its trigger", async () => {
    const user = await openSignIn();

    const trigger = screen.getByRole("button", { name: /Change theme/ });
    await user.click(trigger);
    expect(screen.getByRole("menu", { name: "Theme" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu", { name: "Theme" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("offers the theme control on every authentication screen", async () => {
    const user = await openSignIn();
    expect(screen.getByRole("button", { name: /Change theme/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await screen.findByRole("heading", { name: "Create your private space" });
    expect(screen.getByRole("button", { name: /Change theme/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(await screen.findByRole("button", { name: "Forgot password?" }));
    await screen.findByRole("heading", { name: "Reset your password" });
    expect(screen.getByRole("button", { name: /Change theme/ })).toBeInTheDocument();
  });

  it("marks decorative icons as hidden from assistive technology", async () => {
    await openSignIn();

    const icons = document.querySelectorAll("svg");
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const labelled =
        icon.getAttribute("aria-hidden") === "true" ||
        icon.hasAttribute("aria-label") ||
        icon.getAttribute("role") === "img" ||
        icon.closest("[aria-hidden='true']") !== null ||
        icon.closest("button,a") !== null;
      expect(labelled).toBe(true);
    }
  });

  it("offers a skip link to the authentication content", async () => {
    await openSignIn();

    const skip = screen.getByRole("link", { name: "Skip to authentication" });
    expect(skip).toHaveAttribute("href", "#auth-main");
    expect(document.getElementById("auth-main")).not.toBeNull();
  });
});
