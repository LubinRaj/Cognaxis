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
const { installWorkspaceApi, makeSession, makeDetail, failure, releaseGate } = await import(
  "./support/workspace-api"
);

let api: WorkspaceApiStub;

/** The history pane, scoped so a title in the app bar never satisfies a history assertion. */
function historyPane(): HTMLElement {
  const panes = screen.getAllByRole("navigation", { name: "Reflection history" });
  return panes[0];
}

async function renderWorkspace() {
  await renderApp();
  const account = makeUser({ uid: "user_alpha", emailVerified: true });
  account.getIdToken = vi.fn().mockResolvedValue("token-user_alpha");
  await signalUser(account);
  return account;
}

describe("reflection history pane", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows skeleton rows while the list loads, then the reflections", async () => {
    api.sessions = [
      makeSession({ id: "s1", title: "Architecture decisions" }),
      makeSession({ id: "s2", title: "Weekly review" }),
    ];
    api.details.set("s1", makeDetail({ id: "s1", title: "Architecture decisions" }));

    api.gate.hold = true;
    await renderWorkspace();

    expect(await screen.findByRole("status", { name: "Loading reflections" })).toBeInTheDocument();

    releaseGate(api);
    expect(await within(historyPane()).findByText("Architecture decisions")).toBeInTheDocument();
    expect(within(historyPane()).getByText("Weekly review")).toBeInTheDocument();
  });

  it("keeps archives out of Home and does not fetch them in the background", async () => {
    api.sessions = [
      makeSession({ id: "s1", title: "Active reflection" }),
      makeSession({ id: "s2", title: "Archived reflection", status: "archived" }),
    ];
    api.details.set("s1", makeDetail({ id: "s1", title: "Active reflection" }));

    await renderWorkspace();
    expect(await within(historyPane()).findByText("Active reflection")).toBeInTheDocument();
    expect(within(historyPane()).queryByText("Archived reflection")).not.toBeInTheDocument();
    expect(within(historyPane()).queryByText(/Archives/)).not.toBeInTheDocument();
    expect(api.routes.some((route) => route.url.includes("status=archived"))).toBe(false);
  });

  it("shows explicit next steps as open loops with a weekly review path", async () => {
    api.sessions = [makeSession({ id: "s1", title: "Launch decision" })];
    api.details.set("s1", makeDetail({ id: "s1", title: "Launch decision" }));
    api.openLoops = [{
      sessionId: "s1",
      title: "Launch decision",
      captureType: "decision",
      date: "2026-09-03",
      text: "Confirm the release checklist.",
    }];
    await renderWorkspace();

    expect(await within(historyPane()).findByText("Confirm the release checklist.")).toBeInTheDocument();
    expect(within(historyPane()).getByRole("link", { name: "Weekly view" })).toHaveAttribute("href", "/app/insights");
  });

  it("uses plain product language with no organisation or security jargon", async () => {
    api.sessions = [makeSession({ id: "s1" })];
    api.details.set("s1", makeDetail({ id: "s1" }));
    await renderWorkspace();
    await within(historyPane()).findByText("Reflection s1");

    const text = document.body.textContent ?? "";
    for (const phrase of [
      "Personal Vault",
      "Workspace Boundary",
      "UID",
      "MVP",
      "permission-scoped",
      "Derived Personal Memory",
      "Scope",
    ]) {
      expect(text).not.toContain(phrase);
    }
    // "Organizations" is a real product destination; only the bare abbreviation is jargon.
    expect(text).not.toMatch(/\bOrg\b/);
  });

  it("filters the loaded reflections by title only", async () => {
    const user = userEvent.setup();
    api.sessions = [
      makeSession({ id: "s1", title: "Architecture decisions" }),
      makeSession({ id: "s2", title: "Weekly review" }),
    ];
    api.details.set("s1", makeDetail({ id: "s1", title: "Architecture decisions" }));
    await renderWorkspace();
    await within(historyPane()).findByText("Weekly review");

    const search = screen.getByLabelText("Search recent reflections");
    await user.type(search, "weekly");

    expect(within(historyPane()).getByText("Weekly review")).toBeInTheDocument();
    expect(within(historyPane()).queryByText("Architecture decisions")).not.toBeInTheDocument();
    expect(screen.getByText("Matching reflections (1)")).toBeInTheDocument();
  });

  it("filters reflections by one or more canonical tags from the filter popover", async () => {
    const user = userEvent.setup();
    api.sessions = [
      makeSession({ id: "s1", title: "Architecture decisions", tags: ["work"] }),
      makeSession({ id: "s2", title: "Family plans", tags: ["family"] }),
    ];
    api.details.set("s1", makeDetail({ id: "s1", title: "Architecture decisions", tags: ["work"] }));
    await renderWorkspace();
    await within(historyPane()).findByText("Family plans");

    await user.click(screen.getByRole("button", { name: "Reflection filters" }));
    const filters = screen.getByRole("dialog", { name: "Reflection filters" });
    await user.click(within(filters).getByRole("button", { name: "work" }));

    expect(within(historyPane()).getByText("Architecture decisions")).toBeInTheDocument();
    expect(within(historyPane()).queryByText("Family plans")).not.toBeInTheDocument();

    await user.click(within(filters).getByRole("button", { name: "family" }));
    expect(within(historyPane()).getByText("Family plans")).toBeInTheDocument();
  });

  it("explains an empty filter result and offers a way back", async () => {
    const user = userEvent.setup();
    api.sessions = [makeSession({ id: "s1", title: "Architecture decisions" })];
    api.details.set("s1", makeDetail({ id: "s1", title: "Architecture decisions" }));
    await renderWorkspace();
    await within(historyPane()).findByText("Architecture decisions");

    await user.type(screen.getByLabelText("Search recent reflections"), "nothing matches");

    expect(await screen.findByText("No matching reflections")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filter" }));

    expect(await within(historyPane()).findByText("Architecture decisions")).toBeInTheDocument();
  });

  it("clears the search field with Escape before anything else", async () => {
    const user = userEvent.setup();
    api.sessions = [makeSession({ id: "s1" })];
    api.details.set("s1", makeDetail({ id: "s1" }));
    await renderWorkspace();
    await within(historyPane()).findByText("Reflection s1");

    const search = screen.getByLabelText("Search recent reflections");
    await user.type(search, "architecture");
    expect(search).toHaveValue("architecture");

    await user.type(search, "{Escape}");
    expect(search).toHaveValue("");
  });

  it("offers a retry when the list cannot be loaded and never shows an API phrase", async () => {
    api.handler = (route) =>
      route.url.startsWith("/api/v1/sessions?") ? failure(500, "INTERNAL_ERROR") : null;

    await renderWorkspace();

    const alerts = await screen.findAllByRole("status");
    expect(alerts.length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("API is not ready");
    expect(screen.getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(0);

    api.handler = null;
    api.sessions = [makeSession({ id: "s1", title: "Recovered reflection" })];
    api.details.set("s1", makeDetail({ id: "s1", title: "Recovered reflection" }));

    await userEvent.setup().click(screen.getAllByRole("button", { name: "Try again" })[0]);
    expect(await within(historyPane()).findByText("Recovered reflection")).toBeInTheDocument();
  });

  it("marks the open reflection as current", async () => {
    api.sessions = [makeSession({ id: "s1" }), makeSession({ id: "s2" })];
    api.details.set("s1", makeDetail({ id: "s1" }));
    api.details.set("s2", makeDetail({ id: "s2" }));
    await renderWorkspace();

    await waitFor(() => {
      const rows = within(historyPane()).getAllByRole("button", { name: /Reflection s1/ });
      expect(rows.some((row) => row.getAttribute("aria-current") === "true")).toBe(true);
    });
  });

  it("creates a reflection, places it at the top, and opens it", async () => {
    const user = userEvent.setup();
    api.sessions = [makeSession({ id: "s1", title: "Older reflection" })];
    api.details.set("s1", makeDetail({ id: "s1", title: "Older reflection" }));
    await renderWorkspace();
    await within(historyPane()).findByText("Older reflection");

    await user.click(screen.getByRole("button", { name: "New reflection" }));

    const list = await within(historyPane()).findByRole("list");
    const rows = within(list).getAllByRole("button");
    expect(rows[0]).toHaveTextContent("New reflection");
    expect(await screen.findByRole("heading", { level: 1, name: "New reflection" })).toBeInTheDocument();
  });

  it("keeps the reflection count in step after a message is sent", async () => {
    const user = userEvent.setup();
    api.sessions = [makeSession({ id: "s1", title: "Counted reflection", messageCount: 2 })];
    api.details.set(
      "s1",
      makeDetail({
        id: "s1",
        title: "Counted reflection",
        messageCount: 2,
        messages: [
          { id: "m1", role: "user", content: "first", createdAt: "2026-09-01T09:00:00.000Z" },
          { id: "m2", role: "model", content: "reply", createdAt: "2026-09-01T09:00:01.000Z" },
        ],
      }),
    );
    await renderWorkspace();
    await within(historyPane()).findByText("2 messages");

    await user.type(screen.getByLabelText("Write your reflection"), "another thought");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await within(historyPane()).findByText("4 messages")).toBeInTheDocument();
  });

  it("shows the first-use empty workspace when no reflection exists", async () => {
    await renderWorkspace();

    expect(
      await screen.findByRole("heading", { name: "Start your first reflection" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No reflections yet")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Sample");
  });
});

describe("mobile reflection drawer", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens, traps focus, and closes with Escape restoring focus to the trigger", async () => {
    const user = userEvent.setup();
    api.sessions = [makeSession({ id: "s1" })];
    api.details.set("s1", makeDetail({ id: "s1" }));
    await renderWorkspace();
    await within(historyPane()).findByText("Reflection s1");

    const trigger = screen.getByRole("button", { name: "Open reflection history" });
    await user.click(trigger);

    const drawers = screen.getAllByRole("navigation", { name: "Reflection history" });
    const drawer = drawers[drawers.length - 1];
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));

    for (let index = 0; index < 6; index += 1) {
      await user.tab();
      expect(drawer.contains(document.activeElement)).toBe(true);
    }

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getAllByRole("navigation", { name: "Reflection history" })).toHaveLength(1),
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("closes after a reflection is selected", async () => {
    const user = userEvent.setup();
    api.sessions = [makeSession({ id: "s1" }), makeSession({ id: "s2" })];
    api.details.set("s1", makeDetail({ id: "s1" }));
    api.details.set("s2", makeDetail({ id: "s2" }));
    await renderWorkspace();
    await within(historyPane()).findByText("Reflection s2");

    await user.click(screen.getByRole("button", { name: "Open reflection history" }));
    const drawers = screen.getAllByRole("navigation", { name: "Reflection history" });
    await user.click(within(drawers[drawers.length - 1]).getByRole("button", { name: /Reflection s2/ }));

    await waitFor(() =>
      expect(screen.getAllByRole("navigation", { name: "Reflection history" })).toHaveLength(1),
    );
  });

  it("closes when the scrim is clicked", async () => {
    const user = userEvent.setup();
    api.sessions = [makeSession({ id: "s1" })];
    api.details.set("s1", makeDetail({ id: "s1" }));
    await renderWorkspace();
    await within(historyPane()).findByText("Reflection s1");

    await user.click(screen.getByRole("button", { name: "Open reflection history" }));
    await user.click(screen.getByTestId("history-scrim"));

    await waitFor(() =>
      expect(screen.getAllByRole("navigation", { name: "Reflection history" })).toHaveLength(1),
    );
  });
});
