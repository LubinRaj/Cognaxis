import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import type {
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

type StoredSession = {
  title: string;
  status: "active" | "archived";
  messageCount: number;
  summarizedMessageCount: number;
  createdBy: string;
  scopeType: "personal";
  scopeId: string;
  schemaVersion: 1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type StoredMessage = {
  role: "user" | "model";
  content: string;
  sequence: number;
  createdBy: string;
  scopeType: "personal";
  scopeId: string;
  schemaVersion: 1;
  createdAt: Timestamp;
};

type StoredExchange = {
  userMessageId: string;
  assistantMessageId: string;
  createdBy: string;
  scopeType: "personal";
  scopeId: string;
  schemaVersion: 1;
  createdAt: Timestamp;
};

type StoredMemory = {
  title: string;
  summary: string;
  themes: string[];
  nextSteps: string[];
  sourceSessionId: string;
  sourceMessageIds: string[];
  sourceMessageCount: number;
  createdBy: string;
  scopeType: "personal";
  scopeId: string;
  schemaVersion: 1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return new Date(0).toISOString();
}

function toSession(id: string, data: StoredSession): JournalSession {
  return {
    id,
    title: data.title,
    status: data.status,
    messageCount: data.messageCount,
    summarizedMessageCount: data.summarizedMessageCount,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function toMessage(id: string, data: StoredMessage): JournalMessage {
  return {
    id,
    role: data.role,
    content: data.content,
    createdAt: timestampToIso(data.createdAt),
  };
}

function toMemory(id: string, data: StoredMemory): PersonalMemory {
  return {
    id,
    title: data.title,
    summary: data.summary,
    themes: data.themes,
    nextSteps: data.nextSteps,
    sourceSessionId: data.sourceSessionId,
    sourceMessageIds: data.sourceMessageIds,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export class FirestoreJournalRepository implements JournalRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  private sessionRef(uid: string, sessionId: string) {
    return this.firestore.doc(`users/${uid}/personalSessions/${sessionId}`);
  }

  private memoryRef(uid: string, sessionId: string) {
    return this.firestore.doc(`users/${uid}/personalMemories/session_${sessionId}`);
  }

  private exchangeRef(uid: string, sessionId: string, requestId: string) {
    return this.sessionRef(uid, sessionId).collection("exchanges").doc(requestId);
  }

  async createSession(uid: string, title: string): Promise<JournalSession> {
    const reference = this.firestore.collection(`users/${uid}/personalSessions`).doc();
    const now = Timestamp.now();
    const data: StoredSession = {
      title,
      status: "active",
      messageCount: 0,
      summarizedMessageCount: 0,
      createdBy: uid,
      scopeType: "personal",
      scopeId: uid,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    await reference.create(data);
    return toSession(reference.id, data);
  }

  async listSessions(uid: string, limit: number): Promise<JournalSession[]> {
    const snapshot = await this.firestore
      .collection(`users/${uid}/personalSessions`)
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((document) =>
      toSession(document.id, document.data() as StoredSession),
    );
  }

  async getSession(uid: string, sessionId: string): Promise<JournalSession | null> {
    const document = await this.sessionRef(uid, sessionId).get();
    if (!document.exists) return null;
    return toSession(document.id, document.data() as StoredSession);
  }

  async listMessages(
    uid: string,
    sessionId: string,
    limit: number,
  ): Promise<JournalMessage[]> {
    const snapshot = await this.sessionRef(uid, sessionId)
      .collection("messages")
      .orderBy("sequence", "desc")
      .limit(limit)
      .get();

    return snapshot.docs
      .map((document) => toMessage(document.id, document.data() as StoredMessage))
      .reverse();
  }

  async getMessageExchange(
    uid: string,
    sessionId: string,
    requestId: string,
  ): Promise<PersistedMessageExchange | null> {
    const session = this.sessionRef(uid, sessionId);
    const exchange = this.exchangeRef(uid, sessionId, requestId);
    const [sessionSnapshot, exchangeSnapshot] = await Promise.all([
      session.get(),
      exchange.get(),
    ]);
    if (!sessionSnapshot.exists || !exchangeSnapshot.exists) return null;

    const stored = exchangeSnapshot.data() as StoredExchange;
    const [userSnapshot, assistantSnapshot] = await this.firestore.getAll(
      session.collection("messages").doc(stored.userMessageId),
      session.collection("messages").doc(stored.assistantMessageId),
    );
    if (!userSnapshot.exists || !assistantSnapshot.exists) {
      throw new Error("INCOMPLETE_MESSAGE_EXCHANGE");
    }

    return {
      userMessage: toMessage(userSnapshot.id, userSnapshot.data() as StoredMessage),
      assistantMessage: toMessage(
        assistantSnapshot.id,
        assistantSnapshot.data() as StoredMessage,
      ),
      messageCount: (sessionSnapshot.data() as StoredSession).messageCount,
    };
  }

  async saveMessageExchange(
    uid: string,
    sessionId: string,
    input: SaveMessageExchangeInput,
  ): Promise<PersistedMessageExchange> {
    const session = this.sessionRef(uid, sessionId);
    const exchange = this.exchangeRef(uid, sessionId, input.requestId);
    const userReference = session.collection("messages").doc();
    const assistantReference = session.collection("messages").doc();
    const now = Timestamp.now();
    let persisted: PersistedMessageExchange | null = null;

    const created = await this.firestore.runTransaction(async (transaction) => {
      const [sessionSnapshot, exchangeSnapshot] = await Promise.all([
        transaction.get(session),
        transaction.get(exchange),
      ]);
      if (!sessionSnapshot.exists) throw new Error("SESSION_NOT_FOUND");
      if (exchangeSnapshot.exists) return false;

      const storedSession = sessionSnapshot.data() as StoredSession;
      if (storedSession.messageCount + 2 > input.maxMessageCount) {
        throw new Error("SESSION_LIMIT_REACHED");
      }

      const userData: StoredMessage = {
        role: "user",
        content: input.userContent,
        sequence: storedSession.messageCount + 1,
        createdBy: uid,
        scopeType: "personal",
        scopeId: uid,
        schemaVersion: 1,
        createdAt: now,
      };
      const assistantData: StoredMessage = {
        role: "model",
        content: input.assistantContent,
        sequence: storedSession.messageCount + 2,
        createdBy: uid,
        scopeType: "personal",
        scopeId: uid,
        schemaVersion: 1,
        createdAt: now,
      };
      const exchangeData: StoredExchange = {
        userMessageId: userReference.id,
        assistantMessageId: assistantReference.id,
        createdBy: uid,
        scopeType: "personal",
        scopeId: uid,
        schemaVersion: 1,
        createdAt: now,
      };

      transaction.create(userReference, userData);
      transaction.create(assistantReference, assistantData);
      transaction.create(exchange, exchangeData);
      transaction.update(session, {
        messageCount: storedSession.messageCount + 2,
        updatedAt: now,
      });

      persisted = {
        userMessage: toMessage(userReference.id, userData),
        assistantMessage: toMessage(assistantReference.id, assistantData),
        messageCount: storedSession.messageCount + 2,
      };
      return true;
    });

    if (!created) {
      const existing = await this.getMessageExchange(uid, sessionId, input.requestId);
      if (!existing) throw new Error("INCOMPLETE_MESSAGE_EXCHANGE");
      return existing;
    }
    if (!persisted) throw new Error("INCOMPLETE_MESSAGE_EXCHANGE");
    return persisted;
  }

  async saveSummary(uid: string, input: SaveSummaryInput): Promise<PersonalMemory> {
    const reference = this.memoryRef(uid, input.sourceSessionId);
    const session = this.sessionRef(uid, input.sourceSessionId);
    const now = Timestamp.now();
    const existing = await reference.get();
    const createdAt = existing.exists
      ? ((existing.data() as StoredMemory).createdAt ?? now)
      : now;
    const data: StoredMemory = {
      ...input,
      createdBy: uid,
      scopeType: "personal",
      scopeId: uid,
      schemaVersion: 1,
      createdAt,
      updatedAt: now,
    };

    await this.firestore.runTransaction(async (transaction) => {
      const sessionSnapshot = await transaction.get(session);
      if (!sessionSnapshot.exists) throw new Error("SESSION_NOT_FOUND");
      transaction.set(reference, data);
      transaction.update(session, {
        summarizedMessageCount: input.sourceMessageCount,
        updatedAt: now,
      });
    });

    return toMemory(reference.id, data);
  }

  async getSummary(uid: string, sessionId: string): Promise<PersonalMemory | null> {
    const document = await this.memoryRef(uid, sessionId).get();
    if (!document.exists) return null;
    return toMemory(document.id, document.data() as StoredMemory);
  }

  async deleteSession(uid: string, sessionId: string): Promise<boolean> {
    const session = this.sessionRef(uid, sessionId);
    const sessionSnapshot = await session.get();
    if (!sessionSnapshot.exists) return false;

    const [messages, exchanges] = await Promise.all([
      session.collection("messages").limit(200).get(),
      session.collection("exchanges").limit(100).get(),
    ]);
    const batch = this.firestore.batch();
    messages.docs.forEach((message) => batch.delete(message.ref));
    exchanges.docs.forEach((exchange) => batch.delete(exchange.ref));
    batch.delete(this.memoryRef(uid, sessionId));
    batch.delete(session);
    await batch.commit();
    return true;
  }
}
