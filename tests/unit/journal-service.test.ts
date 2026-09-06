import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { JournalMessage, SummaryOutput } from "../../src/shared/schemas.js";
import { InMemoryMemoryIndexRepository } from "../../src/server/data/in-memory-memory-index-repository.js";
import { InMemoryAttachmentRepository } from "../../src/server/data/in-memory-attachment-repository.js";
import { InMemoryJournalRepository } from "../../src/server/data/in-memory-journal-repository.js";
import type { ConversationModel, ModelAttachment, ReflectionClassification, ReflectionClassificationInput } from "../../src/server/services/conversation-model.js";
import { JournalService } from "../../src/server/services/journal-service.js";
import { MemoryIndexService } from "../../src/server/services/memory-index-service.js";

class RecordingModel implements ConversationModel {
  readonly replyContexts: JournalMessage[][] = [];
  replyCalls = 0;
  summaryCalls = 0;
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
    this.summaryCalls += 1;
    if (this.failSummary) throw new Error("SUMMARY_FAILED");
    return {
      title: "Reflection",
      summary: "A grounded summary.",
      themes: ["clarity"],
      nextSteps: ["Continue reflecting."],
    };
  }

  async embedText(_text: string): Promise<{ values: number[]; model: string }> {
    return { values: [1, 0], model: "test-embedding" };
  }
}

class ClassifyingModel extends RecordingModel {
  classification: ReflectionClassification = { title: "", tags: [] };
  classificationInputs: ReflectionClassificationInput[] = [];

  async classifyReflection(input: ReflectionClassificationInput): Promise<ReflectionClassification> {
    this.classificationInputs.push(structuredClone(input));
    return this.classification;
  }
}

class AttachmentIndexModel extends RecordingModel {
  readonly extractedMimeTypes: string[] = [];
  readonly embeddedTexts: string[] = [];

  async extractAttachmentText(attachment: ModelAttachment): Promise<string> {
    this.extractedMimeTypes.push(attachment.mimeType);
    return "The document contains the private launch checklist.";
  }

  async embedText(text: string): Promise<{ values: number[]; model: string }> {
    this.embeddedTexts.push(text);
    return { values: [1, 0], model: "test-embedding" };
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
  it("uses an AI-generated concise title and one optional normalized tag for a new reflection", async () => {
    const repository = new InMemoryJournalRepository();
    const model = new ClassifyingModel();
    model.classification = { title: "Launch planning for a new product", tags: ["Work", "Project planning"] };
    const service = new JournalService(repository, model);
    const session = await service.createSession("user_alpha");

    await service.addMessage("user_alpha", session.id, randomUUID(), "I need to plan the product launch.");

    await expect(repository.getSession("user_alpha", session.id)).resolves.toMatchObject({
      title: "Launch planning for a new",
      tags: ["work"],
    });
    await expect(service.listTags("user_alpha")).resolves.toEqual(["work"]);
    expect(model.classificationInputs[0]).toMatchObject({
      scope: "personal",
      purpose: "initial",
      content: "I need to plan the product launch.",
    });
  });

  it("offers previously assigned canonical tags to AI classification", async () => {
    const repository = new InMemoryJournalRepository();
    const model = new ClassifyingModel();
    model.classification = { title: "Launch planning", tags: ["Work"] };
    const service = new JournalService(repository, model);
    const first = await service.createSession("user_alpha");
    await service.addMessage("user_alpha", first.id, randomUUID(), "Plan the launch.");
    const second = await service.createSession("user_alpha");
    await service.addMessage("user_alpha", second.id, randomUUID(), "Continue the work plan.");

    expect(model.classificationInputs[1]?.existingTags).toEqual(["work"]);
  });

  it("adds one distinct tag after a summary only when it is useful", async () => {
    const repository = new InMemoryJournalRepository();
    const model = new ClassifyingModel();
    model.classification = { title: "Launch planning", tags: [] };
    const service = new JournalService(repository, model);
    const session = await service.createSession("user_alpha");
    await service.addMessage("user_alpha", session.id, randomUUID(), "I need to plan the product launch.");
    model.classification = { tags: ["goals"] };

    await service.summarize("user_alpha", session.id);

    await expect(repository.getSession("user_alpha", session.id)).resolves.toMatchObject({
      tags: ["goals"],
    });
    expect(model.classificationInputs.at(-1)).toMatchObject({
      purpose: "summary",
      scope: "personal",
      currentTags: [],
    });
  });

  it("does not change existing tags when summary tagging finds nothing useful", async () => {
    const repository = new InMemoryJournalRepository();
    const model = new ClassifyingModel();
    model.classification = { title: "Launch planning", tags: ["work"] };
    const service = new JournalService(repository, model);
    const session = await service.createSession("user_alpha");
    await service.addMessage("user_alpha", session.id, randomUUID(), "I need to plan the product launch.");
    model.classification = { tags: [] };

    await service.summarize("user_alpha", session.id);

    await expect(repository.getSession("user_alpha", session.id)).resolves.toMatchObject({
      tags: ["work"],
    });
  });

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
    const { repository, service, session } = await fixture();
    const requestId = randomUUID();
    const textChunks: string[] = [];
    
    const exchange = await service.streamMessage(
      "user_alpha", session.id, requestId, "Streamed thought", (chunk) => {
        textChunks.push(chunk);
      },
    );
    
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
      "user_alpha", session.id, requestId, "Will cancel", () => {},
      abortController.signal
    );
    abortController.abort();
    releaseReplies();
    
