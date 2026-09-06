import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const { renderApp, signalUser } = await import("./support/render-app");
const { installWorkspaceApi } = await import("./support/workspace-api");

let api: WorkspaceApiStub;

async function renderQuickReflection() {
  await renderApp("/app/ask");
  const account = makeUser({ uid: "user_alpha", emailVerified: true });
  account.getIdToken = vi.fn().mockResolvedValue("token-alpha");
  await signalUser(account);
  await screen.findByRole("button", { name: "New reflection" });
}

describe("quick new reflection", () => {
  beforeEach(() => {
    resetHarness();
    window.sessionStorage.removeItem("cognaxis.workspace-scope.user_alpha");
    api = installWorkspaceApi();
  });

  afterEach(() => {
    window.sessionStorage.removeItem("cognaxis.workspace-scope.user_alpha");
    vi.unstubAllGlobals();
  });

  it("opens Home for a personal reflection without creating outside Home", async () => {
    const user = userEvent.setup();
    await renderQuickReflection();

    await user.click(screen.getByRole("button", { name: "New reflection" }));

    await waitFor(() => expect(window.location.pathname).toBe("/app/journal"));
    expect(api.routes.some((route) => route.method === "POST" && route.url === "/api/v1/sessions")).toBe(false);
    expect(screen.queryByRole("dialog", { name: "New reflection" })).not.toBeInTheDocument();
  });

  it("opens the unified journal in the most recently selected writable team", async () => {
    api.organizations = [
      {
        orgId: "org_alpha",
        organizationName: "Product group",
        role: "member",
        status: "active",
        joinedAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-05T00:00:00.000Z",
      },
    ];
    window.sessionStorage.setItem("cognaxis.workspace-scope.user_alpha", "org_alpha");
    const user = userEvent.setup();
    await renderQuickReflection();

    await user.click(screen.getByRole("button", { name: "New reflection" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/app/journal");
      expect(screen.getAllByLabelText("Reflection space")[0]).toHaveValue("team:org_alpha");
    });
    expect(api.routes.some((route) => route.method === "POST" && route.url === "/api/v1/organizations/org_alpha/sessions")).toBe(false);
    expect(screen.queryByRole("dialog", { name: "New reflection" })).not.toBeInTheDocument();
  });
});
