import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  AuditEvent,
  CreateOrganizationInput,
  CreatedInvite,
  InvitePreview,
  JournalMessage,
  Organization,
  OrganizationDetail,
  OrganizationInvite,
  OrganizationMemberView,
  OrganizationMembership,
  OrganizationPermissions,
  OrganizationRole,
  OrganizationSession,
  OrganizationSessionDetail,
  OrganizationSummary,
  UpdateMemberInput,
  UserOrganizationEdge,
} from "../../shared/schemas.js";
import {
  canChangeMemberRole,
  canChangeMemberStatus,
  canDeleteSession,
  canInviteRole,
  canPerform,
  canRemoveMember,
  rolesAllowed,
  type OrganizationAction,
} from "../authorization/organization-roles.js";
import type {
  ActorConstraint,
  OrganizationExchange,
  OrganizationRepository,
  OrganizationWorkspaceRepository,
} from "../data/organization-repository.js";
import type { PlatformUserRepository } from "../data/platform-user-repository.js";
import { AppError, forbidden, notFound } from "../errors.js";
import type { ConversationModel } from "./conversation-model.js";
import type { UsageRecorder } from "./usage-recorder.js";

const MAX_STORED_MESSAGES = 120;
const MODEL_CONTEXT_MESSAGES = 24;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MEMBER_PAGE_LIMIT = 50;