    await expect(streamPromise).rejects.toThrow("AbortError");
    // Should not persist
    expect(await repository.listMessages("user_alpha", session.id, 120)).toHaveLength(0);
  });

  it("refreshes personal memory after the streamed exchange is persisted", async () => {
    const repository = new InMemoryJournalRepository();
    const memoryRepository = new InMemoryMemoryIndexRepository();
    const model = new RecordingModel();
    const service = new JournalService(
      repository,
      model,
      [],
      [],
      undefined,
      undefined,
      new MemoryIndexService(memoryRepository, model),
    );
    const session = await service.createSession("user_alpha", "Fresh decision", "decision");

    await service.streamMessage(
      "user_alpha",
      session.id,
      randomUUID(),
      "I decided to protect focus time.",
      () => undefined,
    );

    await vi.waitFor(async () => {
      const chunks = await memoryRepository.findNearest(
        { type: "personal", scopeId: "user_alpha" },
        [1, 0],
        8,
      );
      expect(chunks).toEqual([
        expect.objectContaining({ sourceSessionId: session.id, captureType: "decision" }),
      ]);
    });
  });

  it("extracts attached document content before indexing the reflection", async () => {
    const repository = new InMemoryJournalRepository();
    const attachments = new InMemoryAttachmentRepository();
    const memoryRepository = new InMemoryMemoryIndexRepository();
    const model = new AttachmentIndexModel();
    const service = new JournalService(
      repository,
      model,
      [],
      [],
      undefined,
      attachments,
      new MemoryIndexService(memoryRepository, model),
    );
    const session = await service.createSession("user_alpha", "Launch files");
    const attachment = await attachments.create(
      { type: "personal", scopeId: "user_alpha" },
      session.id,
      "document",
      "application/pdf",
      Buffer.from("private pdf bytes"),
    );

    await service.addMessage(
      "user_alpha",
      session.id,
      randomUUID(),
      "Review this attached file.",
      [attachment.id],
    );

    await vi.waitFor(() => {
      expect(model.extractedMimeTypes).toEqual(["application/pdf"]);
      expect(model.embeddedTexts.some((text) => text.includes("private launch checklist"))).toBe(true);
    });
  });
});

