import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
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

const { resetHarness, makeUser, firebaseAuthMocks } = await import("./support/firebase-harness");
const { renderApp, signalUser } = await import("./support/render-app");
const { installWorkspaceApi, makeSession, makeDetail, makeSummary, failure } = await import(
  "./support/workspace-api"
);

let api: WorkspaceApiStub;
let downloads: { name: string; blob: Blob }[];
let revokeObjectURL: ReturnType<typeof vi.spyOn>;

const CONVERSATION = [
  { id: "m1", role: "user" as const, content: "A private thought.", createdAt: "2026-09-01T09:00:00.000Z" },
  { id: "m2", role: "model" as const, content: "A grounded reply.", createdAt: "2026-09-01T09:00:01.000Z" },
];

async function scan(): Promise<string> {
  const results = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false }, "target-size": { enabled: false } },
    resultTypes: ["violations"],
  });
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.help}`)
    .join("\n");
}

async function renderWorkspace(detail = makeDetail({ id: "s1", title: "Architecture decisions" })) {
  api.sessions = [makeSession({ id: detail.id, title: detail.title })];
  api.details.set(detail.id, detail);

  await renderApp();
  const account = makeUser({ uid: "user_alpha", emailVerified: true, displayName: "Ada Lovelace" });
  account.getIdToken = vi.fn().mockResolvedValue("token-user_alpha");
  await signalUser(account);
  await screen.findByRole("heading", { level: 1, name: detail.title });
}

async function openOverflow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More reflection actions" }));
}

describe("export dialog", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
    downloads = [];

    // Only the two static helpers are replaced. Substituting the whole URL global would remove the
    // constructor that the application and its dependencies rely on.
    const blobs = new Map<string, Blob>();

    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
      const url = `blob:mock-${blobs.size}`;
      blobs.set(url, blob as Blob);
      return url;
    });
    revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      const blob = blobs.get(this.href);
      if (blob) downloads.push({ name: this.download, blob });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("offers only the implemented formats and no all-reflections option", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Export reflection" }));

    const dialog = await screen.findByRole("dialog", { name: "Export this reflection" });
    const formats = within(dialog).getAllByRole("radio");
    expect(formats).toHaveLength(2);
    expect(formats.map((input) => (input as HTMLInputElement).value)).toEqual([
      "markdown",
      "json",
    ]);
    expect(dialog.textContent).not.toContain("Plain text");
    expect(dialog.textContent).not.toContain("All Reflections");
    expect(dialog.textContent).not.toContain("All reflections");
  });

  it("shows the privacy notice", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Export reflection" }));

    expect(
      await screen.findByText(/no longer protected by your account/i),
    ).toBeInTheDocument();
  });

  it("downloads exactly the active reflection as Markdown with a sanitised filename", async () => {
    const user = userEvent.setup();
    await renderWorkspace(
      makeDetail({
        id: "s1",
        title: "Architecture decisions",
        messageCount: 2,
        summarizedMessageCount: 2,
        messages: CONVERSATION,
        summary: makeSummary({ sourceSessionId: "s1" }),
      }),
    );

    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Export reflection" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toMatch(/^cognaxis-reflection-\d{4}-\d{2}-\d{2}\.md$/);
    expect(downloads[0].name).not.toContain("Architecture");

    const text = await downloads[0].blob.text();
    expect(text).toContain("# Architecture decisions");
    expect(text).toContain("A private thought.");
    expect(text).toContain("Simplify the storage layer");
    expect(text).toContain("Isolate the storage layer.");
    expect(text).toContain("Themes: design, focus");
    expect(text).not.toContain("Weekly review");
  });

  it("downloads JSON containing only the active reflection", async () => {
    const user = userEvent.setup();
    api.sessions = [];
    await renderWorkspace(
      makeDetail({ id: "s1", title: "Architecture decisions", messageCount: 2, messages: CONVERSATION }),
    );

    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Export reflection" }));
    await user.click(screen.getByRole("radio", { name: /JSON/ }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toMatch(/\.json$/);

    const parsed = JSON.parse(await downloads[0].blob.text()) as {
      reflection: { id: string; messages: unknown[] };
    };
    expect(parsed.reflection.id).toBe("s1");
    expect(parsed.reflection.messages).toHaveLength(2);
  });

  it("revokes the object URL after the download", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Export reflection" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalled());
  });

  it("never uploads the export", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    const before = api.routes.length;

    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Export reflection" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(api.routes.length).toBe(before);
  });

  it("reports no serious accessibility violations", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Export reflection" }));
    await screen.findByRole("dialog");

    expect(await scan()).toBe("");
  });
});

describe("delete reflection dialog", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the reflection and explains what is removed", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Delete reflection" }));

    const dialog = await screen.findByRole("dialog", { name: "Delete this reflection?" });
    expect(within(dialog).getByText("Architecture decisions")).toBeInTheDocument();
    expect(dialog.textContent).toContain("generated summary will be permanently deleted");
    expect(dialog.textContent).toContain("cannot be undone");
  });

  it("does not focus the destructive action first", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Delete reflection" }));

    const dialog = await screen.findByRole("dialog");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).not.toBe(
      within(dialog).getByRole("button", { name: "Delete reflection" }),
    );
  });

  it("deletes only after confirmation and moves on to the empty workspace", async () => {
    const user = userEvent.setup();
    await renderWorkspace();

    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Delete reflection" }));
    expect(api.routes.some((route) => route.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Delete reflection" }));

    await waitFor(() => expect(api.routes.some((route) => route.method === "DELETE")).toBe(true));
    expect(
      await screen.findByRole("heading", { name: "Start your first reflection" }),
    ).toBeInTheDocument();
  });

  it("prevents a duplicate confirmation and cannot be dismissed while deleting", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    api.gate.hold = true;

    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Delete reflection" }));
    const confirm = screen.getByRole("button", { name: "Delete reflection" });
    await user.click(confirm);

    await waitFor(() => expect(confirm).toBeDisabled());
    await user.click(confirm);
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("dialog-scrim"));

    expect(api.routes.filter((route) => route.method === "DELETE")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the dialog open and the reflection intact when deletion fails", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    api.handler = (route) => (route.method === "DELETE" ? failure(500, "INTERNAL_ERROR") : null);

    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Delete reflection" }));
    await user.click(screen.getByRole("button", { name: "Delete reflection" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Architecture decisions" })).toBeInTheDocument();
  });

  it("hands a recent-authentication rejection to the auth state machine without replaying", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    api.handler = (route) =>
      route.method === "DELETE"
        ? failure(401, "RECENT_AUTH_REQUIRED", "Please sign in again to continue.")
        : null;

    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Delete reflection" }));
    await user.click(screen.getByRole("button", { name: "Delete reflection" }));

    expect(
      await screen.findByRole("heading", { name: "Please sign in again" }),
    ).toBeInTheDocument();
    expect(api.routes.filter((route) => route.method === "DELETE")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Architecture decisions");
  });

  it("reports no serious accessibility violations", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openOverflow(user);
    await user.click(await screen.findByRole("menuitem", { name: "Delete reflection" }));
    await screen.findByRole("dialog");

    expect(await scan()).toBe("");
  });
});

describe("account and appearance", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openAccountMenu(user: ReturnType<typeof userEvent.setup>) {
    const triggers = screen.getAllByRole("button", { name: /Ada Lovelace/ });
    await user.click(triggers[0]);
  }

  it("shows the signed-in identity and verification status, and no internal identifiers", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openAccountMenu(user);

    const menu = await screen.findByRole("menu", { name: "Account and appearance" });
    expect(within(menu).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(menu).getByText("alpha@example.test")).toBeInTheDocument();
    expect(within(menu).getByText("Email verified")).toBeInTheDocument();
    expect(menu.textContent).not.toContain("user_alpha");
    expect(menu.textContent).not.toContain("password");
    expect(menu.textContent).not.toContain("google.com");
  });

  it("offers only truthful preferences", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openAccountMenu(user);

    const menu = await screen.findByRole("menu");
    for (const label of ["System", "Light", "Dark", "Sign out"]) {
      expect(within(menu).getByRole("menuitem", { name: new RegExp(label) })).toBeInTheDocument();
    }
    for (const forbidden of ["Reset mock data", "Model", "Notifications", "zero-knowledge"]) {
      expect(menu.textContent).not.toContain(forbidden);
    }
  });

  it("changes the theme immediately and stores only the preference", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openAccountMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: /Dark/ }));

    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("dark"));
    expect(window.localStorage.getItem("cognaxis_theme_preference")).toBe("dark");

    const stored = Object.entries({ ...window.localStorage })
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("|");
    expect(stored).not.toContain("alpha@example.test");
    expect(stored).not.toContain("token-user_alpha");
    expect(stored).not.toContain("A private thought");
  });

  it("explains protection without unsupported claims", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openAccountMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: /How your journal is protected/ }));

    const dialog = await screen.findByRole("dialog", { name: "How your journal is protected" });
    expect(dialog.textContent).toContain("never stores or sees your password");
    expect(dialog.textContent).not.toContain("zero-knowledge");
    expect(dialog.textContent).not.toContain("encrypted at rest");
    expect(dialog.textContent).not.toContain("100%");
  });

  it("signs out from the menu", async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    await openAccountMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(firebaseAuthMocks.signOut).toHaveBeenCalledTimes(1));
  });
});

describe("workspace accessibility", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports no serious violations on a populated conversation", async () => {
    await renderWorkspace(
      makeDetail({
        id: "s1",
        title: "Architecture decisions",
        messageCount: 2,
        summarizedMessageCount: 2,
        messages: CONVERSATION,
        summary: makeSummary({ sourceSessionId: "s1" }),
      }),
    );

    expect(await scan()).toBe("");
  });

  it("reports no serious violations on the first-use empty workspace", async () => {
    await renderApp();
    const account = makeUser({ uid: "user_alpha", emailVerified: true });
    account.getIdToken = vi.fn().mockResolvedValue("token-user_alpha");
    await signalUser(account);
    await screen.findByRole("heading", { name: "Start your first reflection" });

    expect(await scan()).toBe("");
  });

  it("exposes correct landmarks and one level-one heading", async () => {
    await renderWorkspace();

    expect(screen.getAllByRole("navigation", { name: "Reflection history" })).toHaveLength(1);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("offers a skip link to the reflection", async () => {
    await renderWorkspace();

    const skip = screen.getByRole("link", { name: "Skip to your reflection" });
    expect(skip).toHaveAttribute("href", "#reflection-main");
    expect(document.getElementById("reflection-main")).not.toBeNull();
  });

  it("keeps every workspace control reachable by keyboard", async () => {
    const user = userEvent.setup();
    await renderWorkspace(
      makeDetail({ id: "s1", title: "Architecture decisions", messageCount: 2, messages: CONVERSATION }),
    );

    const reached = new Set<string>();
    for (let index = 0; index < 30; index += 1) {
      await user.tab();
      const active = document.activeElement as HTMLElement | null;
      if (active) reached.add(active.getAttribute("aria-label") ?? active.textContent ?? "");
    }

    expect([...reached].some((label) => label.includes("New reflection"))).toBe(true);
    expect([...reached].some((label) => label.includes("Search recent reflections"))).toBe(true);
    expect([...reached].some((label) => label.includes("Write your reflection"))).toBe(true);
  });
});
