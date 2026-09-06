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
const {
  installWorkspaceApi,
  makeSession,
  makeDetail,
  makeSummary,
  failure,
  releaseGate,
  stubClipboard,
} = await import("./support/workspace-api");

let api: WorkspaceApiStub;
let clipboard: ReturnType<typeof stubClipboard>;

const CONVERSATION = [
  {
    id: "m1",
    role: "user" as const,
    content: "Line one\nLine two",
    createdAt: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "m2",
    role: "model" as const,
    content: "A grounded reply from Cognaxis.",
    createdAt: "2026-09-01T09:00:01.000Z",
  },
];

async function renderWorkspace() {
  await renderApp();
  const account = makeUser({ uid: "user_alpha", emailVerified: true });
  account.getIdToken = vi.fn().mockResolvedValue("token-user_alpha");
  await signalUser(account);
}

function seedConversation(overrides: Parameters<typeof makeDetail>[0]) {
  const title = overrides.title ?? "Reflection";
  api.sessions = [makeSession({ id: overrides.id, title })];
  api.details.set(overrides.id, makeDetail({ ...overrides, title }));
}

describe("conversation thread", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
    clipboard = stubClipboard(() => Promise.resolve());
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("labels the speakers as You and Cognaxis and preserves line breaks", async () => {
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();

    const yours = await screen.findByRole("article", { name: "Your message" });
    expect(within(yours).getByText(/Line one/)).toBeInTheDocument();
    expect(yours.textContent).toContain("Line one\nLine two");

    const reply = screen.getByRole("article", { name: "Message from Cognaxis" });
    expect(within(reply).getByText("A grounded reply from Cognaxis.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Cognaxis Intelligence");
  });

  it("renders model content as text and never as markup", async () => {
    seedConversation({
      id: "s1",
      messageCount: 2,
      messages: [
        CONVERSATION[0],
        {
          id: "m2",
          role: "model",
          content: "<img src=x onerror=alert(1)> and <b>bold</b>",
          createdAt: "2026-09-01T09:00:01.000Z",
        },
      ],
    });
    await renderWorkspace();

    const reply = await screen.findByRole("article", { name: "Message from Cognaxis" });
    expect(within(reply).getByText(/onerror=alert\(1\)/)).toBeInTheDocument();
    expect(reply.querySelector("img")).toBeNull();
    expect(reply.querySelector("b")).toBeNull();
  });

  it("copies a message and announces the result politely", async () => {
    const user = userEvent.setup();
    clipboard = stubClipboard(() => Promise.resolve());
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();

    const reply = await screen.findByRole("article", { name: "Message from Cognaxis" });
    await user.click(within(reply).getByRole("button", { name: "Copy message" }));

    expect(clipboard).toHaveBeenCalledWith("A grounded reply from Cognaxis.");
    await waitFor(() =>
      expect(within(reply).getByRole("button", { name: "Message copied" })).toBeInTheDocument(),
    );
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain("Copied");
  });

  it("reports a clipboard failure without blocking the interface", async () => {
    const user = userEvent.setup();
    clipboard = stubClipboard(() => Promise.reject(new Error("denied")));
    expect(clipboard).not.toHaveBeenCalled();
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();

    const reply = await screen.findByRole("article", { name: "Message from Cognaxis" });
    await user.click(within(reply).getByRole("button", { name: "Copy message" }));

    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
        "Copying is not available",
      ),
    );
    expect(screen.getByRole("article", { name: "Message from Cognaxis" })).toBeInTheDocument();
  });

  it("shows the responding indicator only while a message is being sent", async () => {
    const user = userEvent.setup();
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();
    await screen.findByRole("article", { name: "Message from Cognaxis" });

    expect(screen.queryByTestId("response-pending")).not.toBeInTheDocument();

    api.gate.hold = true;
    await user.type(screen.getByLabelText("Write your reflection"), "another thought");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByTestId("response-pending")).toBeInTheDocument();
    expect(screen.getByText("Reflecting…")).toBeInTheDocument();
    expect(screen.getByText("Cognaxis · Responding…")).toBeInTheDocument();

    releaseGate(api);
    await waitFor(() => expect(screen.queryByTestId("response-pending")).not.toBeInTheDocument());
  });

  it("never shows the responding indicator while another reflection is opening", async () => {
    const user = userEvent.setup();
    api.sessions = [
      makeSession({ id: "s1", title: "First" }),
      makeSession({ id: "s2", title: "Second" }),
    ];
    api.details.set("s1", makeDetail({ id: "s1", title: "First", messages: CONVERSATION }));
    api.details.set("s2", makeDetail({ id: "s2", title: "Second", messages: CONVERSATION }));
    await renderWorkspace();
    await screen.findByRole("heading", { level: 1, name: "First" });

    api.gate.hold = true;
    const panes = screen.getAllByRole("navigation", { name: "Reflection history" });
    await user.click(within(panes[0]).getByRole("button", { name: /Second/ }));

    expect(screen.queryByTestId("response-pending")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading reflection" })).toBeInTheDocument();

    releaseGate(api);
    await screen.findByRole("heading", { level: 1, name: "Second" });
  });

  it("ends on the last reflection chosen during rapid switching", async () => {
    const user = userEvent.setup();
    api.sessions = [
      makeSession({ id: "s1", title: "First" }),
      makeSession({ id: "s2", title: "Second" }),
      makeSession({ id: "s3", title: "Third" }),
    ];
    for (const id of ["s1", "s2", "s3"]) {
      api.details.set(id, makeDetail({ id, title: { s1: "First", s2: "Second", s3: "Third" }[id] }));
    }
    await renderWorkspace();
    await screen.findByRole("heading", { level: 1, name: "First" });

    api.gate.hold = true;
    const pane = screen.getAllByRole("navigation", { name: "Reflection history" })[0];
    await user.click(within(pane).getByRole("button", { name: /Second/ }));
    await user.click(within(pane).getByRole("button", { name: /Third/ }));

    releaseGate(api);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Third" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("heading", { level: 1, name: "Second" })).not.toBeInTheDocument();
  });
});

