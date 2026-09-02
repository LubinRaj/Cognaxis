import type { SessionDetail } from "../../shared/schemas.js";

export type ExportFormat = "markdown" | "json";

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  markdown: "Markdown",
  json: "JSON",
};

export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  markdown: "text/markdown;charset=utf-8",
  json: "application/json;charset=utf-8",
};

/**
 * Builds a download name from a fixed prefix and the export date only. Session titles are user
 * content and never reach the filesystem.
 */
export function exportFilename(format: ExportFormat, at: Date): string {
  const year = at.getFullYear();
  const month = `${at.getMonth() + 1}`.padStart(2, "0");
  const day = `${at.getDate()}`.padStart(2, "0");
  const extension = format === "markdown" ? "md" : "json";
  return `cognaxis-reflection-${year}-${month}-${day}.${extension}`;
}

function speaker(role: "user" | "model"): string {
  return role === "user" ? "You" : "Cognaxis";
}

export function buildMarkdownExport(session: SessionDetail, generatedAt: Date): string {
  const lines: string[] = [];

  lines.push(`# ${session.title}`, "");
  lines.push(`Exported ${generatedAt.toISOString()}`, "");
  lines.push(
    "This file contains private journal content. Once downloaded it is no longer protected by Cognaxis.",
    "",
  );

  if (session.summary) {
    lines.push("## Reflection summary", "");
    lines.push(`### ${session.summary.title}`, "");
    lines.push(session.summary.summary, "");

    if (session.summary.themes.length > 0) {
      lines.push(`Themes: ${session.summary.themes.join(", ")}`, "");
    }

    if (session.summary.nextSteps.length > 0) {
      lines.push("Next steps:", "");
      for (const step of session.summary.nextSteps) lines.push(`1. ${step}`);
      lines.push("");
    }
  }

  lines.push("## Conversation", "");
  if (session.messages.length === 0) {
    lines.push("This reflection has no messages yet.", "");
  } else {
    for (const message of session.messages) {
      lines.push(`**${speaker(message.role)}**`, "");
      lines.push(message.content, "");
    }
  }

  return lines.join("\n");
}

export function buildJsonExport(session: SessionDetail, generatedAt: Date): string {
  return JSON.stringify(
    {
      exportedAt: generatedAt.toISOString(),
      notice:
        "This file contains private journal content. Once downloaded it is no longer protected by Cognaxis.",
      reflection: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
        messages: session.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
        summary: session.summary
          ? {
              title: session.summary.title,
              summary: session.summary.summary,
              themes: session.summary.themes,
              nextSteps: session.summary.nextSteps,
              createdAt: session.summary.createdAt,
              updatedAt: session.summary.updatedAt,
            }
          : null,
      },
    },
    null,
    2,
  );
}

export function buildExport(
  session: SessionDetail,
  format: ExportFormat,
  generatedAt: Date,
): string {
  return format === "markdown"
    ? buildMarkdownExport(session, generatedAt)
    : buildJsonExport(session, generatedAt);
}
