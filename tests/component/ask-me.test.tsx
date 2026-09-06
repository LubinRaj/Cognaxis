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

async function renderAskMe() {
  await renderApp("/app/ask");
  const user = makeUser({ uid: "user_alpha", emailVerified: true });
  user.getIdToken = vi.fn().mockResolvedValue("token-alpha");
  await signalUser(user);
  await screen.findByRole("heading", { name: "Ask me" });
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "Memory scope" })).not.toBeDisabled();
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Ask Me scope selection", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
    api.organizations = [{
      orgId: "org_alpha",
      organizationName: "Product group",
      role: "member",
      status: "active",
      joinedAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
    }];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses personal memory by default", async () => {
    api.handler = (route) => route.method === "POST" && route.url === "/api/v1/personal/memory/ask"
      ? json({ answer: "Personal answer", citations: [] })
      : null;
    const user = userEvent.setup();
    await renderAskMe();

    await user.type(screen.getByLabelText("What would you like to remember or understand?"), "What did I decide?");
    await user.click(screen.getByRole("button", { name: "Ask me" }));

    await waitFor(() => {
      expect(api.routes.some((route) => route.method === "POST" && route.url === "/api/v1/personal/memory/ask")).toBe(true);
    });
    expect(api.routes.some((route) => route.url.includes("/organizations/org_alpha/memory/ask"))).toBe(false);
    expect(await screen.findByText("Personal answer")).toBeInTheDocument();
  });

  it("sends a team question only to the selected team and labels the answer", async () => {
    api.handler = (route) => route.method === "POST" && route.url === "/api/v1/organizations/org_alpha/memory/ask"
      ? json({
        answer: "Team answer",
        citations: [{ sessionId: "team-session", title: "Team roadmap", date: "2026-09-05", captureType: "update" }],
      })
      : null;
    const user = userEvent.setup();
    await renderAskMe();

    await user.selectOptions(screen.getByRole("combobox", { name: "Memory scope" }), "team:org_alpha");
    await user.type(screen.getByLabelText("What would you like to remember or understand?"), "What is our roadmap?");
    await user.click(screen.getByRole("button", { name: "Ask me" }));

    await waitFor(() => {
      expect(api.routes.some((route) => route.method === "POST" && route.url === "/api/v1/organizations/org_alpha/memory/ask")).toBe(true);
    });
    expect(api.routes.some((route) => route.url === "/api/v1/personal/memory/ask")).toBe(false);
    expect(await screen.findByText("Team answer")).toBeInTheDocument();
    expect(screen.getAllByText("Product group").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Based on this team’s reflections/)).toBeInTheDocument();
  });
});
