import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type * as FirebaseAuthModule from "firebase/auth";

const actionMocks = {
  verifyPasswordResetCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
  applyActionCode: vi.fn(),
  checkActionCode: vi.fn(),
};

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof FirebaseAuthModule>();
  const harness = await import("./support/firebase-harness");
  return { ...actual, ...harness.firebaseAuthMocks, ...actionMocks };
});

vi.mock("../../src/client/lib/firebase", async () => {
  const harness = await import("./support/firebase-harness");
  return harness.firebaseModuleMock;
});

const { resetHarness, firebaseAuthMocks } = await import("./support/firebase-harness");
const { AuthActionSurface } = await import(
  "../../src/client/components/auth-action/AuthActionSurface"
);

const RESET_CODE = "abcd1234efgh5678";

function visit(search: string) {
  window.history.replaceState(null, "", `/auth/action${search}`);
}

async function scan(): Promise<string> {
  const results = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false }, "target-size": { enabled: false } },
    resultTypes: ["violations"],
  });
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.help}`)
    .join("\n");
}

describe("branded email action surface", () => {
  beforeEach(() => {
    resetHarness();
    for (const mock of Object.values(actionMocks)) mock.mockReset();
    actionMocks.verifyPasswordResetCode.mockResolvedValue("person@example.test");
    actionMocks.confirmPasswordReset.mockResolvedValue(undefined);
    actionMocks.applyActionCode.mockResolvedValue(undefined);
    actionMocks.checkActionCode.mockResolvedValue({ data: { email: "person@example.test" } });
    firebaseAuthMocks.validatePassword.mockImplementation((_auth, password: string) =>
      Promise.resolve({
        isValid: password.length >= 8,
        meetsMinPasswordLength: password.length >= 8,
        passwordPolicy: { customStrengthOptions: { minPasswordLength: 8 } },
      } as never),
    );
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("removes the one-time code from the address bar", async () => {
    visit(`?mode=verifyEmail&oobCode=${RESET_CODE}&apiKey=AIzaSyEXAMPLE`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.location.pathname).toBe("/auth/action");
    expect(window.location.href).not.toContain(RESET_CODE);
    expect(window.location.href).not.toContain("AIzaSy");
  });

  it("verifies an email with applyActionCode and confirms completion", async () => {
    visit(`?mode=verifyEmail&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);

    expect(
      await screen.findByRole("heading", { name: "Your email is verified" }),
    ).toBeInTheDocument();
    expect(actionMocks.applyActionCode).toHaveBeenCalledTimes(1);
    expect(actionMocks.applyActionCode.mock.calls[0][1]).toBe(RESET_CODE);
  });

  it("verifies a reset code before showing the new-password form", async () => {
    visit(`?mode=resetPassword&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);

    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    expect(actionMocks.verifyPasswordResetCode).toHaveBeenCalledTimes(1);
    expect(actionMocks.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("masks the account address on the reset form", async () => {
    visit(`?mode=resetPassword&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);
    await screen.findByRole("heading", { name: "Set a new password" });

    expect(screen.getByText("pe•••@example.test")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("person@example.test");
  });

  it("uses new-password autocomplete on both fields and a live policy checklist", async () => {
    const user = userEvent.setup();
    visit(`?mode=resetPassword&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);
    await screen.findByRole("heading", { name: "Set a new password" });

    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );

    await user.type(screen.getByLabelText("New password"), "short");
    expect(await screen.findByText("At least 8 characters")).toBeInTheDocument();
  });

  it("blocks a mismatch and a policy failure before contacting Firebase", async () => {
    const user = userEvent.setup();
    visit(`?mode=resetPassword&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);
    await screen.findByRole("heading", { name: "Set a new password" });

    await user.type(screen.getByLabelText("New password"), "long-enough-passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "different-passphrase");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Both passwords must match.");
    expect(actionMocks.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("completes the reset and offers an explicit return without signing in", async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    visit(`?mode=resetPassword&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={onReturn} />);
    await screen.findByRole("heading", { name: "Set a new password" });

    await user.type(screen.getByLabelText("New password"), "long-enough-passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "long-enough-passphrase");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(
      await screen.findByRole("heading", { name: "Your password has been changed" }),
    ).toBeInTheDocument();
    expect(actionMocks.confirmPasswordReset).toHaveBeenCalledTimes(1);
    expect(firebaseAuthMocks.signInWithCredential).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Return to sign in" }));
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it("prevents a duplicate submission", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => undefined;
    actionMocks.confirmPasswordReset.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    visit(`?mode=resetPassword&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);
    await screen.findByRole("heading", { name: "Set a new password" });

    await user.type(screen.getByLabelText("New password"), "long-enough-passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "long-enough-passphrase");
    const save = screen.getByRole("button", { name: "Save new password" });
    await user.click(save);

    await waitFor(() => expect(save).toBeDisabled());
    await user.click(save);
    await user.click(save);

    expect(actionMocks.confirmPasswordReset).toHaveBeenCalledTimes(1);
    release(undefined);
  });

  it("fails safely for an expired or already-used link and leaks no code", async () => {
    actionMocks.applyActionCode.mockRejectedValue({
      code: "auth/invalid-action-code",
      message: `Firebase: the action code ${RESET_CODE} has expired.`,
    });

    visit(`?mode=verifyEmail&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);

    expect(
      await screen.findByRole("heading", { name: "This link cannot be used" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/verification link is invalid, has expired/)).toBeInTheDocument();

    const text = document.body.textContent ?? "";
    expect(text).not.toContain(RESET_CODE);
    expect(text).not.toContain("Firebase:");
    expect(text).not.toContain("person@example.test");
  });

  it("rejects an unsupported mode without calling Firebase", async () => {
    visit(`?mode=signIn&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);

    expect(
      await screen.findByRole("heading", { name: "This link cannot be used" }),
    ).toBeInTheDocument();
    for (const mock of Object.values(actionMocks)) expect(mock).not.toHaveBeenCalled();
  });

  it("rejects a malformed code without calling Firebase", async () => {
    visit("?mode=resetPassword&oobCode=%3Cscript%3E");
    render(<AuthActionSurface onReturnToApp={() => undefined} />);

    expect(
      await screen.findByRole("heading", { name: "This link cannot be used" }),
    ).toBeInTheDocument();
    expect(actionMocks.verifyPasswordResetCode).not.toHaveBeenCalled();
  });

  it("restores a recovered email through checkActionCode then applyActionCode", async () => {
    visit(`?mode=recoverEmail&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);

    expect(
      await screen.findByRole("heading", { name: "Your email address has been restored" }),
    ).toBeInTheDocument();
    expect(actionMocks.checkActionCode).toHaveBeenCalledTimes(1);
    expect(actionMocks.applyActionCode).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/pe•••@example\.test/)).toBeInTheDocument();
    expect(screen.getByText(/account email has been restored/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("signed in to");
  });

  it("accepts only a same-origin continuation target", async () => {
    visit(
      `?mode=verifyEmail&oobCode=${RESET_CODE}&continueUrl=${encodeURIComponent("https://evil.example/steal")}`,
    );
    render(<AuthActionSurface onReturnToApp={() => undefined} />);
    await screen.findByRole("heading", { name: "Your email is verified" });

    expect(document.body.textContent).not.toContain("evil.example");
  });

  it("shows an allowlisted continuation target", async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();
    visit(`?mode=verifyEmail&oobCode=${RESET_CODE}&continueUrl=%2Fjournal`);
    render(<AuthActionSurface onReturnToApp={onReturn} />);
    await screen.findByRole("heading", { name: "Your email is verified" });

    expect(screen.getByText("/journal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to Cognaxis" }));
    expect(onReturn).toHaveBeenCalledWith("/journal");
  });

  it("never writes the code or the address into browser storage", async () => {
    const user = userEvent.setup();
    visit(`?mode=resetPassword&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);
    await screen.findByRole("heading", { name: "Set a new password" });

    await user.type(screen.getByLabelText("New password"), "long-enough-passphrase");
    await user.type(screen.getByLabelText("Confirm new password"), "long-enough-passphrase");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    await screen.findByRole("heading", { name: "Your password has been changed" });

    const stored = [
      ...Object.entries({ ...window.localStorage }),
      ...Object.entries({ ...window.sessionStorage }),
    ]
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("|");

    expect(stored).not.toContain(RESET_CODE);
    expect(stored).not.toContain("person@example.test");
    expect(stored).not.toContain("long-enough-passphrase");
  });

  it("reports no serious accessibility violations on the reset form", async () => {
    visit(`?mode=resetPassword&oobCode=${RESET_CODE}`);
    render(<AuthActionSurface onReturnToApp={() => undefined} />);
    await screen.findByRole("heading", { name: "Set a new password" });

    expect(await scan()).toBe("");
  });

  it("reports no serious accessibility violations on the invalid-link state", async () => {
    visit("?mode=signIn&oobCode=bad");
    render(<AuthActionSurface onReturnToApp={() => undefined} />);
    await screen.findByRole("heading", { name: "This link cannot be used" });

    expect(await scan()).toBe("");
  });
});