describe("session summarization", () => {
  it("rejects summarization when conversation has fewer than 2 messages", async () => {
    const { service, session } = await fixture();
    await expect(service.summarize("user_alpha", session.id)).rejects.toMatchObject({
      status: 409,
      code: "NOT_ENOUGH_CONTEXT",
    });
  });

  it("rejects cross-user summary access", async () => {
    const { service, session } = await fixture();
    await service.addMessage("user_alpha", session.id, randomUUID(), "First thought");
    await service.addMessage("user_alpha", session.id, randomUUID(), "Second thought");

    await expect(service.summarize("user_bravo", session.id)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("returns cached summary without re-invoking model when message count is unchanged", async () => {
    const { model, service, session } = await fixture();
    await service.addMessage("user_alpha", session.id, randomUUID(), "First thought");
    await service.addMessage("user_alpha", session.id, randomUUID(), "Second thought");

    const firstSummary = await service.summarize("user_alpha", session.id);
    expect(firstSummary.title).toBe("Reflection");
    expect(model.summaryCalls).toBe(1);

    // Calling summarize again on unchanged session returns existing summary without model call
    const cachedSummary = await service.summarize("user_alpha", session.id);
    expect(cachedSummary.id).toBe(firstSummary.id);
    expect(model.summaryCalls).toBe(1);
  });

  it("propagates repository persistence failure during summarization", async () => {
    const { repository, service, session } = await fixture();
    await service.addMessage("user_alpha", session.id, randomUUID(), "First thought");
    await service.addMessage("user_alpha", session.id, randomUUID(), "Second thought");

    repository.saveSummary = () => Promise.reject(new Error("Firestore write failed"));

    await expect(service.summarize("user_alpha", session.id)).rejects.toThrow("Firestore write failed");
  });
});

describe("personal memory retrieval", () => {
  it("removes archived reflections from the semantic index and rebuilds them on restore", async () => {
    const repository = new InMemoryJournalRepository();
    const memoryRepository = new InMemoryMemoryIndexRepository();
    const model = new RecordingModel();
    const service = new JournalService(
      repository,
      model,
      [],
      [],
      undefined,
      undefined,
      new MemoryIndexService(memoryRepository, model),
    );
    const session = await service.createSession("user_alpha", "Indexed thought");
    await service.addMessage("user_alpha", session.id, randomUUID(), "A searchable private thought.");
    await vi.waitFor(async () => {
      expect(await memoryRepository.findNearest({ type: "personal", scopeId: "user_alpha" }, [1, 0], 8)).toHaveLength(1);
    });

    await service.archiveSession("user_alpha", session.id);
    expect(await memoryRepository.findNearest({ type: "personal", scopeId: "user_alpha" }, [1, 0], 8)).toHaveLength(0);

    await service.restoreSession("user_alpha", session.id);
    await vi.waitFor(async () => {
      expect(await memoryRepository.findNearest({ type: "personal", scopeId: "user_alpha" }, [1, 0], 8)).toHaveLength(1);
    });
  });

  it("builds a bounded index for existing non-empty personal captures", async () => {
    const repository = new InMemoryJournalRepository();
    const model = new RecordingModel();
    const originalService = new JournalService(repository, model);
    const populated = await originalService.createSession("user_alpha", "Existing capture");
    await originalService.addMessage("user_alpha", populated.id, randomUUID(), "An existing decision.");
    await originalService.createSession("user_alpha", "Empty draft");

    const memoryRepository = new InMemoryMemoryIndexRepository();
    const service = new JournalService(
      repository,
      model,
      [],
      [],
      undefined,
      undefined,
      new MemoryIndexService(memoryRepository, model),
    );

    await expect(service.buildMemoryIndex("user_alpha", 20)).resolves.toEqual({
      examined: 2,
      indexed: 1,
      skipped: 1,
      failed: 0,
    });
    await expect(memoryRepository.findNearest(
      { type: "personal", scopeId: "user_alpha" },
      [1, 0],
      8,
    )).resolves.toEqual([expect.objectContaining({ sourceSessionId: populated.id })]);
    await expect(memoryRepository.findNearest(
      { type: "personal", scopeId: "user_bravo" },
      [1, 0],
      8,
    )).resolves.toEqual([]);
  });

  it("answers from only the verified user's bounded summaries and returns source citations", async () => {
    const { model, service, session } = await fixture();
    await service.addMessage("user_alpha", session.id, randomUUID(), "I decided to protect focus time.");
    await service.addMessage("user_alpha", session.id, randomUUID(), "I will schedule fewer meetings.");
    await service.summarize("user_alpha", session.id);

    const result = await service.askPersonalMemory("user_alpha", "What needs clarity?");

    expect(result.citations).toEqual([
      expect.objectContaining({ sessionId: session.id, title: "Reflection" }),
    ]);
    expect(model.replyContexts.at(-1)?.at(-1)?.content).toContain("What needs clarity?");
    expect(model.replyContexts.at(-1)?.at(-2)?.content).toContain("authorizedPersonalSummaries");
  });

  it("does not expose another user's summaries", async () => {
    const { service, session } = await fixture();
    await service.addMessage("user_alpha", session.id, randomUUID(), "Private alpha thought");
    await service.addMessage("user_alpha", session.id, randomUUID(), "Private alpha follow-up");
    await service.summarize("user_alpha", session.id);

    const result = await service.askPersonalMemory("user_bravo", "What did alpha think?");

    expect(result.citations).toEqual([]);
  });

  it("does not send unrelated summaries to Gemini or cite them", async () => {
    const { model, service, session } = await fixture();
    await service.addMessage("user_alpha", session.id, randomUUID(), "Private planning note");
    await service.addMessage("user_alpha", session.id, randomUUID(), "Follow up tomorrow");
    await service.summarize("user_alpha", session.id);
    const callsBeforeQuestion = model.replyCalls;

    await expect(service.askPersonalMemory("user_alpha", "Where is my passport?")).resolves.toEqual({
      answer: "I couldn't find enough in your saved captures to answer that reliably.",
      citations: [],
    });
    expect(model.replyCalls).toBe(callsBeforeQuestion);
  });

  it("answers from recent messages when summary generation has not completed", async () => {
    const { model, service, session } = await fixture();
    await service.addMessage("user_alpha", session.id, randomUUID(), "I decided to protect focus time.");
    await service.addMessage("user_alpha", session.id, randomUUID(), "I will schedule fewer meetings.");

    const result = await service.askPersonalMemory("user_alpha", "What have I been deciding lately?");

    expect(result.citations).toEqual([
      expect.objectContaining({ sessionId: session.id, title: "New personal reflection" }),
    ]);
    expect(model.replyContexts.at(-1)?.at(-2)?.content).toContain("authorizedPersonalCaptures");
    expect(model.replyContexts.at(-1)?.at(-2)?.content).toContain("protect focus time");
  });

  it("derives bounded open loops only from the owner's stored summary next steps", async () => {
    const { service, session } = await fixture();
    await service.addMessage("user_alpha", session.id, randomUUID(), "First thought");
    await service.addMessage("user_alpha", session.id, randomUUID(), "Second thought");
    await service.summarize("user_alpha", session.id);

    await expect(service.listOpenLoops("user_alpha")).resolves.toEqual([
      expect.objectContaining({
        sessionId: session.id,
        text: "Continue reflecting.",
        captureType: "reflection",
      }),
    ]);
    await expect(service.listOpenLoops("user_bravo")).resolves.toEqual([]);
  });
});
