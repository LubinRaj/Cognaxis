import type { AuditEvent, PlatformRole, PlatformStatus, PlatformUser } from "../../shared/schemas.js";

export type PlatformIdentity = {
  uid: string;
  email: string | null;
  displayName: string | null;
  providerId: string | null;
  emailVerified: boolean;
};

export type PlatformUserFilters = {
  role?: PlatformRole;
  status?: PlatformStatus;
  /** Exact uid or email to look up directly. */
  query?: string;
  cursor?: string | null;
  limit: number;
};

export type PlatformUserPage = {
  users: PlatformUser[];
  nextCursor: string | null;
};

export type AdminAuditWrite = {
  actorUid: string;
  eventType: string;
  targetType: AuditEvent["targetType"];
  targetId: string;
  organizationId: string | null;
  changes: AuditEvent["changes"];
  reason: string;
  requestId: string;
};

export type AdminMutation = {
  targetUid: string;
  changes: { platformRole?: PlatformRole; status?: PlatformStatus };
  /** Audit changes are derived inside the transaction from the target's current values. */
  audit: Omit<AdminAuditWrite, "changes">;
};

export type AdminAuditPageResult = {
  events: AuditEvent[];
  nextCursor: string | null;
};

export interface PlatformUserRepository {
  get(uid: string): Promise<PlatformUser | null>;
  getOrCreate(identity: PlatformIdentity): Promise<PlatformUser>;
  refreshIdentity(uid: string, identity: PlatformIdentity): Promise<PlatformUser>;
  touchLastSeen(uid: string): Promise<PlatformUser>;

  list(filters: PlatformUserFilters): Promise<PlatformUserPage>;
  countUsers(): Promise<number>;
  countActiveSince(sinceIso: string): Promise<number>;

  /**
   * Applies a role or status change to the target, adjusts the active-super-admin counter, and
   * appends the audit event in one transaction. The acting user is re-read inside the same
   * transaction and must still be an active super admin (ACTOR_NOT_AUTHORIZED). Fails closed
   * when the counter document is absent (COUNTER_MISSING), the change would leave no active
   * super admin (LAST_SUPER_ADMIN), or the target does not exist (TARGET_NOT_FOUND). Audit
   * changes are computed from the target values read inside the transaction; a mutation that
   * changes nothing writes neither the target nor an audit event.
   */
  applyAdminMutation(mutation: AdminMutation): Promise<PlatformUser>;

  /**
   * Atomically changes an organization's status and appends the platform audit event, with the
   * acting user re-verified as an active super admin in the same transaction. Returns false when
   * the organization does not exist; an unchanged status writes nothing.
   */
  setOrganizationStatusWithAudit(
    orgId: string,
    status: "active" | "suspended",
    audit: Omit<AdminAuditWrite, "changes">,
  ): Promise<boolean>;

  appendAdminAudit(event: AdminAuditWrite): Promise<void>;
  listAdminAudit(cursor: string | null, limit: number): Promise<AdminAuditPageResult>;

  getActiveSuperAdminCount(): Promise<number | null>;
  initializeAccessControl(activeSuperAdminCount: number): Promise<void>;
  /** Users whose platform role is super_admin and whose status is active, counted now. */
  countActiveSuperAdmins(): Promise<number>;
  /**
   * Promotes the target to an active super admin and writes the access-control counter from an
   * actual count of active super admins taken in the same transaction, so the counter can never
   * be initialized to zero while an active super admin exists. Throws TARGET_NOT_FOUND when the
   * user record does not exist and COUNT_UNAVAILABLE when the count cannot be established.
   */
  bootstrapFirstAdmin(targetUid: string): Promise<{ activeSuperAdminCount: number }>;
}
