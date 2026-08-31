import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const { firebaseAuthMocks, resetHarness, makeUser, emitObserverError, observerCount } = await import(
  "./support/firebase-harness"
);
const { App } = await import("../../src/client/App");
const { renderApp, signalUser, signalNoUser } = await import("./support/render-app");
const { BOOTSTRAP_TIMEOUT_MS } = await import("../../src/client/auth/AuthProvider");

describe("authentication bootstrap", () => {
  beforeEach(() => {
    resetHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the bootstrap screen with no private or signed-out content", async () => {
    const { container } = await renderApp();

    expect(screen.getByRole("status")).toHaveTextContent("Preparing your private workspace…");
    expect(container.textContent).not.toContain("Think freely");
    expect(container.textContent).not.toContain("Welcome back");
    expect(container.textContent).not.toContain("Alpha");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("completes any pending redirect before starting the observer", async () => {
    const order: string[] = [];
    firebaseAuthMocks.getRedirectResult.mockImplementation(() => {
      order.push("redirect");
      return Promise.resolve(null);
    });
    firebaseAuthMocks.onIdTokenChanged.mockImplementation(() => {
      order.push("observer");
      return () => undefined;
    });

    await renderApp();

    await waitFor(() => expect(order).toEqual(["redirect", "observer"]));
  });

  it("registers exactly one identity observer", async () => {
    await renderApp();
    await signalNoUser();

    expect(observerCount()).toBe(1);
  });

  it("surfaces a sanitised message when the redirect result fails", async () => {
    firebaseAuthMocks.getRedirectResult.mockRejectedValue({
      code: "auth/account-exists-with-different-credential",
      message: "Firebase raw provider payload",
    });

    await renderApp();
    await signalNoUser();

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "This account was set up with a different sign-in method. Use that method to continue.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/raw provider payload/)).not.toBeInTheDocument();
  });

  it("recovers to the session-expired screen when the observer reports a failure", async () => {
    await renderApp();

    await act(async () => {
      emitObserverError(new Error("listener failed"));
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("heading", { name: "Please sign in again" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/listener failed/)).not.toBeInTheDocument();
  });

  it("offers a bounded retry when initialisation never completes", async () => {
    vi.useFakeTimers();
    firebaseAuthMocks.getRedirectResult.mockReturnValue(new Promise(() => undefined));

    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(BOOTSTRAP_TIMEOUT_MS + 100);
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing your workspace is taking longer than expected.",
    );
    const retry = screen.getByRole("button", { name: "Try again" });

    firebaseAuthMocks.getRedirectResult.mockResolvedValue(null);
    fireEvent.click(retry);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("routes a verified session straight to the workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ sessions: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );

    await renderApp();
    await signalUser(makeUser({ emailVerified: true }));

    await waitFor(() =>
      expect(screen.queryByText("Preparing your private workspace…")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("heading", { name: "Welcome back" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Verify your email" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("routes an unverified session to the verification screen, never the workspace", async () => {
    await renderApp();
    await signalUser(makeUser({ emailVerified: false }));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  });
});
