import {
  Timestamp,
  getFirestore,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type {
  CaptureType,
  OrganizationMessage,
  OrganizationRole,
  OrganizationSession,
  OrganizationSummary,
} from "../../shared/schemas.js";
import type {
  ActorConstraint,
  OrganizationExchange,
  OrganizationWorkspaceRepository,
  SaveOrganizationExchangeInput,
  SaveOrganizationSummaryInput,
  SessionActorConstraint,
} from "./organization-repository.js";
import { isPlaceholderReflectionTitle } from "../../shared/reflection-title.js";
import { reflectionTagKey, sanitizeReflectionTags } from "../../shared/reflection-tags.js";

type StoredSession = {
  title: string;
  status: "active" | "archived";
  messageCount: number;
  summarizedMessageCount: number;
  captureType?: CaptureType;
  tags?: string[];
  createdBy: string;
  scopeType: "organization";
  scopeId: string;
  schemaVersion: 1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type StoredMessage = {
  role: "user" | "model";
  content: string;
  attachmentIds?: string[];
  sequence: number;
  authorUid: string | null;
  createdBy: string;
  scopeType: "organization";
  scopeId: string;
  schemaVersion: 1;
  createdAt: Timestamp;
};

type StoredExchange = {
  userMessageId: string;
  assistantMessageId: string;
  createdBy: string;
  scopeType: "organization";
  scopeId: string;
  schemaVersion: 1;
  createdAt: Timestamp;
};

type StoredSummary = {
  title: string;
  summary: string;
  themes: string[];
  nextSteps: string[];
  sourceSessionId: string;
  sourceMessageCount: number;
  createdBy: string;
  scopeType: "organization";
  scopeId: string;
  schemaVersion: 1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type StoredTag = {
  value: string;
  schemaVersion: 1;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

function iso(value: Timestamp): string {
  return value.toDate().toISOString();
}

function toSession(id: string, stored: StoredSession): OrganizationSession {
  return {
    id,
    title: stored.title,
    // Older shared reflections have no status field and remain active by default.
    status: stored.status ?? "active",
    messageCount: stored.messageCount,
    summarizedMessageCount: stored.summarizedMessageCount,
    captureType: stored.captureType ?? "reflection",
    tags: Array.isArray(stored.tags) ? [...stored.tags] : [],
    createdBy: stored.createdBy,
    createdAt: iso(stored.createdAt),
    updatedAt: iso(stored.updatedAt),
  };
}

function toMessage(id: string, stored: StoredMessage): OrganizationMessage {
  return {
    id,
    role: stored.role,
    content: stored.content,
    ...(stored.attachmentIds && stored.attachmentIds.length > 0 ? { attachmentIds: [...stored.attachmentIds] } : {}),
    authorUid: stored.authorUid,
    createdAt: iso(stored.createdAt),
  };
}

function toSummary(stored: StoredSummary): OrganizationSummary {
  return {
    id: `session_${stored.sourceSessionId}`,
    title: stored.title,
    summary: stored.summary,
    themes: stored.themes,
    nextSteps: stored.nextSteps,
    sourceSessionId: stored.sourceSessionId,
    createdBy: stored.createdBy,
    createdAt: iso(stored.createdAt),
    updatedAt: iso(stored.updatedAt),
  };
}

// Every path is rooted at one organization's document, so no query can cross tenants.
export class FirestoreOrganizationWorkspaceRepository
  implements OrganizationWorkspaceRepository
{
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  private sessionRef(orgId: string, sessionId: string): DocumentReference {
    return this.firestore.doc(`organizations/${orgId}/workspaceSessions/${sessionId}`);
  }

  private summaryRef(orgId: string, sessionId: string): DocumentReference {
    return this.firestore.doc(`organizations/${orgId}/workspaceSummaries/session_${sessionId}`);
  }

  private tagRef(orgId: string, tag: string): DocumentReference {
    return this.firestore.doc(`organizations/${orgId}/reflectionTags/${reflectionTagKey(tag)}`);
  }

  // Re-reads organization status and the actor's membership inside the transaction that persists
  // the write, so an authorization revoked while a model call was in flight always wins.
  private async requireActiveRole(
    transaction: Transaction,
    orgId: string,
    uid: string,
  ): Promise<OrganizationRole> {
    const [orgSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(this.firestore.doc(`organizations/${orgId}`)),
      transaction.get(this.firestore.doc(`organizations/${orgId}/members/${uid}`)),
    ]);
    if (!orgSnapshot.exists || !memberSnapshot.exists) throw new Error("ACTOR_NOT_AUTHORIZED");
    const organization = orgSnapshot.data() as { status?: string };
    const membership = memberSnapshot.data() as { status?: string; role?: OrganizationRole };
    if (
      organization.status !== "active" ||
      membership.status !== "active" ||
      membership.role === undefined
    ) {
      throw new Error("ACTOR_NOT_AUTHORIZED");
    }
    return membership.role;
  }

  private async requireActor(
    transaction: Transaction,
    orgId: string,
    actor: ActorConstraint,
  ): Promise<void> {
    const role = await this.requireActiveRole(transaction, orgId, actor.uid);
    if (!actor.allowedRoles.includes(role)) throw new Error("ACTOR_NOT_AUTHORIZED");
  }

  async createSession(
    orgId: string,
    actor: ActorConstraint,
    title: string,
    captureType: CaptureType = "reflection",
  ): Promise<OrganizationSession> {
    const reference = this.firestore
      .collection(`organizations/${orgId}/workspaceSessions`)
      .doc();
    const now = Timestamp.now();
    const data: StoredSession = {
      title,
      status: "active",
      messageCount: 0,
      summarizedMessageCount: 0,
      captureType,
      tags: [],
      createdBy: actor.uid,
      scopeType: "organization",
      scopeId: orgId,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.firestore.runTransaction(async (transaction) => {
      await this.requireActor(transaction, orgId, actor);
      transaction.create(reference, data);
    });
    return toSession(reference.id, data);
  }

  async listSessions(orgId: string, limit: number, status: OrganizationSession["status"] = "active"): Promise<OrganizationSession[]> {
    const snapshot = await this.firestore
      .collection(`organizations/${orgId}/workspaceSessions`)
      .orderBy("updatedAt", "desc")
      .get();
    return snapshot.docs
      .map((document) => toSession(document.id, document.data() as StoredSession))
      .filter((session) => session.status === status)
      .slice(0, limit);
  }

  async renameSession(
    orgId: string,
    sessionId: string,
    title: string,
    actor: ActorConstraint,
  ): Promise<OrganizationSession> {
    const reference = this.sessionRef(orgId, sessionId);
    const now = Timestamp.now();
    let updated: OrganizationSession | null = null;
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new Error("SESSION_NOT_FOUND");
      await this.requireActor(transaction, orgId, actor);
      const stored = snapshot.data() as StoredSession;
      if ((stored.status ?? "active") !== "active") throw new Error("SESSION_ARCHIVED");
      transaction.update(reference, { title, updatedAt: now });
      updated = toSession(sessionId, { ...stored, title, updatedAt: now });
    });
    if (!updated) throw new Error("SESSION_NOT_FOUND");
    return updated;
  }

  async setSessionTags(
    orgId: string,
    sessionId: string,
    tags: string[],
    actor: ActorConstraint,
  ): Promise<OrganizationSession> {
    const reference = this.sessionRef(orgId, sessionId);
    const now = Timestamp.now();
    let updated: OrganizationSession | null = null;
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new Error("SESSION_NOT_FOUND");
      await this.requireActor(transaction, orgId, actor);
      const stored = snapshot.data() as StoredSession;
      if ((stored.status ?? "active") !== "active") throw new Error("SESSION_ARCHIVED");
      transaction.update(reference, { tags: [...tags], updatedAt: now });
      updated = toSession(sessionId, { ...stored, tags: [...tags], updatedAt: now });
    });
    if (!updated) throw new Error("SESSION_NOT_FOUND");
    return updated;
  }

  async listTags(orgId: string, limit: number): Promise<string[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const [catalog, sessions] = await Promise.all([
      this.firestore.collection(`organizations/${orgId}/reflectionTags`).orderBy("value", "asc").limit(safeLimit).get(),
      this.firestore.collection(`organizations/${orgId}/workspaceSessions`).orderBy("updatedAt", "desc").limit(200).get(),
    ]);
    return sanitizeReflectionTags([
      ...catalog.docs.map((document) => (document.data() as StoredTag).value),
      ...sessions.docs.flatMap((document) => (document.data() as StoredSession).tags ?? []),
    ], safeLimit).sort((left, right) => left.localeCompare(right));
  }

  async registerTags(orgId: string, tags: string[], actor: ActorConstraint): Promise<void> {
    const values = sanitizeReflectionTags(tags, 50);
    if (values.length === 0) return;
    const now = Timestamp.now();
    await this.firestore.runTransaction(async (transaction) => {
      await this.requireActor(transaction, orgId, actor);
      const references = values.map((tag) => this.tagRef(orgId, tag));
      const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
      for (let index = 0; index < references.length; index += 1) {
        if (snapshots[index]?.exists) {
          transaction.update(references[index], { updatedAt: now });
        } else {
          const data: StoredTag = { value: values[index], schemaVersion: 1, createdAt: now, updatedAt: now };
          transaction.create(references[index], data);
        }
      }
    });
  }

  async getSession(orgId: string, sessionId: string): Promise<OrganizationSession | null> {
    const snapshot = await this.sessionRef(orgId, sessionId).get();
    if (!snapshot.exists) return null;
    return toSession(snapshot.id, snapshot.data() as StoredSession);
  }

  async listMessages(
    orgId: string,
    sessionId: string,
    limit: number,
  ): Promise<OrganizationMessage[]> {
    const snapshot = await this.sessionRef(orgId, sessionId)
      .collection("messages")
      .orderBy("sequence", "desc")
      .limit(limit)
      .get();
    return snapshot.docs
      .map((document) => toMessage(document.id, document.data() as StoredMessage))
      .reverse();
  }

  async getMessageExchange(
    orgId: string,
    sessionId: string,
    requestId: string,
  ): Promise<OrganizationExchange | null> {
    const session = this.sessionRef(orgId, sessionId);
    const exchange = session.collection("exchanges").doc(requestId);
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
    orgId: string,
    sessionId: string,
    input: SaveOrganizationExchangeInput,
    actor: ActorConstraint,
  ): Promise<OrganizationExchange> {
    const session = this.sessionRef(orgId, sessionId);
    const exchange = session.collection("exchanges").doc(input.requestId);
    const userReference = session.collection("messages").doc();
    const assistantReference = session.collection("messages").doc();
    const now = Timestamp.now();
    let persisted: OrganizationExchange | null = null;

    const created = await this.firestore.runTransaction(async (transaction) => {
      const [sessionSnapshot, exchangeSnapshot] = await Promise.all([
        transaction.get(session),
        transaction.get(exchange),
        this.requireActor(transaction, orgId, actor),
      ]);
      if (!sessionSnapshot.exists) throw new Error("SESSION_NOT_FOUND");
      if (exchangeSnapshot.exists) return false;

      const storedSession = sessionSnapshot.data() as StoredSession;
      if ((storedSession.status ?? "active") !== "active") throw new Error("SESSION_ARCHIVED");
      if (storedSession.messageCount + 2 > input.maxMessageCount) {
        throw new Error("SESSION_LIMIT_REACHED");
      }

      const userData: StoredMessage = {
        role: "user",
        content: input.userContent,
        ...(input.attachmentIds && input.attachmentIds.length > 0 ? { attachmentIds: [...input.attachmentIds] } : {}),
        sequence: storedSession.messageCount + 1,
        authorUid: input.authorUid,
        createdBy: input.authorUid,
        scopeType: "organization",
        scopeId: orgId,
        schemaVersion: 1,
        createdAt: now,
      };
      const assistantData: StoredMessage = {
        role: "model",
        content: input.assistantContent,
        sequence: storedSession.messageCount + 2,
        authorUid: null,
        createdBy: input.authorUid,
        scopeType: "organization",
        scopeId: orgId,
        schemaVersion: 1,
        createdAt: now,
      };
      transaction.create(userReference, userData);
      transaction.create(assistantReference, assistantData);
      transaction.create(exchange, {
        userMessageId: userReference.id,
        assistantMessageId: assistantReference.id,
        createdBy: input.authorUid,
        scopeType: "organization",
        scopeId: orgId,
        schemaVersion: 1,
        createdAt: now,
      } satisfies StoredExchange);
      transaction.update(session, {
        messageCount: storedSession.messageCount + 2,
        ...(input.title && isPlaceholderReflectionTitle(storedSession.title, true) ? { title: input.title } : {}),
        ...(input.tags && isPlaceholderReflectionTitle(storedSession.title, true) ? { tags: [...input.tags] } : {}),
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
      const existing = await this.getMessageExchange(orgId, sessionId, input.requestId);
      if (!existing) throw new Error("INCOMPLETE_MESSAGE_EXCHANGE");
      return existing;
    }
    if (!persisted) throw new Error("INCOMPLETE_MESSAGE_EXCHANGE");
    return persisted;
  }

  async saveSummary(
    orgId: string,
    input: SaveOrganizationSummaryInput,
    actor: ActorConstraint,
  ): Promise<OrganizationSummary> {
    const reference = this.summaryRef(orgId, input.sourceSessionId);
    const session = this.sessionRef(orgId, input.sourceSessionId);
    const now = Timestamp.now();
    const existing = await reference.get();
    const data: StoredSummary = {
      title: input.title,
      summary: input.summary,
      themes: input.themes,
      nextSteps: input.nextSteps,
      sourceSessionId: input.sourceSessionId,
      sourceMessageCount: input.sourceMessageCount,
      createdBy: input.createdBy,
      scopeType: "organization",
      scopeId: orgId,
      schemaVersion: 1,
      createdAt: existing.exists ? (existing.data() as StoredSummary).createdAt : now,
      updatedAt: now,
    };

    await this.firestore.runTransaction(async (transaction) => {
      const [sessionSnapshot] = await Promise.all([
        transaction.get(session),
        this.requireActor(transaction, orgId, actor),
      ]);
      if (!sessionSnapshot.exists) throw new Error("SESSION_NOT_FOUND");
      const storedSession = sessionSnapshot.data() as StoredSession;
      if ((storedSession.status ?? "active") !== "active") throw new Error("SESSION_ARCHIVED");
      transaction.set(reference, data);
      transaction.update(session, {
        summarizedMessageCount: input.sourceMessageCount,
        updatedAt: now,
      });
    });

    return toSummary(data);
  }

  async getSummary(orgId: string, sessionId: string): Promise<OrganizationSummary | null> {
    const snapshot = await this.summaryRef(orgId, sessionId).get();
    if (!snapshot.exists) return null;
    return toSummary(snapshot.data() as StoredSummary);
  }

  async setSessionStatus(
    orgId: string,
    sessionId: string,
    status: OrganizationSession["status"],
    actor: SessionActorConstraint,
  ): Promise<OrganizationSession | null> {
    const reference = this.sessionRef(orgId, sessionId);
    const now = Timestamp.now();
    let updated: OrganizationSession | null = null;
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return;
      const data = snapshot.data() as StoredSession;
      await this.requireActor(transaction, orgId, actor);
      transaction.update(reference, { status, updatedAt: now });
      updated = toSession(sessionId, { ...data, status, updatedAt: now });
    });
    return updated;
  }

  async deleteSession(
    orgId: string,
    sessionId: string,
    actor: SessionActorConstraint,
  ): Promise<boolean> {
    const session = this.sessionRef(orgId, sessionId);

    return this.firestore.runTransaction(async (transaction) => {
      const [snapshot, role] = await Promise.all([
        transaction.get(session),
        this.requireActiveRole(transaction, orgId, actor.uid),
      ]);
      if (!snapshot.exists) return false;

      const stored = snapshot.data() as StoredSession;
      const allowedRoles =
        stored.createdBy === actor.uid
          ? [...actor.allowedRoles, ...(actor.creatorRoles ?? [])]
          : actor.allowedRoles;
      if (!allowedRoles.includes(role)) throw new Error("ACTOR_NOT_AUTHORIZED");

      const [messages, exchanges] = await Promise.all([
        transaction.get(session.collection("messages").limit(200)),
        transaction.get(session.collection("exchanges").limit(100)),
      ]);
      messages.docs.forEach((message) => transaction.delete(message.ref));
      exchanges.docs.forEach((exchange) => transaction.delete(exchange.ref));
      transaction.delete(this.summaryRef(orgId, sessionId));
      transaction.delete(session);
      return true;
    });
  }
}
