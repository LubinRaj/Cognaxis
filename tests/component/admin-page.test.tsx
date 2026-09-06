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
const { installWorkspaceApi, makePlatformUser } = await import("./support/workspace-api");

let api: WorkspaceApiStub;

async function renderAdmin(uid = "user_root") {
  await import("../../src/client/pages/AdminPage");
  await renderApp("/app/admin");
  const account = makeUser({ uid, emailVerified: true, email: `${uid}@example.test` });
  account.getIdToken = vi.fn().mockResolvedValue(`token-${uid}`);
  await signalUser(account);
}

describe("platform administration page", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
    api.capabilitiesAdmin = true;
    api.adminUsers = [
      makePlatformUser({ uid: "user_root", platformRole: "super_admin" }),
      makePlatformUser({ uid: "user_bravo" }),
    ];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the administration surface without the metadata notice", async () => {
    await renderAdmin();

    expect(await screen.findByText("Platform administration")).toBeInTheDocument();
    expect(screen.queryByText(/private journals are inaccessible/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Application users")).toBeInTheDocument();
    expect(screen.getByText("Product usage, last 7 days")).toBeInTheDocument();
    expect(screen.queryByText(/impersonate|view as user/i)).not.toBeInTheDocument();
  });

  it("refuses the surface to an account without admin capability", async () => {
    api.capabilitiesAdmin = false;
    await renderAdmin("user_alpha");

    expect(
      await screen.findByText("Platform administration is not available"),
    ).toBeInTheDocument();
  });

  it("requires a confirmation with an operational reason before promoting", async () => {
    const user = userEvent.setup();
    await renderAdmin();
    await screen.findByText("Application users");

    await user.click(screen.getByRole("tab", { name: "Users" }));
    expect(await screen.findByText(/Person user_bravo/)).toBeInTheDocument();
    // The signed-in admin has no manage control for themselves.
    expect(
      screen.queryByRole("button", { name: "Manage Person user_root" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manage Person user_bravo" }));
    await user.click(await screen.findByRole("menuitem", { name: "Promote to super admin" }));

    const dialog = await screen.findByRole("dialog", { name: "Promote to super admin?" });
    expect(dialog).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Promote" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Operational reason"), "Routine access review by owner.");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => {
      const patch = api.routes.find(
        (entry) => entry.method === "PATCH" && entry.url.endsWith("/users/user_bravo/role"),
      );
      expect(patch?.body).toEqual({
        role: "super_admin",
        reason: "Routine access review by owner.",
      });
    });
    await waitFor(() => {
      expect(screen.getAllByText("Super admin").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("renders the fixed-schema audit trail", async () => {
    api.adminAudit = [
      {
        id: "evt-1",
        eventType: "platformUser.roleChanged",
        actorUid: "user_root",
        targetType: "user",
        targetId: "user_bravo",
        organizationId: null,
        changes: [{ field: "platformRole", from: "user", to: "super_admin" }],
        reason: "Routine access review.",
        requestId: "req-1",
        createdAt: "2026-09-03T10:00:00.000Z",
        schemaVersion: 1,
      },
    ];
    const user = userEvent.setup();
    await renderAdmin();
    await screen.findByText("Application users");

    await user.click(screen.getByRole("tab", { name: "Audit" }));
    expect(await screen.findByText("platformUser.roleChanged")).toBeInTheDocument();
    expect(screen.getByText(/platformRole: user to super_admin/)).toBeInTheDocument();
    expect(screen.getByText(/Routine access review\./)).toBeInTheDocument();
  });
});