describe("composer", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends with Enter and inserts a line break with Shift+Enter", async () => {
    const user = userEvent.setup();
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();
    const composer = await screen.findByLabelText("Write your reflection");

    await user.type(composer, "first line{Shift>}{Enter}{/Shift}second line");
    expect(composer).toHaveValue("first line\nsecond line");
    expect(api.routes.some((route) => route.url.includes("/messages"))).toBe(false);

    await user.type(composer, "{Enter}");
    await waitFor(() =>
      expect(api.routes.some((route) => route.url.includes("/messages"))).toBe(true),
    );
  });

  it("does not submit while an input method editor is composing", async () => {
    const user = userEvent.setup();
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();
    const composer = await screen.findByLabelText("Write your reflection");

    await user.type(composer, "にほんご");
    composer.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await user.type(composer, "{Enter}");

    expect(api.routes.some((route) => route.url.includes("/messages"))).toBe(false);
  });

  it("never sends an empty or whitespace-only message", async () => {
    const user = userEvent.setup();
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();
    const composer = await screen.findByLabelText("Write your reflection");

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    await user.type(composer, "    ");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await user.type(composer, "{Enter}");
    expect(api.routes.some((route) => route.url.includes("/messages"))).toBe(false);
  });

  it("restores the exact draft, including line breaks, when sending fails", async () => {
    const user = userEvent.setup();
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    api.handler = (route) =>
      route.url.includes("/messages") ? failure(500, "INTERNAL_ERROR") : null;
    await renderWorkspace();

    const composer = await screen.findByLabelText("Write your reflection");
    await user.type(composer, "line one{Shift>}{Enter}{/Shift}line two");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(composer).toHaveValue("line one\nline two"));
    expect(screen.queryByText("line one\nline two")).not.toBeInTheDocument();
    // The server's own generic message is shown next to the composer.
    expect(
      screen.getAllByRole("status").some((node) => node.textContent?.includes("Something went wrong")),
    ).toBe(true);
  });

  it("places a starter prompt into the composer without sending it", async () => {
    const user = userEvent.setup();
    seedConversation({ id: "s1", messageCount: 0, messages: [] });
    await renderWorkspace();

    const prompt = await screen.findByRole("button", {
      name: "Reflect on what I learned today.",
    });
    await user.click(prompt);

    const composer = screen.getByLabelText("Write your reflection");
    expect(composer).toHaveValue("Reflect on what I learned today.");
    expect(document.activeElement).toBe(composer);
    expect(api.routes.some((route) => route.url.includes("/messages"))).toBe(false);
  });

  it("warns near the character limit and prevents input beyond it", async () => {
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();
    const composer = await screen.findByLabelText("Write your reflection");

    expect(composer).toHaveAttribute("maxlength", "8000");

    const user = userEvent.setup();
    await user.click(composer);
    // fireEvent-style bulk change keeps the test fast while exercising the same handler.
    await user.paste("x".repeat(7_950));

    expect(await screen.findByText(/characters left/)).toBeInTheDocument();
  });

  it("stops sending and explains when the reflection is full", async () => {
    seedConversation({ id: "s1", messageCount: 120, messages: CONVERSATION });
    await renderWorkspace();

    const composer = await screen.findByLabelText("Write your reflection");
    expect(composer).toBeDisabled();
    expect(
      screen.getAllByText("This reflection is full. Start a new reflection to continue.").length,
    ).toBeGreaterThan(0);
  });

  it("prevents a duplicate submission while a message is in flight", async () => {
    const user = userEvent.setup();
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();

    api.gate.hold = true;
    await user.type(screen.getByLabelText("Write your reflection"), "one message only");
    const send = screen.getByRole("button", { name: "Send message" });
    await user.click(send);

    await waitFor(() => expect(send).toBeDisabled());
    await user.click(send);
    await user.click(send);

    expect(api.routes.filter((route) => route.url.includes("/messages"))).toHaveLength(1);
    releaseGate(api);
  });

  it("keeps a failed message draft with its originating reflection after a switch", async () => {
    const user = userEvent.setup();
    api.sessions = [
      makeSession({ id: "s1", title: "First", messageCount: 2 }),
      makeSession({ id: "s2", title: "Second", messageCount: 2 }),
    ];
    api.details.set(
      "s1",
      makeDetail({ id: "s1", title: "First", messageCount: 2, messages: CONVERSATION }),
    );
    api.details.set(
      "s2",
      makeDetail({ id: "s2", title: "Second", messageCount: 2, messages: CONVERSATION }),
    );
    api.handler = (route) =>
      route.url.includes("/messages") ? failure(500, "INTERNAL_ERROR") : null;
    await renderWorkspace();
    await screen.findByRole("heading", { level: 1, name: "First" });

    api.gate.hold = true;
    await user.type(screen.getByLabelText("Write your reflection"), "draft for first only");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await user.click(screen.getByRole("button", { name: /Second/ }));
    releaseGate(api);

    await screen.findByRole("heading", { level: 1, name: "Second" });
    expect(screen.getByLabelText("Write your reflection")).toHaveValue("");
    expect(document.body.textContent).not.toContain("draft for first only");

    await user.click(screen.getByRole("button", { name: /First/ }));
    await screen.findByRole("heading", { level: 1, name: "First" });
    expect(screen.getByLabelText("Write your reflection")).toHaveValue("draft for first only");
  });
});

