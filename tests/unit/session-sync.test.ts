import { describe, expect, it } from "vitest";
import type { JournalSession, PersonalMemory, SessionDetail } from "../../src/shared/schemas.js";
import {
  applyExchange,
  applySummary,
  deriveSummaryState,
  filterSessions,
  isSessionFull,
  MAX_MESSAGE_LENGTH,
  MAX_SESSION_MESSAGES,
  nextSelectionAfterDelete,
  removeOptimisticMessage,
  removeSession,
  sortSessions,
  syncSessionFromDetail,
  upsertSession,
} from "../../src/client/workspace/session-sync.js";

function session(overrides: Partial<JournalSession> & { id: string }): JournalSession {
  return {
    title: `Reflection ${overrides.id}`,
    status: "active",
    messageCount: 0,
    summarizedMessageCount: 0,
    captureType: "reflection",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
    tags: overrides.tags ?? [],
  };
}

const summary: PersonalMemory = {
  id: "memory-1",
  sourceSessionId: "s1",
  sourceMessageIds: ["m1", "m2"],
  title: "Reflection summary",
  summary: "A synthetic summary.",
  themes: ["clarity"],
  nextSteps: ["Write the next thought."],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("session list synchronisation", () => {
  it("orders sessions by most recent update", () => {
    const list = [
      session({ id: "a", updatedAt: "2026-08-01T00:00:00.000Z" }),
      session({ id: "b", updatedAt: "2026-08-03T00:00:00.000Z" }),
      session({ id: "c", updatedAt: "2026-08-02T00:00:00.000Z" }),
    ];

    expect(sortSessions(list).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("never mutates the array it is given", () => {
    const list = [session({ id: "a" })];
    const frozen = Object.freeze([...list]);

    expect(() => sortSessions(frozen)).not.toThrow();
    expect(() => upsertSession(frozen, session({ id: "b" }))).not.toThrow();
    expect(() => removeSession(frozen, "a")).not.toThrow();
    expect(list).toHaveLength(1);
  });

  it("places a newly created session at the top", () => {
    const list = [session({ id: "a", updatedAt: "2026-08-01T00:00:00.000Z" })];
    const created = session({ id: "new", updatedAt: "2026-08-05T00:00:00.000Z" });

    expect(upsertSession(list, created).map((item) => item.id)).toEqual(["new", "a"]);
  });

  it("replaces an existing row instead of duplicating it", () => {
    const list = [session({ id: "a", messageCount: 0 }), session({ id: "b" })];
    const updated = session({ id: "a", messageCount: 4, updatedAt: "2026-08-09T00:00:00.000Z" });

    const next = upsertSession(list, updated);
    expect(next.filter((item) => item.id === "a")).toHaveLength(1);
    expect(next[0].id).toBe("a");
    expect(next[0].messageCount).toBe(4);
  });

  it("applies authoritative counts from session detail and drops private payloads", () => {
    const list = [session({ id: "s1", messageCount: 0, summarizedMessageCount: 0 })];
    const detail: SessionDetail = {
      ...session({ id: "s1", messageCount: 6, summarizedMessageCount: 6 }),
      messages: [
        { id: "m1", role: "user", content: "private text", createdAt: "2026-08-01T00:00:00.000Z" },
      ],
      summary,
    };

    const [row] = syncSessionFromDetail(list, detail);
    expect(row.messageCount).toBe(6);
    expect(row.summarizedMessageCount).toBe(6);
    expect(row).not.toHaveProperty("messages");
    expect(row).not.toHaveProperty("summary");
    expect(JSON.stringify(row)).not.toContain("private text");
  });

  it("ignores a detail response for a session that is no longer listed", () => {
    const list = [session({ id: "a" })];
    const detail: SessionDetail = {
      ...session({ id: "deleted" }),
      messages: [],
      summary: null,
    };

    expect(syncSessionFromDetail(list, detail).map((item) => item.id)).toEqual(["a"]);
  });
});

describe("applying a completed exchange", () => {
  const detail: SessionDetail = {
    ...session({ id: "s1", messageCount: 4, summarizedMessageCount: 4 }),
    messages: [
      { id: "m1", role: "user", content: "earlier", createdAt: "2026-08-01T00:00:00.000Z" },
      { id: "pending-1", role: "user", content: "draft", createdAt: "2026-08-01T00:00:01.000Z" },
    ],
    summary: null,
  };

  const exchange = {
    userMessage: {
      id: "m2",
      role: "user" as const,
      content: "draft",
      createdAt: "2026-08-02T00:00:00.000Z",
    },
    assistantMessage: {
      id: "m3",
      role: "model" as const,
      content: "reply",
      createdAt: "2026-08-02T00:00:01.000Z",
    },
    summary: null,
  };

  it("replaces the optimistic message with the authoritative pair", () => {
    const next = applyExchange(detail, exchange, "pending-1");

    expect(next.messages.map((message) => message.id)).toEqual(["m1", "m2", "m3"]);
    expect(next.messages.some((message) => message.id.startsWith("pending-"))).toBe(false);
  });

  it("advances the message count by exactly two", () => {
    expect(applyExchange(detail, exchange, "pending-1").messageCount).toBe(6);
  });

  it("leaves the summary stale when the server did not generate one", () => {
    const next = applyExchange(detail, exchange, "pending-1");
    expect(next.summarizedMessageCount).toBe(4);
    expect(next.summary).toBeNull();
  });

  it("marks the summary current when the server generated one automatically", () => {
    const next = applyExchange(detail, { ...exchange, summary }, "pending-1");

    expect(next.summary).toEqual(summary);
    expect(next.summarizedMessageCount).toBe(next.messageCount);
  });

  it("advances the updated time from the server response", () => {
    expect(applyExchange(detail, exchange, "pending-1").updatedAt).toBe(
      "2026-08-02T00:00:01.000Z",
    );
  });

  it("does not mutate the previous detail object", () => {
    const before = JSON.stringify(detail);
    applyExchange(detail, exchange, "pending-1");
    expect(JSON.stringify(detail)).toBe(before);
  });

  it("removes the optimistic message after a failure without touching the counts", () => {
    const next = removeOptimisticMessage(detail, "pending-1");

    expect(next.messages.map((message) => message.id)).toEqual(["m1"]);
    expect(next.messageCount).toBe(4);
  });

  it("marks a manually requested summary current for the session that asked", () => {
    const stale: SessionDetail = {
      ...session({ id: "s1", messageCount: 8, summarizedMessageCount: 4 }),
      messages: [],
      summary: null,
    };

    const next = applySummary(stale, summary);
    expect(next.summary).toEqual(summary);
    expect(next.summarizedMessageCount).toBe(8);
  });
});

describe("selection after deletion", () => {
  const list = [session({ id: "a" }), session({ id: "b" }), session({ id: "c" })];

  it("moves to the next nearest session", () => {
    expect(nextSelectionAfterDelete(list, "a")).toBe("b");
    expect(nextSelectionAfterDelete(list, "b")).toBe("c");
  });

  it("falls back to the previous session when the last row is removed", () => {
    expect(nextSelectionAfterDelete(list, "c")).toBe("b");
  });

  it("returns nothing when no session remains", () => {
    expect(nextSelectionAfterDelete([session({ id: "only" })], "only")).toBeNull();
    expect(nextSelectionAfterDelete([], "missing")).toBeNull();
  });

  it("selects the first remaining session when the deleted row was not listed", () => {
    expect(nextSelectionAfterDelete(list, "unknown")).toBe("a");
  });
});

describe("local filtering", () => {
  const list = [
    session({ id: "a", title: "Architecture decisions" }),
    session({ id: "b", title: "Weekly review" }),
    session({ id: "c", title: "ARCHITECTURE follow-up" }),
  ];

  it("matches titles case-insensitively", () => {
    expect(filterSessions(list, "architecture").map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("returns everything for an empty or whitespace query", () => {
    expect(filterSessions(list, "")).toHaveLength(3);
    expect(filterSessions(list, "   ")).toHaveLength(3);
  });

  it("returns nothing when no title matches", () => {
    expect(filterSessions(list, "nonexistent")).toHaveLength(0);
  });

  it("matches only titles, never message content", () => {
    expect(filterSessions(list, "review").map((item) => item.id)).toEqual(["b"]);
  });
});

describe("summary state derivation", () => {
  it("requires at least two messages", () => {
    expect(
      deriveSummaryState({
        session: session({ id: "a", messageCount: 1 }),
        summary: null,
        summarizing: false,
      }),
    ).toBe("not-enough-messages");
    expect(deriveSummaryState({ session: null, summary: null, summarizing: false })).toBe(
      "not-enough-messages",
    );
  });

  it("offers creation when enough messages exist and no summary is stored", () => {
    expect(
      deriveSummaryState({
        session: session({ id: "a", messageCount: 2 }),
        summary: null,
        summarizing: false,
      }),
    ).toBe("create");
  });

  it("reports a current summary when the counts match", () => {
    expect(
      deriveSummaryState({
        session: session({ id: "a", messageCount: 6, summarizedMessageCount: 6 }),
        summary,
        summarizing: false,
      }),
    ).toBe("current");
  });

  it("reports a stale summary when new messages arrived", () => {
    expect(
      deriveSummaryState({
        session: session({ id: "a", messageCount: 8, summarizedMessageCount: 6 }),
        summary,
        summarizing: false,
      }),
    ).toBe("stale");
  });

  it("reports the in-flight state above every other outcome", () => {
    expect(
      deriveSummaryState({
        session: session({ id: "a", messageCount: 8, summarizedMessageCount: 6 }),
        summary,
        summarizing: true,
      }),
    ).toBe("summarizing");
  });
});

describe("server-bounded limits", () => {
  it("mirrors the server message limits exactly", () => {
    expect(MAX_SESSION_MESSAGES).toBe(120);
    expect(MAX_MESSAGE_LENGTH).toBe(8_000);
  });

  it("detects a full session", () => {
    expect(isSessionFull(session({ id: "a", messageCount: 119 }))).toBe(false);
    expect(isSessionFull(session({ id: "a", messageCount: 120 }))).toBe(true);
    expect(isSessionFull(null)).toBe(false);
  });
});
