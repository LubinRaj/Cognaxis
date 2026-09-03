import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AuthenticatedPrincipal, TokenVerifier } from "../../src/server/types.js";
import { TestModel, createTestApp, spyOnServerLogs } from "../helpers/test-app.js";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const detailSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string(), memberCount: z.number() }),
  role: z.string(),
  permissions: z.object({ canWrite: z.boolean(), canManageMembers: z.boolean() }),
});

const inviteSchema = z.object({
  invite: z.object({ inviteId: z.string(), secret: z.string(), role: z.string() }),
});

function auth(uid: string) {
  return `Bearer token-${uid}`;
}

async function createOrganization(context: TestApp, uid: string): Promise<string> {
  const response = await request(context.app)
    .post("/api/v1/organizations")
    .set("authorization", auth(uid))
    .send({ name: "Synthetic Org", description: null })
    .expect(201);
  return detailSchema.parse(JSON.parse(response.text)).organization.id;
}

async function invite(
  context: TestApp,
  ownerUid: string,
  orgId: string,
  role: "admin" | "member" | "viewer",
): Promise<{ inviteId: string; secret: string }> {
  const response = await request(context.app)
    .post(`/api/v1/organizations/${orgId}/invites`)
    .set("authorization", auth(ownerUid))
    .send({ role })
    .expect(201);
  const parsed = inviteSchema.parse(JSON.parse(response.text));
  return { inviteId: parsed.invite.inviteId, secret: parsed.invite.secret };
}

async function join(context: TestApp, uid: string, orgId: string, created: { inviteId: string; secret: string }) {
  await request(context.app)
    .post(`/api/v1/organizations/${orgId}/invites/${created.inviteId}/accept`)
    .set("authorization", auth(uid))
    .send({ secret: created.secret })
    .expect(200);
}

