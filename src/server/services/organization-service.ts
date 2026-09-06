import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  AuditEvent,
  CaptureType,
  CreateOrganizationInput,
  CreatedInvite,
  InvitePreview,
  JournalMessage,
  Organization,
  OrganizationDetail,
  OrganizationEodSettings,
  OrganizationEodSettingsInput,
  OrganizationEodStatus,
  OrganizationInvite,
  OrganizationMemoryAnswer,
  MemoryIndexBuildResult,
  OrganizationMemberView,
  OrganizationMembership,
  OrganizationPermissions,
  OrganizationRole,
  OrganizationSession,
  OrganizationSessionDetail,
  OrganizationSummary,
  AttachmentKind,
  AttachmentReference,
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
import type { AttachmentRepository } from "../data/attachment-repository.js";
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
import type { PlatformUserRepository } from "../data/platform-user-repository.js";
import { AppError, forbidden, notFound } from "../errors.js";
import type { ConversationModel, ReflectionClassification } from "./conversation-model.js";
import type { ModelAttachment } from "./conversation-model.js";
import type { UsageRecorder } from "./usage-recorder.js";

const MAX_STORED_MESSAGES = 120;
const MODEL_CONTEXT_MESSAGES = 24;
const MEMORY_MESSAGE_SESSIONS = 30;
const MEMORY_MESSAGE_LIMIT = 12;
const MAX_MEMORY_EVIDENCE_TEXT = 2_500;
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
    private readonly attachments?: AttachmentRepository,
    private readonly memoryIndex?: MemoryIndexService,
  ) {}

  private async refreshMemoryIndex(orgId: string, sessionId: string): Promise<void> {
    if (!this.memoryIndex) return;
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session || session.status !== "active") return;
    const [messages, summary] = await Promise.all([
      this.workspace.listMessages(orgId, sessionId, MAX_STORED_MESSAGES),
      this.workspace.getSummary(orgId, sessionId),
    ]);
    const attachmentIds = [...new Set(messages.flatMap((message) => message.attachmentIds ?? []))].slice(0, 3);
    const attachments = this.attachments
      ? (await Promise.all(attachmentIds.map((attachmentId) =>
        this.attachments!.get({ type: "organization", scopeId: orgId }, sessionId, attachmentId).catch(() => null),
      ))).filter((attachment): attachment is NonNullable<typeof attachment> =>
        attachment !== null && (attachment.kind === "image" || attachment.kind === "document"),
      ).map(({ mimeType, bytes }) => ({ mimeType, bytes }))
      : [];
    await this.memoryIndex.indexSession({ type: "organization", scopeId: orgId }, {
      sessionId,
      title: session.title,
      captureType: session.captureType,
      tags: session.tags,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
      summary,
      attachments,
    });
  }

  private async classifyNewReflection(
    orgId: string,
    session: OrganizationSession,
    content: string,
  ): Promise<ReflectionClassification | null> {
    if (!this.model.classifyReflection || session.messageCount !== 0 || !isPlaceholderReflectionTitle(session.title, true)) {
      return null;
    }
    try {
      const existingTags = await this.workspace.listTags(orgId, 50);
      const result = await this.model.classifyReflection({
        content,
        existingTags,
        purpose: "initial",
        scope: "organization",
      });
      const title = normalizeReflectionTitle(result.title);
      if (!title) return null;
      return { title, tags: sanitizeReflectionTags(result.tags, MAX_AI_REFLECTION_TAGS) };
    } catch {
      return null;
    }
  }

  private async classifySummaryTag(
    uid: string,
    orgId: string,
    session: OrganizationSession,
    messages: JournalMessage[],
    summary: OrganizationSummary,
  ): Promise<string[] | null> {
    if (!this.model.classifyReflection) return null;
    try {
      const [existingTags, latestSession] = await Promise.all([
        this.workspace.listTags(orgId, 50),
        this.workspace.getSession(orgId, session.id),
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
        scope: "organization",
      });
      return appendAutomaticReflectionTag(latestSession.tags, result.tags);
    } catch {
      return null;
    }
  }

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
      if (error instanceof Error && error.message === "SESSION_ARCHIVED") {
        throw new AppError(409, "SESSION_ARCHIVED", "This shared reflection is archived.");
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

  async listSessions(
    uid: string,
    orgId: string,
    status: OrganizationSession["status"] = "active",
  ): Promise<OrganizationSession[]> {
    await this.requireContext(uid, orgId, "view");
    const sessions = await this.workspace.listSessions(orgId, 30, status);
    return sessions;
  }

  async getEodSettings(uid: string, orgId: string): Promise<OrganizationEodSettings> {
    await this.requireContext(uid, orgId, "view");
    return (await this.organizations.getEodSettings(orgId)) ?? {
      enabled: false,
      timezone: "UTC",
      activeWeekdays: [1, 2, 3, 4, 5],
      dueLocalTime: "17:00",
      questions: ["What moved forward?", "What is blocked?", "What needs a decision or help?"],
      showSubmissionStatus: false,
      updatedBy: null,
      updatedAt: null,
    };
  }

  async updateEodSettings(
    uid: string,
    orgId: string,
    input: OrganizationEodSettingsInput,
  ): Promise<OrganizationEodSettings> {
    await this.requireContext(uid, orgId, "updateSettings");
    return this.guarded(() =>
      this.organizations.setEodSettings(orgId, input, this.actor(uid, rolesAllowed("updateSettings"))),
    );
  }

  async getEodStatus(uid: string, orgId: string, localDate: string): Promise<OrganizationEodStatus> {
    await this.requireContext(uid, orgId, "view");
    return (await this.organizations.getEodStatus(orgId, uid, localDate)) ?? {
      uid,
      localDate,
      dismissed: false,
      submittedSessionId: null,
      updatedAt: null,
    };
  }

  async getEodSubmissionCount(uid: string, orgId: string, localDate: string): Promise<number | null> {
    await this.requireContext(uid, orgId, "view");
    const settings = await this.organizations.getEodSettings(orgId);
    if (!settings?.enabled || !settings.showSubmissionStatus) return null;
    return this.organizations.countEodSubmissions(orgId, localDate);
  }

  async updateEodStatus(
    uid: string,
    orgId: string,
    localDate: string,
    changes: { dismissed?: boolean; submittedSessionId?: string | null },
  ): Promise<OrganizationEodStatus> {
    const isSubmission = typeof changes.submittedSessionId === "string";
    const action: OrganizationAction = isSubmission ? "sendMessage" : "view";
    await this.requireContext(uid, orgId, action);
    if (isSubmission) {
      const session = await this.workspace.getSession(orgId, changes.submittedSessionId!);
      if (
        !session ||
        session.status !== "active" ||
        session.createdBy !== uid ||
        session.captureType !== "update" ||
        session.messageCount < 2
      ) {
        throw new AppError(
          409,
          "INVALID_EOD_SUBMISSION",
          "Share your own completed team update before marking today as submitted.",
        );
      }
    }
    return this.guarded(() =>
      this.organizations.setEodStatus(orgId, uid, localDate, changes, this.actor(uid, rolesAllowed(action))),
    );
  }

  /**
   * Bounded Team Intelligence retrieval. The membership check happens before any organization
   * summary or message is read or placed in the model context. A scoped vector index is preferred;
   * summaries and recent messages provide a small, honest fallback without creating a mixed
   * personal/team collection.
   */
  async askOrganizationMemory(uid: string, orgId: string, query: string): Promise<OrganizationMemoryAnswer> {
    const sessions = await this.listSessions(uid, orgId);
    if (this.memoryIndex) {
      try {
        const chunks = await this.memoryIndex.search({ type: "organization", scopeId: orgId }, query, 8);
        const sessionById = new Map(sessions.map((session) => [session.id, session]));
        const authorized = chunks.filter((chunk) => sessionById.has(chunk.sourceSessionId));
        if (authorized.length > 0) {
          const evidence = authorized.map((chunk) => ({
            sourceSessionId: chunk.sourceSessionId,
            sourceMessageIds: chunk.sourceMessageIds,
            captureType: chunk.captureType,
            text: chunk.text,
          }));
          if (this.model.answerGroundedMemory) {
            const grounded = validateGroundedMemoryAnswer(
              evidence,
              await this.model.answerGroundedMemory({
                scope: "organization",
                question: query,
                evidence,
              }),
            );
            if (!grounded) {
              return {
                answer: "I couldn't find enough shared team context to answer that reliably yet.",
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
                  return {
                    sessionId: session.id,
                    title: session.title,
                    date: session.updatedAt.slice(0, 10),
                    captureType: session.captureType,
                  };
                }),
            };
          }
          const answer = await this.model.reply([
            {
              id: "organization-memory-vector-context",
              role: "user",
              content: JSON.stringify({ authorizedOrganizationMemoryChunks: authorized.map((chunk) => ({
                sourceSessionId: chunk.sourceSessionId,
                captureType: chunk.captureType,
                text: chunk.text,
              })) }),
              createdAt: this.now().toISOString(),
            },
            {
              id: "organization-memory-vector-question",
              role: "user",
              content: `Answer using only the authorized shared memory chunks above. If they do not contain enough evidence, say so plainly. Question: ${query}`,
              createdAt: this.now().toISOString(),
            },
          ]);
          return {
            answer,
            citations: authorized.map((chunk) => {
              const session = sessionById.get(chunk.sourceSessionId)!;
              return {
                sessionId: session.id,
                title: session.title,
                date: session.updatedAt.slice(0, 10),
                captureType: session.captureType,
              };
            }),
          };
        }
      } catch {
        // Fall back to the bounded summary index while older captures are being backfilled.
      }
    }
    const summaries = (
      await Promise.all(
        sessions.map(async (session) => ({ session, summary: await this.workspace.getSummary(orgId, session.id) })),
      )
    ).filter(
      (entry): entry is { session: OrganizationSession; summary: OrganizationSummary } =>
        entry.summary !== null,
    );

    const terms = memorySearchTerms(query);
    if (terms.length === 0) {
      return {
        answer: "I couldn't find enough shared team context to answer that reliably yet.",
        citations: [],
      };
    }
    const ranked = summaries
      .map((entry, index) => {
        const searchable = [
          entry.session.title,
          entry.summary.title,
          entry.summary.summary,
          ...entry.summary.themes,
          ...entry.summary.nextSteps,
        ].join(" ").toLowerCase();
        const score = memoryTextScore(searchable, terms);
        return { ...entry, score, index };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 8);

    if (ranked.length === 0) {
      // A team capture is usable before its optional summary exists. Read only messages from the
      // already-authorized organization session list; this never broadens the organization scope.
      const messageCandidates = (
        await Promise.all(
          sessions.slice(0, MEMORY_MESSAGE_SESSIONS).map(async (session) => ({
            session,
            messages: await this.workspace.listMessages(orgId, session.id, MEMORY_MESSAGE_LIMIT),
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
          answer: "I couldn't find enough shared team context to answer that reliably yet.",
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
            scope: "organization",
            question: query,
            evidence,
          }),
        );
        if (!grounded) {
          return {
            answer: "I couldn't find enough shared team context to answer that reliably yet.",
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
              captureType: session.captureType,
            })),
        };
      }
      const answer = await this.model.reply([
        {
          id: "organization-memory-messages-context",
          role: "user",
          content: JSON.stringify({ authorizedOrganizationCaptures: evidence }),
          createdAt: this.now().toISOString(),
        },
        {
          id: "organization-memory-messages-question",
          role: "user",
          content: `Answer using only the authorized shared captures above. If they do not contain enough evidence, say so plainly. Question: ${query}`,
          createdAt: this.now().toISOString(),
        },
      ]);
      return {
        answer,
        citations: rankedMessages.map(({ session }) => ({
          sessionId: session.id,
          title: session.title,
          date: session.updatedAt.slice(0, 10),
          captureType: session.captureType,
        })),
      };
    }

    const evidence = ranked.map(({ session, summary }) => ({
      sourceSessionId: session.id,
      sourceMessageIds: [],
      captureType: session.captureType,
      text: [
        `Date: ${session.updatedAt.slice(0, 10)}`,
        `Title: ${summary.title}`,
        `Summary: ${summary.summary}`,
        `Themes: ${summary.themes.join(", ")}`,
        `Next steps: ${summary.nextSteps.join(", ")}`,
      ].join("\n"),
    }));
    if (this.model.answerGroundedMemory) {
      const grounded = validateGroundedMemoryAnswer(
        evidence,
        await this.model.answerGroundedMemory({
          scope: "organization",
          question: query,
          evidence,
        }),
      );
      if (!grounded) {
        return {
          answer: "I couldn't find enough shared team context to answer that reliably yet.",
          citations: [],
        };
      }
      const selected = new Set(grounded.sourceSessionIds);
      return {
        answer: grounded.answer,
        citations: ranked
          .filter(({ session }) => selected.has(session.id))
          .map(({ session, summary }) => ({
            sessionId: session.id,
            title: summary.title,
            date: session.updatedAt.slice(0, 10),
            captureType: session.captureType,
          })),
      };
    }
    const answer = await this.model.reply([
      {
        id: "organization-memory-context",
        role: "user" as const,
        content: JSON.stringify({ authorizedOrganizationSummaries: evidence }),
        createdAt: this.now().toISOString(),
      },
      {
        id: "organization-memory-question",
        role: "user",
        content: `Answer using only the authorized shared team summaries above. If they do not contain enough evidence, say so plainly. Question: ${query}`,
        createdAt: this.now().toISOString(),
      },
    ]);

    return {
      answer,
      citations: ranked.map(({ session, summary }) => ({
        sessionId: session.id,
        title: summary.title,
        date: session.updatedAt.slice(0, 10),
        captureType: session.captureType,
      })),
    };
  }

  async buildMemoryIndex(uid: string, orgId: string, limit = 20): Promise<MemoryIndexBuildResult> {
    await this.requireContext(uid, orgId, "updateSettings");
    if (!this.memoryIndex) {
      throw new AppError(503, "MEMORY_INDEX_UNAVAILABLE", "Team memory indexing is not available right now.");
    }
    const boundedLimit = Math.min(Math.max(limit, 1), 30);
    const sessions = await this.workspace.listSessions(orgId, boundedLimit, "active");
    let indexed = 0;
    let skipped = 0;
    let failed = 0;
    for (const session of sessions) {
      if (session.messageCount === 0) {
        skipped += 1;
        continue;
      }
      try {
        await this.refreshMemoryIndex(orgId, session.id);
        indexed += 1;
      } catch {
        failed += 1;
      }
    }
    return { examined: sessions.length, indexed, skipped, failed };
  }

  async createSession(
    uid: string,
    orgId: string,
    title?: string,
    captureType: CaptureType = "reflection",
  ): Promise<OrganizationSession> {
    await this.requireContext(uid, orgId, "createSession");
    const session = await this.guarded(() =>
      this.workspace.createSession(
        orgId,
        this.actor(uid, rolesAllowed("createSession")),
        title ?? "New team reflection",
        captureType,
      ),
    );
    await this.usage?.record("organizationSessionsCreated");
    return session;
  }

  async setSessionTags(
    uid: string,
    orgId: string,
    sessionId: string,
    tags: string[],
  ): Promise<OrganizationSession> {
    await this.requireContext(uid, orgId, "updateSessionTags");
    const normalized = sanitizeReflectionTags(tags);
    const actor = this.actor(uid, rolesAllowed("updateSessionTags"));
    const updated = await this.guarded(() =>
      this.workspace.setSessionTags(
        orgId,
        sessionId,
        normalized,
        actor,
      ),
    );
    if (!updated) throw notFound();
    await this.guarded(() => this.workspace.registerTags(orgId, normalized, actor)).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "organization_tag_catalog_failed" }));
    });
    void this.refreshMemoryIndex(orgId, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    return updated;
  }

  async listTags(uid: string, orgId: string, limit = 100): Promise<string[]> {
    await this.requireContext(uid, orgId);
    return this.workspace.listTags(orgId, Math.max(1, Math.min(limit, 100)));
  }

  async renameSession(
    uid: string,
    orgId: string,
    sessionId: string,
    title: string,
  ): Promise<OrganizationSession> {
    await this.requireContext(uid, orgId, "renameSession");
    const updated = await this.guarded(() =>
      this.workspace.renameSession(
        orgId,
        sessionId,
        title.trim(),
        this.actor(uid, rolesAllowed("renameSession")),
      ),
    );
    void this.refreshMemoryIndex(orgId, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    return updated;
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

  async assertSessionWritable(uid: string, orgId: string, sessionId: string): Promise<void> {
    await this.requireContext(uid, orgId, "sendMessage");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ARCHIVED", "This shared reflection is archived.");
    }
    if (session.messageCount + 2 > MAX_STORED_MESSAGES) {
      throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
    }
  }

  async addMessage(
    uid: string,
    orgId: string,
    sessionId: string,
    requestId: string,
    content: string,
    attachmentIds: string[] = [],
  ): Promise<OrganizationExchange> {
    await this.requireContext(uid, orgId, "sendMessage");

    const previous = await this.workspace.getMessageExchange(orgId, sessionId, requestId);
    if (previous) {
      const existingAttachmentIds = previous.userMessage.attachmentIds ?? [];
      if (
        previous.userMessage.content !== content ||
        existingAttachmentIds.length !== attachmentIds.length ||
        existingAttachmentIds.some((id, index) => id !== attachmentIds[index])
      ) {
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
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ARCHIVED", "This shared reflection is archived.");
    }
    const modelAttachments = await this.modelAttachments(orgId, sessionId, attachmentIds);
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
        ...(attachmentIds.length > 0 ? { attachmentIds: [...attachmentIds] } : {}),
        createdAt: this.now().toISOString(),
      },
    ];
    const classificationPromise = this.classifyNewReflection(orgId, session, content);
    const replyPromise = modelAttachments.length > 0 && this.model.replyWithAttachments
      ? this.model.replyWithAttachments(modelMessages.slice(-MODEL_CONTEXT_MESSAGES), modelAttachments)
      : this.model.reply(modelMessages.slice(-MODEL_CONTEXT_MESSAGES));
    const [reply, classification] = await Promise.all([replyPromise, classificationPromise]);
    const title = classification?.title;

    let exchange: OrganizationExchange;
    try {
      exchange = await this.workspace.saveMessageExchange(
        orgId,
        sessionId,
        {
          requestId,
          userContent: content,
          assistantContent: reply,
          title,
          tags: classification?.tags,
          authorUid: uid,
          attachmentIds,
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
    const updatedSession = await this.workspace.getSession(orgId, sessionId);
    if (classification?.tags.length) {
      await this.guarded(() => this.workspace.registerTags(
        orgId,
        classification.tags,
        this.actor(uid, rolesAllowed("sendMessage")),
      )).catch(() => {
        console.warn(JSON.stringify({ severity: "WARNING", event: "organization_tag_catalog_failed" }));
      });
    }
    void this.refreshMemoryIndex(orgId, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    return updatedSession ? { ...exchange, session: updatedSession } : exchange;
  }

  async streamMessage(
    uid: string,
    orgId: string,
    sessionId: string,
    requestId: string,
    content: string,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
    attachmentIds: string[] = [],
  ): Promise<OrganizationExchange> {
    await this.requireContext(uid, orgId, "sendMessage");
    const previous = await this.workspace.getMessageExchange(orgId, sessionId, requestId);
    if (previous) {
      const previousIds = previous.userMessage.attachmentIds ?? [];
      if (
        previous.userMessage.content !== content ||
        previousIds.length !== attachmentIds.length ||
        previousIds.some((id, index) => id !== attachmentIds[index])
      ) {
        throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This message request conflicts with an earlier request.");
      }
      onChunk(previous.assistantMessage.content);
      return previous;
    }

    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ARCHIVED", "This shared reflection is archived.");
    }
    if (session.messageCount + 2 > MAX_STORED_MESSAGES) {
      throw new AppError(409, "SESSION_LIMIT_REACHED", "Start a new session to continue.");
    }
    const [context, modelAttachments] = await Promise.all([
      this.workspace.listMessages(orgId, sessionId, MODEL_CONTEXT_MESSAGES),
      this.modelAttachments(orgId, sessionId, attachmentIds),
    ]);
    const classificationPromise = this.classifyNewReflection(orgId, session, content);
    const pendingMessage: JournalMessage = {
      id: `pending_${requestId}`,
      role: "user",
      content,
      ...(attachmentIds.length > 0 ? { attachmentIds: [...attachmentIds] } : {}),
      createdAt: this.now().toISOString(),
    };
    const modelMessages: JournalMessage[] = [
      ...context.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
      pendingMessage,
    ].slice(-MODEL_CONTEXT_MESSAGES);
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

    let exchange: OrganizationExchange;
    try {
      exchange = await this.workspace.saveMessageExchange(
        orgId,
        sessionId,
        {
          requestId,
          userContent: content,
          assistantContent,
          title,
          tags: classification?.tags,
          authorUid: uid,
          attachmentIds,
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
    const updatedSession = await this.workspace.getSession(orgId, sessionId);
    if (classification?.tags.length) {
      await this.guarded(() => this.workspace.registerTags(
        orgId,
        classification.tags,
        this.actor(uid, rolesAllowed("sendMessage")),
      )).catch(() => {
        console.warn(JSON.stringify({ severity: "WARNING", event: "organization_tag_catalog_failed" }));
      });
    }
    void this.refreshMemoryIndex(orgId, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    return updatedSession ? { ...exchange, session: updatedSession } : exchange;
  }

  async createAttachment(
    uid: string,
    orgId: string,
    sessionId: string,
    kind: AttachmentKind,
    mimeType: string,
    bytes: Buffer,
  ): Promise<AttachmentReference> {
    await this.requireContext(uid, orgId, "sendMessage");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session || session.status !== "active") throw notFound();
    if (!this.attachments) throw new AppError(503, "ATTACHMENTS_UNAVAILABLE", "Attachments are not available right now.");
    return this.attachments.create({ type: "organization", scopeId: orgId }, sessionId, kind, mimeType, bytes);
  }

  async deleteAttachment(uid: string, orgId: string, sessionId: string, attachmentId: string): Promise<void> {
    await this.requireContext(uid, orgId, "sendMessage");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session || session.status !== "active") throw notFound();
    if (!this.attachments || !(await this.attachments.delete({ type: "organization", scopeId: orgId }, sessionId, attachmentId))) {
      throw notFound();
    }
  }

  async transcribeAttachment(uid: string, orgId: string, sessionId: string, attachmentId: string): Promise<string> {
    await this.requireContext(uid, orgId, "sendMessage");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session || session.status !== "active") throw notFound();
    if (!this.attachments || !this.model.transcribeAudio) {
      throw new AppError(503, "TRANSCRIPTION_UNAVAILABLE", "Voice transcription is not available right now.");
    }
    const attachment = await this.attachments.get({ type: "organization", scopeId: orgId }, sessionId, attachmentId);
    if (!attachment || attachment.kind !== "audio") throw notFound();
    return this.model.transcribeAudio({ mimeType: attachment.mimeType, bytes: attachment.bytes });
  }

  async transcribeVoice(uid: string, orgId: string, sessionId: string, mimeType: string, bytes: Buffer): Promise<string> {
    await this.requireContext(uid, orgId, "sendMessage");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session || session.status !== "active") throw notFound();
    if (!this.model.transcribeAudio) {
      throw new AppError(503, "TRANSCRIPTION_UNAVAILABLE", "Voice transcription is not available right now.");
    }
    return this.model.transcribeAudio({ mimeType, bytes });
  }

  async getAttachment(uid: string, orgId: string, sessionId: string, attachmentId: string): Promise<{ mimeType: string; bytes: Buffer }> {
    await this.requireContext(uid, orgId, "view");
    if (!this.attachments) throw new AppError(503, "ATTACHMENTS_UNAVAILABLE", "Attachments are not available right now.");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();
    const attachment = await this.attachments.get({ type: "organization", scopeId: orgId }, sessionId, attachmentId);
    if (!attachment) throw notFound();
    return { mimeType: attachment.mimeType, bytes: attachment.bytes };
  }

  private async modelAttachments(
    orgId: string,
    sessionId: string,
    attachmentIds: string[],
  ): Promise<ModelAttachment[]> {
    if (attachmentIds.length === 0) return [];
    if (!this.attachments) throw new AppError(503, "ATTACHMENTS_UNAVAILABLE", "Attachments are not available right now.");
    const records = await Promise.all(
      attachmentIds.map((id) => this.attachments!.get({ type: "organization", scopeId: orgId }, sessionId, id)),
    );
    if (records.some((record) => record === null)) throw notFound();
    return records
      .filter((record): record is NonNullable<typeof record> => record !== null)
      .filter((record) => record.kind === "image" || record.kind === "document")
      .map((record) => ({ mimeType: record.mimeType, bytes: record.bytes }));
  }

  async summarize(uid: string, orgId: string, sessionId: string): Promise<OrganizationSummary> {
    await this.requireContext(uid, orgId, "summarize");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ARCHIVED", "This shared reflection is archived.");
    }

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
    const saved = await this.guarded(() =>
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
    const updatedTags = await this.classifySummaryTag(uid, orgId, session, messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })), saved);
    if (updatedTags) {
      try {
        const actor = this.actor(uid, rolesAllowed("updateSessionTags"));
        await this.guarded(() => this.workspace.setSessionTags(orgId, sessionId, updatedTags, actor));
        await this.guarded(() => this.workspace.registerTags(orgId, updatedTags, actor));
      } catch {
        console.warn(JSON.stringify({ severity: "WARNING", event: "organization_summary_tag_failed" }));
      }
    }
    void this.refreshMemoryIndex(orgId, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    return saved;
  }

  async archiveSession(uid: string, orgId: string, sessionId: string): Promise<OrganizationSession> {
    const { membership } = await this.requireContext(uid, orgId, "view");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();
    if (session.status !== "active") {
      throw new AppError(409, "SESSION_ALREADY_ARCHIVED", "This shared reflection is already archived.");
    }
    if (!canDeleteSession(membership.role, session.createdBy === uid)) throw forbidden();
    const archived = await this.guarded(() =>
      this.workspace.setSessionStatus(orgId, sessionId, "archived", {
        uid,
        allowedRoles: rolesAllowed("deleteOtherSession"),
        creatorRoles: rolesAllowed("deleteOwnSession"),
      }),
    );
    if (!archived) throw notFound();
    await this.memoryIndex?.deleteSession({ type: "organization", scopeId: orgId }, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_cleanup_failed" }));
    });
    return archived;
  }

  async restoreSession(uid: string, orgId: string, sessionId: string): Promise<OrganizationSession> {
    const { membership } = await this.requireContext(uid, orgId, "view");
    const session = await this.workspace.getSession(orgId, sessionId);
    if (!session) throw notFound();
    if (session.status !== "archived") {
      throw new AppError(409, "SESSION_NOT_ARCHIVED", "This shared reflection is already active.");
    }
    if (!canDeleteSession(membership.role, session.createdBy === uid)) throw forbidden();
    const restored = await this.guarded(() =>
      this.workspace.setSessionStatus(orgId, sessionId, "active", {
        uid,
        allowedRoles: rolesAllowed("deleteOtherSession"),
        creatorRoles: rolesAllowed("deleteOwnSession"),
      }),
    );
    if (!restored) throw notFound();
    void this.refreshMemoryIndex(orgId, sessionId).catch(() => {
      console.warn(JSON.stringify({ severity: "WARNING", event: "memory_index_failed" }));
    });
    return restored;
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
    await this.attachments?.deleteForSession({ type: "organization", scopeId: orgId }, sessionId);
    await this.memoryIndex?.deleteSession({ type: "organization", scopeId: orgId }, sessionId);
  }
}
