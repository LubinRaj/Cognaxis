import type { CaptureType, JournalMessage, OrganizationSummary, PersonalMemory } from "../../shared/schemas.js";
import type { MemoryIndexRepository, MemoryScope } from "../data/memory-index-repository.js";
import type {
  ConversationModel,
  GroundedMemoryEvidence,
  GroundedMemoryModelAnswer,
  ModelAttachment,
} from "./conversation-model.js";

const MAX_INDEX_TEXT = 12_000;
const MEMORY_STOP_WORDS = new Set([
  "about", "and", "are", "did", "for", "from", "have", "how", "into", "latest", "lately",
  "that", "the", "their", "this", "was", "were", "what", "when", "where", "which", "with",
]);

/** Conservative terms for the bounded lexical path when vector search is unavailable. */
export function memorySearchTerms(query: string): string[] {
  return (query.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((term) => term.length >= 3 && !MEMORY_STOP_WORDS.has(term))
    .slice(0, 12);
}

/**
 * Scores lexical fallback evidence without requiring exact inflection matches. The vector index
 * is preferred, but this path must still find a message when its summary says "decision" and the
 * question says "deciding" (or similar). Matching is deliberately conservative: only exact words,
 * clear prefixes, or a shared four-character stem for longer words count.
 */
export function memoryTextScore(text: string, terms: string[]): number {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return terms.reduce((score, term) => {
    const matches = tokens.some((token) => {
      if (token === term) return true;
      if (term.length >= 4 && token.length >= term.length && token.startsWith(term)) return true;
      if (token.length >= 4 && term.length >= token.length && term.startsWith(token)) return true;
      return token.length >= 6 && term.length >= 6 && token.slice(0, 4) === term.slice(0, 4);
    });
    return score + (matches ? 1 : 0);
  }, 0);
}

/**
 * Treat the model's structured citations as untrusted output. A citation is accepted only when it
 * names supplied evidence, uses no foreign message id, and quotes an exact supporting excerpt.
 */
export function validateGroundedMemoryAnswer(
  evidence: GroundedMemoryEvidence[],
  answer: GroundedMemoryModelAnswer,
): { answer: string; sourceSessionIds: string[] } | null {
  if (answer.insufficientEvidence) return null;

  const evidenceBySession = new Map(evidence.map((item) => [item.sourceSessionId, item]));
  const selected: string[] = [];
  for (const citation of answer.citations) {
    const source = evidenceBySession.get(citation.sourceSessionId);
    if (!source) return null;
    if (citation.sourceMessageIds.some((id) => !source.sourceMessageIds.includes(id))) return null;
    if (!source.text.includes(citation.supportingExcerpt)) return null;
    if (!selected.includes(citation.sourceSessionId)) selected.push(citation.sourceSessionId);
  }
  if (selected.length === 0) return null;
  return { answer: answer.answer, sourceSessionIds: selected };
}

function canonicalText(
  title: string,
  captureType: CaptureType,
  messages: JournalMessage[],
  summary: PersonalMemory | OrganizationSummary | null,
  tags: string[] = [],
): string {
  const messageText = messages
    .slice(-24)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const summaryText = summary
    ? `Summary: ${summary.summary}\nThemes: ${summary.themes.join(", ")}\nNext steps: ${summary.nextSteps.join(", ")}`
    : "";
  return [`Capture type: ${captureType}`, `Title: ${title}`, tags.length > 0 ? `Tags: ${tags.join(", ")}` : "", summaryText, messageText]
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_INDEX_TEXT);
}

export class MemoryIndexService {
  constructor(
    private readonly repository: MemoryIndexRepository,
    private readonly model: ConversationModel,
  ) {}

  async indexSession(
    scope: MemoryScope,
    input: {
      sessionId: string;
      title: string;
      captureType: CaptureType;
      tags?: string[];
      messages: JournalMessage[];
      summary: PersonalMemory | OrganizationSummary | null;
      attachments?: ModelAttachment[];
    },
  ): Promise<void> {
    if (!this.model.embedText) return;
    const attachmentText = this.model.extractAttachmentText && input.attachments?.length
      ? (await Promise.all(input.attachments.slice(0, 3).map(async (attachment, index) => {
        try {
          const extracted = await this.model.extractAttachmentText!(attachment);
          return `Attachment ${index + 1} (${attachment.mimeType}):\n${extracted}`;
        } catch {
          // A file-processing failure must not erase the searchable text already present in the
          // reflection. The attachment remains available for direct model analysis on the message.
          return "";
        }
      }))).filter(Boolean).join("\n")
      : "";
    const text = [
      canonicalText(input.title, input.captureType, input.messages, input.summary, input.tags),
      attachmentText ? `Attachments:\n${attachmentText}` : "",
    ].filter(Boolean).join("\n").slice(0, MAX_INDEX_TEXT);
    const embedding = await this.model.embedText(text, "RETRIEVAL_DOCUMENT");
    await this.repository.upsert(scope, {
      sourceSessionId: input.sessionId,
      sourceMessageIds: input.messages.map((message) => message.id).slice(-24),
      captureType: input.captureType,
      text,
      embedding: embedding.values,
      embeddingModel: embedding.model,
      embeddingVersion: 1,
      indexStatus: "ready",
    });
  }

  async search(scope: MemoryScope, query: string, limit = 8) {
    if (!this.model.embedText) return [];
    const embedding = await this.model.embedText(query, "RETRIEVAL_QUERY");
    return this.repository.findNearest(scope, embedding.values, limit);
  }

  async deleteSession(scope: MemoryScope, sessionId: string): Promise<void> {
    await this.repository.deleteForSession(scope, sessionId);
  }
}
