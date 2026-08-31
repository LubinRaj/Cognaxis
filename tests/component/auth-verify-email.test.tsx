import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IdTokenResult } from "firebase/auth";
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

const { firebaseAuthMocks, resetHarness, makeUser, emitUser } = await import(
  "./support/firebase-harness"
);
const { renderUnverifiedUser, renderWithUser } = await import("./support/render-app");

function tokenResult(emailVerified: boolean) {
  return { claims: { email_verified: emailVerified } } as unknown as IdTokenResult;
}

describe("email verification pending screen", () => {
  beforeEach(() => {
    resetHarness();
  });

  it("holds an unverified account on the verification screen", async () => {
    await renderUnverifiedUser();

    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome back" })).not.toBeInTheDocument();
    expect(document.body.textContent).toContain("stays locked until this email is verified");
  });

  it("does not claim that a verification email was sent for a returning unverified account", async () => {
    await renderUnverifiedUser();

    expect(document.body.textContent).toContain("Request a new verification email below");
    expect(document.body.textContent).not.toContain("We sent a verification link");
  });

  it("masks the email address instead of showing it in full", async () => {
    await renderUnverifiedUser({ email: "confidential.person@example.test" });

    expect(screen.getByText("co•••@example.test")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("confidential.person@example.test");
    expect(document.body.textContent).not.toContain("confidential.person");
  });

  it("reloads the user and forces a fresh token before entering the journal", async () => {
    const user = userEvent.setup();
    const reload = vi.fn().mockResolvedValue(undefined);
    const getIdTokenResult = vi.fn().mockResolvedValue(tokenResult(true));
    const account = makeUser({ emailVerified: false, reload, getIdTokenResult });
    await renderWithUser(account);

    await user.click(screen.getByRole("button", { name: "I've verified my email" }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(getIdTokenResult).toHaveBeenCalledWith(true);
  });

  it("stays on the verification screen when the refreshed token is still unverified", async () => {
    const user = userEvent.setup();
    const getIdTokenResult = vi.fn().mockResolvedValue(tokenResult(false));
    const account = makeUser({ emailVerified: false, getIdTokenResult });
    await renderWithUser(account);

    await user.click(screen.getByRole("button", { name: "I've verified my email" }));

    expect(
      await screen.findByText("That email is not verified yet. Open the link we sent, then check again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  });

  it("does not accept a truthy non-boolean verification claim", async () => {
    const user = userEvent.setup();
    const getIdTokenResult = vi.fn().mockResolvedValue({ claims: { email_verified: "true" } });
    const account = makeUser({ emailVerified: false, getIdTokenResult });
    await renderWithUser(account);

    await user.click(screen.getByRole("button", { name: "I've verified my email" }));

    await waitFor(() => expect(getIdTokenResult).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  });

  it("resends the verification email and then enforces a cooldown", async () => {
    const user = userEvent.setup();
    await renderUnverifiedUser();

    const resend = screen.getByRole("button", { name: "Resend verification email" });
    await user.click(resend);

    await waitFor(() =>
      expect(firebaseAuthMocks.sendEmailVerification).toHaveBeenCalledTimes(1),
    );
    expect(
      await screen.findByText("Verification email sent. Check your inbox and spam folder."),
    ).toBeInTheDocument();

    const cooling = await screen.findByRole("button", { name: /Resend available in \d+s/ });
    expect(cooling).toBeDisabled();

    await user.click(cooling);
    expect(firebaseAuthMocks.sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it("applies the cooldown even when the resend fails, and sanitises the failure", async () => {
    const user = userEvent.setup();
    await renderUnverifiedUser();
    firebaseAuthMocks.sendEmailVerification.mockRejectedValue({
      code: "auth/too-many-requests",
      message: "TOO_MANY_ATTEMPTS_TRY_LATER : internal quota detail",
    });

    await user.click(screen.getByRole("button", { name: "Resend verification email" }));

    expect(
      await screen.findByText("Too many attempts. Wait a moment and try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/TOO_MANY_ATTEMPTS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal quota detail/)).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Resend available in \d+s/ })).toBeDisabled();
  });

  it("does not claim delivery when the initial verification email failed", async () => {
    await renderUnverifiedUser();

    expect(
      screen.queryByText("Verification email sent. Check your inbox and spam folder."),
    ).not.toBeInTheDocument();
  });

  it("signs out and clears the session with 'Use a different account'", async () => {
    const user = userEvent.setup();
    await renderUnverifiedUser();

    await user.click(screen.getByRole("button", { name: "Use a different account" }));

    await waitFor(() => expect(firebaseAuthMocks.signOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Verify your email" })).not.toBeInTheDocument();
  });

  it("offers no route back to the public page while an unverified identity is held", async () => {
    await renderUnverifiedUser();

    expect(screen.queryByRole("button", { name: "Back to home" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a different account" })).toBeInTheDocument();
  });

  it("announces asynchronous status through a polite live region", async () => {
    await renderUnverifiedUser();

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });

  it("enters the journal once the observer reports a verified user", async () => {
    await renderUnverifiedUser();
    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();

    const verified = makeUser({ emailVerified: true });
    await waitFor(async () => {
      emitUser(verified);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Verify your email" })).not.toBeInTheDocument(),
    );
  });
});
