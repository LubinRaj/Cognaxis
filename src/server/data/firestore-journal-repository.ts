import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
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
  private readonly firestore = getFirestore();

  private sessionRef(uid: string, sessionId: string) {
    return this.firestore.doc(`users/${uid}/personalSessions/${sessionId}`);
  }

  private memoryRef(uid: string, sessionId: string) {
    return this.firestore.doc(`users/${uid}/personalMemories/session_${sessionId}`);
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
      .orderBy("createdAt", "asc")
      .limit(limit)
      .get();

    return snapshot.docs.map((document) =>
      toMessage(document.id, document.data() as StoredMessage),
    );
  }

  async appendMessage(
    uid: string,
    sessionId: string,
    message: AppendMessageInput,
  ): Promise<JournalMessage> {
    const session = this.sessionRef(uid, sessionId);
    const reference = session.collection("messages").doc();
    const now = Timestamp.now();
    const data: StoredMessage = {
      ...message,
      createdBy: uid,
      scopeType: "personal",
      scopeId: uid,
      schemaVersion: 1,
      createdAt: now,
    };

    await this.firestore.runTransaction(async (transaction) => {
      const sessionSnapshot = await transaction.get(session);
      if (!sessionSnapshot.exists) throw new Error("SESSION_NOT_FOUND");
      transaction.create(reference, data);
      transaction.update(session, {
        messageCount: FieldValue.increment(1),
        updatedAt: now,
      });
    });

    return toMessage(reference.id, data);
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

    const messages = await session.collection("messages").limit(400).get();
    const batch = this.firestore.batch();
    messages.docs.forEach((message) => batch.delete(message.ref));
    batch.delete(this.memoryRef(uid, sessionId));
    batch.delete(session);
    await batch.commit();
    return true;
  }
}
