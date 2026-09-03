import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import type { AuditEvent, PlatformUser } from "../../shared/schemas.js";
import { decodeCursorStrict, encodeCursor } from "../lib/cursor.js";
import type {
  AdminAuditPageResult,
  AdminAuditWrite,
  AdminMutation,
  PlatformIdentity,
  PlatformUserFilters,
  PlatformUserPage,
  PlatformUserRepository,
} from "./platform-user-repository.js";

type StoredPlatformUser = {
  email: string | null;
  displayName: string | null;
  providerIds: string[];
  emailVerified: boolean;
  platformRole: "user" | "super_admin";
  status: "active" | "suspended";
  firstSeenAt: Timestamp;
  lastSeenAt: Timestamp;
  lastSeenWriteAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  schemaVersion: 1;
};

const ALREADY_EXISTS = 6;

function toIso(value: Timestamp | undefined): string {
  return value ? value.toDate().toISOString() : new Date(0).toISOString();
}

export function mapPlatformUser(uid: string, stored: StoredPlatformUser): PlatformUser {
  return {
    uid,
    email: stored.email ?? null,
    displayName: stored.displayName ?? null,
    providerIds: stored.providerIds ?? [],
    emailVerified: stored.emailVerified === true,
    platformRole: stored.platformRole === "super_admin" ? "super_admin" : "user",
    status: stored.status === "suspended" ? "suspended" : "active",
    firstSeenAt: toIso(stored.firstSeenAt),
    lastSeenAt: toIso(stored.lastSeenAt),
    lastSeenWriteAt: toIso(stored.lastSeenWriteAt),
    createdAt: toIso(stored.createdAt),
    updatedAt: toIso(stored.updatedAt),
    schemaVersion: 1,
  };
}

