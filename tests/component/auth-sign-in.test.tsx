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

const { firebaseAuthMocks, resetHarness, credential, makeUser } = await import(
  "./support/firebase-harness"
);
const { renderSignedOut } = await import("./support/render-app");

async function openSignIn() {
  const user = userEvent.setup();
  await renderSignedOut();
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Welcome back" });
  return user;
}

describe("sign-in screen", () => {
  beforeEach(() => {
    resetHarness();
  });

  it("shows the public landing page before any authentication screen", async () => {
    await renderSignedOut();

    expect(
      screen.getByRole("heading", { name: /Think freely/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Start journaling" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sign in securely with Google or email.").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome back" })).not.toBeInTheDocument();
  });

  it("opens the focused authentication surface from the landing CTA", async () => {
    const user = userEvent.setup();
    await renderSignedOut();

    await user.click(screen.getAllByRole("button", { name: "Start journaling" })[0]);

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(
      screen.getByText("Continue to your private Cognaxis journal."),
    ).toBeInTheDocument();
  });

  it("renders the Google control before the email form", async () => {
    await openSignIn();

    const google = screen.getByRole("button", { name: /Continue with Google/i });
    const email = screen.getByLabelText("Email");

    expect(google.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("or continue with email")).toBeInTheDocument();
  });

  it("labels every field and uses the correct autocomplete tokens", async () => {
    await openSignIn();

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");

    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
  });

  it("exposes a keyboard-operable password visibility control", async () => {
    const user = await openSignIn();
    const password = screen.getByLabelText("Password");
    const reveal = screen.getByRole("button", { name: "Show password" });

    expect(reveal).toHaveAttribute("aria-pressed", "false");
    expect(password).toHaveAttribute("type", "password");

    reveal.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");

    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("uses one generic message for an unknown account and a wrong password", async () => {
    const user = await openSignIn();
    const messages: string[] = [];

    for (const code of ["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"]) {
      firebaseAuthMocks.signInWithCredential.mockRejectedValueOnce({
        code,
        message: "raw provider detail",
      });

      await user.clear(screen.getByLabelText("Email"));
      await user.type(screen.getByLabelText("Email"), "person@example.test");
      await user.clear(screen.getByLabelText("Password"));
      await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
      await user.click(screen.getByRole("button", { name: "Sign in" }));

      const alert = await screen.findByText("Email or password is incorrect.");
      messages.push(alert.textContent ?? "");
      expect(screen.queryByText(/raw provider detail/)).not.toBeInTheDocument();
      expect(screen.queryByText(/No account found/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Incorrect password/i)).not.toBeInTheDocument();
    }

    expect(new Set(messages).size).toBe(1);
  });

  it("sanitises failure codes that FirebaseUI does not translate", async () => {
    const user = await openSignIn();

    for (const failure of [
      { code: "auth/internal-error", message: "Firebase: Error (auth/internal-error)." },
      { code: "auth/unauthorized-domain", message: "Firebase: this domain is not authorized." },
      { code: "auth/web-storage-unsupported", message: "Firebase: storage unsupported." },
      { code: "auth/some-future-code", message: "Firebase: raw untranslated detail." },
    ]) {
      firebaseAuthMocks.signInWithCredential.mockRejectedValueOnce(failure);

      await user.clear(screen.getByLabelText("Email"));
      await user.type(screen.getByLabelText("Email"), "person@example.test");
      await user.clear(screen.getByLabelText("Password"));
      await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
      await user.click(screen.getByRole("button", { name: "Sign in" }));

      await waitFor(() => {
        expect(screen.queryByText(/^Firebase:/)).not.toBeInTheDocument();
      });
      expect(screen.queryByText(/auth\//)).not.toBeInTheDocument();
      expect(screen.queryByText(/raw untranslated detail/)).not.toBeInTheDocument();
    }
  });

  it("does not send credentials until the fields are valid", async () => {
    const user = await openSignIn();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "secret-value");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(firebaseAuthMocks.signInWithCredential).not.toHaveBeenCalled();
    });
  });

  it("prevents a duplicate submission while a sign-in is pending", async () => {
    const user = await openSignIn();
    let release: (value: unknown) => void = () => undefined;
    firebaseAuthMocks.signInWithCredential.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    await user.type(screen.getByLabelText("Email"), "person@example.test");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");

    const submit = screen.getByRole("button", { name: "Sign in" });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);
    await user.click(submit);

    expect(firebaseAuthMocks.signInWithCredential).toHaveBeenCalledTimes(1);
    release(credential(makeUser()));
  });

  it("starts Google sign-in through the popup strategy", async () => {
    const user = await openSignIn();
    firebaseAuthMocks.signInWithPopup.mockResolvedValue(credential(makeUser()));

    await user.click(screen.getByRole("button", { name: /Continue with Google/i }));

    await waitFor(() => expect(firebaseAuthMocks.signInWithPopup).toHaveBeenCalledTimes(1));
    expect(firebaseAuthMocks.signInWithRedirect).not.toHaveBeenCalled();
  });

  it("falls back to redirect only when the popup runtime cannot complete", async () => {
    const user = await openSignIn();
    firebaseAuthMocks.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    firebaseAuthMocks.signInWithRedirect.mockResolvedValue(undefined);

    await user.click(screen.getByRole("button", { name: /Continue with Google/i }));

    await waitFor(() => expect(firebaseAuthMocks.signInWithRedirect).toHaveBeenCalledTimes(1));
  });

  it("does not redirect when the user simply closed the popup", async () => {
    const user = await openSignIn();
    firebaseAuthMocks.signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });

    await user.click(screen.getByRole("button", { name: /Continue with Google/i }));

    expect(await screen.findByText("Sign-in was cancelled before it completed.")).toBeVisible();
    expect(firebaseAuthMocks.signInWithRedirect).not.toHaveBeenCalled();
  });

  it("navigates to sign-up, forgot password, and back without changing card width", async () => {
    const user = await openSignIn();

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(
      await screen.findByRole("heading", { name: "Create your private space" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in", hidden: false }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(
      await screen.findByRole("heading", { name: "Reset your password" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });

  it("returns to the public landing page from the authentication surface", async () => {
    const user = await openSignIn();

    await user.click(screen.getByRole("button", { name: "Back to home" }));

    expect(await screen.findByRole("heading", { name: /Think freely/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Welcome back" })).not.toBeInTheDocument();
  });

  it("keeps private workspace content out of the document while signed out", async () => {
    await openSignIn();

    expect(screen.queryByPlaceholderText(/reflect/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved to your private memory/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("New reflection");
  });
});
