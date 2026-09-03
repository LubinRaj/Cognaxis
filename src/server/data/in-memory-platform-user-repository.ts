import { randomUUID } from "node:crypto";
import type { AuditEvent, PlatformUser } from "../../shared/schemas.js";
import { decodeCursorStrict, encodeCursor } from "../lib/cursor.js";
import type { InMemoryOrganizationRepository } from "./in-memory-organization-repository.js";
import type {
  AdminAuditPageResult,
  AdminAuditWrite,
  AdminMutation,
  PlatformIdentity,
  PlatformUserFilters,
  PlatformUserPage,
  PlatformUserRepository,
} from "./platform-user-repository.js";

export class InMemoryPlatformUserRepository implements PlatformUserRepository {
  private readonly users = new Map<string, PlatformUser>();
  private readonly adminAudit: AuditEvent[] = [];
  private activeSuperAdminCount: number | null = null;
  private organizations: InMemoryOrganizationRepository | null = null;

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Links the organization repository so admin organization mutations stay atomic in tests. */
  linkOrganizations(organizations: InMemoryOrganizationRepository): void {
    this.organizations = organizations;
  }

  seed(user: Partial<PlatformUser> & { uid: string }): PlatformUser {
    const timestamp = this.now().toISOString();
    const record: PlatformUser = {
      email: `${user.uid}@example.test`,
      displayName: null,
      providerIds: ["password"],
      emailVerified: true,
      platformRole: "user",
      status: "active",
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      lastSeenWriteAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: 1,
      ...user,
    };
    this.users.set(record.uid, record);
    return structuredClone(record);
  }

  async get(uid: string): Promise<PlatformUser | null> {
    const user = this.users.get(uid);
    return user ? structuredClone(user) : null;
  }

  async getOrCreate(identity: PlatformIdentity): Promise<PlatformUser> {
    const existing = this.users.get(identity.uid);
    if (existing) return structuredClone(existing);

    const timestamp = this.now().toISOString();
    const record: PlatformUser = {
      uid: identity.uid,
      email: identity.email,
      displayName: identity.displayName,
      providerIds: identity.providerId ? [identity.providerId] : [],
      emailVerified: identity.emailVerified,
      platformRole: "user",
      status: "active",
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      lastSeenWriteAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      schemaVersion: 1,
    };
    this.users.set(identity.uid, record);
    return structuredClone(record);
  }

  async refreshIdentity(uid: string, identity: PlatformIdentity): Promise<PlatformUser> {
    const user = this.require(uid);
    user.email = identity.email;
    user.displayName = identity.displayName;
    user.emailVerified = identity.emailVerified;
    if (identity.providerId && !user.providerIds.includes(identity.providerId)) {
      user.providerIds = [...user.providerIds, identity.providerId];
    }
    user.updatedAt = this.now().toISOString();
    return structuredClone(user);
  }

  async touchLastSeen(uid: string): Promise<PlatformUser> {
    const user = this.require(uid);
    const timestamp = this.now().toISOString();
    user.lastSeenAt = timestamp;
    user.lastSeenWriteAt = timestamp;
    return structuredClone(user);
  }

  private require(uid: string): PlatformUser {
    const user = this.users.get(uid);
    if (!user) throw new Error("Platform user does not exist");
    return user;
  }

