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
const { installWorkspaceApi, makeOrgDetail, makeOrgMember, makeOrgSession, makeOrgSessionDetail } =
  await import("./support/workspace-api");

let api: WorkspaceApiStub;

async function renderAt(path: string, uid = "user_alpha") {
  // Lazily routed pages are resolved ahead of the render so Suspense never races the testing
  // library's default query timeout on the first transform of a chunk.
  await Promise.all([
    import("../../src/client/pages/OrganizationsPage"),
    import("../../src/client/pages/OrganizationWorkspacePage"),
    import("../../src/client/pages/JoinPage"),
  ]);
  await renderApp(path);
  const account = makeUser({ uid, emailVerified: true });
  account.getIdToken = vi.fn().mockResolvedValue(`token-${uid}`);
  await signalUser(account);
}

describe("organizations list", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the user's organizations with their roles", async () => {
    api.organizations = [
      {
        orgId: "org_1",
        organizationName: "Research Group",
        role: "owner",
        status: "active",
        joinedAt: "2026-09-01T09:00:00.000Z",
        updatedAt: "2026-09-01T09:00:00.000Z",
      },
    ];
    api.orgSessions = [
      makeOrgSession({
        id: "orgs-update-1",
        title: "Launch status",
        captureType: "update",
        updatedAt: "2026-09-03T09:00:00.000Z",
      }),
    ];
    await renderAt("/app/organizations");

    expect(await screen.findByText("Research Group")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(await screen.findByText(/1 shared reflection/)).toBeInTheDocument();
  });

  it("creates an organization and opens its workspace", async () => {
    const user = userEvent.setup();
    await renderAt("/app/organizations");
    await screen.findByRole("heading", { name: "Teams" });

    await user.click(screen.getAllByRole("button", { name: "New team" })[0]);
    await screen.findByRole("dialog", { name: "New team" });
    await user.type(screen.getByLabelText("Name"), "Product research group");
    await user.click(screen.getByRole("button", { name: "Create team" }));

    await waitFor(() => {
      expect(
        api.routes.some(
          (entry) => entry.method === "POST" && entry.url === "/api/v1/organizations",
        ),
      ).toBe(true);
    });

    expect(
      await screen.findByRole("heading", { name: "Product research group" }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/app/organizations/org_new");
    expect(screen.getByText("Organization workspace")).toBeInTheDocument();
  });
});

