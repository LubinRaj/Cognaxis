import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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
const { installWorkspaceApi, makeOrgSession, makeSession } =
  await import("./support/workspace-api");

let api: WorkspaceApiStub;

async function renderArchives() {
  await import("../../src/client/pages/ArchivesPage");
  await renderApp("/app/archives");
  const account = makeUser({ uid: "user_alpha", emailVerified: true });
  account.getIdToken = vi.fn().mockResolvedValue("token-user_alpha");
  await signalUser(account);
}

describe("archives page", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
    api.sessions = [
      makeSession({ id: "personal-archive", title: "Old personal plan", status: "archived" }),
    ];
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
        id: "team-archive",
        title: "Old team decision",
        status: "archived",
        createdBy: "user_member",
      }),
    ];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps personal and team archives on a dedicated, scoped page", async () => {
    const user = userEvent.setup();
    await renderArchives();

    expect(await screen.findByRole("heading", { level: 1, name: "Archives" })).toBeInTheDocument();
    const personalRow = (await screen.findByText("Old personal plan")).closest("li");
    expect(personalRow).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /Research Group/ }));
    const teamRow = (await screen.findByText("Old team decision")).closest("li");
    expect(teamRow).not.toBeNull();
    expect(api.routes.some((route) => route.url.includes("org_1/sessions?status=archived"))).toBe(true);

    await user.click(within(personalRow!).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(screen.queryByText("Old personal plan")).not.toBeInTheDocument());
    expect(api.routes.some((route) => route.url.endsWith("personal-archive/restore"))).toBe(true);

    await user.click(within(teamRow!).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this reflection permanently?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(screen.queryByText("Old team decision")).not.toBeInTheDocument());
    expect(
      api.routes.some(
        (route) => route.method === "DELETE" && route.url.endsWith("org_1/sessions/team-archive"),
      ),
    ).toBe(true);
  });
});