describe("reflection summary surface", () => {
  beforeEach(() => {
    resetHarness();
    api = installWorkspaceApi();
    clipboard = stubClipboard(() => Promise.resolve());
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores a stored summary with its themes and next steps", async () => {
    seedConversation({
      id: "s1",
      messageCount: 2,
      summarizedMessageCount: 2,
      messages: CONVERSATION,
      summary: makeSummary({ sourceSessionId: "s1" }),
    });
    await renderWorkspace();

    expect(await screen.findByRole("heading", { name: "Reflection summary" })).toBeInTheDocument();
    expect(screen.getByText("Simplify the storage layer")).toBeInTheDocument();
    expect(screen.getByText("design")).toBeInTheDocument();
    expect(screen.getByText("focus")).toBeInTheDocument();
    expect(screen.getByText("Isolate the storage layer.")).toBeInTheDocument();
    expect(screen.getByText("Define clear boundaries.")).toBeInTheDocument();
    expect(screen.getByText("Private to your account")).toBeInTheDocument();
  });

  it("uses no storage-path or tenant terminology", async () => {
    seedConversation({
      id: "s1",
      messageCount: 2,
      summarizedMessageCount: 2,
      messages: CONVERSATION,
      summary: makeSummary({ sourceSessionId: "s1" }),
    });
    await renderWorkspace();
    await screen.findByRole("heading", { name: "Reflection summary" });

    const text = document.body.textContent ?? "";
    for (const phrase of ["users/", "uid", "Derived Personal Memory", "Memory Synthesis", "tenant"]) {
      expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("collapses and expands without losing the summary", async () => {
    const user = userEvent.setup();
    seedConversation({
      id: "s1",
      messageCount: 2,
      summarizedMessageCount: 2,
      messages: CONVERSATION,
      summary: makeSummary({ sourceSessionId: "s1" }),
    });
    await renderWorkspace();
    await screen.findByRole("heading", { name: "Reflection summary" });

    await user.click(screen.getByRole("button", { name: "Collapse reflection summary" }));
    expect(screen.queryByText("Isolate the storage layer.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand reflection summary" }));
    expect(screen.getByText("Isolate the storage layer.")).toBeInTheDocument();
  });

  it("reveals a current collapsed summary without regenerating it", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem("cognaxis_summary_collapsed", "true");
    seedConversation({
      id: "s1",
      messageCount: 2,
      summarizedMessageCount: 2,
      messages: CONVERSATION,
      summary: makeSummary({ sourceSessionId: "s1" }),
    });
    await renderWorkspace();
    await screen.findByRole("heading", { name: "Reflection summary" });
    expect(screen.queryByText("Isolate the storage layer.")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "View summary" })[0]);

    expect(await screen.findByText("Isolate the storage layer.")).toBeInTheDocument();
    expect(api.routes.filter((route) => route.url.includes("/summarize"))).toHaveLength(0);
  });

  it("marks the summary stale and offers an update when new messages arrive", async () => {
    seedConversation({
      id: "s1",
      messageCount: 6,
      summarizedMessageCount: 2,
      messages: CONVERSATION,
      summary: makeSummary({ sourceSessionId: "s1" }),
    });
    await renderWorkspace();

    expect(
      await screen.findByText("New messages have arrived since this summary."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Update summary" }).length).toBeGreaterThan(0);
  });

  it("keeps the previous summary visible when an update fails", async () => {
    const user = userEvent.setup();
    seedConversation({
      id: "s1",
      messageCount: 6,
      summarizedMessageCount: 2,
      messages: CONVERSATION,
      summary: makeSummary({ sourceSessionId: "s1" }),
    });
    api.handler = (route) =>
      route.url.includes("/summarize") ? failure(500, "INTERNAL_ERROR") : null;
    await renderWorkspace();
    await screen.findByRole("heading", { name: "Reflection summary" });

    await user.click(screen.getAllByRole("button", { name: "Update summary" })[0]);

    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((node) =>
          node.textContent?.includes("Something went wrong"),
        ),
      ).toBe(true),
    );
    expect(screen.getByText("Simplify the storage layer")).toBeInTheDocument();
  });

  it("does not reserve a card when no summary exists", async () => {
    seedConversation({ id: "s1", messageCount: 2, messages: CONVERSATION });
    await renderWorkspace();
    await screen.findByRole("article", { name: "Message from Cognaxis" });

    expect(screen.queryByRole("heading", { name: "Reflection summary" })).not.toBeInTheDocument();
  });

  it("disables the summary action until there are enough messages", async () => {
    seedConversation({ id: "s1", messageCount: 0, messages: [] });
    await renderWorkspace();
    await screen.findByRole("heading", { level: 1, name: "Reflection" });

    // The app bar renders a labelled button for wide screens and an icon button for narrow ones;
    // CSS shows only one at a time, so both must reflect the same disabled state.
    const actions = screen.getAllByRole("button", { name: "Create summary" });
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action).toBeDisabled();
    expect(document.body.textContent).toContain(
      "Write at least one exchange before creating a summary.",
    );
  });
});
