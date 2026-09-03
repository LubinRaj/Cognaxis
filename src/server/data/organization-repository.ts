import type {
  AuditEvent,
  Organization,
  OrganizationInvite,
  OrganizationMembership,
  OrganizationMessage,
  OrganizationRole,
  OrganizationSession,
  OrganizationSummary,
  SummaryOutput,
  UserOrganizationEdge,
} from "../../shared/schemas.js";

export type AuditWrite = {
  eventType: string;
  targetType: AuditEvent["targetType"];
  targetId: string;
  changes: AuditEvent["changes"];
  requestId: string;
};

// Every mutating call re-reads the acting user's membership inside the same transaction that
// writes the change, so a membership that was just revoked can never complete a late write.
export type ActorConstraint = {
  uid: string;
  allowedRoles: readonly OrganizationRole[];
};

// Membership mutations carry their authorization decision as a pure function that the repository
// evaluates against the memberships it just read inside the write transaction. The seniority
// matrix and the audit trail therefore always reflect the state actually being mutated, not a
// snapshot taken before the transaction began. Returning null denies the mutation.
export type MembershipMutationPlan = (
  actor: OrganizationMembership,
  target: OrganizationMembership,
) => {
  changes: { role?: OrganizationRole; status?: "active" | "suspended" };
  auditChanges: AuditEvent["changes"];
} | null;

export type MembershipRemovalPlan = (
  actor: OrganizationMembership,
  target: OrganizationMembership,
) => AuditEvent["changes"] | null;

// Workspace writes revalidate this constraint inside the transaction that persists the write, so
// a suspension or removal that lands while a model call is in flight always wins over the write.
export type SessionActorConstraint = ActorConstraint & {
  /** Roles that are additionally sufficient when the actor created the session being changed. */
  creatorRoles?: readonly OrganizationRole[];
};

/** The documented ceiling on memberships per organization, enforced at acceptance time. */
export const MAX_ORGANIZATION_MEMBERS = 50;

export type AcceptInviteResult =
  | { status: "accepted"; role: "admin" | "member" | "viewer"; organizationName: string }
  | { status: "already-member"; role: OrganizationRole; organizationName: string }
  | { status: "full" }
  | { status: "invalid" };

export interface OrganizationRepository {
  createWithOwner(input: {
    name: string;
    description: string | null;
    ownerUid: string;
    requestId: string;
  }): Promise<Organization>;
  getOrganization(orgId: string): Promise<Organization | null>;
  /** Platform-administration path: suspend or restore an organization. */
  setOrganizationStatus(orgId: string, status: "active" | "suspended"): Promise<Organization | null>;
  listOrganizations(limit: number, status?: "active" | "suspended"): Promise<Organization[]>;
  /** Metadata count for the admin overview; filtering happens in the query, not in memory. */
  countOrganizations(status?: "active" | "suspended"): Promise<number>;
  updateOrganization(
    orgId: string,
    changes: { name?: string; description?: string | null },
    actor: ActorConstraint,
    audit: AuditWrite,
  ): Promise<Organization>;
  getMembership(orgId: string, uid: string): Promise<OrganizationMembership | null>;
  listMembers(orgId: string, limit: number): Promise<OrganizationMembership[]>;
  listUserEdges(uid: string): Promise<UserOrganizationEdge[]>;
  updateMembership(
    orgId: string,
    targetUid: string,
    actorUid: string,
    plan: MembershipMutationPlan,
    audit: Omit<AuditWrite, "changes">,
  ): Promise<OrganizationMembership>;
  removeMembership(
    orgId: string,
    targetUid: string,
    actorUid: string,
    plan: MembershipRemovalPlan,
    audit: Omit<AuditWrite, "changes">,
  ): Promise<void>;

  createInvite(
    orgId: string,
    invite: {
      tokenHash: string;
      role: "admin" | "member" | "viewer";
      expiresAt: string;
      createdBy: string;
    },
    actor: ActorConstraint,
    audit: AuditWrite,
  ): Promise<{ inviteId: string }>;
  getInvite(orgId: string, inviteId: string): Promise<OrganizationInvite | null>;
  listInvites(orgId: string, limit: number): Promise<OrganizationInvite[]>;
  revokeInvite(
    orgId: string,
    inviteId: string,
    actor: ActorConstraint,
    audit: AuditWrite,
  ): Promise<boolean>;
  acceptInvite(params: {
    orgId: string;
    inviteId: string;
    uid: string;
    tokenHash: string;
    nowIso: string;
    requestId: string;
  }): Promise<AcceptInviteResult>;

  listAuditEvents(orgId: string, limit: number): Promise<AuditEvent[]>;
}

export type OrganizationExchange = {
  userMessage: OrganizationMessage;
  assistantMessage: OrganizationMessage;
  messageCount: number;
};

export type SaveOrganizationExchangeInput = {
  requestId: string;
  userContent: string;
  assistantContent: string;
  authorUid: string;
  maxMessageCount: number;
};

export type SaveOrganizationSummaryInput = SummaryOutput & {
  sourceSessionId: string;
  createdBy: string;
  sourceMessageCount: number;
};

export interface OrganizationWorkspaceRepository {
  createSession(orgId: string, actor: ActorConstraint, title: string): Promise<OrganizationSession>;
  listSessions(orgId: string, limit: number): Promise<OrganizationSession[]>;
  getSession(orgId: string, sessionId: string): Promise<OrganizationSession | null>;
  listMessages(orgId: string, sessionId: string, limit: number): Promise<OrganizationMessage[]>;
  getMessageExchange(
    orgId: string,
    sessionId: string,
    requestId: string,
  ): Promise<OrganizationExchange | null>;
  saveMessageExchange(
    orgId: string,
    sessionId: string,
    input: SaveOrganizationExchangeInput,
    actor: ActorConstraint,
  ): Promise<OrganizationExchange>;
  saveSummary(
    orgId: string,
    input: SaveOrganizationSummaryInput,
    actor: ActorConstraint,
  ): Promise<OrganizationSummary>;
  getSummary(orgId: string, sessionId: string): Promise<OrganizationSummary | null>;
  deleteSession(
    orgId: string,
    sessionId: string,
    actor: SessionActorConstraint,
  ): Promise<boolean>;
}