describe("organization workspace", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides management tabs and writing from a viewer", async () => {
    api.orgDetail = makeOrgDetail({
      role: "viewer",
      permissions: {
        canWrite: false,
        canManageMembers: false,
        canViewInvites: false,
        canInviteAdmin: false,
        canUpdateSettings: false,
        canViewAudit: false,
      },
    });
    await renderAt("/app/organizations/org_1");

    await screen.findByRole("heading", { name: "Synthetic Org" });
    expect(screen.getByRole("tab", { name: /Reflections/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Invites" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Settings" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New shared reflection" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(/Shared reflections will appear here/),
    ).toBeInTheDocument();
  });

  it("keeps team reflections read-only within Teams", async () => {
    const user = userEvent.setup();
    api.orgDetail = makeOrgDetail();
    api.orgSessions = [makeOrgSession({ id: "orgs-1", createdBy: "user_owner" })];
    api.orgSessionDetails.set(
      "orgs-1",
      makeOrgSessionDetail({ id: "orgs-1", createdBy: "user_owner" }),
    );
    api.orgMembers = [
      makeOrgMember({ uid: "user_owner", displayName: "Olive Owner", role: "owner" }),
      makeOrgMember({ uid: "user_alpha", displayName: "Alex Alpha" }),
    ];
    await renderAt("/app/organizations/org_1");

    await user.click(await screen.findByText("Shared reflection orgs-1"));
    expect(window.location.pathname).toBe("/app/organizations/org_1");
    expect(await screen.findByRole("heading", { name: "Shared reflection orgs-1" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Message to the organization")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New shared reflection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
  });

  it("does not expose reflection mutation controls in Teams", async () => {
    const user = userEvent.setup();
    api.orgDetail = makeOrgDetail();
    api.orgSessions = [makeOrgSession({ id: "orgs-rename", createdBy: "user_owner" })];
    api.orgSessionDetails.set(
      "orgs-rename",
      makeOrgSessionDetail({ id: "orgs-rename", createdBy: "user_owner" }),
    );
    await renderAt("/app/organizations/org_1");

    await user.click(await screen.findByText("Shared reflection orgs-rename"));
    expect(window.location.pathname).toBe("/app/organizations/org_1");
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tags" })).not.toBeInTheDocument();
  });

  it("keeps archived reflections out of the team conversation", async () => {
    api.orgDetail = makeOrgDetail({
      role: "viewer",
      permissions: {
        canWrite: false,
        canManageMembers: false,
        canViewInvites: false,
        canInviteAdmin: false,
        canUpdateSettings: false,
        canViewAudit: false,
      },
    });
    api.orgSessions = [makeOrgSession({ id: "orgs-archived", status: "archived", createdBy: "user_owner" })];
    await renderAt("/app/organizations/org_1");
    await screen.findByText("No shared reflections yet");
    expect(screen.queryByText(/Archived reflections/)).not.toBeInTheDocument();
    expect(api.routes.some((route) => route.url.includes("status=archived"))).toBe(false);
  });

  it("creates a one-time invitation link with the secret only in the fragment", async () => {
    const user = userEvent.setup();
    api.orgDetail = makeOrgDetail({
      role: "owner",
      permissions: {
        canWrite: true,
        canManageMembers: true,
        canViewInvites: true,
        canInviteAdmin: true,
        canUpdateSettings: true,
        canViewAudit: true,
      },
    });
    await renderAt("/app/organizations/org_1");
    await screen.findByRole("heading", { name: "Synthetic Org" });

    await user.click(screen.getByRole("tab", { name: "Invites" }));
    await user.click(await screen.findByRole("button", { name: "Create invitation link" }));

    const link = await screen.findByTestId("invite-link");
    expect(link.textContent).toContain("/join?org=org_1&invite=invite_1#token=");
    expect(
      screen.getByText(/for safety it will not be shown again/i),
    ).toBeInTheDocument();
  });

  it("lets an owner manage member roles but never themselves or the owner", async () => {
    const user = userEvent.setup();
    api.orgDetail = makeOrgDetail({
      role: "owner",
      permissions: {
        canWrite: true,
        canManageMembers: true,
        canViewInvites: true,
        canInviteAdmin: true,
        canUpdateSettings: true,
        canViewAudit: true,
      },
    });
    api.orgMembers = [
      makeOrgMember({ uid: "user_alpha", displayName: "Alex Alpha", role: "owner" }),
      makeOrgMember({ uid: "user_bravo", displayName: "Bea Bravo", role: "member" }),
    ];
    await renderAt("/app/organizations/org_1");
    await screen.findByRole("heading", { name: "Synthetic Org" });

    await user.click(screen.getByRole("tab", { name: /Members/ }));
    expect(await screen.findByText("Bea Bravo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage Alex Alpha" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manage Bea Bravo" }));
    await user.click(await screen.findByRole("menuitem", { name: "Make admin" }));

    await waitFor(() => {
      const patch = api.routes.find(
        (routeEntry) =>
          routeEntry.method === "PATCH" && routeEntry.url.endsWith("/members/user_bravo"),
      );
      expect(patch?.body).toEqual({ role: "admin" });
    });
  });
});

describe("invitation acceptance", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scrubs the secret from the URL, previews, and joins", async () => {
    const secret = "s".repeat(43);
    api.orgDetail = makeOrgDetail();
    await renderAt(`/join?org=org_1&invite=invite_1#token=${secret}`);

    expect(
      await screen.findByRole("heading", { name: "Join Synthetic Org?" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("");

    const acceptCallsBefore = api.routes.filter((entry) => entry.url.includes("/accept"));
    expect(acceptCallsBefore).toHaveLength(0);

    await userEvent.setup().click(screen.getByRole("button", { name: "Join organization" }));

    await screen.findByRole("heading", { name: "Synthetic Org" });
    expect(window.location.pathname).toBe("/app/organizations/org_1");
    const acceptCall = api.routes.find((entry) => entry.url.includes("/accept"));
    expect(acceptCall?.body).toEqual({ secret });
  });

  it("shows one safe state for an invalid invitation", async () => {
    const { failure } = await import("./support/workspace-api");
    api.handler = (route) =>
      route.url.includes("/preview")
        ? failure(404, "INVITE_INVALID", "This invitation is not valid.")
        : null;
    await renderAt(`/join?org=org_1&invite=invite_1#token=${"s".repeat(43)}`);

    expect(
      await screen.findByText(/This invitation is not valid any more/),
    ).toBeInTheDocument();
  });
});
