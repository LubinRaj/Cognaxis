import { describe, expect, it } from "vitest";
import type { SessionDetail } from "../../src/shared/schemas.js";
import {
  buildExport,
  buildJsonExport,
  buildMarkdownExport,
  exportFilename,
} from "../../src/client/workspace/export-reflection.js";

const generatedAt = new Date("2026-09-04T10:20:30.000Z");

const session: SessionDetail = {
  id: "session-alpha",
  title: "Architecture decisions",
  status: "active",
  messageCount: 2,
  summarizedMessageCount: 2,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-04T09:00:00.000Z",
  messages: [
    {
      id: "m1",
      role: "user",
      content: "Line one\nLine two",
      createdAt: "2026-09-01T08:00:00.000Z",
    },
    {
      id: "m2",
      role: "model",
      content: "A grounded reply.",
      createdAt: "2026-09-01T08:00:05.000Z",
    },
  ],
  summary: {
    id: "memory-1",
    sourceSessionId: "session-alpha",
    sourceMessageIds: ["m1", "m2"],
    title: "Simplify the storage layer",
    summary: "Complexity stems from coupling.",
    themes: ["design", "focus"],
    nextSteps: ["Isolate the storage layer.", "Define tenant boundaries."],
    createdAt: "2026-09-01T08:10:00.000Z",
    updatedAt: "2026-09-01T08:10:00.000Z",
  },
};

describe("export filename", () => {
  it("uses a fixed prefix and the export date only", () => {
    expect(exportFilename("markdown", generatedAt)).toBe("cognaxis-reflection-2026-09-04.md");
    expect(exportFilename("json", generatedAt)).toBe("cognaxis-reflection-2026-09-04.json");
  });

  it("never derives the filename from untrusted session text", () => {
    const hostileDate = new Date("2026-01-05T00:00:00.000Z");
    const name = exportFilename("markdown", hostileDate);

    expect(name).not.toContain("Architecture");
    expect(name).toMatch(/^cognaxis-reflection-\d{4}-\d{2}-\d{2}\.(md|json)$/);
  });

  it("pads single-digit months and days", () => {
    expect(exportFilename("json", new Date(2026, 0, 5))).toBe("cognaxis-reflection-2026-01-05.json");
  });
});

describe("markdown export", () => {
  const markdown = buildMarkdownExport(session, generatedAt);

  it("includes the title, conversation, summary, themes, and next steps", () => {
    expect(markdown).toContain("# Architecture decisions");
    expect(markdown).toContain("## Conversation");
    expect(markdown).toContain("**You**");
    expect(markdown).toContain("**Cognaxis**");
    expect(markdown).toContain("Line one\nLine two");
    expect(markdown).toContain("A grounded reply.");
    expect(markdown).toContain("## Reflection summary");
    expect(markdown).toContain("### Simplify the storage layer");
    expect(markdown).toContain("Themes: design, focus");
    expect(markdown).toContain("1. Isolate the storage layer.");
    expect(markdown).toContain("1. Define tenant boundaries.");
  });

  it("carries the privacy notice", () => {
    expect(markdown).toContain("no longer protected by Cognaxis");
  });

  it("omits the summary section entirely when none exists", () => {
    const withoutSummary = buildMarkdownExport({ ...session, summary: null }, generatedAt);

    expect(withoutSummary).not.toContain("## Reflection summary");
    expect(withoutSummary).toContain("## Conversation");
  });

  it("states plainly when a reflection has no messages", () => {
    const empty = buildMarkdownExport(
      { ...session, messages: [], summary: null },
      generatedAt,
    );

    expect(empty).toContain("This reflection has no messages yet.");
  });

  it("is deterministic for the same input", () => {
    expect(buildMarkdownExport(session, generatedAt)).toBe(markdown);
  });
});

describe("json export", () => {
  const parsed = JSON.parse(buildJsonExport(session, generatedAt)) as {
    exportedAt: string;
    notice: string;
    reflection: {
      id: string;
      title: string;
      messages: { role: string; content: string }[];
      summary: { themes: string[]; nextSteps: string[] } | null;
    };
  };

  it("contains exactly the active reflection", () => {
    expect(parsed.reflection.id).toBe("session-alpha");
    expect(parsed.reflection.title).toBe("Architecture decisions");
    expect(parsed.reflection.messages).toHaveLength(2);
  });

  it("includes themes and next steps", () => {
    expect(parsed.reflection.summary?.themes).toEqual(["design", "focus"]);
    expect(parsed.reflection.summary?.nextSteps).toEqual([
      "Isolate the storage layer.",
      "Define tenant boundaries.",
    ]);
  });

  it("carries the privacy notice and export timestamp", () => {
    expect(parsed.notice).toContain("no longer protected by Cognaxis");
    expect(parsed.exportedAt).toBe("2026-09-04T10:20:30.000Z");
  });

  it("does not leak internal provenance identifiers", () => {
    const raw = buildJsonExport(session, generatedAt);
    expect(raw).not.toContain("sourceMessageIds");
    expect(raw).not.toContain("sourceSessionId");
  });

  it("represents an absent summary as null", () => {
    const withoutSummary = JSON.parse(
      buildJsonExport({ ...session, summary: null }, generatedAt),
    ) as { reflection: { summary: unknown } };
    expect(withoutSummary.reflection.summary).toBeNull();
  });
});

describe("export dispatch", () => {
  it("supports only the two implemented formats", () => {
    expect(buildExport(session, "markdown", generatedAt)).toBe(
      buildMarkdownExport(session, generatedAt),
    );
    expect(buildExport(session, "json", generatedAt)).toBe(buildJsonExport(session, generatedAt));
  });

  it("never includes content from another reflection", () => {
    const other: SessionDetail = {
      ...session,
      id: "session-bravo",
      title: "Another private reflection",
      messages: [
        {
          id: "x1",
          role: "user",
          content: "Content that belongs to a different reflection.",
          createdAt: "2026-09-02T00:00:00.000Z",
        },
      ],
      summary: null,
    };

    for (const format of ["markdown", "json"] as const) {
      const output = buildExport(session, format, generatedAt);
      expect(output).not.toContain(other.title);
      expect(output).not.toContain("belongs to a different reflection");
      expect(output).not.toContain("session-bravo");
    }
  });
});
