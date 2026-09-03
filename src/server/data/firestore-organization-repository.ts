import { timingSafeEqual } from "node:crypto";
import {
  Timestamp,
  getFirestore,
  type DocumentReference,
  type Firestore,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";
import type {
  AuditEvent,
  Organization,
  OrganizationInvite,
  OrganizationMembership,
  OrganizationRole,
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

const ALL_ROLES: readonly OrganizationRole[] = ["owner", "admin", "member", "viewer"];

type StoredOrganization = Omit<Organization, "id" | "createdAt" | "updatedAt"> & {
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

type StoredMembership = Omit<OrganizationMembership, "joinedAt" | "updatedAt"> & {
  joinedAt: Timestamp;
  updatedAt: Timestamp;
};

type StoredInvite = Omit<OrganizationInvite, "id" | "createdAt" | "acceptedAt"> & {
  createdAt: Timestamp;
  acceptedAt: Timestamp | null;
};

type StoredEdge = Omit<UserOrganizationEdge, "joinedAt" | "updatedAt"> & {
  joinedAt: Timestamp;
  updatedAt: Timestamp;
};

type StoredAudit = Omit<AuditEvent, "id" | "createdAt"> & { createdAt: Timestamp };

function iso(value: Timestamp): string {
  return value.toDate().toISOString();
}

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function toOrganization(id: string, stored: StoredOrganization): Organization {
  return { ...stored, id, createdAt: iso(stored.createdAt), updatedAt: iso(stored.updatedAt) };
}

function toMembership(stored: StoredMembership): OrganizationMembership {
  return { ...stored, joinedAt: iso(stored.joinedAt), updatedAt: iso(stored.updatedAt) };
}

function toInvite(id: string, stored: StoredInvite): OrganizationInvite {
  return {
    ...stored,
    id,
    createdAt: iso(stored.createdAt),
    acceptedAt: stored.acceptedAt ? iso(stored.acceptedAt) : null,
  };
}

export class FirestoreOrganizationRepository implements OrganizationRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  private orgRef(orgId: string): DocumentReference {
    return this.firestore.collection("organizations").doc(orgId);
  }

  private memberRef(orgId: string, uid: string): DocumentReference {
    return this.orgRef(orgId).collection("members").doc(uid);
  }

  private inviteRef(orgId: string, inviteId: string): DocumentReference {
    return this.orgRef(orgId).collection("invites").doc(inviteId);
  }

  private edgeRef(uid: string, orgId: string): DocumentReference {
    return this.firestore
      .collection("users")
      .doc(uid)
      .collection("organizationMemberships")
      .doc(orgId);
  }

  private auditRef(orgId: string): DocumentReference {
    return this.orgRef(orgId).collection("auditEvents").doc();
  }

  private edgeData(
    organization: { id: string; name: string },
    membership: StoredMembership,
  ): StoredEdge {
    return {
      orgId: organization.id,
      organizationName: organization.name,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt,
      updatedAt: membership.updatedAt,
    };
  }

  private auditData(orgId: string, actorUid: string, audit: AuditWrite, now: Timestamp): StoredAudit {
    return {
      eventType: audit.eventType,
      actorUid,
      targetType: audit.targetType,
      targetId: audit.targetId,
      organizationId: orgId,
      changes: audit.changes,
      reason: null,
      requestId: audit.requestId,
      createdAt: now,
      schemaVersion: 1,
    };
  }

  // Re-reads the actor's membership and the organization inside the running transaction so a
  // just-revoked membership or just-suspended organization can never complete a late write.
  private async requireActor(
    transaction: Transaction,
    orgId: string,
    actor: ActorConstraint,
  ): Promise<{ organization: StoredOrganization; membership: StoredMembership }> {
    const [orgSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(this.orgRef(orgId)),
      transaction.get(this.memberRef(orgId, actor.uid)),
    ]);
    if (!orgSnapshot.exists || !memberSnapshot.exists) throw new Error("ACTOR_NOT_AUTHORIZED");
    const organization = orgSnapshot.data() as StoredOrganization;
    const membership = memberSnapshot.data() as StoredMembership;
    if (
      organization.status !== "active" ||
      membership.status !== "active" ||
      !actor.allowedRoles.includes(membership.role)
    ) {
      throw new Error("ACTOR_NOT_AUTHORIZED");
    }
    return { organization, membership };
  }

  async createWithOwner(input: {
    name: string;
    description: string | null;
    ownerUid: string;
    requestId: string;
  }): Promise<Organization> {
    const orgReference = this.firestore.collection("organizations").doc();
    const now = Timestamp.now();
    const organization: StoredOrganization = {
      name: input.name,
      description: input.description,
      status: "active",
      ownerUid: input.ownerUid,
      memberCount: 1,
      createdBy: input.ownerUid,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    };
    const membership: StoredMembership = {
      uid: input.ownerUid,
      orgId: orgReference.id,
      role: "owner",
      status: "active",
      invitedBy: null,
      joinedAt: now,
      updatedAt: now,
      schemaVersion: 1,
    };

    await this.firestore.runTransaction(async (transaction) => {
      transaction.create(orgReference, organization);
      transaction.create(this.memberRef(orgReference.id, input.ownerUid), membership);
      transaction.create(
        this.edgeRef(input.ownerUid, orgReference.id),
        this.edgeData({ id: orgReference.id, name: input.name }, membership),
      );
      transaction.create(
        this.auditRef(orgReference.id),
        this.auditData(orgReference.id, input.ownerUid, {
          eventType: "organization.created",
          targetType: "organization",
          targetId: orgReference.id,
          changes: [{ field: "name", from: null, to: input.name }],
          requestId: input.requestId,
        }, now),
      );
      return Promise.resolve();
    });

    return toOrganization(orgReference.id, organization);
  }

  async getOrganization(orgId: string): Promise<Organization | null> {
    const snapshot = await this.orgRef(orgId).get();
    if (!snapshot.exists) return null;
    return toOrganization(orgId, snapshot.data() as StoredOrganization);
  }

  async setOrganizationStatus(
    orgId: string,
    status: "active" | "suspended",
  ): Promise<Organization | null> {
    const reference = this.orgRef(orgId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return null;
    await reference.update({ status, updatedAt: Timestamp.now() });
    const updated = await reference.get();
    return toOrganization(orgId, updated.data() as StoredOrganization);
  }

  async listOrganizations(
    limit: number,
    status?: "active" | "suspended",
  ): Promise<Organization[]> {
    let query: Query = this.firestore.collection("organizations");
    if (status) query = query.where("status", "==", status);
    const snapshot = await query.orderBy("createdAt", "desc").limit(limit).get();
    return snapshot.docs.map((document) =>
      toOrganization(document.id, document.data() as StoredOrganization),
    );
  }

  async countOrganizations(status?: "active" | "suspended"): Promise<number> {
    let query: Query = this.firestore.collection("organizations");
    if (status) query = query.where("status", "==", status);
    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  async updateOrganization(
    orgId: string,
    changes: { name?: string; description?: string | null },
    actor: ActorConstraint,
    audit: AuditWrite,
  ): Promise<Organization> {
    const now = Timestamp.now();

    await this.firestore.runTransaction(async (transaction) => {
      await this.requireActor(transaction, orgId, actor);
      const memberSnapshots = await transaction.get(
        this.orgRef(orgId).collection("members").limit(200),
      );

      const update: Record<string, unknown> = { updatedAt: now };
      if (changes.name !== undefined) update.name = changes.name;
      if (changes.description !== undefined) update.description = changes.description;
      transaction.update(this.orgRef(orgId), update);

      if (changes.name !== undefined) {
        for (const memberDocument of memberSnapshots.docs) {
          transaction.update(this.edgeRef(memberDocument.id, orgId), {
            organizationName: changes.name,
            updatedAt: now,
          });
        }
      }
      transaction.create(this.auditRef(orgId), this.auditData(orgId, actor.uid, audit, now));
    });

    const updated = await this.getOrganization(orgId);
    if (!updated) throw new Error("ORGANIZATION_NOT_FOUND");
    return updated;
  }

  async getMembership(orgId: string, uid: string): Promise<OrganizationMembership | null> {
    const snapshot = await this.memberRef(orgId, uid).get();
    if (!snapshot.exists) return null;
    return toMembership(snapshot.data() as StoredMembership);
  }

  async listMembers(orgId: string, limit: number): Promise<OrganizationMembership[]> {
    const snapshot = await this.orgRef(orgId)
      .collection("members")
      .orderBy("joinedAt", "asc")
      .limit(limit)
      .get();
    return snapshot.docs.map((document) => toMembership(document.data() as StoredMembership));
  }

  async listUserEdges(uid: string): Promise<UserOrganizationEdge[]> {
    const snapshot = await this.firestore
      .collection("users")
      .doc(uid)
      .collection("organizationMemberships")
      .orderBy("updatedAt", "desc")
      .limit(50)
      .get();
    return snapshot.docs.map((document) => {
      const stored = document.data() as StoredEdge;
      return { ...stored, joinedAt: iso(stored.joinedAt), updatedAt: iso(stored.updatedAt) };
    });
  }

  // The seniority matrix and the audit values are evaluated by the caller-supplied plan against
  // the memberships read inside this transaction, never against a pre-transaction snapshot.
  async updateMembership(
    orgId: string,
    targetUid: string,
    actorUid: string,
    plan: MembershipMutationPlan,
    audit: Omit<AuditWrite, "changes">,
  ): Promise<OrganizationMembership> {
    const now = Timestamp.now();
    let result: OrganizationMembership | null = null;

    await this.firestore.runTransaction(async (transaction) => {
      const { organization, membership } = await this.requireActor(transaction, orgId, {
        uid: actorUid,
        allowedRoles: ALL_ROLES,
      });
      const targetSnapshot = await transaction.get(this.memberRef(orgId, targetUid));
      if (!targetSnapshot.exists) throw new Error("TARGET_NOT_FOUND");
      const target = targetSnapshot.data() as StoredMembership;

      const decision = plan(toMembership(membership), toMembership(target));
      if (!decision) throw new Error("ACTOR_NOT_AUTHORIZED");
      if (decision.auditChanges.length === 0) {
        result = toMembership(target);
        return;
      }

      const updated: StoredMembership = {
        ...target,
        role: decision.changes.role ?? target.role,
        status: decision.changes.status ?? target.status,
        updatedAt: now,
      };
      transaction.set(this.memberRef(orgId, targetUid), updated);
      transaction.set(
        this.edgeRef(targetUid, orgId),
        this.edgeData({ id: orgId, name: organization.name }, updated),
      );
      transaction.create(
        this.auditRef(orgId),
        this.auditData(orgId, actorUid, { ...audit, changes: decision.auditChanges }, now),
      );
      result = toMembership(updated);
    });

    if (!result) throw new Error("TARGET_NOT_FOUND");
    return result;
  }

  async removeMembership(
    orgId: string,
    targetUid: string,
    actorUid: string,
    plan: MembershipRemovalPlan,
    audit: Omit<AuditWrite, "changes">,
  ): Promise<void> {
    const now = Timestamp.now();

    await this.firestore.runTransaction(async (transaction) => {
      const { organization, membership } = await this.requireActor(transaction, orgId, {
        uid: actorUid,
        allowedRoles: ALL_ROLES,
      });
      const targetSnapshot = await transaction.get(this.memberRef(orgId, targetUid));
      if (!targetSnapshot.exists) throw new Error("TARGET_NOT_FOUND");
      const target = targetSnapshot.data() as StoredMembership;

      const auditChanges = plan(toMembership(membership), toMembership(target));
      if (!auditChanges) throw new Error("ACTOR_NOT_AUTHORIZED");

      transaction.delete(this.memberRef(orgId, targetUid));
      transaction.delete(this.edgeRef(targetUid, orgId));
      transaction.update(this.orgRef(orgId), {
        memberCount: Math.max(0, organization.memberCount - 1),
        updatedAt: now,
      });
      transaction.create(
        this.auditRef(orgId),
        this.auditData(orgId, actorUid, { ...audit, changes: auditChanges }, now),
      );
    });
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
    const reference = this.orgRef(orgId).collection("invites").doc();
    const now = Timestamp.now();
    const stored: StoredInvite = {
      tokenHash: invite.tokenHash,
      role: invite.role,
      status: "pending",
      expiresAt: invite.expiresAt,
      createdBy: invite.createdBy,
      acceptedBy: null,
      createdAt: now,
      acceptedAt: null,
      schemaVersion: 1,
    };

    await this.firestore.runTransaction(async (transaction) => {
      await this.requireActor(transaction, orgId, actor);
      transaction.create(reference, stored);
      transaction.create(
        this.auditRef(orgId),
        this.auditData(orgId, actor.uid, { ...audit, targetId: reference.id }, now),
      );
    });

    return { inviteId: reference.id };
  }

  async getInvite(orgId: string, inviteId: string): Promise<OrganizationInvite | null> {
    const snapshot = await this.inviteRef(orgId, inviteId).get();
    if (!snapshot.exists) return null;
    return toInvite(inviteId, snapshot.data() as StoredInvite);
  }

  async listInvites(orgId: string, limit: number): Promise<OrganizationInvite[]> {
    const snapshot = await this.orgRef(orgId)
      .collection("invites")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return snapshot.docs.map((document) =>
      toInvite(document.id, document.data() as StoredInvite),
    );
  }

  async revokeInvite(
    orgId: string,
    inviteId: string,
    actor: ActorConstraint,
    audit: AuditWrite,
  ): Promise<boolean> {
    const now = Timestamp.now();
    let revoked = false;

    await this.firestore.runTransaction(async (transaction) => {
      await this.requireActor(transaction, orgId, actor);
      const snapshot = await transaction.get(this.inviteRef(orgId, inviteId));
      if (!snapshot.exists || (snapshot.data() as StoredInvite).status !== "pending") {
        revoked = false;
        return;
      }
      transaction.update(this.inviteRef(orgId, inviteId), { status: "revoked" });
      transaction.create(this.auditRef(orgId), this.auditData(orgId, actor.uid, audit, now));
      revoked = true;
    });

    return revoked;
  }

  // The complete acceptance decision is made inside one transaction against the current state of
  // the organization, the invitation, and the accepting user's membership.
  async acceptInvite(params: {
    orgId: string;
    inviteId: string;
    uid: string;
    tokenHash: string;
    nowIso: string;
    requestId: string;
  }): Promise<AcceptInviteResult> {
    const now = Timestamp.now();

    return this.firestore.runTransaction(async (transaction): Promise<AcceptInviteResult> => {
      const [orgSnapshot, inviteSnapshot, memberSnapshot] = await Promise.all([
        transaction.get(this.orgRef(params.orgId)),
        transaction.get(this.inviteRef(params.orgId, params.inviteId)),
        transaction.get(this.memberRef(params.orgId, params.uid)),
      ]);
      if (!orgSnapshot.exists || !inviteSnapshot.exists) return { status: "invalid" };
      const organization = orgSnapshot.data() as StoredOrganization;
      const invite = inviteSnapshot.data() as StoredInvite;
      if (organization.status !== "active" || !hashesMatch(invite.tokenHash, params.tokenHash)) {
        return { status: "invalid" };
      }

      if (memberSnapshot.exists) {
        const existing = memberSnapshot.data() as StoredMembership;
        if (invite.status === "accepted" && invite.acceptedBy === params.uid) {
          return {
            status: "already-member",
            role: existing.role,
            organizationName: organization.name,
          };
        }
        if (invite.status !== "pending" || invite.expiresAt <= params.nowIso) {
          return { status: "invalid" };
        }
        return {
          status: "already-member",
          role: existing.role,
          organizationName: organization.name,
        };
      }

      if (invite.status !== "pending" || invite.expiresAt <= params.nowIso) {
        return { status: "invalid" };
      }
      if (organization.memberCount >= MAX_ORGANIZATION_MEMBERS) {
        return { status: "full" };
      }

      const membership: StoredMembership = {
        uid: params.uid,
        orgId: params.orgId,
        role: invite.role,
        status: "active",
        invitedBy: invite.createdBy,
        joinedAt: now,
        updatedAt: now,
        schemaVersion: 1,
      };
      transaction.create(this.memberRef(params.orgId, params.uid), membership);
      transaction.create(
        this.edgeRef(params.uid, params.orgId),
        this.edgeData({ id: params.orgId, name: organization.name }, membership),
      );
      transaction.update(this.orgRef(params.orgId), {
        memberCount: organization.memberCount + 1,
        updatedAt: now,
      });
      transaction.update(this.inviteRef(params.orgId, params.inviteId), {
        status: "accepted",
        acceptedBy: params.uid,
        acceptedAt: now,
      });
      transaction.create(
        this.auditRef(params.orgId),
        this.auditData(params.orgId, params.uid, {
          eventType: "invite.accepted",
          targetType: "membership",
          targetId: params.uid,
          changes: [{ field: "role", from: null, to: invite.role }],
          requestId: params.requestId,
        }, now),
      );
      return { status: "accepted", role: invite.role, organizationName: organization.name };
    });
  }

  async listAuditEvents(orgId: string, limit: number): Promise<AuditEvent[]> {
    const snapshot = await this.orgRef(orgId)
      .collection("auditEvents")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return snapshot.docs.map((document) => {
      const stored = document.data() as StoredAudit;
      return { ...stored, id: document.id, createdAt: iso(stored.createdAt) };
    });
  }
}
