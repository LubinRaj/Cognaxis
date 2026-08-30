import { randomUUID } from "node:crypto";
import type {
  JournalMessage,
  JournalSession,
  PersonalMemory,
} from "../../shared/schemas.js";
import type {
  AppendMessageInput,
  JournalRepository,
  SaveSummaryInput,
} from "./journal-repository.js";

type UserStore = {
  sessions: Map<string, JournalSession>;
  messages: Map<string, JournalMessage[]>;
  memories: Map<string, PersonalMemory>;
};

export class InMemoryJournalRepository implements JournalRepository {
  private readonly users = new Map<string, UserStore>();

  private user(uid: string): UserStore {
    const existing = this.users.get(uid);
    if (existing) return existing;
    const created: UserStore = {
      sessions: new Map(),
      messages: new Map(),
      memories: new Map(),
    };
    this.users.set(uid, created);
    return created;
  }

  async createSession(uid: string, title: string): Promise<JournalSession> {
    const now = new Date().toISOString();
    const session: JournalSession = {
      id: randomUUID(),
      title,
      status: "active",
      messageCount: 0,
      summarizedMessageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.user(uid).sessions.set(session.id, session);
    this.user(uid).messages.set(session.id, []);
    return structuredClone(session);
  }

  async listSessions(uid: string, limit: number): Promise<JournalSession[]> {
    return [...this.user(uid).sessions.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map((session) => structuredClone(session));
  }

  async getSession(uid: string, sessionId: string): Promise<JournalSession | null> {
    const session = this.user(uid).sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  async listMessages(
    uid: string,
    sessionId: string,
    limit: number,
  ): Promise<JournalMessage[]> {
    return (this.user(uid).messages.get(sessionId) ?? [])
      .slice(-limit)
      .map((message) => structuredClone(message));
  }

  async appendMessage(
    uid: string,
    sessionId: string,
    input: AppendMessageInput,
  ): Promise<JournalMessage> {
    const store = this.user(uid);
    const session = store.sessions.get(sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    const message: JournalMessage = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    store.messages.get(sessionId)?.push(message);
    session.messageCount += 1;
    session.updatedAt = message.createdAt;
    return structuredClone(message);
  }

  async saveSummary(uid: string, input: SaveSummaryInput): Promise<PersonalMemory> {
    const store = this.user(uid);
    const session = store.sessions.get(input.sourceSessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    const now = new Date().toISOString();
    const existing = store.memories.get(input.sourceSessionId);
    const memory: PersonalMemory = {
      id: `session_${input.sourceSessionId}`,
      title: input.title,
      summary: input.summary,
      themes: [...input.themes],
      nextSteps: [...input.nextSteps],
      sourceSessionId: input.sourceSessionId,
      sourceMessageIds: [...input.sourceMessageIds],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    store.memories.set(input.sourceSessionId, memory);
    session.summarizedMessageCount = input.sourceMessageCount;
    return structuredClone(memory);
  }

  async getSummary(uid: string, sessionId: string): Promise<PersonalMemory | null> {
    const memory = this.user(uid).memories.get(sessionId);
    return memory ? structuredClone(memory) : null;
  }

  async deleteSession(uid: string, sessionId: string): Promise<boolean> {
    const store = this.user(uid);
    const existed = store.sessions.delete(sessionId);
    store.messages.delete(sessionId);
    store.memories.delete(sessionId);
    return existed;
  }
}
