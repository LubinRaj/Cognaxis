import type {
  JournalMessage,
  JournalSession,
  PersonalMemory,
  SessionDetail,
} from "../../shared/schemas.js";
import { AppError, notFound } from "../errors.js";
import type { JournalRepository } from "../data/journal-repository.js";
import type { ConversationModel } from "./conversation-model.js";

const MAX_STORED_MESSAGES = 120;
const MODEL_CONTEXT_MESSAGES = 24;
const AUTO_SUMMARY_INTERVAL = 8;

export type MessageExchange = {
  userMessage: JournalMessage;
  assistantMessage: JournalMessage;
  summary: PersonalMemory | null;
};

export class JournalService {
  constructor(
    private readonly repository: JournalRepository,
    private readonly model: ConversationModel,
  ) {}

  async createSession(uid: string, title?: string): Promise<JournalSession> {
    return this.repository.createSession(uid, title ?? "New reflection");
  }

  async listSessions(uid: string, limit: number): Promise<JournalSession[]> {
    return this.repository.listSessions(uid, limit);
  }

  async getSession(uid: string, sessionId: string): Promise<SessionDetail> {
    const session = await this.repository.getSession(uid, sessionId);
    if (!session) throw notFound();
    const messages = await this.repository.listMessages(uid, sessionId, MAX_STORED_MESSAGES);
    return { ...session, messages };
  }

  async addMessage(uid: string, sessionId: string, content: string): Promise<MessageExchange> {
    const session = await this.repository.getSession(uid, sessionId);
    if (!session) throw notFound();
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ARCHIVED", "This session is archived.");
    }
    if (session.messageCount >= MAX_STORED_MESSAGES) {
      throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
    }

    const userMessage = await this.repository.appendMessage(uid, sessionId, {
      role: "user",
      content,
    });
    const context = await this.repository.listMessages(uid, sessionId, MODEL_CONTEXT_MESSAGES);
    const reply = await this.model.reply(context);
    const assistantMessage = await this.repository.appendMessage(uid, sessionId, {
      role: "model",
      content: reply,
    });

    const newCount = session.messageCount + 2;
    const shouldSummarize =
      newCount - session.summarizedMessageCount >= AUTO_SUMMARY_INTERVAL;
    const summary = shouldSummarize ? await this.summarize(uid, sessionId) : null;

    return { userMessage, assistantMessage, summary };
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
    return this.repository.saveSummary(uid, {
      ...output,
      sourceSessionId: sessionId,
      sourceMessageIds: messages.map((message) => message.id),
      sourceMessageCount: session.messageCount,
    });
  }

  async deleteSession(uid: string, sessionId: string): Promise<void> {
    const deleted = await this.repository.deleteSession(uid, sessionId);
    if (!deleted) throw notFound();
  }
}
