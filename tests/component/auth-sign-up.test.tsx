import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

const { firebaseAuthMocks, resetHarness, credential, makeUser, passwordPolicy } = await import(
  "./support/firebase-harness"
);
const { renderSignedOut, signalUser } = await import("./support/render-app");

async function openSignUp() {
  const user = userEvent.setup();
  await renderSignedOut();
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await user.click(await screen.findByRole("button", { name: "Create an account" }));
  await screen.findByRole("heading", { name: "Create your private space" });
  return user;
}

async function fillSignUp(user: ReturnType<typeof userEvent.setup>, password: string) {
  await user.type(screen.getByLabelText("Email"), "newcomer@example.test");
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Confirm password"), password);
}

describe("create-account screen", () => {
  beforeEach(() => {
    resetHarness();
  });

  it("collects no display name and keeps data collection minimal", async () => {
    await openSignUp();

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it("uses new-password autocomplete on both password fields", async () => {
    await openSignUp();

    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
  });

  it("shows the Google control before the email form", async () => {
    await openSignUp();

    const google = screen.getByRole("button", { name: /Continue with Google/i });
    const email = screen.getByLabelText("Email");
    expect(google.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("reflects the live Firebase password policy as the user types", async () => {
    const user = await openSignUp();

    const list = await screen.findByText("Your password needs:");
    const container = list.parentElement as HTMLElement;
    expect(within(container).getByText("At least 12 characters")).toBeInTheDocument();
    expect(within(container).getByText("A number")).toBeInTheDocument();
    expect(within(container).getAllByText("not yet met").length).toBe(2);

    await user.type(screen.getByLabelText("Password"), "long-enough-passphrase7");

    await waitFor(() => {
      expect(within(container).getAllByText("requirement met").length).toBe(2);
    });
  });

  it("associates the policy checklist with the password field", async () => {
    await openSignUp();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("password-policy"),
    );
  });

  it("falls back to guidance when the password policy cannot be fetched", async () => {
    firebaseAuthMocks.validatePassword.mockRejectedValue(new Error("offline"));
    await openSignUp();

    expect(await screen.findByText(/Choose a long, unique password/)).toBeInTheDocument();
    expect(screen.queryByText("Your password needs:")).not.toBeInTheDocument();
  });

  it("blocks submission when the two passwords do not match", async () => {
    const user = await openSignUp();

    await user.type(screen.getByLabelText("Email"), "newcomer@example.test");
    await user.type(screen.getByLabelText("Password"), "long-enough-passphrase7");
    await user.type(screen.getByLabelText("Confirm password"), "different-passphrase7");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Both passwords must match.")).toBeInTheDocument();
    expect(firebaseAuthMocks.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("does not call Firebase when the local policy check fails", async () => {
    const user = await openSignUp();
    firebaseAuthMocks.validatePassword.mockImplementation((_auth, password: string) =>
      Promise.resolve(passwordPolicy(password)),
    );

    await fillSignUp(user, "tooshort1");

    const checklist = (await screen.findByText("Your password needs:"))
      .parentElement as HTMLElement;
    await waitFor(() => {
      expect(within(checklist).getAllByText("requirement met")).toHaveLength(1);
      expect(within(checklist).getAllByText("not yet met")).toHaveLength(1);
    });

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("Choose a password that meets every requirement listed below."),
    ).toBeInTheDocument();
    expect(firebaseAuthMocks.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("creates the account, sends verification, and shows the pending screen", async () => {
    const user = await openSignUp();
    const created = makeUser({ emailVerified: false, email: "newcomer@example.test" });
    firebaseAuthMocks.createUserWithEmailAndPassword.mockResolvedValue(credential(created));

    await fillSignUp(user, "long-enough-passphrase7");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(firebaseAuthMocks.createUserWithEmailAndPassword).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(firebaseAuthMocks.sendEmailVerification).toHaveBeenCalledWith(created),
    );

    await signalUser(created);
    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  });

  it("never sends the password to a Cognaxis endpoint", async () => {
    const user = await openSignUp();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    firebaseAuthMocks.createUserWithEmailAndPassword.mockResolvedValue(
      credential(makeUser({ emailVerified: false })),
    );

    await fillSignUp(user, "long-enough-passphrase7");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(firebaseAuthMocks.createUserWithEmailAndPassword).toHaveBeenCalledTimes(1),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not disclose that an address is already registered", async () => {
    const user = await openSignUp();
    firebaseAuthMocks.createUserWithEmailAndPassword.mockRejectedValue({
      code: "auth/email-already-in-use",
      message: "An account already exists with this email",
    });

    await fillSignUp(user, "long-enough-passphrase7");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText(
        "We couldn't create that account. Try signing in or resetting your password.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument();
  });

  it("prevents duplicate account creation from repeated clicks", async () => {
    const user = await openSignUp();
    let release: (value: unknown) => void = () => undefined;
    firebaseAuthMocks.createUserWithEmailAndPassword.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );

    await fillSignUp(user, "long-enough-passphrase7");
    const submit = screen.getByRole("button", { name: "Create account" });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);
    await user.click(submit);

    expect(firebaseAuthMocks.createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
    release(credential(makeUser({ emailVerified: false })));
  });

  it("gives each password field its own reveal control name", async () => {
    const user = await openSignUp();

    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show confirm password" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("sanitises failure codes that FirebaseUI does not translate", async () => {
    const user = await openSignUp();
    firebaseAuthMocks.createUserWithEmailAndPassword.mockRejectedValue({
      code: "auth/internal-error",
      message: "Firebase: Error (auth/internal-error).",
    });

    await fillSignUp(user, "long-enough-passphrase7");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("Sign-in could not be completed. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Firebase:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/auth\/internal-error/)).not.toBeInTheDocument();
  });

  it("returns to the sign-in screen from the account link", async () => {
    const user = await openSignUp();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
});
