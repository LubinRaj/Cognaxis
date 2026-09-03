// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildJoinLink,
  clearPendingInvite,
  parseJoinLocation,
  readPendingInvite,
  storePendingInvite,
} from "../../src/client/organizations/invite-links.js";

const SECRET = "a".repeat(43);

describe("invitation links", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("puts the secret only in the fragment", () => {
    const link = buildJoinLink("https://cognaxis.test", "org_123", "invite_456", SECRET);
    expect(link).toBe(
      `https://cognaxis.test/join?org=org_123&invite=invite_456#token=${SECRET}`,
    );
    const [request] = link.split("#");
    expect(request).not.toContain(SECRET);
  });

  it("parses a well-formed join location and rejects tampered ones", () => {
    expect(parseJoinLocation("?org=org_123&invite=invite_456", `#token=${SECRET}`)).toEqual({
      orgId: "org_123",
      inviteId: "invite_456",
      secret: SECRET,
    });

    expect(parseJoinLocation("?org=org_123", `#token=${SECRET}`)).toBeNull();
    expect(parseJoinLocation("?org=org_123&invite=invite_456", "#token=short")).toBeNull();
    expect(parseJoinLocation("?org=../etc&invite=invite_456", `#token=${SECRET}`)).toBeNull();
    expect(parseJoinLocation("", "")).toBeNull();
  });

  it("stores a pending invite only while needed", () => {
    storePendingInvite({ orgId: "org_123", inviteId: "invite_456", secret: SECRET });
    expect(readPendingInvite()).toEqual({
      orgId: "org_123",
      inviteId: "invite_456",
      secret: SECRET,
    });
    clearPendingInvite();
    expect(readPendingInvite()).toBeNull();
  });

  it("ignores tampered storage content", () => {
    window.sessionStorage.setItem("cognaxis.pendingInvite", '{"orgId":"x!","secret":"short"}');
    expect(readPendingInvite()).toBeNull();
  });
});
