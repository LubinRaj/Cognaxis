import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type * as FirebaseAuthModule from "firebase/auth";
import type { WorkspaceApiStub } from "./support/workspace-api";

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof FirebaseAuthModule>();
  const harness = await import("./support/firebase-harness");
  return { ...actual, ...harness.firebaseAuthMocks };
});

vi.mock("../../src/client/lib/firebase", async () => {
  const harness = await import("./support/firebase-harness");
  return harness.firebaseModuleMock;
});

const { resetHarness, makeUser } = await import("./support/firebase-harness");
const { renderApp, signalNoUser, signalUser } = await import("./support/render-app");
const { installWorkspaceApi, failure } = await import("./support/workspace-api");

let api: WorkspaceApiStub;

function verifiedAccount(uid = "user_alpha") {
  const account = makeUser({ uid, emailVerified: true });
  account.getIdToken = vi.fn().mockResolvedValue(`token-${uid}`);
  return account;
}

async function waitForJournal() {
  await waitFor(() => {
    expect(screen.getAllByRole("navigation", { name: "Reflection history" }).length).toBeGreaterThan(0);
  });
}

describe("application routing", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an authenticated visit of the root to the journal", async () => {
    await renderApp("/");
    await signalUser(verifiedAccount());

    await waitForJournal();
    expect(window.location.pathname).toBe("/app/journal");
  });

  it("returns to a deep link after signing in", async () => {
    await renderApp("/app/journal");
    await signalNoUser();

    expect(await screen.findByText(/Think clearly/)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");

    await signalUser(verifiedAccount());
    await waitForJournal();
    expect(window.location.pathname).toBe("/app/journal");
  });

  it("redirects an unknown application route to the journal", async () => {
    await renderApp("/app/does-not-exist");
    await signalUser(verifiedAccount());

    await waitForJournal();
    expect(window.location.pathname).toBe("/app/journal");
  });

  it("serves the public privacy and terms pages without authentication", async () => {
    await renderApp("/privacy");
    await signalNoUser();
    expect(await screen.findByRole("heading", { name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText(/not used to train its models/)).toBeInTheDocument();
    expect(screen.getByText(/Google Maps Platform Terms of Service/)).toBeInTheDocument();
    cleanup();

    await renderApp("/terms");
    await signalNoUser();
    expect(await screen.findByRole("heading", { name: "Terms of use" })).toBeInTheDocument();
    expect(screen.getByText(/not medical advice/)).toBeInTheDocument();
  });

  it("redirects an unknown public route to the landing page", async () => {
    await renderApp("/does-not-exist");
    await signalNoUser();

    expect(await screen.findByText(/Think clearly/)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("shows the navigation destinations the account is allowed to use", async () => {
    await renderApp("/");
    await signalUser(verifiedAccount());
    await waitForJournal();

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "Insights" }).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByRole("link", { name: "Home" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Places" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Teams" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("keeps account controls in the permanent navigation on non-journal pages", async () => {
    const account = verifiedAccount();
    await renderApp("/app/insights");
    await signalUser(account);

    await screen.findByRole("heading", { name: /^Insights$/ });
    expect(screen.getAllByRole("button", { name: /alpha@example\.test/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("navigation", { name: "Reflection history" })).not.toBeInTheDocument();
  });

  it("keeps Home personal even when a recent team is remembered", async () => {
    window.sessionStorage.setItem("cognaxis.workspace-scope.user_alpha", "org_older");
    api.organizations = [
      {
        orgId: "org_older",
        organizationName: "Older team",
        role: "member",
        status: "active",
        joinedAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
      {
        orgId: "org_recent",
        organizationName: "Recent team",
        role: "member",
        status: "active",
        joinedAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-09-05T00:00:00.000Z",
      },
    ];

    await renderApp("/app/journal");
    await signalUser(verifiedAccount());

    await waitForJournal();
    expect(window.location.pathname).toBe("/app/journal");
    expect(screen.getAllByLabelText("Reflection space")[0]).toHaveValue("personal");
    expect(window.sessionStorage.getItem("cognaxis.workspace-scope.user_alpha")).toBe("org_older");
    window.sessionStorage.removeItem("cognaxis.workspace-scope.user_alpha");
  });

  it("shows the admin destination only to a platform administrator", async () => {
    api.handler = (route) =>
      route.url === "/api/v1/me/capabilities"
        ? new Response(
            JSON.stringify({
              capabilities: {
                platformRole: "super_admin",
                status: "active",
                features: { insights: true, maps: true, organizations: true, admin: true },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        : null;

    await renderApp("/");
    await signalUser(verifiedAccount("user_root"));
    await waitForJournal();

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "Admin" }).length).toBeGreaterThan(0);
    });
  });

  it("replaces the workspace with a suspended state for a suspended account", async () => {
    api.handler = (route) =>
      route.url === "/api/v1/me/capabilities"
        ? failure(403, "ACCOUNT_SUSPENDED", "This account is currently suspended.")
        : null;

    await renderApp("/");
    await signalUser(verifiedAccount());

    expect(
      await screen.findByRole("heading", { name: "This account is suspended" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Reflection history" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("hides navigation for features that are disabled on the server", async () => {
    api.handler = (route) =>
      route.url === "/api/v1/me/capabilities"
        ? new Response(
            JSON.stringify({
              capabilities: {
                platformRole: "user",
                status: "active",
                features: { insights: false, maps: false, organizations: false, admin: false },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        : null;

    await renderApp("/");
    await signalUser(verifiedAccount());
    await waitForJournal();

    expect(screen.getAllByRole("link", { name: "Home" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Insights" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Places" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Teams" })).not.toBeInTheDocument();
  });
});