export class FirestorePlatformUserRepository implements PlatformUserRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  private reference(uid: string): DocumentReference {
    return this.firestore.collection("platformUsers").doc(uid);
  }

  async get(uid: string): Promise<PlatformUser | null> {
    const snapshot = await this.reference(uid).get();
    if (!snapshot.exists) return null;
    return mapPlatformUser(uid, snapshot.data() as StoredPlatformUser);
  }

  async getOrCreate(identity: PlatformIdentity): Promise<PlatformUser> {
    const reference = this.reference(identity.uid);
    try {
      await reference.create({
        email: identity.email,
        displayName: identity.displayName,
        providerIds: identity.providerId ? [identity.providerId] : [],
        emailVerified: identity.emailVerified,
        platformRole: "user",
        status: "active",
        firstSeenAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
        lastSeenWriteAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
    }

    const created = await this.get(identity.uid);
    if (!created) throw new Error("Platform user creation failed");
    return created;
  }

  async refreshIdentity(uid: string, identity: PlatformIdentity): Promise<PlatformUser> {
    await this.reference(uid).update({
      email: identity.email,
      displayName: identity.displayName,
      emailVerified: identity.emailVerified,
      ...(identity.providerId
        ? { providerIds: FieldValue.arrayUnion(identity.providerId) }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const updated = await this.get(uid);
    if (!updated) throw new Error("Platform user does not exist");
    return updated;
  }

  async touchLastSeen(uid: string): Promise<PlatformUser> {
    await this.reference(uid).update({
      lastSeenAt: FieldValue.serverTimestamp(),
      lastSeenWriteAt: FieldValue.serverTimestamp(),
    });
    const updated = await this.get(uid);
    if (!updated) throw new Error("Platform user does not exist");
    return updated;
  }

  private controlReference(): DocumentReference {
    return this.firestore.collection("platformControl").doc("access");
  }

  private auditCollection() {
    return this.firestore.collection("platformAdminAudit");
  }

  async list(filters: PlatformUserFilters): Promise<PlatformUserPage> {
    // An exact query short-circuits pagination: it can only ever match a uid or an email.
    if (filters.query) {
      const results = new Map<string, PlatformUser>();
      const byUid = await this.get(filters.query);
      if (byUid) results.set(byUid.uid, byUid);
      const byEmail = await this.firestore
        .collection("platformUsers")
        .where("email", "==", filters.query)
        .limit(5)
        .get();
      for (const document of byEmail.docs) {
        results.set(document.id, mapPlatformUser(document.id, document.data() as never));
      }
      let users = [...results.values()];
      if (filters.role) users = users.filter((user) => user.platformRole === filters.role);
      if (filters.status) users = users.filter((user) => user.status === filters.status);
      return { users, nextCursor: null };
    }

    let query: Query = this.firestore.collection("platformUsers");
    if (filters.role) query = query.where("platformRole", "==", filters.role);
    if (filters.status) query = query.where("status", "==", filters.status);
    query = query.orderBy("lastSeenAt", "desc").orderBy(FieldPath.documentId());

    if (filters.cursor) {
      const decoded = decodeCursorStrict(filters.cursor, ["lastSeenAt", "uid"], ["lastSeenAt"]);
      query = query.startAfter(Timestamp.fromDate(new Date(decoded.lastSeenAt)), decoded.uid);
    }

    const snapshot = await query.limit(filters.limit + 1).get();
    const users = snapshot.docs
      .slice(0, filters.limit)
      .map((document) => mapPlatformUser(document.id, document.data() as never));
    const last = users[users.length - 1];
    const nextCursor =
      snapshot.docs.length > filters.limit && last
        ? encodeCursor({ lastSeenAt: last.lastSeenAt, uid: last.uid })
        : null;
    return { users, nextCursor };
  }

  async countUsers(): Promise<number> {
    const snapshot = await this.firestore.collection("platformUsers").count().get();
    return snapshot.data().count;
  }

  async countActiveSince(sinceIso: string): Promise<number> {
    const snapshot = await this.firestore
      .collection("platformUsers")
      .where("lastSeenAt", ">=", Timestamp.fromDate(new Date(sinceIso)))
      .count()
      .get();
    return snapshot.data().count;
  }

  // Confirms the acting user is still an active super admin at commit time, so a concurrent
  // demotion or suspension always defeats the demoted admin's in-flight mutation.
  private requireActiveSuperAdmin(actor: StoredPlatformUser | undefined): void {
    if (!actor || actor.platformRole !== "super_admin" || actor.status !== "active") {
      throw new Error("ACTOR_NOT_AUTHORIZED");
    }
  }

  async applyAdminMutation(mutation: AdminMutation): Promise<PlatformUser> {
    const targetReference = this.reference(mutation.targetUid);
    const actorReference = this.reference(mutation.audit.actorUid);
    const controlReference = this.controlReference();
    const auditReference = this.auditCollection().doc();
    const now = Timestamp.now();

    await this.firestore.runTransaction(async (transaction) => {
      const [actorSnapshot, controlSnapshot, targetSnapshot] = await Promise.all([
        transaction.get(actorReference),
        transaction.get(controlReference),
        transaction.get(targetReference),
      ]);
      this.requireActiveSuperAdmin(
        actorSnapshot.exists ? (actorSnapshot.data() as StoredPlatformUser) : undefined,
      );
      if (!controlSnapshot.exists) throw new Error("COUNTER_MISSING");
      if (!targetSnapshot.exists) throw new Error("TARGET_NOT_FOUND");

      const control = controlSnapshot.data() as { activeSuperAdminCount?: number };
      const currentCount = control.activeSuperAdminCount;
      if (typeof currentCount !== "number") throw new Error("COUNTER_MISSING");

      const target = targetSnapshot.data() as {
        platformRole: "user" | "super_admin";
        status: "active" | "suspended";
      };

      // Audit values come from the target as read in this transaction; an already-applied change
      // writes nothing rather than recording a misleading no-op transition.
      const auditChanges: AdminAuditWrite["changes"] = [];
      if (
        mutation.changes.platformRole !== undefined &&
        mutation.changes.platformRole !== target.platformRole
      ) {
        auditChanges.push({
          field: "platformRole",
          from: target.platformRole,
          to: mutation.changes.platformRole,
        });
      }
      if (mutation.changes.status !== undefined && mutation.changes.status !== target.status) {
        auditChanges.push({ field: "status", from: target.status, to: mutation.changes.status });
      }
      if (auditChanges.length === 0) return;

      const wasActiveAdmin = target.platformRole === "super_admin" && target.status === "active";
      const nextRole = mutation.changes.platformRole ?? target.platformRole;
      const nextStatus = mutation.changes.status ?? target.status;
      const isActiveAdmin = nextRole === "super_admin" && nextStatus === "active";
      const nextCount = currentCount + (isActiveAdmin ? 1 : 0) - (wasActiveAdmin ? 1 : 0);
      if (nextCount < 1) throw new Error("LAST_SUPER_ADMIN");

      transaction.update(targetReference, {
        platformRole: nextRole,
        status: nextStatus,
        updatedAt: now,
      });
      transaction.update(controlReference, {
        activeSuperAdminCount: nextCount,
        updatedAt: now,
      });
      transaction.create(auditReference, {
        eventType: mutation.audit.eventType,
        actorUid: mutation.audit.actorUid,
        targetType: mutation.audit.targetType,
        targetId: mutation.audit.targetId,
        organizationId: mutation.audit.organizationId,
        changes: auditChanges,
        reason: mutation.audit.reason,
        requestId: mutation.audit.requestId,
        createdAt: now,
        schemaVersion: 1,
      });
    });

    const updated = await this.get(mutation.targetUid);
    if (!updated) throw new Error("TARGET_NOT_FOUND");
    return updated;
  }

  async setOrganizationStatusWithAudit(
    orgId: string,
    status: "active" | "suspended",
    audit: Omit<AdminAuditWrite, "changes">,
  ): Promise<boolean> {
    const organizationReference = this.firestore.collection("organizations").doc(orgId);
    const actorReference = this.reference(audit.actorUid);
    const auditReference = this.auditCollection().doc();
    const now = Timestamp.now();

    return this.firestore.runTransaction(async (transaction) => {
      const [organizationSnapshot, actorSnapshot] = await Promise.all([
        transaction.get(organizationReference),
        transaction.get(actorReference),
      ]);
      this.requireActiveSuperAdmin(
        actorSnapshot.exists ? (actorSnapshot.data() as StoredPlatformUser) : undefined,
      );
      if (!organizationSnapshot.exists) return false;

      const previousStatus = (organizationSnapshot.data() as { status?: string }).status;
      if (previousStatus === status) return true;

      transaction.update(organizationReference, { status, updatedAt: now });
      transaction.create(auditReference, {
        eventType: audit.eventType,
        actorUid: audit.actorUid,
        targetType: audit.targetType,
        targetId: audit.targetId,
        organizationId: audit.organizationId,
        changes: [{ field: "status", from: previousStatus ?? null, to: status }],
        reason: audit.reason,
        requestId: audit.requestId,
        createdAt: now,
        schemaVersion: 1,
      });
      return true;
    });
  }

  async appendAdminAudit(event: AdminAuditWrite): Promise<void> {
    await this.auditCollection().doc().create({
      eventType: event.eventType,
      actorUid: event.actorUid,
      targetType: event.targetType,
      targetId: event.targetId,
      organizationId: event.organizationId,
      changes: event.changes,
      reason: event.reason,
      requestId: event.requestId,
      createdAt: Timestamp.now(),
      schemaVersion: 1,
    });
  }

  async listAdminAudit(cursor: string | null, limit: number): Promise<AdminAuditPageResult> {
    let query: Query = this.auditCollection()
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId());
    if (cursor) {
      const decoded = decodeCursorStrict(cursor, ["createdAt", "id"], ["createdAt"]);
      query = query.startAfter(Timestamp.fromDate(new Date(decoded.createdAt)), decoded.id);
    }
    const snapshot = await query.limit(limit + 1).get();
    const events: AuditEvent[] = snapshot.docs.slice(0, limit).map((document) => {
      const stored = document.data() as Omit<AuditEvent, "id" | "createdAt"> & {
        createdAt: Timestamp;
      };
      return { ...stored, id: document.id, createdAt: stored.createdAt.toDate().toISOString() };
    });
    const last = events[events.length - 1];
    const nextCursor =
      snapshot.docs.length > limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;
    return { events, nextCursor };
  }

  async getActiveSuperAdminCount(): Promise<number | null> {
    const snapshot = await this.controlReference().get();
    if (!snapshot.exists) return null;
    const count = (snapshot.data() as { activeSuperAdminCount?: number }).activeSuperAdminCount;
    return typeof count === "number" ? count : null;
  }

  async initializeAccessControl(activeSuperAdminCount: number): Promise<void> {
    await this.controlReference().set({
      activeSuperAdminCount,
      updatedAt: Timestamp.now(),
      schemaVersion: 1,
    });
  }

  async countActiveSuperAdmins(): Promise<number> {
    const snapshot = await this.firestore
      .collection("platformUsers")
      .where("platformRole", "==", "super_admin")
      .where("status", "==", "active")
      .count()
      .get();
    return snapshot.data().count;
  }

  async bootstrapFirstAdmin(targetUid: string): Promise<{ activeSuperAdminCount: number }> {
    const targetReference = this.reference(targetUid);
    const controlReference = this.controlReference();
    const activeAdminsQuery = this.firestore
      .collection("platformUsers")
      .where("platformRole", "==", "super_admin")
      .where("status", "==", "active")
      .count();
    const now = Timestamp.now();

    return this.firestore.runTransaction(async (transaction) => {
      const targetSnapshot = await transaction.get(targetReference);
      if (!targetSnapshot.exists) throw new Error("TARGET_NOT_FOUND");

      // The counter is derived from an actual count taken in this transaction, never from a
      // possibly stale or missing counter document.
      let countedActive: number;
      try {
        const countSnapshot = await transaction.get(activeAdminsQuery);
        countedActive = countSnapshot.data().count;
      } catch {
        throw new Error("COUNT_UNAVAILABLE");
      }

      const target = targetSnapshot.data() as { platformRole?: string; status?: string };
      const wasActiveAdmin = target.platformRole === "super_admin" && target.status === "active";
      const activeSuperAdminCount = Math.max(1, countedActive + (wasActiveAdmin ? 0 : 1));

      transaction.set(
        targetReference,
        { platformRole: "super_admin", status: "active", updatedAt: now },
        { merge: true },
      );
      transaction.set(controlReference, {
        activeSuperAdminCount,
        updatedAt: now,
        schemaVersion: 1,
      });
      return { activeSuperAdminCount };
    });
  }
}
