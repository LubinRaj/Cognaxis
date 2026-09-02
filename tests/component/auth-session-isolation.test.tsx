import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const { firebaseAuthMocks, resetHarness, makeUser } = await import("./support/firebase-harness");
const { renderApp, signalUser, signalNoUser, waitForAuthSurface } = await import(
  "./support/render-app"
);

const ALPHA_TITLE = "Alpha private reflection";
const BRAVO_TITLE = "Bravo private reflection";

type Handler = (url: string, init: RequestInit) => Response;

let handler: Handler;
let requests: { url: string; token: string | undefined }[];

function sessionsFor(uid: string) {
  if (uid === "user_alpha") {
    return [{ id: "s-alpha", title: ALPHA_TITLE, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z", messageCount: 2 }];
  }
  if (uid === "user_bravo") {
    return [{ id: "s-bravo", title: BRAVO_TITLE, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z", messageCount: 2 }];
  }
  return [];
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("session isolation and recovery", () => {
  beforeEach(() => {
    resetHarness();
    requests = [];
    handler = (url) => {
      const uid = requests.at(-1)?.token?.replace("token-", "") ?? "";
      if (url.startsWith("/api/v1/sessions?")) return json(200, { sessions: sessionsFor(uid) });
      if (url.startsWith("/api/v1/sessions/")) {
        const list = sessionsFor(uid);
        return json(200, { session: { ...list[0], messages: [] } });
      }
      return json(200, {});
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string> | undefined;
        requests.push({ url, token: headers?.authorization?.replace("Bearer ", "") });
        return Promise.resolve(handler(url, init));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function accountFor(uid: string) {
    const account = makeUser({ uid, email: `${uid}@example.test`, emailVerified: true });
    account.getIdToken = vi.fn().mockResolvedValue(`token-${uid}`);
    return account;
  }

  it("restores an authenticated session without a signed-out flash", async () => {
    const { container } = await renderApp();

    expect(container.textContent).toContain("Preparing your private workspace…");
    expect(container.textContent).not.toContain("Think freely");
    expect(container.textContent).not.toContain("Welcome back");

    await signalUser(accountFor("user_alpha"));

    await waitFor(() => expect(screen.getAllByText(ALPHA_TITLE).length).toBeGreaterThan(0));
  });

  it("gives a second account an empty client state with no trace of the first", async () => {
    await renderApp();
    await signalUser(accountFor("user_alpha"));
    await waitFor(() => expect(screen.getAllByText(ALPHA_TITLE).length).toBeGreaterThan(0));

    await signalNoUser();
    await waitFor(() => expect(screen.queryAllByText(ALPHA_TITLE)).toHaveLength(0));
    expect(document.body.textContent).not.toContain(ALPHA_TITLE);

    await signalUser(accountFor("user_bravo"));
    await waitFor(() => expect(screen.getAllByText(BRAVO_TITLE).length).toBeGreaterThan(0));

    expect(screen.queryAllByText(ALPHA_TITLE)).toHaveLength(0);
    expect(requests.every((request) => request.token !== undefined)).toBe(true);
    expect(requests.filter((request) => request.token === "token-user_bravo").length).toBeGreaterThan(0);
  });

  it("clears the workspace immediately when the user signs out", async () => {
    const user = userEvent.setup();
    await renderApp();
    await signalUser(accountFor("user_alpha"));
    await waitFor(() => expect(screen.getAllByText(ALPHA_TITLE).length).toBeGreaterThan(0));

    // Sign out lives inside the account menu in the history pane footer.
    await user.click(screen.getAllByRole("button", { name: /alpha@example\.test/i })[0]);
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(firebaseAuthMocks.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryAllByText(ALPHA_TITLE)).toHaveLength(0));
    expect(await screen.findByRole("heading", { name: /Think freely/i })).toBeInTheDocument();
  });

  it("shows the session-expired screen after a terminal token failure", async () => {
    handler = () => json(401, { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });

    await renderApp();
    await signalUser(accountFor("user_alpha"));
    await waitForAuthSurface();

    expect(
      await screen.findByRole("heading", { name: "Please sign in again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your session could not be verified. Sign in again to continue securely."),
    ).toBeInTheDocument();
    expect(screen.queryAllByText(ALPHA_TITLE)).toHaveLength(0);
    expect(document.body.textContent).not.toContain(ALPHA_TITLE);
  });

  it("keeps the session-expired screen visible while the session is cleared", async () => {
    handler = () => json(401, { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });

    await renderApp();
    await signalUser(accountFor("user_alpha"));
    await screen.findByRole("heading", { name: "Please sign in again" });

    await signalNoUser();

    expect(screen.getByRole("heading", { name: "Please sign in again" })).toBeInTheDocument();
  });

  it("returns to sign-in from the session-expired screen", async () => {
    handler = () => json(401, { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
    const user = userEvent.setup();

    await renderApp();
    await signalUser(accountFor("user_alpha"));
    await screen.findByRole("heading", { name: "Please sign in again" });

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });

  it("sends a verified user back to verification when the server rejects the claim", async () => {
    handler = () =>
      json(403, {
        error: {
          code: "EMAIL_VERIFICATION_REQUIRED",
          message: "Verify your email address before using your private journal.",
        },
      });

    await renderApp();
    await signalUser(accountFor("user_alpha"));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.queryAllByText(ALPHA_TITLE)).toHaveLength(0);
  });

  it("never writes an identity token into browser storage", async () => {
    await renderApp();
    await signalUser(accountFor("user_alpha"));
    await waitFor(() => expect(screen.getAllByText(ALPHA_TITLE).length).toBeGreaterThan(0));

    const stored = [
      ...Object.entries({ ...window.localStorage }),
      ...Object.entries({ ...window.sessionStorage }),
    ]
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("|");

    expect(stored).not.toContain("token-user_alpha");
    expect(stored).not.toContain("Bearer");
    expect(stored).not.toContain("alpha@example.test");
  });
});
