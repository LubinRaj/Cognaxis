import { randomUUID } from "node:crypto";
import type {
  CaptureType,
  JournalMessage,
  JournalSession,
  PersonalMemory,
} from "../../shared/schemas.js";
import type {
  JournalRepository,
  PersistedMessageExchange,
  SaveMessageExchangeInput,
  SaveSummaryInput,
} from "./journal-repository.js";
import { isPlaceholderReflectionTitle } from "../../shared/reflection-title.js";
import { sanitizeReflectionTags } from "../../shared/reflection-tags.js";

type UserStore = {
  sessions: Map<string, JournalSession>;
  messages: Map<string, JournalMessage[]>;
  memories: Map<string, PersonalMemory>;
  exchanges: Map<string, PersistedMessageExchange>;
  tags: Map<string, string>;
};

export class InMemoryJournalRepository implements JournalRepository {
  private readonly users = new Map<string, UserStore>();
  private readonly clock: () => string;

  constructor(clock: () => string | Date = () => new Date().toISOString()) {
    this.clock = () => {
      const val = clock();
      return val instanceof Date ? val.toISOString() : val;
    };
  }

  private user(uid: string): UserStore {
    const existing = this.users.get(uid);
    if (existing) return existing;
    const created: UserStore = {
      sessions: new Map(),
      messages: new Map(),
      memories: new Map(),
      exchanges: new Map(),
      tags: new Map(),
    };
    this.users.set(uid, created);
    return created;
  }

  async createSession(
    uid: string,
    title: string,
    captureType: CaptureType = "reflection",
  ): Promise<JournalSession> {
    const now = this.clock();
    const session: JournalSession = {
      id: randomUUID(),
      title,
      status: "active",
      messageCount: 0,
      summarizedMessageCount: 0,
      captureType,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    this.user(uid).sessions.set(session.id, session);
    this.user(uid).messages.set(session.id, []);
    return structuredClone(session);
  }

  async renameSession(uid: string, sessionId: string, title: string): Promise<JournalSession> {
    const session = this.user(uid).sessions.get(sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "active") throw new Error("SESSION_ARCHIVED");
    session.title = title;
    session.updatedAt = this.clock();
    return structuredClone(session);
  }

  async setSessionTags(uid: string, sessionId: string, tags: string[]): Promise<JournalSession> {
    const session = this.user(uid).sessions.get(sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "active") throw new Error("SESSION_ARCHIVED");
    session.tags = [...tags];
    session.updatedAt = this.clock();
    return structuredClone(session);
  }

  async listTags(uid: string, limit: number): Promise<string[]> {
    const store = this.user(uid);
    // Include historic session tags while the persistent catalog is gradually populated.
    const known = [
      ...store.tags.values(),
      ...[...store.sessions.values()].flatMap((session) => session.tags),
    ];
    return sanitizeReflectionTags(known, limit).sort((left, right) => left.localeCompare(right));
  }

  async registerTags(uid: string, tags: string[]): Promise<void> {
    const store = this.user(uid);
    for (const tag of sanitizeReflectionTags(tags, 50)) store.tags.set(tag, tag);
  }

  async listSessions(uid: string, limit: number, status: JournalSession["status"] = "active"): Promise<JournalSession[]> {
    return [...this.user(uid).sessions.values()]
      .filter((session) => session.status === status)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map((session) => structuredClone(session));
  }

  async getSession(uid: string, sessionId: string): Promise<JournalSession | null> {
    const session = this.user(uid).sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  async listSessionsCreatedSince(
    uid: string,
    sinceIso: string,
    limit: number,
  ): Promise<JournalSession[]> {
    return [...this.user(uid).sessions.values()]
      .filter((session) => session.status === "active" && session.createdAt >= sinceIso)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((session) => structuredClone(session));
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

  async getMessageExchange(
    uid: string,
    sessionId: string,
    requestId: string,
  ): Promise<PersistedMessageExchange | null> {
    const exchange = this.user(uid).exchanges.get(`${sessionId}:${requestId}`);
    return exchange ? structuredClone(exchange) : null;
  }

  async saveMessageExchange(
    uid: string,
    sessionId: string,
    input: SaveMessageExchangeInput,
  ): Promise<PersistedMessageExchange> {
    const store = this.user(uid);
    const exchangeKey = `${sessionId}:${input.requestId}`;
    const existing = store.exchanges.get(exchangeKey);
    if (existing) return structuredClone(existing);

    const session = store.sessions.get(sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "active") throw new Error("SESSION_ARCHIVED");
    if (session.messageCount + 2 > input.maxMessageCount) {
      throw new Error("SESSION_LIMIT_REACHED");
    }

    const createdAt = this.clock();
    const userMessage: JournalMessage = {
      id: randomUUID(),
      role: "user",
      content: input.userContent,
      ...(input.attachmentIds && input.attachmentIds.length > 0 ? { attachmentIds: [...input.attachmentIds] } : {}),
      createdAt,
    };
    const assistantMessage: JournalMessage = {
      id: randomUUID(),
      role: "model",
      content: input.assistantContent,
      createdAt,
    };
    store.messages.get(sessionId)?.push(userMessage, assistantMessage);
    session.messageCount += 2;
    const placeholderTitle = isPlaceholderReflectionTitle(session.title);
    if (input.title && placeholderTitle) session.title = input.title;
    if (input.tags && placeholderTitle) session.tags = [...input.tags];
    session.updatedAt = createdAt;

    const exchange: PersistedMessageExchange = {
      userMessage,
      assistantMessage,
      messageCount: session.messageCount,
    };
    store.exchanges.set(exchangeKey, exchange);
    return structuredClone(exchange);
  }

  async saveSummary(uid: string, input: SaveSummaryInput): Promise<PersonalMemory> {
    const store = this.user(uid);
    const session = store.sessions.get(input.sourceSessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "active") throw new Error("SESSION_ARCHIVED");
    const now = this.clock();
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

  async setSessionStatus(uid: string, sessionId: string, status: JournalSession["status"]): Promise<JournalSession | null> {
    const session = this.user(uid).sessions.get(sessionId);
    if (!session) return null;
    session.status = status;
    session.updatedAt = this.clock();
    return structuredClone(session);
  }

  async deleteSession(uid: string, sessionId: string): Promise<boolean> {
    const store = this.user(uid);
    const existed = store.sessions.delete(sessionId);
    store.messages.delete(sessionId);
    store.memories.delete(sessionId);
    for (const key of store.exchanges.keys()) {
      if (key.startsWith(`${sessionId}:`)) store.exchanges.delete(key);
    }
    return existed;
  }
}
