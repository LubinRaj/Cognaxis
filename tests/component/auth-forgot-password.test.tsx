import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const { firebaseAuthMocks, resetHarness } = await import("./support/firebase-harness");
const { renderSignedOut } = await import("./support/render-app");

async function openForgotPassword() {
  const user = userEvent.setup();
  await renderSignedOut();
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await user.click(await screen.findByRole("button", { name: "Forgot password?" }));
  await screen.findByRole("heading", { name: "Reset your password" });
  return user;
}

async function submitEmail(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.clear(screen.getByLabelText("Email"));
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send reset instructions" }));
}

describe("forgot password flow", () => {
  beforeEach(() => {
    resetHarness();
  });

  it("presents an enumeration-neutral prompt", async () => {
    await openForgotPassword();

    expect(
      screen.getByText(
        "Enter your email and we'll send password reset instructions if an account is available.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
  });

  it("shows the same confirmation whether or not the account exists", async () => {
    const user = await openForgotPassword();

    await submitEmail(user, "known@example.test");
    const first = (await screen.findByRole("heading", { name: "Check your inbox" })).textContent;
    const firstBody = screen.getByText(
      "If an account is available for that email, Firebase has sent password reset instructions.",
    ).textContent;

    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    await user.click(await screen.findByRole("button", { name: "Forgot password?" }));

    firebaseAuthMocks.sendPasswordResetEmail.mockRejectedValueOnce({
      code: "auth/user-not-found",
      message: "There is no user record corresponding to this identifier.",
    });
    await submitEmail(user, "unknown@example.test");

    const second = (await screen.findByRole("heading", { name: "Check your inbox" })).textContent;
    const secondBody = screen.getByText(
      "If an account is available for that email, Firebase has sent password reset instructions.",
    ).textContent;

    expect(second).toBe(first);
    expect(secondBody).toBe(firstBody);
    expect(screen.queryByText(/no user record/i)).not.toBeInTheDocument();
  });

  it("keeps the email address out of the URL", async () => {
    const user = await openForgotPassword();

    await submitEmail(user, "person@example.test");
    await screen.findByRole("heading", { name: "Check your inbox" });

    expect(window.location.href).not.toContain("person");
    expect(window.location.search).toBe("");
    expect(window.location.hash).not.toContain("@");
  });

  it("still reports a network failure, which cannot reveal account existence", async () => {
    const user = await openForgotPassword();
    firebaseAuthMocks.sendPasswordResetEmail.mockRejectedValue({
      code: "auth/network-request-failed",
    });

    await submitEmail(user, "person@example.test");

    expect(
      await screen.findByText(
        "We couldn't reach the sign-in service. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Check your inbox" })).not.toBeInTheDocument();
  });

  it("reports rate limiting without confirming the address", async () => {
    const user = await openForgotPassword();
    firebaseAuthMocks.sendPasswordResetEmail.mockRejectedValue({ code: "auth/too-many-requests" });

    await submitEmail(user, "person@example.test");

    expect(
      await screen.findByText("Too many attempts. Wait a moment and try again."),
    ).toBeInTheDocument();
  });

  it("validates the address before contacting Firebase", async () => {
    const user = await openForgotPassword();

    await submitEmail(user, "not-an-email");

    await waitFor(() => {
      expect(firebaseAuthMocks.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("offers a cooldown-protected resend on the confirmation screen", async () => {
    const user = await openForgotPassword();

    await submitEmail(user, "person@example.test");
    await screen.findByRole("heading", { name: "Check your inbox" });

    expect(firebaseAuthMocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const cooling = screen.getByRole("button", { name: /Resend available in \d+s/ });
    expect(cooling).toBeDisabled();

    await user.click(cooling);
    expect(firebaseAuthMocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("returns to sign-in and forgets the submitted address", async () => {
    const user = await openForgotPassword();

    await submitEmail(user, "person@example.test");
    await screen.findByRole("heading", { name: "Check your inbox" });
    await user.click(screen.getByRole("button", { name: "Back to sign in" }));

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("person@example.test");
  });

  it("prevents a duplicate reset request from repeated clicks", async () => {
    const user = await openForgotPassword();
    let release: (value: unknown) => void = () => undefined;
    firebaseAuthMocks.sendPasswordResetEmail.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    await user.type(screen.getByLabelText("Email"), "person@example.test");
    const submit = screen.getByRole("button", { name: "Send reset instructions" });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);
    await user.click(submit);

    expect(firebaseAuthMocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    release(undefined);
  });
});