function permissionsFor(role: OrganizationRole): OrganizationPermissions {
  return {
    canWrite: canPerform(role, "sendMessage"),
    canManageMembers: canPerform(role, "manageMembers"),
    canViewInvites: canPerform(role, "viewInvites"),
    canInviteAdmin: role === "owner",
    canUpdateSettings: canPerform(role, "updateSettings"),
    canViewAudit: canPerform(role, "viewAudit"),
  };
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

const invalidInvite = () =>
  new AppError(404, "INVITE_INVALID", "This invitation is not valid. Ask for a new link.");

type OrganizationContext = {
  organization: Organization;
  membership: OrganizationMembership;
};

export class OrganizationService {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly workspace: OrganizationWorkspaceRepository,
    private readonly platformUsers: PlatformUserRepository,
    private readonly model: ConversationModel,
    private readonly now: () => Date = () => new Date(),
    private readonly usage?: UsageRecorder,
  ) {}

  // Organization existence is confirmed only after active membership, so a guessed foreign
  // organization id is indistinguishable from one that does not exist.
  private async requireContext(
    uid: string,
    orgId: string,
    action?: OrganizationAction,
  ): Promise<OrganizationContext> {
    const organization = await this.organizations.getOrganization(orgId);
    const membership = organization
      ? await this.organizations.getMembership(orgId, uid)
      : null;
    if (!organization || !membership || membership.status !== "active") {
      throw notFound();
    }
    if (organization.status !== "active") {
      throw new AppError(
        403,
        "ORGANIZATION_SUSPENDED",
        "This organization is currently suspended.",
      );
    }
    if (action && !canPerform(membership.role, action)) {
      throw forbidden();
    }
    return { organization, membership };
  }

  private actor(uid: string, allowedRoles: readonly OrganizationRole[]): ActorConstraint {
    return { uid, allowedRoles };
  }

  private async guarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error && error.message === "ACTOR_NOT_AUTHORIZED") {
        throw forbidden();
      }
      if (error instanceof Error && error.message === "TARGET_NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  }

  async create(
    uid: string,
    input: CreateOrganizationInput,
    requestId: string,
  ): Promise<OrganizationDetail> {
    const organization = await this.organizations.createWithOwner({
      name: input.name,
      description: input.description ?? null,
      ownerUid: uid,
      requestId,
    });
    return { organization, role: "owner", permissions: permissionsFor("owner") };
  }

  async listMine(uid: string): Promise<UserOrganizationEdge[]> {
    return this.organizations.listUserEdges(uid);
  }

  async get(uid: string, orgId: string): Promise<OrganizationDetail> {
    const { organization, membership } = await this.requireContext(uid, orgId, "view");
    return {
      organization,
      role: membership.role,
      permissions: permissionsFor(membership.role),
    };
  }

  async updateSettings(
    uid: string,
    orgId: string,
    changes: { name?: string; description?: string | null },
    requestId: string,
  ): Promise<Organization> {
    const { organization } = await this.requireContext(uid, orgId, "updateSettings");
    const auditChanges: AuditEvent["changes"] = [];
    if (changes.name !== undefined && changes.name !== organization.name) {
      auditChanges.push({ field: "name", from: organization.name, to: changes.name });
    }
    if (changes.description !== undefined) {
      auditChanges.push({ field: "description", from: null, to: null });
    }
    return this.guarded(() =>
      this.organizations.updateOrganization(orgId, changes, this.actor(uid, ["owner", "admin"]), {
        eventType: "organization.updated",
        targetType: "organization",
        targetId: orgId,
        changes: auditChanges,
        requestId,
      }),
    );
  }

  async listMembers(uid: string, orgId: string): Promise<OrganizationMemberView[]> {
    await this.requireContext(uid, orgId, "view");
    const members = await this.organizations.listMembers(orgId, MEMBER_PAGE_LIMIT);

    const views: OrganizationMemberView[] = [];
    for (const member of members) {
      // Only the safe identity projection joins the member list; platform role, status, and
      // activity metadata stay out of organization surfaces.
      const identity = await this.platformUsers.get(member.uid);
      views.push({
        uid: member.uid,
        displayName: identity?.displayName ?? null,
        email: identity?.email ?? null,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
      });
    }
    return views;
  }

  async updateMember(
    uid: string,
    orgId: string,
    targetUid: string,
    input: UpdateMemberInput,
    requestId: string,
  ): Promise<OrganizationMemberView> {
    const { membership } = await this.requireContext(uid, orgId, "manageMembers");
    const target = await this.organizations.getMembership(orgId, targetUid);
    if (!target) throw notFound();
    const isSelf = targetUid === uid;

    // Fast pre-checks give precise errors; the same decisions are re-derived inside the write
    // transaction from the memberships as they exist at commit time.
    const preflight: AuditEvent["changes"] = [];
    if (input.role !== undefined && input.role !== target.role) {
      if (!canChangeMemberRole(membership.role, target.role, input.role, isSelf)) {
        throw forbidden();
      }
      preflight.push({ field: "role", from: target.role, to: input.role });
    }
    if (input.status !== undefined && input.status !== target.status) {
      if (!canChangeMemberStatus(membership.role, target.role, isSelf)) {
        throw forbidden();
      }
      preflight.push({ field: "status", from: target.status, to: input.status });
    }
    if (preflight.length === 0) {
      throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
    }

    const updated = await this.guarded(() =>
      this.organizations.updateMembership(
        orgId,
        targetUid,
        uid,
        (actor, current) => {
          if (!canPerform(actor.role, "manageMembers")) return null;
          const changes: { role?: OrganizationRole; status?: "active" | "suspended" } = {};
          const auditChanges: AuditEvent["changes"] = [];
          if (input.role !== undefined && input.role !== current.role) {
            if (!canChangeMemberRole(actor.role, current.role, input.role, isSelf)) return null;
            changes.role = input.role;
            auditChanges.push({ field: "role", from: current.role, to: input.role });
          }
          if (input.status !== undefined && input.status !== current.status) {
            if (!canChangeMemberStatus(actor.role, current.role, isSelf)) return null;
            changes.status = input.status;
            auditChanges.push({ field: "status", from: current.status, to: input.status });
          }
          return { changes, auditChanges };
        },
        {
          eventType: "membership.updated",
          targetType: "membership",
          targetId: targetUid,
          requestId,
        },
      ),
    );

    const identity = await this.platformUsers.get(targetUid);
    return {
      uid: targetUid,
      displayName: identity?.displayName ?? null,
      email: identity?.email ?? null,
      role: updated.role,
      status: updated.status,
      joinedAt: updated.joinedAt,
    };
  }

  async removeMember(
    uid: string,
    orgId: string,
    targetUid: string,
    requestId: string,
  ): Promise<void> {
    const { membership } = await this.requireContext(uid, orgId, "manageMembers");
    const target = await this.organizations.getMembership(orgId, targetUid);
    if (!target) throw notFound();
    if (!canRemoveMember(membership.role, target.role, targetUid === uid)) {
      throw forbidden();
    }

    await this.guarded(() =>
      this.organizations.removeMembership(
        orgId,
        targetUid,
        uid,
        (actor, current) =>
          canPerform(actor.role, "manageMembers") &&
          canRemoveMember(actor.role, current.role, targetUid === uid)
            ? [{ field: "status", from: current.status, to: null }]
            : null,
        {
          eventType: "membership.removed",
          targetType: "membership",
          targetId: targetUid,
          requestId,
        },
      ),
    );
  }

  async createInvite(
    uid: string,
    orgId: string,
    role: "admin" | "member" | "viewer",
    requestId: string,
  ): Promise<CreatedInvite> {
    const { membership } = await this.requireContext(uid, orgId, "createInvite");
    if (!canInviteRole(membership.role, role)) throw forbidden();

    // The raw secret exists only in this response; only its hash is ever stored.
    const secret = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + INVITE_TTL_MS).toISOString();

    const { inviteId } = await this.guarded(() =>
      this.organizations.createInvite(
        orgId,
        { tokenHash: hashSecret(secret), role, expiresAt, createdBy: uid },
        this.actor(uid, role === "admin" ? ["owner"] : ["owner", "admin"]),
        {
          eventType: "invite.created",
          targetType: "invite",
          targetId: "pending",
          changes: [{ field: "role", from: null, to: role }],
          requestId,
        },
      ),
    );

    return { inviteId, secret, role, expiresAt };
  }

  async listInvites(
    uid: string,
    orgId: string,
  ): Promise<Array<Omit<OrganizationInvite, "tokenHash">>> {
    await this.requireContext(uid, orgId, "viewInvites");
    const invites = await this.organizations.listInvites(orgId, 30);
    return invites.map(({ tokenHash: _tokenHash, ...safe }) => safe);
  }

  async revokeInvite(
    uid: string,
    orgId: string,
    inviteId: string,
    requestId: string,
  ): Promise<void> {
    await this.requireContext(uid, orgId, "revokeInvite");
    const revoked = await this.guarded(() =>
      this.organizations.revokeInvite(orgId, inviteId, this.actor(uid, ["owner", "admin"]), {
        eventType: "invite.revoked",
        targetType: "invite",
        targetId: inviteId,
        changes: [{ field: "status", from: "pending", to: "revoked" }],
        requestId,
      }),
    );
    if (!revoked) throw notFound();
  }

  // The preview lets a signed-in recipient see what they were offered before accepting. Every
  // failure collapses into one safe invalid state so nothing about other tenants leaks.
  async previewInvite(orgId: string, inviteId: string, secret: string): Promise<InvitePreview> {
    const organization = await this.organizations.getOrganization(orgId);
    const invite = organization ? await this.organizations.getInvite(orgId, inviteId) : null;
    if (
      !organization ||
      organization.status !== "active" ||
      !invite ||
      invite.status !== "pending" ||
      invite.expiresAt <= this.now().toISOString() ||
      !hashesMatch(invite.tokenHash, hashSecret(secret))
    ) {
      throw invalidInvite();
    }
    return { organizationName: organization.name, role: invite.role, expiresAt: invite.expiresAt };
  }

  async acceptInvite(
    uid: string,
    orgId: string,
    inviteId: string,
    secret: string,
    requestId: string,
  ): Promise<{ orgId: string; organizationName: string; role: OrganizationRole }> {
    const result = await this.organizations.acceptInvite({
      orgId,
      inviteId,
      uid,
      tokenHash: hashSecret(secret),
      nowIso: this.now().toISOString(),
      requestId,
    });
    if (result.status === "invalid") throw invalidInvite();
    if (result.status === "full") {
      throw new AppError(
        409,
        "ORGANIZATION_FULL",
        "This organization has reached its member limit.",
      );
    }
    if (result.status === "accepted") {
      await this.usage?.record("organizationInvitesAccepted");
    }
    return { orgId, organizationName: result.organizationName, role: result.role };
  }

  async listAudit(uid: string, orgId: string): Promise<AuditEvent[]> {
    await this.requireContext(uid, orgId, "viewAudit");
    return this.organizations.listAuditEvents(orgId, 50);
  }

  async listSessions(uid: string, orgId: string): Promise<OrganizationSession[]> {
    await this.requireContext(uid, orgId, "view");
    return this.workspace.listSessions(orgId, 30);
  }

  async createSession(uid: string, orgId: string, title?: string): Promise<OrganizationSession> {
    await this.requireContext(uid, orgId, "createSession");
    const session = await this.guarded(() =>
      this.workspace.createSession(
        orgId,
        this.actor(uid, rolesAllowed("createSession")),
        title ?? "New shared reflection",
      ),
    );
    await this.usage?.record("organizationSessionsCreated");
    return session;
  }

  async getSession(
    uid: string,
    orgId: string,
    sessionId: string,
  ): Promise<OrganizationSessionDetail> {
    await this.requireContext(uid, orgId, "view");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();
    const [messages, summary] = await Promise.all([
      this.workspace.listMessages(orgId, sessionId, MAX_STORED_MESSAGES),
      this.workspace.getSummary(orgId, sessionId),
    ]);
    return { ...session, messages, summary };
  }

  async addMessage(
    uid: string,
    orgId: string,
    sessionId: string,
    requestId: string,
    content: string,
  ): Promise<OrganizationExchange> {
    await this.requireContext(uid, orgId, "sendMessage");

    const previous = await this.workspace.getMessageExchange(orgId, sessionId, requestId);
    if (previous) {
      if (previous.userMessage.content !== content) {
        throw new AppError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This message request conflicts with an earlier request.",
        );
      }
      return previous;
    }

    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();
    if (session.messageCount + 2 > MAX_STORED_MESSAGES) {
      throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
    }

    // Model context is read exclusively from this organization's subtree; no personal data can
    // enter the prompt.
    const context = await this.workspace.listMessages(orgId, sessionId, MODEL_CONTEXT_MESSAGES);
    const modelMessages: JournalMessage[] = [
      ...context.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
      {
        id: `pending_${requestId}`,
        role: "user",
        content,
        createdAt: this.now().toISOString(),
      },
    ];
    const reply = await this.model.reply(modelMessages.slice(-MODEL_CONTEXT_MESSAGES));

    try {
      return await this.workspace.saveMessageExchange(
        orgId,
        sessionId,
        {
          requestId,
          userContent: content,
          assistantContent: reply,
          authorUid: uid,
          maxMessageCount: MAX_STORED_MESSAGES,
        },
        this.actor(uid, rolesAllowed("sendMessage")),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "ACTOR_NOT_AUTHORIZED") throw forbidden();
      if (error instanceof Error && error.message === "SESSION_NOT_FOUND") throw notFound();
      if (error instanceof Error && error.message === "SESSION_LIMIT_REACHED") {
        throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
      }
      throw error;
    }
  }

  async summarize(uid: string, orgId: string, sessionId: string): Promise<OrganizationSummary> {
    await this.requireContext(uid, orgId, "summarize");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();

    const existing = await this.workspace.getSummary(orgId, sessionId);
    if (existing && session.summarizedMessageCount === session.messageCount) return existing;

    const messages = await this.workspace.listMessages(orgId, sessionId, MAX_STORED_MESSAGES);
    if (messages.length < 2) {
      throw new AppError(409, "NOT_ENOUGH_CONTEXT", "Add more to the conversation first.");
    }
    const output = await this.model.summarize(
      messages.slice(-MODEL_CONTEXT_MESSAGES).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
    );
    return this.guarded(() =>
      this.workspace.saveSummary(
        orgId,
        {
          ...output,
          sourceSessionId: sessionId,
          createdBy: uid,
          sourceMessageCount: messages.length,
        },
        this.actor(uid, rolesAllowed("summarize")),
      ),
    );
  }

  async deleteSession(uid: string, orgId: string, sessionId: string): Promise<void> {
    const { membership } = await this.requireContext(uid, orgId, "view");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();
    if (!canDeleteSession(membership.role, session.createdBy === uid)) {
      throw forbidden();
    }
    const deleted = await this.guarded(() =>
      this.workspace.deleteSession(orgId, sessionId, {
        uid,
        allowedRoles: rolesAllowed("deleteOtherSession"),
        creatorRoles: rolesAllowed("deleteOwnSession"),
      }),
    );
    if (!deleted) throw notFound();
  }
}
