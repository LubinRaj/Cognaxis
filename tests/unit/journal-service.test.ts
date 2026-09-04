import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { JournalMessage, SummaryOutput } from "../../src/shared/schemas.js";
import { InMemoryJournalRepository } from "../../src/server/data/in-memory-journal-repository.js";
import type { ConversationModel } from "../../src/server/services/conversation-model.js";
import { JournalService } from "../../src/server/services/journal-service.js";

class RecordingModel implements ConversationModel {
  readonly replyContexts: JournalMessage[][] = [];
  replyCalls = 0;
  failReply = false;
  failSummary = false;
  onReplyStart: (() => void) | null = null;
  holdReply: Promise<void> | null = null;

  async reply(messages: JournalMessage[]): Promise<string> {
    this.replyCalls += 1;
    this.replyContexts.push(structuredClone(messages));
    this.onReplyStart?.();
    if (this.holdReply) await this.holdReply;
    if (this.failReply) throw new Error("MODEL_FAILED");
    return `reply-${this.replyCalls}`;
  }

  async *replyStream(messages: JournalMessage[], signal?: AbortSignal): AsyncIterable<string> {
    this.replyCalls += 1;
    this.replyContexts.push(structuredClone(messages));
    this.onReplyStart?.();
    if (this.holdReply) await this.holdReply;
    if (this.failReply) throw new Error("MODEL_FAILED");
    if (signal?.aborted) throw new Error("AbortError");
    yield `reply-`;
    yield `${this.replyCalls}`;
  }

  async summarize(): Promise<SummaryOutput> {
    if (this.failSummary) throw new Error("SUMMARY_FAILED");
    return {
      title: "Reflection",
      summary: "A grounded summary.",
      themes: ["clarity"],
      nextSteps: ["Continue reflecting."],
    };
  }
}

async function fixture() {
  const repository = new InMemoryJournalRepository();
  const model = new RecordingModel();
  const service = new JournalService(repository, model);
  const session = await service.createSession("user_alpha");
  return { repository, model, service, session };
}

describe("journal message consistency", () => {
  it("does not persist an orphaned user message when the model fails", async () => {
    const { repository, model, service, session } = await fixture();
    model.failReply = true;

    await expect(
      service.addMessage("user_alpha", session.id, randomUUID(), "Keep this atomic."),
    ).rejects.toThrow("MODEL_FAILED");

    expect(await repository.listMessages("user_alpha", session.id, 120)).toEqual([]);
    expect((await repository.getSession("user_alpha", session.id))?.messageCount).toBe(0);
  });

  it("returns the same exchange for a retried request without calling the model twice", async () => {
    const { repository, model, service, session } = await fixture();
    const requestId = randomUUID();

    const first = await service.addMessage("user_alpha", session.id, requestId, "One thought.");
    const retried = await service.addMessage(
      "user_alpha",
      session.id,
      requestId,
      "One thought.",
    );

    expect(retried.userMessage.id).toBe(first.userMessage.id);
    expect(retried.assistantMessage.id).toBe(first.assistantMessage.id);
    expect(model.replyCalls).toBe(1);
    expect(await repository.listMessages("user_alpha", session.id, 120)).toHaveLength(2);
    expect((await repository.getSession("user_alpha", session.id))?.messageCount).toBe(2);
  });

  it("rejects reuse of a request id for different content without extra writes or model calls", async () => {
    const { repository, model, service, session } = await fixture();
    const requestId = randomUUID();
    await service.addMessage("user_alpha", session.id, requestId, "Original thought.");

    await expect(
      service.addMessage("user_alpha", session.id, requestId, "Different thought."),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });

    // The conflict changed nothing: same stored exchange, no second model call, no extra
    // messages.
    expect(model.replyCalls).toBe(1);
    const messages = await repository.listMessages("user_alpha", session.id, 120);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("Original thought.");
    expect((await repository.getSession("user_alpha", session.id))?.messageCount).toBe(2);
  });

  it("stores exactly one exchange when duplicate requests race through the model together", async () => {
    const { repository, model, service, session } = await fixture();
    const requestId = randomUUID();

    // Both duplicates pass the replay pre-check and reach the model before either commits; the
    // transactional write must still collapse them to a single stored exchange.
    let releaseReplies = () => undefined as void;
    model.holdReply = new Promise<void>((resolve) => {
      releaseReplies = resolve;
    });
    let started = 0;
    const bothStarted = new Promise<void>((resolve) => {
      model.onReplyStart = () => {
        started += 1;
        if (started === 2) resolve();
      };
    });

    const attempts = [
      service.addMessage("user_alpha", session.id, requestId, "Raced thought."),
      service.addMessage("user_alpha", session.id, requestId, "Raced thought."),
    ];
    await bothStarted;
    releaseReplies();
    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<(typeof attempts)[number]>> =>
        result.status === "fulfilled",
    );
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const exchangeIds = new Set(
      fulfilled.map((result) => `${result.value.userMessage.id}:${result.value.assistantMessage.id}`),
    );
    expect(exchangeIds.size).toBe(1);

    const messages = await repository.listMessages("user_alpha", session.id, 120);
    expect(messages).toHaveLength(2);
    expect((await repository.getSession("user_alpha", session.id))?.messageCount).toBe(2);
  });

  it("keeps a completed exchange successful when automatic summarization fails", async () => {
    const { repository, model, service, session } = await fixture();
    model.failSummary = true;

    for (let index = 1; index <= 4; index += 1) {
      const exchange = await service.addMessage(
        "user_alpha",
        session.id,
        randomUUID(),
        `Thought ${index}`,
      );
      expect(exchange.userMessage.content).toBe(`Thought ${index}`);
      expect(exchange.summary).toBeNull();
    }

    expect(await repository.listMessages("user_alpha", session.id, 120)).toHaveLength(8);
    expect((await repository.getSession("user_alpha", session.id))?.messageCount).toBe(8);
  });

  it("sends only the most recent 24 messages to the model", async () => {
    const { model, service, session } = await fixture();

    for (let index = 1; index <= 13; index += 1) {
      await service.addMessage(
        "user_alpha",
        session.id,
        randomUUID(),
        `Thought ${index}`,
      );
    }

    const latestContext = model.replyContexts.at(-1) ?? [];
    expect(latestContext).toHaveLength(24);
    expect(latestContext[0]?.content).toBe("reply-1");
    expect(latestContext.at(-1)?.content).toBe("Thought 13");
  });
});

