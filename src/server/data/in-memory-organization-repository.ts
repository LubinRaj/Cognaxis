import { randomUUID } from "node:crypto";
import type {
  AuditEvent,
  OrganizationEodSettings,
  OrganizationEodSettingsInput,
  OrganizationEodStatus,
  Organization,
  OrganizationInvite,
  OrganizationMembership,
  UserOrganizationEdge,
} from "../../shared/schemas.js";
import {
  MAX_ORGANIZATION_MEMBERS,
  type AcceptInviteResult,
  type ActorConstraint,
  type AuditWrite,
  type MembershipMutationPlan,
  type MembershipRemovalPlan,
  type OrganizationRepository,
} from "./organization-repository.js";

class ConstraintViolation extends Error {
  constructor() {
    super("ACTOR_NOT_AUTHORIZED");
  }
}

type OrgStore = {
  organization: Organization;
  members: Map<string, OrganizationMembership>;
  invites: Map<string, OrganizationInvite>;
  audit: AuditEvent[];
  eodSettings: OrganizationEodSettings | null;
  eodStatus: Map<string, OrganizationEodStatus>;
};

export class InMemoryOrganizationRepository implements OrganizationRepository {
  private readonly organizations = new Map<string, OrgStore>();
  private readonly userEdges = new Map<string, Map<string, UserOrganizationEdge>>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private store(orgId: string): OrgStore | null {
    return this.organizations.get(orgId) ?? null;
  }

  private edges(uid: string): Map<string, UserOrganizationEdge> {
    let edges = this.userEdges.get(uid);
    if (!edges) {
      edges = new Map();
      this.userEdges.set(uid, edges);
    }
    return edges;
  }

  private requireActor(store: OrgStore, actor: ActorConstraint): OrganizationMembership {
    const membership = store.members.get(actor.uid);
    if (
      !membership ||
      membership.status !== "active" ||
      !actor.allowedRoles.includes(membership.role) ||
      store.organization.status !== "active"
    ) {
      throw new ConstraintViolation();
    }
    return membership;
  }

  private appendAudit(store: OrgStore, actorUid: string, audit: AuditWrite): void {
    store.audit.unshift({
      id: randomUUID(),
      eventType: audit.eventType,
      actorUid,
      targetType: audit.targetType,
      targetId: audit.targetId,
      organizationId: store.organization.id,
      changes: audit.changes,
      reason: null,
      requestId: audit.requestId,
      createdAt: this.now().toISOString(),
      schemaVersion: 1,
    });
  }

  private syncEdge(store: OrgStore, membership: OrganizationMembership): void {
    this.edges(membership.uid).set(store.organization.id, {
      orgId: store.organization.id,
      organizationName: store.organization.name,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt,
      updatedAt: membership.updatedAt,
    });
  }

