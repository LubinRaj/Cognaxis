import type {
  CaptureType,
  JournalMessage,
  JournalSession,
  PersonalMemory,
  PersonalMemoryAnswer,
  MemoryIndexBuildResult,
  PersonalOpenLoop,
  SessionDetail,
  AttachmentKind,
  AttachmentReference,
} from "../../shared/schemas.js";
import { AppError, notFound } from "../errors.js";
import type {
  JournalRepository,
  PersistedMessageExchange,
} from "../data/journal-repository.js";
import type { ConversationModel, ReflectionClassification } from "./conversation-model.js";
import type { ModelAttachment } from "./conversation-model.js";
import type { AttachmentRepository } from "../data/attachment-repository.js";
import type { UsageRecorder } from "./usage-recorder.js";
import {
  memorySearchTerms,
  memoryTextScore,
  validateGroundedMemoryAnswer,
  type MemoryIndexService,
} from "./memory-index-service.js";
import { isPlaceholderReflectionTitle, normalizeReflectionTitle } from "../../shared/reflection-title.js";
import {
  appendAutomaticReflectionTag,
  MAX_AI_REFLECTION_TAGS,
  sanitizeReflectionTags,
} from "../../shared/reflection-tags.js";

const MAX_STORED_MESSAGES = 120;
const MODEL_CONTEXT_MESSAGES = 24;
const AUTO_SUMMARY_INTERVAL = 8;
const MEMORY_MESSAGE_SESSIONS = 30;
const MEMORY_MESSAGE_LIMIT = 12;
const MAX_MEMORY_EVIDENCE_TEXT = 2_500;

export type MessageExchange = {
  userMessage: JournalMessage;
  assistantMessage: JournalMessage;
  summary: PersonalMemory | null;
  session?: JournalSession;
};

function requireMatchingRequest(
  exchange: PersistedMessageExchange,
  content: string,
  attachmentIds: string[] = [],
): PersistedMessageExchange {
  const existingAttachmentIds = exchange.userMessage.attachmentIds ?? [];
  if (
    exchange.userMessage.content !== content ||
    existingAttachmentIds.length !== attachmentIds.length ||
    existingAttachmentIds.some((id, index) => id !== attachmentIds[index])
  ) {
    throw new AppError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "This message request conflicts with an earlier request.",
    );
  }
  return exchange;
}

export type SessionDeletionCascade = (uid: string, sessionId: string) => Promise<void>;
/**
 * Notified with the creation instant of the session whose content changed, so derived artifacts
 * are invalidated for the period that actually contains the session — not the wall-clock period
 * of the edit.
 */
export type ContentChangeListener = (uid: string, sessionCreatedAt: string) => Promise<void>;

export class JournalService {
  constructor(
    private readonly repository: JournalRepository,
    private readonly model: ConversationModel,
    private readonly deletionCascades: SessionDeletionCascade[] = [],
    private readonly contentChangeListeners: ContentChangeListener[] = [],
    private readonly usage?: UsageRecorder,
    private readonly attachments?: AttachmentRepository,
    private readonly memoryIndex?: MemoryIndexService,
  ) {}

  private async refreshMemoryIndex(uid: string, sessionId: string): Promise<void> {
    if (!this.memoryIndex) return;
    const session = await this.repository.getSession(uid, sessionId);
    if (!session || session.status !== "active") return;
    const [messages, summary] = await Promise.all([
      this.repository.listMessages(uid, sessionId, MAX_STORED_MESSAGES),
      this.repository.getSummary(uid, sessionId),
    ]);
    const attachmentIds = [...new Set(messages.flatMap((message) => message.attachmentIds ?? []))].slice(0, 3);
    const attachments = this.attachments
      ? (await Promise.all(attachmentIds.map((attachmentId) =>
        this.attachments!.get({ type: "personal", scopeId: uid }, sessionId, attachmentId).catch(() => null),
      ))).filter((attachment): attachment is NonNullable<typeof attachment> =>
        attachment !== null && (attachment.kind === "image" || attachment.kind === "document"),
      ).map(({ mimeType, bytes }) => ({ mimeType, bytes }))
      : [];
    await this.memoryIndex.indexSession({ type: "personal", scopeId: uid }, {
      sessionId,
      title: session.title,
      captureType: session.captureType,
      tags: session.tags,
      messages,
      summary,
      attachments,
    });
  }

