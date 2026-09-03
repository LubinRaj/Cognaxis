import type { JournalMessage, SummaryOutput } from "../../../src/shared/schemas.js";
import type { ConversationModel } from "../../../src/server/services/conversation-model.js";
import type {
  InsightModel,
  InsightModelInput,
} from "../../../src/server/services/insight-model.js";

// Deterministic Gemini stand-ins for the end-to-end server. Two message markers let browser tests
// exercise failure and in-flight states without timing tricks: "[e2e:model-error]" fails the
// reply, and "[e2e:model-slow]" holds it open long enough to observe disabled controls.

export const MODEL_ERROR_TRIGGER = "[e2e:model-error]";
export const MODEL_SLOW_TRIGGER = "[e2e:model-slow]";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class DeterministicConversationModel implements ConversationModel {
  async reply(messages: JournalMessage[]): Promise<string> {
    const userMessages = messages.filter((message) => message.role === "user");
    const latest = userMessages.at(-1)?.content ?? "";
    if (latest.includes(MODEL_ERROR_TRIGGER)) {
      throw new Error("Deterministic model failure requested by the test.");
    }
    if (latest.includes(MODEL_SLOW_TRIGGER)) {
      await wait(1_500);
    }
    return `Test reflection response ${userMessages.length}`;
  }

  async summarize(): Promise<SummaryOutput> {
    return {
      title: "Reflection summary",
      summary: "A deterministic summary produced for automated end-to-end tests.",
      themes: ["clarity"],
      nextSteps: ["Write the next thought."],
    };
  }
}

export class DeterministicInsightModel implements InsightModel {
  async generateNarrative(input: InsightModelInput): Promise<unknown> {
    return {
      title: "A steady period",
      overview: "A deterministic overview grounded only in the supplied records.",
      patterns:
        input.evidence.length > 0
          ? [
              {
                observation: "Reflections in this period shared a calm, focused tone.",
                evidenceSessionIds: [input.evidence[0].sessionId],
                confidence: "medium",
              },
            ]
          : [],
      highlights: ["A deterministic highlight."],
      nextSteps: ["Write the next thought."],
    };
  }
}
