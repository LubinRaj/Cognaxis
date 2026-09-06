import { describe, expect, it } from "vitest";
import type { GroundedMemoryEvidence } from "../../src/server/services/conversation-model.js";
import { validateGroundedMemoryAnswer } from "../../src/server/services/memory-index-service.js";

const evidence: GroundedMemoryEvidence[] = [{
  sourceSessionId: "session_alpha",
  sourceMessageIds: ["message_alpha"],
  captureType: "decision",
  text: "We decided to ship the onboarding checklist on Friday.",
}];

describe("grounded memory answer validation", () => {
  it("accepts only an exact excerpt from an authorized cited source", () => {
    expect(validateGroundedMemoryAnswer(evidence, {
      answer: "The onboarding checklist is planned for Friday.",
      confidence: "high",
      insufficientEvidence: false,
      citations: [{
        sourceSessionId: "session_alpha",
        sourceMessageIds: ["message_alpha"],
        supportingExcerpt: "ship the onboarding checklist on Friday",
      }],
    })).toEqual({
      answer: "The onboarding checklist is planned for Friday.",
      sourceSessionIds: ["session_alpha"],
    });
  });

  it.each([
    {
      label: "foreign session",
      citation: { sourceSessionId: "session_foreign", sourceMessageIds: [], supportingExcerpt: "Friday" },
    },
    {
      label: "foreign message",
      citation: { sourceSessionId: "session_alpha", sourceMessageIds: ["message_foreign"], supportingExcerpt: "Friday" },
    },
    {
      label: "invented excerpt",
      citation: { sourceSessionId: "session_alpha", sourceMessageIds: [], supportingExcerpt: "launch on Monday" },
    },
  ])("rejects a $label citation", ({ citation }) => {
    expect(validateGroundedMemoryAnswer(evidence, {
      answer: "Unsupported answer",
      confidence: "high",
      insufficientEvidence: false,
      citations: [citation],
    })).toBeNull();
  });

  it("does not surface citations when the model declares insufficient evidence", () => {
    expect(validateGroundedMemoryAnswer(evidence, {
      answer: "There is not enough evidence.",
      confidence: "low",
      insufficientEvidence: true,
      citations: [{
        sourceSessionId: "session_alpha",
        sourceMessageIds: [],
        supportingExcerpt: "Friday",
      }],
    })).toBeNull();
  });
});
