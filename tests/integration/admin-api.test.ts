import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { InMemoryPlatformUserRepository } from "../../src/server/data/in-memory-platform-user-repository.js";
import { createTestApp, spyOnServerLogs } from "../helpers/test-app.js";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const REASON = "Routine operational access review.";

function auth(uid: string) {
  return `Bearer token-${uid}`;
}

async function createAdminApp(): Promise<TestApp> {
  const platformUsers = new InMemoryPlatformUserRepository();
  platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
  platformUsers.seed({ uid: "user_alpha" });
  platformUsers.seed({ uid: "user_bravo" });
  await platformUsers.initializeAccessControl(1);
  return createTestApp({ platformUsers });
}

describe("platform admin API", () => {
  let context: TestApp;

  beforeEach(async () => {
    context = await createAdminApp();
    spyOnServerLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("denies every admin route to an ordinary user", async () => {
    const attempts = [
      request(context.app).get("/api/v1/admin/overview"),
      request(context.app).get("/api/v1/admin/users"),
      request(context.app).get("/api/v1/admin/organizations"),
      request(context.app).get("/api/v1/admin/audit"),
      request(context.app)
        .patch("/api/v1/admin/users/user_bravo/role")
        .send({ role: "super_admin", reason: REASON }),
    ];
    for (const attempt of attempts) {
      const response = await attempt.set("authorization", auth("user_alpha"));
      expect(response.status, `body: ${response.text}`).toBe(403);
    }
  });

  it("denies a suspended super admin", async () => {
    const platformUsers = new InMemoryPlatformUserRepository();
    platformUsers.seed({ uid: "user_root", platformRole: "super_admin", status: "suspended" });
    await platformUsers.initializeAccessControl(0);
    const suspended = await createTestApp({ platformUsers });

    const response = await request(suspended.app)
      .get("/api/v1/admin/overview")
      .set("authorization", auth("user_root"));
    expect(response.status).toBe(403);
  });

  it("shows real metadata counts and never invents zeros for failures", async () => {
    await request(context.app)
      .post("/api/v1/sessions")
      .set("authorization", auth("user_alpha"))
      .send({ title: "Reflection" })
      .expect(201);

    const response = await request(context.app)
      .get("/api/v1/admin/overview")
      .set("authorization", auth("user_root"))
      .expect(200);

    const { overview } = JSON.parse(response.text) as {
      overview: {
        totalUsers: number;
        activeUsersLast7Days: number;
        activeOrganizations: number;
        usage: Array<{ date: string; sessionsCreated: number }>;
      };
    };
    expect(overview.totalUsers).toBe(3);
    expect(overview.activeUsersLast7Days).toBe(3);
    expect(overview.activeOrganizations).toBe(0);
    expect(overview.usage.some((day) => day.sessionsCreated >= 1)).toBe(true);
  });

  it("promotes, demotes, and audits atomically while protecting the last admin", async () => {
    // Promote a second admin.
    await request(context.app)
      .patch("/api/v1/admin/users/user_alpha/role")
      .set("authorization", auth("user_root"))
      .send({ role: "super_admin", reason: REASON })
      .expect(200);
    expect(await context.platformUsers.getActiveSuperAdminCount()).toBe(2);

    // Demote them again.
    await request(context.app)
      .patch("/api/v1/admin/users/user_alpha/role")
      .set("authorization", auth("user_root"))
      .send({ role: "user", reason: REASON })
      .expect(200);
    expect(await context.platformUsers.getActiveSuperAdminCount()).toBe(1);

    // The last active super admin can be neither demoted nor suspended.
    const demote = await request(context.app)
      .patch("/api/v1/admin/users/user_root/role")
      .set("authorization", auth("user_root"))
      .send({ role: "user", reason: REASON });
    expect(demote.status).toBe(400);
    expect(demote.text).toContain("SELF_TARGET_FORBIDDEN");

    const audit = await request(context.app)
      .get("/api/v1/admin/audit")
      .set("authorization", auth("user_root"))
      .expect(200);
    const { events } = JSON.parse(audit.text) as {
      events: Array<{ eventType: string; reason: string }>;
    };
    expect(events.filter((event) => event.eventType === "platformUser.roleChanged")).toHaveLength(2);
    expect(events[0]?.reason).toBe(REASON);
  });

  it("never lets an admin mutate their own access even via status", async () => {
    const response = await request(context.app)
      .patch("/api/v1/admin/users/user_root/status")
      .set("authorization", auth("user_root"))
      .send({ status: "suspended", reason: REASON });
    expect(response.status).toBe(400);
    expect(response.text).toContain("SELF_TARGET_FORBIDDEN");
  });

  it("protects the last active super admin under concurrent demotion", async () => {
    await request(context.app)
      .patch("/api/v1/admin/users/user_alpha/role")
      .set("authorization", auth("user_root"))
      .send({ role: "super_admin", reason: REASON })
      .expect(200);

    // Two admins each demote the other at the same time; exactly one may win.
    const [first, second] = await Promise.all([
      request(context.app)
        .patch("/api/v1/admin/users/user_alpha/role")
        .set("authorization", auth("user_root"))
        .send({ role: "user", reason: REASON }),
      request(context.app)
        .patch("/api/v1/admin/users/user_root/role")
        .set("authorization", auth("user_alpha"))
        .send({ role: "user", reason: REASON }),
    ]);
    // Exactly one demotion may win; the loser is stopped either by the transactional counter
    // (409) or because their own super-admin role was already revoked when their request was
    // authorized (403). Either way one active super admin always remains.
    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    expect(await context.platformUsers.getActiveSuperAdminCount()).toBe(1);
  });

  it("fails closed when the access counter was never bootstrapped", async () => {
    const platformUsers = new InMemoryPlatformUserRepository();
    platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
    platformUsers.seed({ uid: "user_alpha" });
    const uninitialized = await createTestApp({ platformUsers });

    const response = await request(uninitialized.app)
      .patch("/api/v1/admin/users/user_alpha/role")
      .set("authorization", auth("user_root"))
      .send({ role: "super_admin", reason: REASON });
    expect(response.status).toBe(409);
    expect(response.text).toContain("ACCESS_CONTROL_UNINITIALIZED");
  });

  it("suspends a user platform-wide and blocks their access immediately", async () => {
    await request(context.app)
      .patch("/api/v1/admin/users/user_bravo/status")
      .set("authorization", auth("user_root"))
      .send({ status: "suspended", reason: REASON })
      .expect(200);

    const blocked = await request(context.app)
      .get("/api/v1/sessions")
      .set("authorization", auth("user_bravo"));
    expect(blocked.status).toBe(403);
    expect(blocked.text).toContain("ACCOUNT_SUSPENDED");

    await request(context.app)
      .patch("/api/v1/admin/users/user_bravo/status")
      .set("authorization", auth("user_root"))
      .send({ status: "active", reason: REASON })
      .expect(200);
    await request(context.app)
      .get("/api/v1/sessions")
      .set("authorization", auth("user_bravo"))
      .expect(200);
  });

  it("suspends and restores an organization with an audit trail", async () => {
    const created = await request(context.app)
      .post("/api/v1/organizations")
      .set("authorization", auth("user_alpha"))
      .send({ name: "Synthetic Org", description: null })
      .expect(201);
    const orgId = z
      .object({ organization: z.object({ id: z.string() }) })
      .parse(JSON.parse(created.text)).organization.id;

    await request(context.app)
      .patch(`/api/v1/admin/organizations/${orgId}/status`)
      .set("authorization", auth("user_root"))
      .send({ status: "suspended", reason: REASON })
      .expect(200);

    const blocked = await request(context.app)
      .get(`/api/v1/organizations/${orgId}`)
      .set("authorization", auth("user_alpha"));
    expect(blocked.status).toBe(403);
    expect(blocked.text).toContain("ORGANIZATION_SUSPENDED");

    const listed = await request(context.app)
      .get("/api/v1/admin/organizations?status=suspended")
      .set("authorization", auth("user_root"))
      .expect(200);
    expect(listed.text).toContain(orgId);
  });

  it("validates the mandatory operational reason", async () => {
    for (const reason of [undefined, "short", "x".repeat(241)]) {
      const response = await request(context.app)
        .patch("/api/v1/admin/users/user_bravo/status")
        .set("authorization", auth("user_root"))
        .send({ status: "suspended", ...(reason === undefined ? {} : { reason }) });
      expect(response.status).toBe(400);
    }
  });

  it("exposes no personal content through any admin response", async () => {
    const CANARY = "CANARY-PRIVATE-JOURNAL-PHRASE";
    const created = await request(context.app)
      .post("/api/v1/sessions")
      .set("authorization", auth("user_alpha"))
      .send({ title: CANARY })
      .expect(201);
    const sessionId = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(JSON.parse(created.text)).session.id;
    await request(context.app)
      .post(`/api/v1/sessions/${sessionId}/messages`)
      .set("authorization", auth("user_alpha"))
      .send({ requestId: randomUUID(), content: `${CANARY} in a private message.` })
      .expect(201);

    for (const path of [
      "/api/v1/admin/overview",
      "/api/v1/admin/users",
      "/api/v1/admin/organizations",
      "/api/v1/admin/audit",
    ]) {
      const response = await request(context.app)
        .get(path)
        .set("authorization", auth("user_root"))
        .expect(200);
      expect(response.text).not.toContain(CANARY);
      expect(response.text).not.toContain(sessionId);
    }
  });

  it("requires recent authentication for admin mutations", async () => {
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const staleSeconds = nowSeconds - 60 * 60;
    const platformUsers = new InMemoryPlatformUserRepository();
    platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
    platformUsers.seed({ uid: "user_bravo" });
    await platformUsers.initializeAccessControl(1);
    const stale = await createTestApp({
      platformUsers,
      verifier: {
        async verify(token: string) {
          if (!token.startsWith("token-")) throw new Error("invalid");
          const uid = token.slice("token-".length);
          return {
            uid,
            email: `${uid}@example.test`,
            emailVerified: true,
            signInProvider: "password",
            issuedAt: staleSeconds,
            authTime: staleSeconds,
          };
        },
      },
    });

    const response = await request(stale.app)
      .patch("/api/v1/admin/users/user_bravo/status")
      .set("authorization", auth("user_root"))
      .send({ status: "suspended", reason: REASON });
    expect(response.status).toBe(401);
    expect(response.text).toContain("RECENT_AUTH_REQUIRED");

    await request(stale.app)
      .get("/api/v1/admin/overview")
      .set("authorization", auth("user_root"))
      .expect(200);
  });

  it("disappears when the admin feature flag is off", async () => {
    const platformUsers = new InMemoryPlatformUserRepository();
    platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
    await platformUsers.initializeAccessControl(1);
    const disabled = await createTestApp({
      platformUsers,
      environment: { FEATURE_ADMIN: "false" },
    });

    await request(disabled.app)
      .get("/api/v1/admin/overview")
      .set("authorization", auth("user_root"))
      .expect(404);
  });

  it("rejects malformed and bad-date pagination cursors outright", async () => {
    const badDate = Buffer.from(
      JSON.stringify({ lastSeenAt: "not-a-date", uid: "user_alpha" }),
      "utf8",
    ).toString("base64url");
    const badShape = Buffer.from(JSON.stringify({ hacker: true }), "utf8").toString("base64url");
    for (const cursor of [badDate, badShape]) {
      const response = await request(context.app)
        .get("/api/v1/admin/users")
        .query({ cursor })
        .set("authorization", auth("user_root"));
      expect(response.status, `body: ${response.text}`).toBe(400);
      expect((JSON.parse(response.text) as { error: { code: string } }).error.code).toBe("INVALID_CURSOR");
    }

    const badAuditCursor = Buffer.from(
      JSON.stringify({ createdAt: "2026-99-99T00:00:00.000Z", id: "event" }),
      "utf8",
    ).toString("base64url");
    const audit = await request(context.app)
      .get("/api/v1/admin/audit")
      .query({ cursor: badAuditCursor })
      .set("authorization", auth("user_root"));
    expect(audit.status, `body: ${audit.text}`).toBe(400);
    expect((JSON.parse(audit.text) as { error: { code: string } }).error.code).toBe("INVALID_CURSOR");
  });

  it("rejects an invalid mutation target identifier with a client error", async () => {
    const response = await request(context.app)
      .patch("/api/v1/admin/users/%21bad%21/role")
      .set("authorization", auth("user_root"))
      .send({ role: "super_admin", reason: REASON });
    expect(response.status, `body: ${response.text}`).toBe(400);
    expect((JSON.parse(response.text) as { error: { code: string } }).error.code).toBe("INVALID_RESOURCE_ID");
  });

  it("paginates the user directory with opaque cursors and filters", async () => {
    const platformUsers = new InMemoryPlatformUserRepository();
    platformUsers.seed({ uid: "user_root", platformRole: "super_admin" });
    for (let index = 0; index < 5; index += 1) {
      platformUsers.seed({ uid: `user_extra_${index}` });
    }
    await platformUsers.initializeAccessControl(1);
    const paged = await createTestApp({ platformUsers });

    const firstPage = await request(paged.app)
      .get("/api/v1/admin/users?limit=3")
      .set("authorization", auth("user_root"))
      .expect(200);
    const first = JSON.parse(firstPage.text) as {
      users: Array<{ uid: string }>;
      nextCursor: string | null;
    };
    expect(first.users).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();

    const secondPage = await request(paged.app)
      .get(`/api/v1/admin/users?limit=3&cursor=${encodeURIComponent(first.nextCursor ?? "")}`)
      .set("authorization", auth("user_root"))
      .expect(200);
    const second = JSON.parse(secondPage.text) as { users: Array<{ uid: string }> };
    const firstUids = new Set(first.users.map((user) => user.uid));
    expect(second.users.every((user) => !firstUids.has(user.uid))).toBe(true);

    const filtered = await request(paged.app)
      .get("/api/v1/admin/users?role=super_admin")
      .set("authorization", auth("user_root"))
      .expect(200);
    expect(JSON.parse(filtered.text)).toMatchObject({ users: [{ uid: "user_root" }] });

    await request(paged.app)
      .get("/api/v1/admin/users?cursor=%20%20bad!!cursor")
      .set("authorization", auth("user_root"))
      .expect(400);
  });
});