describe("organization API", () => {
  let context: TestApp;
  let model: TestModel;

  beforeEach(async () => {
    model = new TestModel();
    context = await createTestApp({ model });
    spyOnServerLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the full collaboration journey across owner, member, and viewer", async () => {
    const orgId = await createOrganization(context, "user_owner");

    const memberInvite = await invite(context, "user_owner", orgId, "member");
    await join(context, "user_member", orgId, memberInvite);
    const viewerInvite = await invite(context, "user_owner", orgId, "viewer");
    await join(context, "user_viewer", orgId, viewerInvite);

    // The member starts a shared conversation with a real model exchange.
    const sessionResponse = await request(context.app)
      .post(`/api/v1/organizations/${orgId}/sessions`)
      .set("authorization", auth("user_member"))
      .send({ title: "Team retro" })
      .expect(201);
    const sessionId = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(JSON.parse(sessionResponse.text)).session.id;

    await request(context.app)
      .post(`/api/v1/organizations/${orgId}/sessions/${sessionId}/messages`)
      .set("authorization", auth("user_member"))
      .send({ requestId: randomUUID(), content: "A shared organization thought." })
      .expect(201);

    // The viewer can read the conversation but cannot write or reach the model.
    const viewerRead = await request(context.app)
      .get(`/api/v1/organizations/${orgId}/sessions/${sessionId}`)
      .set("authorization", auth("user_viewer"))
      .expect(200);
    expect(viewerRead.text).toContain("A shared organization thought.");
    expect(viewerRead.headers["cache-control"]).toBe("private, no-store");

    const modelCalls = model.calls;
    await request(context.app)
      .post(`/api/v1/organizations/${orgId}/sessions/${sessionId}/messages`)
      .set("authorization", auth("user_viewer"))
      .send({ requestId: randomUUID(), content: "Should be rejected." })
      .expect(403);
    await request(context.app)
      .post(`/api/v1/organizations/${orgId}/sessions/${sessionId}/summarize`)
      .set("authorization", auth("user_viewer"))
      .expect(403);
    expect(model.calls).toBe(modelCalls);

    // The owner manages members and settings and reads the audit trail.
    await request(context.app)
      .patch(`/api/v1/organizations/${orgId}/members/user_member`)
      .set("authorization", auth("user_owner"))
      .send({ role: "admin" })
      .expect(200);
    await request(context.app)
      .patch(`/api/v1/organizations/${orgId}`)
      .set("authorization", auth("user_owner"))
      .send({ name: "Renamed Org" })
      .expect(200);
    await request(context.app)
      .delete(`/api/v1/organizations/${orgId}/members/user_viewer`)
      .set("authorization", auth("user_owner"))
      .expect(204);

    const audit = await request(context.app)
      .get(`/api/v1/organizations/${orgId}/audit-events`)
      .set("authorization", auth("user_owner"))
      .expect(200);
    const events = z
      .object({ events: z.array(z.object({ eventType: z.string() })) })
      .parse(JSON.parse(audit.text)).events;
    expect(events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "organization.created",
        "invite.created",
        "invite.accepted",
        "membership.updated",
        "organization.updated",
        "membership.removed",
      ]),
    );
    expect(audit.text).not.toContain("A shared organization thought.");

    // The removed viewer has lost all access.
    await request(context.app)
      .get(`/api/v1/organizations/${orgId}`)
      .set("authorization", auth("user_viewer"))
      .expect(404);
  });

  it("hides foreign organizations behind generic 404s on every route", async () => {
    const orgId = await createOrganization(context, "user_owner");

    const attempts = [
      request(context.app).get(`/api/v1/organizations/${orgId}`),
      request(context.app).get(`/api/v1/organizations/${orgId}/members`),
      request(context.app).get(`/api/v1/organizations/${orgId}/sessions`),
      request(context.app).get(`/api/v1/organizations/${orgId}/audit-events`),
      request(context.app)
        .post(`/api/v1/organizations/${orgId}/sessions`)
        .send({ title: "Nope" }),
      request(context.app)
        .post(`/api/v1/organizations/${orgId}/invites`)
        .send({ role: "member" }),
    ];
    for (const attempt of attempts) {
      const response = await attempt.set("authorization", auth("user_stranger"));
      expect([403, 404]).toContain(response.status);
      expect(response.text).not.toContain("Synthetic Org");
    }
  });

  it("requires recent authentication for sensitive organization mutations", async () => {
    const staleSeconds = Math.floor(Date.now() / 1_000) - 60 * 60;
    class StaleVerifier implements TokenVerifier {
      async verify(token: string): Promise<AuthenticatedPrincipal> {
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
      }
    }
    const stale = await createTestApp({ verifier: new StaleVerifier() });
    const orgId = await createOrganization(stale, "user_owner");

    const sensitiveAttempts = [
      request(stale.app)
        .patch(`/api/v1/organizations/${orgId}`)
        .send({ name: "Renamed" }),
      request(stale.app)
        .post(`/api/v1/organizations/${orgId}/invites`)
        .send({ role: "member" }),
      request(stale.app).delete(`/api/v1/organizations/${orgId}/members/user_x`),
    ];
    for (const attempt of sensitiveAttempts) {
      const response = await attempt.set("authorization", auth("user_owner"));
      expect(response.status).toBe(401);
      expect(response.text).toContain("RECENT_AUTH_REQUIRED");
    }

    // Reads still work with an older token.
    await request(stale.app)
      .get(`/api/v1/organizations/${orgId}`)
      .set("authorization", auth("user_owner"))
      .expect(200);
  });

  it("validates invite secrets and identifiers strictly", async () => {
    const orgId = await createOrganization(context, "user_owner");
    const created = await invite(context, "user_owner", orgId, "member");

    await request(context.app)
      .post(`/api/v1/organizations/${orgId}/invites/${created.inviteId}/accept`)
      .set("authorization", auth("user_member"))
      .send({ secret: "short" })
      .expect(400);
    await request(context.app)
      .post(`/api/v1/organizations/${orgId}/invites/${created.inviteId}/accept`)
      .set("authorization", auth("user_member"))
      .send({ secret: created.secret, extra: true })
      .expect(400);
    await request(context.app)
      .post(`/api/v1/organizations/bad!id/invites/${created.inviteId}/accept`)
      .set("authorization", auth("user_member"))
      .send({ secret: created.secret })
      .expect(400);
  });

  it("previews an invitation without consuming it", async () => {
    const orgId = await createOrganization(context, "user_owner");
    const created = await invite(context, "user_owner", orgId, "viewer");

    const preview = await request(context.app)
      .post(`/api/v1/organizations/${orgId}/invites/${created.inviteId}/preview`)
      .set("authorization", auth("user_new"))
      .send({ secret: created.secret })
      .expect(200);
    expect(JSON.parse(preview.text)).toMatchObject({
      invite: { organizationName: "Synthetic Org", role: "viewer" },
    });

    await join(context, "user_new", orgId, created);
  });

  it("disappears entirely when the organizations feature is disabled", async () => {
    const disabled = await createTestApp({ environment: { FEATURE_ORGANIZATIONS: "false" } });
    await request(disabled.app)
      .get("/api/v1/organizations")
      .set("authorization", auth("user_owner"))
      .expect(404);
    await request(disabled.app)
      .post("/api/v1/organizations")
      .set("authorization", auth("user_owner"))
      .send({ name: "Nope", description: null })
      .expect(404);
  });

  it("rate limits invitation activity so secrets cannot be probed quickly", async () => {
    const orgId = "org_0123456789abcdef";
    const inviteId = "invite_0123456789ab";
    const secret = "a".repeat(43);

    // Ten probes per user consume the invitation budget; the eleventh is refused before any
    // invitation lookup happens.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(context.app)
        .post(`/api/v1/organizations/${orgId}/invites/${inviteId}/preview`)
        .set("authorization", auth("user_prober"))
        .send({ secret })
        .expect(404);
    }
    const limited = await request(context.app)
      .post(`/api/v1/organizations/${orgId}/invites/${inviteId}/preview`)
      .set("authorization", auth("user_prober"))
      .send({ secret })
      .expect(429);
    expect((JSON.parse(limited.text) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
  });
});