  async createWithOwner(input: {
    name: string;
    description: string | null;
    ownerUid: string;
    requestId: string;
  }): Promise<Organization> {
    const timestamp = this.now().toISOString();
    const organization: Organization = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      status: "active",
      ownerUid: input.ownerUid,
      memberCount: 1,
      createdBy: input.ownerUid,
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: 1,
    };
    const membership: OrganizationMembership = {
      uid: input.ownerUid,
      orgId: organization.id,
      role: "owner",
      status: "active",
      invitedBy: null,
      joinedAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: 1,
    };
    const store: OrgStore = {
      organization,
      members: new Map([[input.ownerUid, membership]]),
      invites: new Map(),
      audit: [],
      eodSettings: null,
      eodStatus: new Map(),
    };
    this.organizations.set(organization.id, store);
    this.syncEdge(store, membership);
    this.appendAudit(store, input.ownerUid, {
      eventType: "organization.created",
      targetType: "organization",
      targetId: organization.id,
      changes: [{ field: "name", from: null, to: input.name }],
      requestId: input.requestId,
    });
    return structuredClone(organization);
  }

  async getOrganization(orgId: string): Promise<Organization | null> {
    const store = this.store(orgId);
    return store ? structuredClone(store.organization) : null;
  }

  async setOrganizationStatus(
    orgId: string,
    status: "active" | "suspended",
  ): Promise<Organization | null> {
    const store = this.store(orgId);
    if (!store) return null;
    store.organization.status = status;
    store.organization.updatedAt = this.now().toISOString();
    for (const membership of store.members.values()) {
      this.syncEdge(store, membership);
    }
    return structuredClone(store.organization);
  }

  async listOrganizations(
    limit: number,
    status?: "active" | "suspended",
  ): Promise<Organization[]> {
    return [...this.organizations.values()]
      .filter((store) => !status || store.organization.status === status)
      .map((store) => structuredClone(store.organization))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async countOrganizations(status?: "active" | "suspended"): Promise<number> {
    return [...this.organizations.values()].filter(
      (store) => !status || store.organization.status === status,
    ).length;
  }

  async updateOrganization(
    orgId: string,
    changes: { name?: string; description?: string | null },
    actor: ActorConstraint,
    audit: AuditWrite,
  ): Promise<Organization> {
    const store = this.store(orgId);
    if (!store) throw new ConstraintViolation();
    this.requireActor(store, actor);

    if (changes.name !== undefined) store.organization.name = changes.name;
    if (changes.description !== undefined) store.organization.description = changes.description;
    store.organization.updatedAt = this.now().toISOString();
    this.appendAudit(store, actor.uid, audit);

    // The organization name is denormalized onto every member edge for navigation.
    for (const membership of store.members.values()) {
      this.syncEdge(store, membership);
    }
    return structuredClone(store.organization);
  }

  async getMembership(orgId: string, uid: string): Promise<OrganizationMembership | null> {
    const membership = this.store(orgId)?.members.get(uid);
    return membership ? structuredClone(membership) : null;
  }

  async listMembers(orgId: string, limit: number): Promise<OrganizationMembership[]> {
    const store = this.store(orgId);
    if (!store) return [];
    return [...store.members.values()]
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .slice(0, limit)
      .map((membership) => structuredClone(membership));
  }

  async listUserEdges(uid: string): Promise<UserOrganizationEdge[]> {
    return [...this.edges(uid).values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((edge) => structuredClone(edge));
  }

  // The actor recheck, the seniority decision, and the audit values are all derived from the
  // same current state that the mutation is applied to, mirroring the Firestore transaction.
  private requireMutationParties(
    orgId: string,
    actorUid: string,
    targetUid: string,
  ): { store: OrgStore; actor: OrganizationMembership; target: OrganizationMembership } {
    const store = this.store(orgId);
    if (!store || store.organization.status !== "active") throw new ConstraintViolation();
    const actor = store.members.get(actorUid);
    if (!actor || actor.status !== "active") throw new ConstraintViolation();
    const target = store.members.get(targetUid);
    if (!target) throw new Error("TARGET_NOT_FOUND");
    return { store, actor, target };
  }

  async updateMembership(
    orgId: string,
    targetUid: string,
    actorUid: string,
    plan: MembershipMutationPlan,
    audit: Omit<AuditWrite, "changes">,
  ): Promise<OrganizationMembership> {
    const { store, actor, target } = this.requireMutationParties(orgId, actorUid, targetUid);
    const decision = plan(structuredClone(actor), structuredClone(target));
    if (!decision) throw new ConstraintViolation();
    if (decision.auditChanges.length === 0) return structuredClone(target);

    if (decision.changes.role !== undefined) target.role = decision.changes.role;
    if (decision.changes.status !== undefined) target.status = decision.changes.status;
    target.updatedAt = this.now().toISOString();
    this.syncEdge(store, target);
    this.appendAudit(store, actorUid, { ...audit, changes: decision.auditChanges });
    return structuredClone(target);
  }

  async removeMembership(
    orgId: string,
    targetUid: string,
    actorUid: string,
    plan: MembershipRemovalPlan,
    audit: Omit<AuditWrite, "changes">,
  ): Promise<void> {
    const { store, actor, target } = this.requireMutationParties(orgId, actorUid, targetUid);
    const auditChanges = plan(structuredClone(actor), structuredClone(target));
    if (!auditChanges) throw new ConstraintViolation();

    store.members.delete(targetUid);
    this.edges(targetUid).delete(orgId);
    store.organization.memberCount -= 1;
    store.organization.updatedAt = this.now().toISOString();
    this.appendAudit(store, actorUid, { ...audit, changes: auditChanges });
  }

  /** Sync status change for the linked platform repository's atomic admin mutation. */
  changeStatusSync(
    orgId: string,
    status: "active" | "suspended",
  ): { previousStatus: "active" | "suspended" } | null {
    const store = this.store(orgId);
    if (!store) return null;
    const previousStatus = store.organization.status;
    if (previousStatus !== status) {
      store.organization.status = status;
      store.organization.updatedAt = this.now().toISOString();
      for (const membership of store.members.values()) {
        this.syncEdge(store, membership);
      }
    }
    return { previousStatus };
  }

  /** Sync snapshot for the linked in-memory workspace repository's transactional actor recheck. */
  actorState(
    orgId: string,
    uid: string,
  ): { organizationStatus: "active" | "suspended"; membership: OrganizationMembership | null } | null {
    const store = this.store(orgId);
    if (!store) return null;
    const membership = store.members.get(uid);
    return {
      organizationStatus: store.organization.status,
      membership: membership ? structuredClone(membership) : null,
    };
  }

  async createInvite(
    orgId: string,
    invite: {
      tokenHash: string;
      role: "admin" | "member" | "viewer";
      expiresAt: string;
      createdBy: string;
    },
    actor: ActorConstraint,
    audit: AuditWrite,
  ): Promise<{ inviteId: string }> {
    const store = this.store(orgId);
    if (!store) throw new ConstraintViolation();
    this.requireActor(store, actor);

    const timestamp = this.now().toISOString();
    const record: OrganizationInvite = {
      id: randomUUID(),
      tokenHash: invite.tokenHash,
      role: invite.role,
      status: "pending",
      expiresAt: invite.expiresAt,
      createdBy: invite.createdBy,
      acceptedBy: null,
      createdAt: timestamp,
      acceptedAt: null,
      schemaVersion: 1,
    };
    store.invites.set(record.id, record);
    this.appendAudit(store, actor.uid, audit);
    return { inviteId: record.id };
  }

  async getInvite(orgId: string, inviteId: string): Promise<OrganizationInvite | null> {
    const invite = this.store(orgId)?.invites.get(inviteId);
    return invite ? structuredClone(invite) : null;
  }

  async listInvites(orgId: string, limit: number): Promise<OrganizationInvite[]> {
    const store = this.store(orgId);
    if (!store) return [];
    return [...store.invites.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((invite) => structuredClone(invite));
  }

  async revokeInvite(
    orgId: string,
    inviteId: string,
    actor: ActorConstraint,
    audit: AuditWrite,
  ): Promise<boolean> {
    const store = this.store(orgId);
    if (!store) throw new ConstraintViolation();
    this.requireActor(store, actor);
    const invite = store.invites.get(inviteId);
    if (!invite || invite.status !== "pending") return false;
    invite.status = "revoked";
    this.appendAudit(store, actor.uid, audit);
    return true;
  }

  // The complete acceptance decision happens atomically against current state, so two
  // simultaneous acceptances can never both consume the same invitation.
  async acceptInvite(params: {
    orgId: string;
    inviteId: string;
    uid: string;
    tokenHash: string;
    nowIso: string;
    requestId: string;
  }): Promise<AcceptInviteResult> {
    const store = this.store(params.orgId);
    if (!store || store.organization.status !== "active") return { status: "invalid" };

    const existing = store.members.get(params.uid);
    const invite = store.invites.get(params.inviteId);
    if (!invite || invite.tokenHash !== params.tokenHash) return { status: "invalid" };

    // A retry from the same account after a successful acceptance stays successful.
    if (invite.status === "accepted" && invite.acceptedBy === params.uid && existing) {
      return {
        status: "already-member",
        role: existing.role,
        organizationName: store.organization.name,
      };
    }
    if (invite.status !== "pending" || invite.expiresAt <= params.nowIso) {
      return { status: "invalid" };
    }
    if (existing) {
      return {
        status: "already-member",
        role: existing.role,
        organizationName: store.organization.name,
      };
    }
    if (store.organization.memberCount >= MAX_ORGANIZATION_MEMBERS) {
      return { status: "full" };
    }

    const membership: OrganizationMembership = {
      uid: params.uid,
      orgId: params.orgId,
      role: invite.role,
      status: "active",
      invitedBy: invite.createdBy,
      joinedAt: params.nowIso,
      updatedAt: params.nowIso,
      schemaVersion: 1,
    };
    store.members.set(params.uid, membership);
    this.syncEdge(store, membership);
    store.organization.memberCount += 1;
    store.organization.updatedAt = params.nowIso;
    invite.status = "accepted";
    invite.acceptedBy = params.uid;
    invite.acceptedAt = params.nowIso;
    this.appendAudit(store, params.uid, {
      eventType: "invite.accepted",
      targetType: "membership",
      targetId: params.uid,
      changes: [{ field: "role", from: null, to: invite.role }],
      requestId: params.requestId,
    });
    return { status: "accepted", role: invite.role, organizationName: store.organization.name };
  }

  async listAuditEvents(orgId: string, limit: number): Promise<AuditEvent[]> {
    const store = this.store(orgId);
    if (!store) return [];
    return store.audit.slice(0, limit).map((event) => structuredClone(event));
  }

  async getEodSettings(orgId: string): Promise<OrganizationEodSettings | null> {
    const store = this.store(orgId);
    return store?.eodSettings ? structuredClone(store.eodSettings) : null;
  }

  async setEodSettings(
    orgId: string,
    input: OrganizationEodSettingsInput,
    actor: ActorConstraint,
  ): Promise<OrganizationEodSettings> {
    const store = this.store(orgId);
    if (!store) throw new ConstraintViolation();
    this.requireActor(store, actor);
    const settings: OrganizationEodSettings = {
      ...structuredClone(input),
      updatedBy: actor.uid,
      updatedAt: this.now().toISOString(),
    };
    store.eodSettings = settings;
    return structuredClone(settings);
  }

  async getEodStatus(orgId: string, uid: string, localDate: string): Promise<OrganizationEodStatus | null> {
    const store = this.store(orgId);
    const status = store?.eodStatus.get(`${uid}_${localDate}`);
    return status ? structuredClone(status) : null;
  }

  async countEodSubmissions(orgId: string, localDate: string): Promise<number> {
    const store = this.store(orgId);
    if (!store) return 0;
    return [...store.eodStatus.values()].filter(
      (status) => status.localDate === localDate && status.submittedSessionId !== null,
    ).length;
  }

  async setEodStatus(
    orgId: string,
    uid: string,
    localDate: string,
    changes: { dismissed?: boolean; submittedSessionId?: string | null },
    actor: ActorConstraint,
  ): Promise<OrganizationEodStatus> {
    const store = this.store(orgId);
    if (!store) throw new ConstraintViolation();
    this.requireActor(store, actor);
    if (actor.uid !== uid) throw new ConstraintViolation();
    const key = `${uid}_${localDate}`;
    const current = store.eodStatus.get(key);
    const status: OrganizationEodStatus = {
      uid,
      localDate,
      dismissed: changes.dismissed ?? current?.dismissed ?? false,
      submittedSessionId:
        changes.submittedSessionId !== undefined
          ? changes.submittedSessionId
          : current?.submittedSessionId ?? null,
      updatedAt: this.now().toISOString(),
    };
    store.eodStatus.set(key, status);
    return structuredClone(status);
  }
}
