import type {
  JournalMessage,
  JournalSession,
  PersonalMemory,
  SessionDetail,
} from "../../shared/schemas.js";
import { AppError, notFound } from "../errors.js";
import type {
  JournalRepository,
  PersistedMessageExchange,
} from "../data/journal-repository.js";
import type { ConversationModel } from "./conversation-model.js";
import type { UsageRecorder } from "./usage-recorder.js";

const MAX_STORED_MESSAGES = 120;
const MODEL_CONTEXT_MESSAGES = 24;
const AUTO_SUMMARY_INTERVAL = 8;

export type MessageExchange = {
  userMessage: JournalMessage;
  assistantMessage: JournalMessage;
  summary: PersonalMemory | null;
};

function requireMatchingRequest(
  exchange: PersistedMessageExchange,
  content: string,
): PersistedMessageExchange {
  if (exchange.userMessage.content !== content) {
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
  ) {}

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

  async createSession(uid: string, title?: string): Promise<JournalSession> {
    const session = await this.repository.createSession(uid, title ?? "New reflection");
    // A new reflection changes the reflection count of its own period.
    await this.notifyContentChanged(uid, session.createdAt);
    await this.usage?.record("sessionsCreated");
    return session;
  }

  async listSessions(uid: string, limit: number): Promise<JournalSession[]> {
    return this.repository.listSessions(uid, limit);
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
  ): Promise<MessageExchange> {
    const previous = await this.repository.getMessageExchange(uid, sessionId, requestId);
    if (previous) {
      const existing = requireMatchingRequest(previous, content);
      return {
        userMessage: existing.userMessage,
        assistantMessage: existing.assistantMessage,
        summary: await this.repository.getSummary(uid, sessionId),
      };
    }

    const session = await this.repository.getSession(uid, sessionId);
    if (!session) throw notFound();
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ARCHIVED", "This session is archived.");
    }
    if (session.messageCount + 2 > MAX_STORED_MESSAGES) {
      throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
    }

    const context = await this.repository.listMessages(uid, sessionId, MODEL_CONTEXT_MESSAGES);
    const pendingUserMessage: JournalMessage = {
      id: `pending_${requestId}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    // Generate first, then atomically persist both sides. A model failure therefore leaves no
    // orphaned user message, while the request id makes a network retry return the same exchange.
    const reply = await this.model.reply(
      [...context, pendingUserMessage].slice(-MODEL_CONTEXT_MESSAGES),
    );

    let persisted: PersistedMessageExchange;
    try {
      persisted = requireMatchingRequest(
        await this.repository.saveMessageExchange(uid, sessionId, {
          requestId,
          userContent: content,
          assistantContent: reply,
          maxMessageCount: MAX_STORED_MESSAGES,
        }),
        content,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_NOT_FOUND") throw notFound();
      if (error instanceof Error && error.message === "SESSION_LIMIT_REACHED") {
        throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
      }
      throw error;
    }

    const latestSession = await this.repository.getSession(uid, sessionId);
    if (!latestSession) throw notFound();
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
    await this.usage?.record("messageExchangesCompleted");

    return {
      userMessage: persisted.userMessage,
      assistantMessage: persisted.assistantMessage,
      summary,
    };
  }

  async streamMessage(
    uid: string,
    sessionId: string,
    requestId: string,
    content: string,
    onStart: (userMessage: JournalMessage) => void,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<MessageExchange> {
    const previous = await this.repository.getMessageExchange(uid, sessionId, requestId);
    if (previous) {
      const existing = requireMatchingRequest(previous, content);
      onStart(existing.userMessage);
      onChunk(existing.assistantMessage.content);
      return {
        userMessage: existing.userMessage,
        assistantMessage: existing.assistantMessage,
        summary: await this.repository.getSummary(uid, sessionId),
      };
    }

    const session = await this.repository.getSession(uid, sessionId);
    if (!session) throw notFound();
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ARCHIVED", "This session is archived.");
    }
    if (session.messageCount + 2 > MAX_STORED_MESSAGES) {
      throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
    }

    const context = await this.repository.listMessages(uid, sessionId, MODEL_CONTEXT_MESSAGES);
    const pendingUserMessage: JournalMessage = {
      id: `pending_${requestId}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    
    onStart(pendingUserMessage);

    const stream = this.model.replyStream(
      [...context, pendingUserMessage].slice(-MODEL_CONTEXT_MESSAGES),
      signal,
    );

    let assistantContent = "";
    for await (const chunk of stream) {
      if (signal?.aborted) throw new Error("AbortError");
      assistantContent += chunk;
      onChunk(chunk);
    }

    let persisted: PersistedMessageExchange;
    try {
      persisted = requireMatchingRequest(
        await this.repository.saveMessageExchange(uid, sessionId, {
          requestId,
          userContent: content,
          assistantContent,
          maxMessageCount: MAX_STORED_MESSAGES,
        }),
        content,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_NOT_FOUND") throw notFound();
      if (error instanceof Error && error.message === "SESSION_LIMIT_REACHED") {
        throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
      }
      throw error;
    }

    const latestSession = await this.repository.getSession(uid, sessionId);
    if (!latestSession) throw notFound();
    const shouldSummarize =
      latestSession.messageCount - latestSession.summarizedMessageCount >= AUTO_SUMMARY_INTERVAL;
    let summary: PersonalMemory | null = null;
    if (shouldSummarize) {
      try {
        summary = await this.summarize(uid, sessionId);
      } catch {
        // The exchange is already complete and must remain successful. A summary can be retried
        // manually, or it will be attempted automatically on the next message.
        summary = await this.repository.getSummary(uid, sessionId);
      }
    } else {
      summary = await this.repository.getSummary(uid, sessionId);
    }

    await this.notifyContentChanged(uid, session.createdAt);
    await this.usage?.record("messageExchangesCompleted");

    return {
      userMessage: persisted.userMessage,
      assistantMessage: persisted.assistantMessage,
      summary,
    };
  }

  async summarize(uid: string, sessionId: string): Promise<PersonalMemory> {
    const session = await this.repository.getSession(uid, sessionId);
    if (!session) throw notFound();
    const existing = await this.repository.getSummary(uid, sessionId);
    if (existing && session.summarizedMessageCount === session.messageCount) return existing;

    const messages = await this.repository.listMessages(uid, sessionId, MAX_STORED_MESSAGES);
    if (messages.length < 2) {
      throw new AppError(409, "NOT_ENOUGH_CONTEXT", "Add more to the conversation first.");
    }
    const output = await this.model.summarize(messages.slice(-MODEL_CONTEXT_MESSAGES));
    const saved = await this.repository.saveSummary(uid, {
      ...output,
      sourceSessionId: sessionId,
      sourceMessageIds: messages.map((message) => message.id),
      sourceMessageCount: session.messageCount,
    });
    await this.notifyContentChanged(uid, session.createdAt);
    await this.usage?.record("sessionSummariesGenerated");
    return saved;
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