describe("content-change notifications", () => {
  it("notifies listeners with the session's creation instant, not the wall clock", async () => {
    const repository = new InMemoryJournalRepository();
    const model = new RecordingModel();
    const notifications: Array<{ uid: string; sessionCreatedAt: string }> = [];
    const service = new JournalService(
      repository,
      model,
      [],
      [
        async (uid, sessionCreatedAt) => {
          notifications.push({ uid, sessionCreatedAt });
        },
      ],
    );

    const session = await service.createSession("user_alpha");
    await service.addMessage("user_alpha", session.id, randomUUID(), "One thought.");
    await service.addMessage("user_alpha", session.id, randomUUID(), "Another thought.");
    await service.summarize("user_alpha", session.id);

    // createSession, two messages, the automatic or explicit summary — every notification must
    // carry the creation instant of the affected session so the correct period goes stale.
    expect(notifications.length).toBeGreaterThanOrEqual(4);
    for (const notification of notifications) {
      expect(notification.uid).toBe("user_alpha");
      expect(notification.sessionCreatedAt).toBe(session.createdAt);
    }
  });

  it("keeps the journal operation successful when a listener fails", async () => {
    const repository = new InMemoryJournalRepository();
    const model = new RecordingModel();
    const service = new JournalService(repository, model, [], [
      async () => {
        throw new Error("listener down");
      },
    ]);

    const session = await service.createSession("user_alpha");
    const exchange = await service.addMessage(
      "user_alpha",
      session.id,
      randomUUID(),
      "Still succeeds.",
    );
    expect(exchange.assistantMessage.content).toContain("reply");
  });
});

describe("journal streaming", () => {
  it("streams chunks and persists correctly", async () => {
    const { repository, model, service, session } = await fixture();
    const requestId = randomUUID();
    let userMsg: any = null;
    let textChunks: string[] = [];
    
    const exchange = await service.streamMessage(
      "user_alpha", session.id, requestId, "Streamed thought",
      (um) => { userMsg = um; },
      (chunk) => { textChunks.push(chunk); }
    );
    
    expect(userMsg).not.toBeNull();
    expect(userMsg.content).toBe("Streamed thought");
    expect(textChunks.join("")).toBe("reply-1");
    expect(exchange.assistantMessage.content).toBe("reply-1");
    expect(await repository.listMessages("user_alpha", session.id, 120)).toHaveLength(2);
  });

  it("handles cancellation", async () => {
    const { repository, model, service, session } = await fixture();
    const requestId = randomUUID();
    
    // We will cancel after start, so we mock the model stream to check signal
    const abortController = new AbortController();
    let releaseReplies = () => undefined as void;
    model.holdReply = new Promise<void>((resolve) => {
      releaseReplies = resolve;
    });
    
    const streamPromise = service.streamMessage(
      "user_alpha", session.id, requestId, "Will cancel",
      () => { 
        // Abort on start
        abortController.abort(); 
        releaseReplies(); 
      },
      () => {},
      abortController.signal
    );
    
    await expect(streamPromise).rejects.toThrow("AbortError");
    // Should not persist
    expect(await repository.listMessages("user_alpha", session.id, 120)).toHaveLength(0);
  });
});
