import type { OrganizationRole } from "../../shared/schemas.js";

// The full owner/admin/member/viewer capability matrix from the product specification. Every
// entry is enforced server-side; the interface only mirrors it for presentation.

export type OrganizationAction =
  | "view"
  | "createSession"
  | "sendMessage"
  | "summarize"
  | "deleteOwnSession"
  | "deleteOtherSession"
  | "updateSettings"
  | "viewInvites"
  | "createInvite"
  | "revokeInvite"
  | "manageMembers"
  | "viewAudit";

const MATRIX: Record<OrganizationAction, readonly OrganizationRole[]> = {
  view: ["owner", "admin", "member", "viewer"],
  createSession: ["owner", "admin", "member"],
  sendMessage: ["owner", "admin", "member"],
  summarize: ["owner", "admin", "member"],
  deleteOwnSession: ["owner", "admin", "member"],
  deleteOtherSession: ["owner", "admin"],
  updateSettings: ["owner", "admin"],
  viewInvites: ["owner", "admin"],
  createInvite: ["owner", "admin"],
  revokeInvite: ["owner", "admin"],
  manageMembers: ["owner", "admin"],
  viewAudit: ["owner", "admin"],
};

export function canPerform(role: OrganizationRole, action: OrganizationAction): boolean {
  return MATRIX[action].includes(role);
}

/** The complete role set an action admits, for transactional rechecks at the repository layer. */
export function rolesAllowed(action: OrganizationAction): readonly OrganizationRole[] {
  return MATRIX[action];
}

export type InvitableRole = "admin" | "member" | "viewer";

export function canInviteRole(actorRole: OrganizationRole, offeredRole: InvitableRole): boolean {
  if (offeredRole === "admin") return actorRole === "owner";
  return actorRole === "owner" || actorRole === "admin";
}

// Membership mutations follow strict seniority rules: an admin may govern members and viewers
// only, the owner may also govern admins, and nobody may change the owner or themselves.
export function canChangeMemberRole(
  actorRole: OrganizationRole,
  targetCurrentRole: OrganizationRole,
  newRole: OrganizationRole,
  isSelf: boolean,
): boolean {
  if (isSelf) return false;
  if (targetCurrentRole === "owner" || newRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") {
    return targetCurrentRole !== "admin" && newRole !== "admin";
  }
  return false;
}

export function canChangeMemberStatus(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
  isSelf: boolean,
): boolean {
  if (isSelf) return false;
  if (targetRole === "owner") return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "admin";
  return false;
}

export function canRemoveMember(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
  isSelf: boolean,
): boolean {
  // Leaving is not a separate capability in this release; removal always requires authority
  // over the target, and the owner can never be removed.
  return canChangeMemberStatus(actorRole, targetRole, isSelf);
}

export function canDeleteSession(
  actorRole: OrganizationRole,
  isSessionCreator: boolean,
): boolean {
  if (isSessionCreator) return canPerform(actorRole, "deleteOwnSession");
  return canPerform(actorRole, "deleteOtherSession");
}
