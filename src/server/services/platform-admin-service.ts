import { addDays, localDateOf } from "../../shared/dates.js";
import type {
  AdminAuditPage,
  AdminOverview,
  AdminUserPage,
  Organization,
  PlatformUser,
  UpdateOrganizationStatusInput,
  UpdatePlatformRoleInput,
  UpdatePlatformStatusInput,
} from "../../shared/schemas.js";
import type { OrganizationRepository } from "../data/organization-repository.js";
import type {
  PlatformUserFilters,
  PlatformUserRepository,
} from "../data/platform-user-repository.js";
import type { UsageRepository } from "../data/usage-repository.js";
import { AppError, forbidden, notFound } from "../errors.js";
import { InvalidCursorError } from "../lib/cursor.js";

const invalidCursor = () =>
  new AppError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");

const lastAdminProtected = () =>
  new AppError(
    409,
    "LAST_SUPER_ADMIN",
    "The last active super admin cannot be demoted or suspended.",
  );

const counterMissing = () =>
  new AppError(
    409,
    "ACCESS_CONTROL_UNINITIALIZED",
    "Platform access control has not been bootstrapped.",
  );

const selfTarget = () =>
  new AppError(400, "SELF_TARGET_FORBIDDEN", "You cannot change your own access.");

export class PlatformAdminService {
  constructor(
    private readonly platformUsers: PlatformUserRepository,
    private readonly organizations: OrganizationRepository,
    private readonly usage: UsageRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Every metric is a metadata count. A failed count becomes null so an outage can never be
  // presented as a legitimate zero.
  async overview(): Promise<AdminOverview> {
    const today = localDateOf(this.now(), "UTC");
    const weekAgoIso = new Date(this.now().getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString();

    const [totalUsers, activeUsers, activeOrganizations, usage] = await Promise.all([
      this.platformUsers.countUsers().catch(() => null),
      this.platformUsers.countActiveSince(weekAgoIso).catch(() => null),
      this.organizations.countOrganizations("active").catch(() => null),
      this.usage.listRange(addDays(today, -6), today).catch(() => null),
    ]);

    return {
      totalUsers,
      activeUsersLast7Days: activeUsers,
      activeOrganizations,
      usage: usage ?? [],
    };
  }

  async listUsers(filters: PlatformUserFilters): Promise<AdminUserPage> {
    try {
      return await this.platformUsers.list(filters);
    } catch (error) {
      if (error instanceof InvalidCursorError) throw invalidCursor();
      throw error;
    }
  }

  // Audit from/to values are derived inside the repository transaction from the target's current
  // state, and the acting super admin is re-verified in that same transaction.
  private async mutate(
    actorUid: string,
    targetUid: string,
    changes: { platformRole?: "user" | "super_admin"; status?: "active" | "suspended" },
    eventType: string,
    reason: string,
    requestId: string,
  ): Promise<PlatformUser> {
    if (targetUid === actorUid) throw selfTarget();
    try {
      return await this.platformUsers.applyAdminMutation({
        targetUid,
        changes,
        audit: {
          actorUid,
          eventType,
          targetType: "user",
          targetId: targetUid,
          organizationId: null,
          reason,
          requestId,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ACTOR_NOT_AUTHORIZED") throw forbidden();
      if (error instanceof Error && error.message === "LAST_SUPER_ADMIN") throw lastAdminProtected();
      if (error instanceof Error && error.message === "COUNTER_MISSING") throw counterMissing();
      if (error instanceof Error && error.message === "TARGET_NOT_FOUND") throw notFound();
      throw error;
    }
  }

  async setUserRole(
    actorUid: string,
    targetUid: string,
    input: UpdatePlatformRoleInput,
    requestId: string,
  ): Promise<PlatformUser> {
    return this.mutate(
      actorUid,
      targetUid,
      { platformRole: input.role },
      "platformUser.roleChanged",
      input.reason,
      requestId,
    );
  }

  async setUserStatus(
    actorUid: string,
    targetUid: string,
    input: UpdatePlatformStatusInput,
    requestId: string,
  ): Promise<PlatformUser> {
    return this.mutate(
      actorUid,
      targetUid,
      { status: input.status },
      "platformUser.statusChanged",
      input.reason,
      requestId,
    );
  }

  async listOrganizations(
    status: "active" | "suspended" | undefined,
    limit: number,
  ): Promise<Organization[]> {
    return this.organizations.listOrganizations(limit, status);
  }

  // The status change and its audit event commit in one repository transaction; the returned
  // organization is a fresh read of what that transaction produced.
  async setOrganizationStatus(
    actorUid: string,
    orgId: string,
    input: UpdateOrganizationStatusInput,
    requestId: string,
  ): Promise<Organization> {
    let changed: boolean;
    try {
      changed = await this.platformUsers.setOrganizationStatusWithAudit(orgId, input.status, {
        actorUid,
        eventType: "organization.statusChanged",
        targetType: "organization",
        targetId: orgId,
        organizationId: orgId,
        reason: input.reason,
        requestId,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ACTOR_NOT_AUTHORIZED") throw forbidden();
      throw error;
    }
    if (!changed) throw notFound();

    const updated = await this.organizations.getOrganization(orgId);
    if (!updated) throw notFound();
    return updated;
  }

  async listAudit(cursor: string | null, limit: number): Promise<AdminAuditPage> {
    try {
      return await this.platformUsers.listAdminAudit(cursor, limit);
    } catch (error) {
      if (error instanceof InvalidCursorError) throw invalidCursor();
      throw error;
    }
  }
}
