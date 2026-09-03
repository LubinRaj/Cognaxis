import { describe, expect, it } from "vitest";
import type { OrganizationRole } from "../../src/shared/schemas.js";
import {
  canChangeMemberRole,
  canChangeMemberStatus,
  canDeleteSession,
  canInviteRole,
  canPerform,
  canRemoveMember,
  type OrganizationAction,
} from "../../src/server/authorization/organization-roles.js";

const ROLES: OrganizationRole[] = ["owner", "admin", "member", "viewer"];

describe("organization capability matrix", () => {
  const expectations: Array<[OrganizationAction, Record<OrganizationRole, boolean>]> = [
    ["view", { owner: true, admin: true, member: true, viewer: true }],
    ["createSession", { owner: true, admin: true, member: true, viewer: false }],
    ["sendMessage", { owner: true, admin: true, member: true, viewer: false }],
    ["summarize", { owner: true, admin: true, member: true, viewer: false }],
    ["deleteOwnSession", { owner: true, admin: true, member: true, viewer: false }],
    ["deleteOtherSession", { owner: true, admin: true, member: false, viewer: false }],
    ["updateSettings", { owner: true, admin: true, member: false, viewer: false }],
    ["viewInvites", { owner: true, admin: true, member: false, viewer: false }],
    ["createInvite", { owner: true, admin: true, member: false, viewer: false }],
    ["revokeInvite", { owner: true, admin: true, member: false, viewer: false }],
    ["manageMembers", { owner: true, admin: true, member: false, viewer: false }],
    ["viewAudit", { owner: true, admin: true, member: false, viewer: false }],
  ];

  it("enforces every action for every role", () => {
    for (const [action, byRole] of expectations) {
      for (const role of ROLES) {
        expect(canPerform(role, action), `${role} ${action}`).toBe(byRole[role]);
      }
    }
  });
});

describe("invitation authority", () => {
  it("lets only the owner invite admins", () => {
    expect(canInviteRole("owner", "admin")).toBe(true);
    expect(canInviteRole("admin", "admin")).toBe(false);
    expect(canInviteRole("member", "admin")).toBe(false);
  });

  it("lets owner and admin invite members and viewers", () => {
    for (const offered of ["member", "viewer"] as const) {
      expect(canInviteRole("owner", offered)).toBe(true);
      expect(canInviteRole("admin", offered)).toBe(true);
      expect(canInviteRole("member", offered)).toBe(false);
      expect(canInviteRole("viewer", offered)).toBe(false);
    }
  });
});

describe("membership mutation authority", () => {
  it("never allows self-mutation or touching the owner", () => {
    expect(canChangeMemberRole("owner", "admin", "member", true)).toBe(false);
    expect(canChangeMemberRole("owner", "owner", "member", false)).toBe(false);
    expect(canChangeMemberRole("owner", "member", "owner", false)).toBe(false);
    expect(canChangeMemberStatus("owner", "owner", false)).toBe(false);
    expect(canRemoveMember("admin", "admin", true)).toBe(false);
    expect(canRemoveMember("owner", "owner", false)).toBe(false);
  });

  it("limits admins to members and viewers", () => {
    expect(canChangeMemberRole("admin", "member", "viewer", false)).toBe(true);
    expect(canChangeMemberRole("admin", "viewer", "member", false)).toBe(true);
    expect(canChangeMemberRole("admin", "admin", "member", false)).toBe(false);
    expect(canChangeMemberRole("admin", "member", "admin", false)).toBe(false);
    expect(canRemoveMember("admin", "admin", false)).toBe(false);
    expect(canRemoveMember("admin", "member", false)).toBe(true);
  });

  it("lets the owner promote and demote admins", () => {
    expect(canChangeMemberRole("owner", "member", "admin", false)).toBe(true);
    expect(canChangeMemberRole("owner", "admin", "member", false)).toBe(true);
    expect(canRemoveMember("owner", "admin", false)).toBe(true);
  });

  it("gives members and viewers no membership authority at all", () => {
    for (const actor of ["member", "viewer"] as const) {
      expect(canChangeMemberRole(actor, "viewer", "member", false)).toBe(false);
      expect(canChangeMemberStatus(actor, "viewer", false)).toBe(false);
      expect(canRemoveMember(actor, "viewer", false)).toBe(false);
    }
  });
});

describe("session deletion authority", () => {
  it("lets creators delete their own sessions and admins delete any", () => {
    expect(canDeleteSession("member", true)).toBe(true);
    expect(canDeleteSession("member", false)).toBe(false);
    expect(canDeleteSession("admin", false)).toBe(true);
    expect(canDeleteSession("owner", false)).toBe(true);
    expect(canDeleteSession("viewer", true)).toBe(false);
  });
});