  private async classifyNewReflection(
    uid: string,
    session: JournalSession,
    content: string,
  ): Promise<ReflectionClassification | null> {
    if (!this.model.classifyReflection || session.messageCount !== 0 || !isPlaceholderReflectionTitle(session.title)) {
      return null;
    }
    try {
      const existingTags = await this.repository.listTags(uid, 50);
      const result = await this.model.classifyReflection({
        content,
        existingTags,
        purpose: "initial",
        scope: "personal",
      });
      const title = normalizeReflectionTitle(result.title);
      if (!title) return null;
      return { title, tags: sanitizeReflectionTags(result.tags, MAX_AI_REFLECTION_TAGS) };
    } catch {
      // Metadata is an enhancement. A model failure must never make a successful reflection fail.
      return null;
    }
  }

  private async classifySummaryTag(
    uid: string,
    session: JournalSession,
    messages: JournalMessage[],
    summary: PersonalMemory,
  ): Promise<string[] | null> {
    if (!this.model.classifyReflection) return null;
    try {
      const [existingTags, latestSession] = await Promise.all([
        this.repository.listTags(uid, 50),
        this.repository.getSession(uid, session.id),
      ]);
      if (!latestSession || latestSession.status !== "active") return null;
      const result = await this.model.classifyReflection({
        content: `Summary:\n${summary.summary}\n\nConversation:\n${messages
          .slice(-MODEL_CONTEXT_MESSAGES)
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n")}`,
        existingTags,
        currentTags: latestSession.tags,
        purpose: "summary",
        scope: "personal",
      });
      return appendAutomaticReflectionTag(latestSession.tags, result.tags);
    } catch {
      // Summary metadata is optional and must never fail a successful summary.
      return null;
    }
  }

  // Derived-artifact bookkeeping must never fail a successful journal operation; a missed
  // staleness mark is recovered at the next explicit generation, which re-checks fingerprints.
  private async notifyContentChanged(uid: string, sessionCreatedAt: string): Promise<void> {
    for (const listener of this.contentChangeListeners) {
      try {
        await listener(uid, sessionCreatedAt);
      } catch {
        console.error(
          JSON.stringify({ severity: "WARNING", event: "insight_invalidation_failed" }),
        );
      }
    }
  }

  /**
   * Checks the owner-scoped session before a streaming response is opened. The stream method
   * repeats this check because a session can still change between preflight and persistence.
   */
  async assertSessionWritable(uid: string, sessionId: string): Promise<void> {
    await this.getActiveSession(uid, sessionId);
  }