  async list(filters: PlatformUserFilters): Promise<PlatformUserPage> {
    let users = [...this.users.values()];

    if (filters.query) {
      users = users.filter(
        (user) => user.uid === filters.query || user.email === filters.query,
      );
    }
    if (filters.role) users = users.filter((user) => user.platformRole === filters.role);
    if (filters.status) users = users.filter((user) => user.status === filters.status);

    users.sort(
      (a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.uid.localeCompare(b.uid),
    );

    if (filters.cursor) {
      const decoded = decodeCursorStrict(filters.cursor, ["lastSeenAt", "uid"], ["lastSeenAt"]);
      users = users.filter(
        (user) =>
          user.lastSeenAt < decoded.lastSeenAt ||
          (user.lastSeenAt === decoded.lastSeenAt && user.uid > decoded.uid),
      );
    }

    const page = users.slice(0, filters.limit).map((user) => structuredClone(user));
    const last = page[page.length - 1];
    const nextCursor =
      users.length > filters.limit && last
        ? encodeCursor({ lastSeenAt: last.lastSeenAt, uid: last.uid })
        : null;
    return { users: page, nextCursor };
  }

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async countActiveSince(sinceIso: string): Promise<number> {
    return [...this.users.values()].filter((user) => user.lastSeenAt >= sinceIso).length;
  }

  private requireActiveSuperAdmin(actorUid: string): void {
    const actor = this.users.get(actorUid);
    if (!actor || actor.platformRole !== "super_admin" || actor.status !== "active") {
      throw new Error("ACTOR_NOT_AUTHORIZED");
    }
  }

  async applyAdminMutation(mutation: AdminMutation): Promise<PlatformUser> {
    this.requireActiveSuperAdmin(mutation.audit.actorUid);
    if (this.activeSuperAdminCount === null) throw new Error("COUNTER_MISSING");
    const target = this.users.get(mutation.targetUid);
    if (!target) throw new Error("TARGET_NOT_FOUND");

    const auditChanges: AuditEvent["changes"] = [];
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
    if (auditChanges.length === 0) return structuredClone(target);

    const wasActiveAdmin = target.platformRole === "super_admin" && target.status === "active";
    const nextRole = mutation.changes.platformRole ?? target.platformRole;
    const nextStatus = mutation.changes.status ?? target.status;
    const isActiveAdmin = nextRole === "super_admin" && nextStatus === "active";
    const nextCount =
      this.activeSuperAdminCount + (isActiveAdmin ? 1 : 0) - (wasActiveAdmin ? 1 : 0);
    if (nextCount < 1) throw new Error("LAST_SUPER_ADMIN");

    target.platformRole = nextRole;
    target.status = nextStatus;
    target.updatedAt = this.now().toISOString();
    this.activeSuperAdminCount = nextCount;
    await this.appendAdminAudit({ ...mutation.audit, changes: auditChanges });
    return structuredClone(target);
  }

  async setOrganizationStatusWithAudit(
    orgId: string,
    status: "active" | "suspended",
    audit: Omit<AdminAuditWrite, "changes">,
  ): Promise<boolean> {
    this.requireActiveSuperAdmin(audit.actorUid);
    if (!this.organizations) throw new Error("ORGANIZATION_REPOSITORY_NOT_LINKED");
    const changed = this.organizations.changeStatusSync(orgId, status);
    if (!changed) return false;
    if (changed.previousStatus !== status) {
      await this.appendAdminAudit({
        ...audit,
        changes: [{ field: "status", from: changed.previousStatus, to: status }],
      });
    }
    return true;
  }

  async appendAdminAudit(event: AdminAuditWrite): Promise<void> {
    this.adminAudit.unshift({
      id: randomUUID(),
      eventType: event.eventType,
      actorUid: event.actorUid,
      targetType: event.targetType,
      targetId: event.targetId,
      organizationId: event.organizationId,
      changes: event.changes,
      reason: event.reason,
      requestId: event.requestId,
      createdAt: this.now().toISOString(),
      schemaVersion: 1,
    });
  }

  async listAdminAudit(cursor: string | null, limit: number): Promise<AdminAuditPageResult> {
    let events = this.adminAudit;
    if (cursor) {
      const decoded = decodeCursorStrict(cursor, ["createdAt", "id"], ["createdAt"]);
      events = events.filter(
        (event) =>
          event.createdAt < decoded.createdAt ||
          (event.createdAt === decoded.createdAt && event.id > decoded.id),
      );
    }
    const page = events.slice(0, limit).map((event) => structuredClone(event));
    const last = page[page.length - 1];
    const nextCursor =
      events.length > limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;
    return { events: page, nextCursor };
  }

  async getActiveSuperAdminCount(): Promise<number | null> {
    return this.activeSuperAdminCount;
  }

  async initializeAccessControl(activeSuperAdminCount: number): Promise<void> {
    this.activeSuperAdminCount = activeSuperAdminCount;
  }

  async countActiveSuperAdmins(): Promise<number> {
    return [...this.users.values()].filter(
      (user) => user.platformRole === "super_admin" && user.status === "active",
    ).length;
  }

  async bootstrapFirstAdmin(targetUid: string): Promise<{ activeSuperAdminCount: number }> {
    const target = this.users.get(targetUid);
    if (!target) throw new Error("TARGET_NOT_FOUND");

    target.platformRole = "super_admin";
    target.status = "active";
    target.updatedAt = this.now().toISOString();
    const activeSuperAdminCount = await this.countActiveSuperAdmins();
    this.activeSuperAdminCount = activeSuperAdminCount;
    return { activeSuperAdminCount };
  }
}
