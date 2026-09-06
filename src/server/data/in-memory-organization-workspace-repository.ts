import { randomUUID } from "node:crypto";
import type {
  CaptureType,
  OrganizationMessage,
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
import type { InMemoryOrganizationRepository } from "./in-memory-organization-repository.js";
import { isPlaceholderReflectionTitle } from "../../shared/reflection-title.js";
import { sanitizeReflectionTags } from "../../shared/reflection-tags.js";

type WorkspaceStore = {
  sessions: Map<string, OrganizationSession>;
  messages: Map<string, OrganizationMessage[]>;
  exchanges: Map<string, OrganizationExchange>;
  summaries: Map<string, OrganizationSummary>;
  tags: Map<string, string>;
};

export class InMemoryOrganizationWorkspaceRepository
  implements OrganizationWorkspaceRepository
{
  private readonly workspaces = new Map<string, WorkspaceStore>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    /** Linked so writes recheck organization status and membership against current state. */
    private readonly organizations?: InMemoryOrganizationRepository,
  ) {}

  private workspace(orgId: string): WorkspaceStore {
    let store = this.workspaces.get(orgId);
    if (!store) {
      store = { sessions: new Map(), messages: new Map(), exchanges: new Map(), summaries: new Map(), tags: new Map() };
      this.workspaces.set(orgId, store);
    }
    return store;
  }

  // Mirrors the Firestore transaction's recheck: an unlinked repository fails closed rather than
  // silently skipping the authorization it cannot perform.
  private requireActor(orgId: string, actor: ActorConstraint): void {
    const state = this.organizations?.actorState(orgId, actor.uid);
    if (
      !state ||
      state.organizationStatus !== "active" ||
      !state.membership ||
      state.membership.status !== "active" ||
      !actor.allowedRoles.includes(state.membership.role)
    ) {
      throw new Error("ACTOR_NOT_AUTHORIZED");
    }
  }

  async createSession(
    orgId: string,
    actor: ActorConstraint,
    title: string,
    captureType: CaptureType = "reflection",
  ): Promise<OrganizationSession> {
    this.requireActor(orgId, actor);
    const timestamp = this.now().toISOString();
    const session: OrganizationSession = {
      id: randomUUID(),
      title,
      status: "active",
      messageCount: 0,
      summarizedMessageCount: 0,
      captureType,
      tags: [],
      createdBy: actor.uid,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.workspace(orgId).sessions.set(session.id, session);
    this.workspace(orgId).messages.set(session.id, []);
    return structuredClone(session);
  }

  async listSessions(orgId: string, limit: number, status: OrganizationSession["status"] = "active"): Promise<OrganizationSession[]> {
    return [...this.workspace(orgId).sessions.values()]
      .filter((session) => session.status === status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((session) => structuredClone(session));
  }

  async renameSession(
    orgId: string,
    sessionId: string,
    title: string,
    actor: ActorConstraint,
  ): Promise<OrganizationSession> {
    this.requireActor(orgId, actor);
    const session = this.workspace(orgId).sessions.get(sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "active") throw new Error("SESSION_ARCHIVED");
    session.title = title;
    session.updatedAt = this.now().toISOString();
    return structuredClone(session);
  }

  async setSessionTags(
    orgId: string,
    sessionId: string,
    tags: string[],
    actor: ActorConstraint,
  ): Promise<OrganizationSession> {
    this.requireActor(orgId, actor);
    const session = this.workspace(orgId).sessions.get(sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "active") throw new Error("SESSION_ARCHIVED");
    session.tags = [...tags];
    session.updatedAt = this.now().toISOString();
    return structuredClone(session);
  }

  async listTags(orgId: string, limit: number): Promise<string[]> {
    const store = this.workspace(orgId);
    const known = [
      ...store.tags.values(),
      ...[...store.sessions.values()].flatMap((session) => session.tags),
    ];
    return sanitizeReflectionTags(known, limit).sort((left, right) => left.localeCompare(right));
  }

  async registerTags(orgId: string, tags: string[], actor: ActorConstraint): Promise<void> {
    this.requireActor(orgId, actor);
    const store = this.workspace(orgId);
    for (const tag of sanitizeReflectionTags(tags, 50)) store.tags.set(tag, tag);
  }

  async getSession(orgId: string, sessionId: string): Promise<OrganizationSession | null> {
    const session = this.workspace(orgId).sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  async listMessages(
    orgId: string,
    sessionId: string,
    limit: number,
  ): Promise<OrganizationMessage[]> {
    return (this.workspace(orgId).messages.get(sessionId) ?? [])
      .slice(-limit)
      .map((message) => structuredClone(message));
  }

  async getMessageExchange(
    orgId: string,
    sessionId: string,
    requestId: string,
  ): Promise<OrganizationExchange | null> {
    const exchange = this.workspace(orgId).exchanges.get(`${sessionId}:${requestId}`);
    return exchange ? structuredClone(exchange) : null;
  }

  async saveMessageExchange(
    orgId: string,
    sessionId: string,
    input: SaveOrganizationExchangeInput,
    actor: ActorConstraint,
  ): Promise<OrganizationExchange> {
    this.requireActor(orgId, actor);
    const store = this.workspace(orgId);
    const session = store.sessions.get(sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "active") throw new Error("SESSION_ARCHIVED");
    if (session.messageCount + 2 > input.maxMessageCount) {
      throw new Error("SESSION_LIMIT_REACHED");
    }

    const timestamp = this.now().toISOString();
    const userMessage: OrganizationMessage = {
      id: randomUUID(),
      role: "user",
      content: input.userContent,
      ...(input.attachmentIds && input.attachmentIds.length > 0 ? { attachmentIds: [...input.attachmentIds] } : {}),
      authorUid: input.authorUid,
      createdAt: timestamp,
    };
    const assistantMessage: OrganizationMessage = {
      id: randomUUID(),
      role: "model",
      content: input.assistantContent,
      authorUid: null,
      createdAt: timestamp,
    };
    const messages = store.messages.get(sessionId) ?? [];
    messages.push(userMessage, assistantMessage);
    store.messages.set(sessionId, messages);
    session.messageCount = messages.length;
    const placeholderTitle = isPlaceholderReflectionTitle(session.title, true);
    if (input.title && placeholderTitle) session.title = input.title;
    if (input.tags && placeholderTitle) session.tags = [...input.tags];
    session.updatedAt = timestamp;

    const exchange: OrganizationExchange = {
      userMessage,
      assistantMessage,
      messageCount: messages.length,
    };
    store.exchanges.set(`${sessionId}:${input.requestId}`, exchange);
    return structuredClone(exchange);
  }

  async saveSummary(
    orgId: string,
    input: SaveOrganizationSummaryInput,
    actor: ActorConstraint,
  ): Promise<OrganizationSummary> {
    this.requireActor(orgId, actor);
    const store = this.workspace(orgId);
    const session = store.sessions.get(input.sourceSessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    if (session.status !== "active") throw new Error("SESSION_ARCHIVED");

    const timestamp = this.now().toISOString();
    const existing = store.summaries.get(input.sourceSessionId);
    const summary: OrganizationSummary = {
      id: `session_${input.sourceSessionId}`,
      title: input.title,
      summary: input.summary,
      themes: input.themes,
      nextSteps: input.nextSteps,
      sourceSessionId: input.sourceSessionId,
      createdBy: input.createdBy,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    store.summaries.set(input.sourceSessionId, summary);
    session.summarizedMessageCount = input.sourceMessageCount;
    return structuredClone(summary);
  }

  async getSummary(orgId: string, sessionId: string): Promise<OrganizationSummary | null> {
    const summary = this.workspace(orgId).summaries.get(sessionId);
    return summary ? structuredClone(summary) : null;
  }

  async setSessionStatus(
    orgId: string,
    sessionId: string,
    status: OrganizationSession["status"],
    actor: SessionActorConstraint,
  ): Promise<OrganizationSession | null> {
    const store = this.workspace(orgId);
    const session = store.sessions.get(sessionId);
    if (!session) return null;
    const allowedRoles = session.createdBy === actor.uid
      ? [...actor.allowedRoles, ...(actor.creatorRoles ?? [])]
      : actor.allowedRoles;
    this.requireActor(orgId, { uid: actor.uid, allowedRoles });
    session.status = status;
    session.updatedAt = this.now().toISOString();
    return structuredClone(session);
  }

  async deleteSession(
    orgId: string,
    sessionId: string,
    actor: SessionActorConstraint,
  ): Promise<boolean> {
    const store = this.workspace(orgId);
    const session = store.sessions.get(sessionId);
    if (!session) return false;
    const allowedRoles =
      session.createdBy === actor.uid
        ? [...actor.allowedRoles, ...(actor.creatorRoles ?? [])]
        : actor.allowedRoles;
    this.requireActor(orgId, { uid: actor.uid, allowedRoles });
    const existed = store.sessions.delete(sessionId);
    store.messages.delete(sessionId);
    store.summaries.delete(sessionId);
    for (const key of store.exchanges.keys()) {
      if (key.startsWith(`${sessionId}:`)) store.exchanges.delete(key);
    }
    return existed;
  }
}