  private async getActiveSession(uid: string, sessionId: string): Promise<JournalSession> {
    const session = await this.repository.getSession(uid, sessionId);
    if (!session) throw notFound();
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ARCHIVED", "This session is archived.");
    }
    return session;
  }

  private async getWritableSession(uid: string, sessionId: string): Promise<JournalSession> {
    const session = await this.getActiveSession(uid, sessionId);
    if (session.messageCount + 2 > MAX_STORED_MESSAGES) {
      throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
    }
    return session;
  }

  async createSession(
    uid: string,
    title?: string,
    captureType: CaptureType = "reflection",
  ): Promise<JournalSession> {
    const session = await this.repository.createSession(uid, title ?? "New personal reflection", captureType);
    // A new reflection changes the reflection count of its own period.
    await this.notifyContentChanged(uid, session.createdAt);
    await this.usage?.record("sessionsCreated");
    return session;
  }

  async listSessions(
    uid: string,
    limit: number,
    status: JournalSession["status"] = "active",
  ): Promise<JournalSession[]> {
    return this.repository.listSessions(uid, limit, status);
  }

  async listTags(uid: string, limit = 100): Promise<string[]> {
    return this.repository.listTags(uid, Math.max(1, Math.min(limit, 100)));
  }

  async renameSession(uid: string, sessionId: string, title: string): Promise<JournalSession> {
    const session = await this.getActiveSession(uid, sessionId);
    const renamed = await this.repository.renameSession(uid, sessionId, title.trim());
    await this.notifyContentChanged(uid, session.createdAt);
    return renamed;
  }

  async setSessionTags(uid: string, sessionId: string, tags: string[]): Promise<JournalSession> {
    const session = await this.getActiveSession(uid, sessionId);
    const normalized = sanitizeReflectionTags(tags);
    const updated = await this.repository.setSessionTags(uid, sessionId, normalized);
    await this.repository.registerTags(uid, normalized).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "reflection_tag_catalog_failed" }));
    });
    await this.notifyContentChanged(uid, session.createdAt);
    return updated;
  }

  async createAttachment(
    uid: string,
    sessionId: string,
    kind: AttachmentKind,
    mimeType: string,
    bytes: Buffer,
  ): Promise<AttachmentReference> {
    await this.getActiveSession(uid, sessionId);
    if (!this.attachments) throw new AppError(503, "ATTACHMENTS_UNAVAILABLE", "Attachments are not available right now.");
    return this.attachments.create({ type: "personal", scopeId: uid }, sessionId, kind, mimeType, bytes);
  }

  async deleteAttachment(uid: string, sessionId: string, attachmentId: string): Promise<void> {
    await this.getActiveSession(uid, sessionId);
    if (!this.attachments || !(await this.attachments.delete({ type: "personal", scopeId: uid }, sessionId, attachmentId))) {
      throw notFound();
    }
  }

  async transcribeAttachment(uid: string, sessionId: string, attachmentId: string): Promise<string> {
    await this.getActiveSession(uid, sessionId);
    if (!this.attachments || !this.model.transcribeAudio) {
      throw new AppError(503, "TRANSCRIPTION_UNAVAILABLE", "Voice transcription is not available right now.");
    }
    const attachment = await this.attachments.get({ type: "personal", scopeId: uid }, sessionId, attachmentId);
    if (!attachment || attachment.kind !== "audio") throw notFound();
    return this.model.transcribeAudio({ mimeType: attachment.mimeType, bytes: attachment.bytes });
  }

  async transcribeVoice(uid: string, sessionId: string, mimeType: string, bytes: Buffer): Promise<string> {
    await this.getActiveSession(uid, sessionId);
    if (!this.model.transcribeAudio) {
      throw new AppError(503, "TRANSCRIPTION_UNAVAILABLE", "Voice transcription is not available right now.");
    }
    return this.model.transcribeAudio({ mimeType, bytes });
  }

  async getAttachment(uid: string, sessionId: string, attachmentId: string): Promise<{ mimeType: string; bytes: Buffer }> {
    await this.getSession(uid, sessionId);
    if (!this.attachments) throw new AppError(503, "ATTACHMENTS_UNAVAILABLE", "Attachments are not available right now.");
    const attachment = await this.attachments.get({ type: "personal", scopeId: uid }, sessionId, attachmentId);
    if (!attachment) throw notFound();
    return { mimeType: attachment.mimeType, bytes: attachment.bytes };
  }

  private async modelAttachments(
    uid: string,
    sessionId: string,
    attachmentIds: string[],
  ): Promise<ModelAttachment[]> {
    if (attachmentIds.length === 0) return [];
    if (!this.attachments) throw new AppError(503, "ATTACHMENTS_UNAVAILABLE", "Attachments are not available right now.");
    const records = await Promise.all(
      attachmentIds.map((id) => this.attachments!.get({ type: "personal", scopeId: uid }, sessionId, id)),
    );
    if (records.some((record) => record === null)) throw notFound();
    return records
      .filter((record): record is NonNullable<typeof record> => record !== null)
      .filter((record) => record.kind === "image" || record.kind === "document")
      .map((record) => ({ mimeType: record.mimeType, bytes: record.bytes }));
  }

  /**
   * Small, bounded retrieval for the first Personal Intelligence release. It deliberately uses
   * only active sessions owned by the verified user. A vector index is preferred, while summaries
   * and recent messages provide a bounded fallback when indexing or summarization is unavailable.
   */
  async askPersonalMemory(uid: string, query: string): Promise<PersonalMemoryAnswer> {
    const sessions = await this.repository.listSessions(uid, 50);
    if (this.memoryIndex) {
      try {
        const chunks = await this.memoryIndex.search({ type: "personal", scopeId: uid }, query, 8);
        if (chunks.length > 0) {
          const sessionById = new Map(sessions.map((session) => [session.id, session]));
          const authorized = chunks.filter((chunk) => sessionById.has(chunk.sourceSessionId));
          if (authorized.length > 0) {
            const evidence = authorized.map((chunk) => ({
              sourceSessionId: chunk.sourceSessionId,
              sourceMessageIds: chunk.sourceMessageIds,
              captureType: chunk.captureType,
              text: chunk.text.slice(0, MAX_MEMORY_EVIDENCE_TEXT),
            }));
            if (this.model.answerGroundedMemory) {
              const grounded = validateGroundedMemoryAnswer(
                evidence,
                await this.model.answerGroundedMemory({
                  scope: "personal",
                  question: query,
                  evidence,
                }),
              );
              if (!grounded) {
                return {
                  answer: "I couldn't find enough in your saved captures to answer that reliably.",
                  citations: [],
                };
              }
              const selected = new Set(grounded.sourceSessionIds);
              return {
                answer: grounded.answer,
                citations: authorized
                  .filter((chunk) => selected.has(chunk.sourceSessionId))
                  .map((chunk) => {
                    const session = sessionById.get(chunk.sourceSessionId)!;
                    return { sessionId: session.id, title: session.title, date: session.updatedAt.slice(0, 10) };
                  }),
              };
            }
            const answer = await this.model.reply([
              {
                id: "personal-memory-vector-context",
                role: "user",
                content: JSON.stringify({ authorizedMemoryChunks: evidence }),
                createdAt: new Date().toISOString(),
              },
              {
                id: "personal-memory-vector-question",
                role: "user",
                content: `Answer using only the authorized memory chunks above. If they do not contain enough evidence, say so plainly. Question: ${query}`,
                createdAt: new Date().toISOString(),
              },
            ]);
            return {
              answer,
              citations: authorized.map((chunk) => {
                const session = sessionById.get(chunk.sourceSessionId)!;
                return { sessionId: session.id, title: session.title, date: session.updatedAt.slice(0, 10) };
              }),
            };
          }
        }
      } catch {
        // Existing summary retrieval remains the compatibility path until the vector index is ready.
      }
    }
    const memories = (
      await Promise.all(
        sessions.map(async (session) => ({
          session,
          memory: await this.repository.getSummary(uid, session.id),
          messages: await this.repository.listMessages(uid, session.id, MEMORY_MESSAGE_LIMIT),
        })),
      )
    ).filter((entry): entry is { session: JournalSession; memory: PersonalMemory; messages: JournalMessage[] } => entry.memory !== null);

    const terms = memorySearchTerms(query);
    if (terms.length === 0) {
      return {
        answer: "I couldn't find enough in your saved captures to answer that reliably.",
        citations: [],
      };
    }
    const ranked = memories
      .map((entry, index) => {
        const searchable = [
          entry.memory.title,
          entry.memory.summary,
          ...entry.memory.themes,
          ...entry.memory.nextSteps,
          ...entry.messages.map((message) => message.content),
        ].join(" ").toLowerCase();
        const score = memoryTextScore(searchable, terms);
        return { ...entry, score, index };
      })
      // A nearest item is not necessarily relevant. Returning zero-match summaries would make the
      // UI cite unrelated captures and encourage the model to manufacture a plausible connection.
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 8);

    if (ranked.length === 0) {
      // Summary generation is asynchronous and may fail independently of a successful capture.
      // Search the recent authorized messages as a compatibility path so Ask Me remains useful
      // immediately after a capture and does not require a manual index refresh.
      const messageCandidates = (
        await Promise.all(
          sessions.slice(0, MEMORY_MESSAGE_SESSIONS).map(async (session) => ({
            session,
            messages: await this.repository.listMessages(uid, session.id, MEMORY_MESSAGE_LIMIT),
          })),
        )
      ).filter((entry) => entry.messages.length > 0);
      const rankedMessages = messageCandidates
        .map((entry, index) => {
          const searchable = [entry.session.title, ...entry.messages.map((message) => message.content)].join(" ");
          return { ...entry, score: memoryTextScore(searchable, terms), index };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, 8);

      if (rankedMessages.length === 0) {
        return {
          answer: "I couldn't find enough in your saved captures to answer that reliably.",
          citations: [],
        };
      }

      const evidence = rankedMessages.map(({ session, messages }) => ({
        sourceSessionId: session.id,
        sourceMessageIds: messages.map((message) => message.id),
        captureType: session.captureType,
        text: [
          `Date: ${session.updatedAt.slice(0, 10)}`,
          `Title: ${session.title}`,
          "Messages:",
          ...messages.map((message) => `${message.role}: ${message.content}`),
        ].join("\n").slice(0, MAX_MEMORY_EVIDENCE_TEXT),
      }));
      if (this.model.answerGroundedMemory) {
        const grounded = validateGroundedMemoryAnswer(
          evidence,
          await this.model.answerGroundedMemory({
            scope: "personal",
            question: query,
            evidence,
          }),
        );
        if (!grounded) {
          return {
            answer: "I couldn't find enough in your saved captures to answer that reliably.",
            citations: [],
          };
        }
        const selected = new Set(grounded.sourceSessionIds);
        return {
          answer: grounded.answer,
          citations: rankedMessages
            .filter(({ session }) => selected.has(session.id))
            .map(({ session }) => ({
              sessionId: session.id,
              title: session.title,
              date: session.updatedAt.slice(0, 10),
            })),
        };
      }
      const answer = await this.model.reply([
        {
          id: "personal-memory-messages-context",
          role: "user",
          content: JSON.stringify({ authorizedPersonalCaptures: evidence }),
          createdAt: new Date().toISOString(),
        },
        {
          id: "personal-memory-messages-question",
          role: "user",
          content: `Answer the question using only the authorized captures above. If they do not contain enough evidence, say so plainly. Question: ${query}`,
          createdAt: new Date().toISOString(),
        },
      ]);
      return {
        answer,
        citations: rankedMessages.map(({ session }) => ({
          sessionId: session.id,
          title: session.title,
          date: session.updatedAt.slice(0, 10),
        })),
      };
    }

    const evidence = ranked.map(({ session, memory, messages }) => ({
      sourceSessionId: session.id,
      sourceMessageIds: [...new Set([...memory.sourceMessageIds, ...messages.map((message) => message.id)])],
      captureType: session.captureType,
      text: [
        `Date: ${session.updatedAt.slice(0, 10)}`,
        `Title: ${memory.title}`,
        `Summary: ${memory.summary}`,
        `Themes: ${memory.themes.join(", ")}`,
        `Next steps: ${memory.nextSteps.join(", ")}`,
        "Messages:",
        ...messages.map((message) => `${message.role}: ${message.content}`),
      ].join("\n").slice(0, MAX_MEMORY_EVIDENCE_TEXT),
    }));
    if (this.model.answerGroundedMemory) {
      const grounded = validateGroundedMemoryAnswer(
        evidence,
        await this.model.answerGroundedMemory({
          scope: "personal",
          question: query,
          evidence,
        }),
      );
      if (!grounded) {
        return {
          answer: "I couldn't find enough in your saved captures to answer that reliably.",
          citations: [],
        };
      }
      const selected = new Set(grounded.sourceSessionIds);
      return {
        answer: grounded.answer,
        citations: ranked
          .filter(({ session }) => selected.has(session.id))
          .map(({ session, memory }) => ({
            sessionId: session.id,
            title: memory.title,
            date: session.updatedAt.slice(0, 10),
          })),
      };
    }
    const context: JournalMessage = {
      id: "personal-memory-context",
      role: "user",
      content: JSON.stringify({ authorizedPersonalSummaries: evidence }),
      createdAt: new Date().toISOString(),
    };
    const question: JournalMessage = {
      id: "personal-memory-question",
      role: "user",
      content: `Answer the question using only the authorized summaries above. If they do not contain enough evidence, say so plainly. Question: ${query}`,
      createdAt: new Date().toISOString(),
    };
    const answer = await this.model.reply([context, question]);
    return {
      answer,
      citations: ranked.map(({ session, memory }) => ({
        sessionId: session.id,
        title: memory.title,
        date: session.updatedAt.slice(0, 10),
      })),
    };
  }

  async buildMemoryIndex(uid: string, limit = 20): Promise<MemoryIndexBuildResult> {
    if (!this.memoryIndex) {
      throw new AppError(503, "MEMORY_INDEX_UNAVAILABLE", "Saved memory indexing is not available right now.");
    }
    const sessions = await this.repository.listSessions(uid, Math.min(Math.max(limit, 1), 30));
    let indexed = 0;
    let skipped = 0;
    let failed = 0;
    for (const session of sessions) {
      if (session.messageCount === 0) {
        skipped += 1;
        continue;
      }
      try {
        await this.refreshMemoryIndex(uid, session.id);
        indexed += 1;
      } catch {
        failed += 1;
      }
    }
    return { examined: sessions.length, indexed, skipped, failed };
  }

  async listOpenLoops(uid: string, limit = 8): Promise<PersonalOpenLoop[]> {
    const sessions = await this.repository.listSessions(uid, 30);
    const summaries = await Promise.all(
      sessions.map(async (session) => ({ session, summary: await this.repository.getSummary(uid, session.id) })),
    );
    const seen = new Set<string>();
    const loops: PersonalOpenLoop[] = [];
    for (const { session, summary } of summaries) {
      if (!summary) continue;
      for (const text of summary.nextSteps) {
        const normalized = text.trim().toLowerCase();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        loops.push({
          sessionId: session.id,
          title: session.title,
          captureType: session.captureType,
          date: session.updatedAt.slice(0, 10),
          text,
        });
        if (loops.length >= limit) return loops;
      }
    }
    return loops;
  }

  async getSession(uid: string, sessionId: string): Promise<SessionDetail> {
    const session = await this.repository.getSession(uid, sessionId);
    if (!session) throw notFound();
    // Messages and the summary are read through the same user-scoped repository calls, so the
    // summary can never be returned for a session the verified uid does not own.
    const [messages, summary] = await Promise.all([
      this.repository.listMessages(uid, sessionId, MAX_STORED_MESSAGES),
      this.repository.getSummary(uid, sessionId),
    ]);
    return { ...session, messages, summary };
  }

  async addMessage(
    uid: string,
    sessionId: string,
    requestId: string,
    content: string,
    attachmentIds: string[] = [],
  ): Promise<MessageExchange> {
    const previous = await this.repository.getMessageExchange(uid, sessionId, requestId);
    if (previous) {
      const existing = requireMatchingRequest(previous, content, attachmentIds);
      return {
        userMessage: existing.userMessage,
        assistantMessage: existing.assistantMessage,
        summary: await this.repository.getSummary(uid, sessionId),
      };
    }

    const session = await this.getWritableSession(uid, sessionId);

    const context = await this.repository.listMessages(uid, sessionId, MODEL_CONTEXT_MESSAGES);
    const modelAttachments = await this.modelAttachments(uid, sessionId, attachmentIds);
    const pendingUserMessage: JournalMessage = {
      id: `pending_${requestId}`,
      role: "user",
      content,
      ...(attachmentIds.length > 0 ? { attachmentIds: [...attachmentIds] } : {}),
      createdAt: new Date().toISOString(),
    };
    // Generate first, then atomically persist both sides. A model failure therefore leaves no
    // orphaned user message, while the request id makes a network retry return the same exchange.
    const modelMessages = [...context, pendingUserMessage].slice(-MODEL_CONTEXT_MESSAGES);
    const classificationPromise = this.classifyNewReflection(uid, session, content);
    const replyPromise = modelAttachments.length > 0 && this.model.replyWithAttachments
      ? this.model.replyWithAttachments(modelMessages, modelAttachments)
      : this.model.reply(modelMessages);
    const [reply, classification] = await Promise.all([replyPromise, classificationPromise]);
    const title = classification?.title;

    let persisted: PersistedMessageExchange;
    try {
      persisted = requireMatchingRequest(
        await this.repository.saveMessageExchange(uid, sessionId, {
          requestId,
          userContent: content,
          assistantContent: reply,
          title,
          tags: classification?.tags,
          attachmentIds,
          maxMessageCount: MAX_STORED_MESSAGES,
        }),
        content,
        attachmentIds,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_NOT_FOUND") throw notFound();
      if (error instanceof Error && error.message === "SESSION_ARCHIVED") {
        throw new AppError(409, "SESSION_ARCHIVED", "This session is archived.");
      }
      if (error instanceof Error && error.message === "SESSION_LIMIT_REACHED") {
        throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
      }
      throw error;
    }

    const latestSession = await this.repository.getSession(uid, sessionId);
    if (!latestSession) throw notFound();
    if (classification?.tags.length) {
      await this.repository.registerTags(uid, classification.tags).catch(() => {
        console.warn(JSON.stringify({ severity: "WARNING", event: "reflection_tag_catalog_failed" }));
      });
    }
    const shouldSummarize =
      latestSession.messageCount - latestSession.summarizedMessageCount >= AUTO_SUMMARY_INTERVAL;
    let summary: PersonalMemory | null = null;
    if (shouldSummarize) {
      try {
        summary = await this.summarize(uid, sessionId);
      } catch {
        // The exchange is already complete and must remain successful. A summary can be retried
        // independently from the workspace without duplicating conversation messages.
        summary = null;
      }
    }

    await this.notifyContentChanged(uid, latestSession.createdAt);
    void this.refreshMemoryIndex(uid, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    await this.usage?.record("messageExchangesCompleted");

    return {
      userMessage: persisted.userMessage,
      assistantMessage: persisted.assistantMessage,
      summary,
      session: latestSession,
    };
  }

  async streamMessage(
    uid: string,
    sessionId: string,
    requestId: string,
    content: string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
    attachmentIds: string[] = [],
  ): Promise<MessageExchange> {
    const previous = await this.repository.getMessageExchange(uid, sessionId, requestId);
    if (previous) {
      const existing = requireMatchingRequest(previous, content, attachmentIds);
      onChunk(existing.assistantMessage.content);
      return {
        userMessage: existing.userMessage,
        assistantMessage: existing.assistantMessage,
        summary: await this.repository.getSummary(uid, sessionId),
      };
    }

    const session = await this.getWritableSession(uid, sessionId);

    const context = await this.repository.listMessages(uid, sessionId, MODEL_CONTEXT_MESSAGES);
    const modelAttachments = await this.modelAttachments(uid, sessionId, attachmentIds);
    const pendingUserMessage: JournalMessage = {
      id: `pending_${requestId}`,
      role: "user",
      content,
      ...(attachmentIds.length > 0 ? { attachmentIds: [...attachmentIds] } : {}),
      createdAt: new Date().toISOString(),
    };
    const modelMessages = [...context, pendingUserMessage].slice(-MODEL_CONTEXT_MESSAGES);
    const classificationPromise = this.classifyNewReflection(uid, session, content);
    const stream = modelAttachments.length > 0 && this.model.replyStreamWithAttachments
      ? this.model.replyStreamWithAttachments(modelMessages, modelAttachments, signal)
      : this.model.replyStream(modelMessages, signal);

    let assistantContent = "";
    for await (const chunk of stream) {
      if (signal?.aborted) throw new Error("AbortError");
      assistantContent += chunk;
      onChunk(chunk);
    }
    const classification = await classificationPromise;
    const title = classification?.title;

    let persisted: PersistedMessageExchange;
    try {
      persisted = requireMatchingRequest(
        await this.repository.saveMessageExchange(uid, sessionId, {
          requestId,
          userContent: content,
          assistantContent,
          title,
          tags: classification?.tags,
          attachmentIds,
          maxMessageCount: MAX_STORED_MESSAGES,
        }),
        content,
        attachmentIds,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_NOT_FOUND") throw notFound();
      if (error instanceof Error && error.message === "SESSION_ARCHIVED") {
        throw new AppError(409, "SESSION_ARCHIVED", "This session is archived.");
      }
      if (error instanceof Error && error.message === "SESSION_LIMIT_REACHED") {
        throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
      }
      throw error;
    }

    const latestSession = await this.repository.getSession(uid, sessionId);
    if (!latestSession) throw notFound();
    if (classification?.tags.length) {
      await this.repository.registerTags(uid, classification.tags).catch(() => {
        console.warn(JSON.stringify({ severity: "WARNING", event: "reflection_tag_catalog_failed" }));
      });
    }
    const shouldSummarize =
      latestSession.messageCount - latestSession.summarizedMessageCount >= AUTO_SUMMARY_INTERVAL;
    
    // Auto-summary is decoupled from the interactive response so chat delivery is not delayed.
    const summary = await this.repository.getSummary(uid, sessionId);
    if (shouldSummarize) {
      void this.summarize(uid, sessionId).catch((error: unknown) => {
        console.warn(
          JSON.stringify({
            severity: "WARNING",
            event: "auto_summary_failed",
            code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
          }),
        );
      });
    }

    await this.notifyContentChanged(uid, session.createdAt);
    // The normal personal-capture path streams replies. Keep its retrieval index as fresh as the
    // non-streaming path so Ask me can find a newly completed capture without requiring a summary.
    void this.refreshMemoryIndex(uid, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    await this.usage?.record("messageExchangesCompleted");

    return {
      userMessage: persisted.userMessage,
      assistantMessage: persisted.assistantMessage,
      summary,
      session: latestSession,
    };
  }

  async summarize(uid: string, sessionId: string): Promise<PersonalMemory> {
    const session = await this.getActiveSession(uid, sessionId);
    const existing = await this.repository.getSummary(uid, sessionId);
    if (existing && session.summarizedMessageCount === session.messageCount) return existing;

    const messages = await this.repository.listMessages(uid, sessionId, MAX_STORED_MESSAGES);
    if (messages.length < 2) {
      throw new AppError(409, "NOT_ENOUGH_CONTEXT", "Add more to the conversation first.");
    }
    const output = await this.model.summarize(messages.slice(-MODEL_CONTEXT_MESSAGES));
    let saved: PersonalMemory;
    try {
      saved = await this.repository.saveSummary(uid, {
        ...output,
        sourceSessionId: sessionId,
        sourceMessageIds: messages.map((message) => message.id),
        sourceMessageCount: session.messageCount,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_ARCHIVED") {
        throw new AppError(409, "SESSION_ARCHIVED", "This session is archived.");
      }
      throw error;
    }
    const updatedTags = await this.classifySummaryTag(uid, session, messages, saved);
    if (updatedTags) {
      try {
        await this.repository.setSessionTags(uid, sessionId, updatedTags);
        await this.repository.registerTags(uid, updatedTags);
      } catch {
        console.warn(JSON.stringify({ severity: "WARNING", event: "reflection_summary_tag_failed" }));
      }
    }
    await this.notifyContentChanged(uid, session.createdAt);
    void this.refreshMemoryIndex(uid, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    await this.usage?.record("sessionSummariesGenerated");
    return saved;
  }

  async archiveSession(uid: string, sessionId: string): Promise<JournalSession> {
    await this.getActiveSession(uid, sessionId);
    const archived = await this.repository.setSessionStatus(uid, sessionId, "archived");
    if (!archived) throw notFound();
    await this.memoryIndex?.deleteSession({ type: "personal", scopeId: uid }, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_cleanup_failed" }));
    });
    await this.notifyContentChanged(uid, archived.createdAt);
    return archived;
  }

  async restoreSession(uid: string, sessionId: string): Promise<JournalSession> {
    const session = await this.repository.getSession(uid, sessionId);
    if (!session) throw notFound();
    if (session.status !== "archived") {
      throw new AppError(409, "SESSION_NOT_ARCHIVED", "This session is already active.");
    }
    const restored = await this.repository.setSessionStatus(uid, sessionId, "active");
    if (!restored) throw notFound();
    void this.refreshMemoryIndex(uid, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    await this.notifyContentChanged(uid, restored.createdAt);
    return restored;
  }

  async deleteSession(uid: string, sessionId: string): Promise<void> {
    const session = await this.repository.getSession(uid, sessionId);
    if (!session) throw notFound();

    // Derived artifacts are removed before the session itself so a failure part-way can never
    // leave an orphaned signal, pin, or stale derived record pointing at a deleted reflection.
    for (const cascade of this.deletionCascades) {
      await cascade(uid, sessionId);
    }

    const deleted = await this.repository.deleteSession(uid, sessionId);
    if (!deleted) throw notFound();
  }
}
