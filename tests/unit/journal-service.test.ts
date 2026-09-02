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

  async reply(messages: JournalMessage[]): Promise<string> {
    this.replyCalls += 1;
    this.replyContexts.push(structuredClone(messages));
    if (this.failReply) throw new Error("MODEL_FAILED");
    return `reply-${this.replyCalls}`;
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

  it("rejects reuse of a request id for different content", async () => {
    const { service, session } = await fixture();
    const requestId = randomUUID();
    await service.addMessage("user_alpha", session.id, requestId, "Original thought.");

    await expect(
      service.addMessage("user_alpha", session.id, requestId, "Different thought."),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
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
