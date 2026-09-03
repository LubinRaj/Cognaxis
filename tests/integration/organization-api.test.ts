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

  it("keeps personal and organization model contexts fully separate for one user", async () => {
    // The same account writes in both surfaces; each model call must see only its own side.
    const personalCreated = await request(context.app)
      .post("/api/v1/sessions")
      .set("authorization", auth("user_owner"))
      .send({ title: "Personal" })
      .expect(201);
    const personalId = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(JSON.parse(personalCreated.text)).session.id;
    await request(context.app)
      .post(`/api/v1/sessions/${personalId}/messages`)
      .set("authorization", auth("user_owner"))
      .send({ requestId: randomUUID(), content: "Personal-only reflection content." })
      .expect(201);
    const personalContext = JSON.stringify(model.lastMessages);
    expect(personalContext).toContain("Personal-only reflection content.");
    expect(personalContext).not.toContain("Organization-only");

    const orgId = await createOrganization(context, "user_owner");
    const orgSession = await request(context.app)
      .post(`/api/v1/organizations/${orgId}/sessions`)
      .set("authorization", auth("user_owner"))
      .send({})
      .expect(201);
    const orgSessionId = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(JSON.parse(orgSession.text)).session.id;
    await request(context.app)
      .post(`/api/v1/organizations/${orgId}/sessions/${orgSessionId}/messages`)
      .set("authorization", auth("user_owner"))
      .send({ requestId: randomUUID(), content: "Organization-only shared content." })
      .expect(201);
    const organizationContext = JSON.stringify(model.lastMessages);
    expect(organizationContext).toContain("Organization-only shared content.");
    expect(organizationContext).not.toContain("Personal-only");

    // A later personal exchange still carries only personal history.
    await request(context.app)
      .post(`/api/v1/sessions/${personalId}/messages`)
      .set("authorization", auth("user_owner"))
      .send({ requestId: randomUUID(), content: "A personal follow-up." })
      .expect(201);
    const secondPersonalContext = JSON.stringify(model.lastMessages);
    expect(secondPersonalContext).toContain("Personal-only reflection content.");
    expect(secondPersonalContext).not.toContain("Organization-only");
  });

  it("hides an organization from members of a different organization", async () => {
    const confidentialName = "Alpha Confidential Org";
    const created = await request(context.app)
      .post("/api/v1/organizations")
      .set("authorization", auth("user_owner"))
      .send({ name: confidentialName, description: null })
      .expect(201);
    const orgA = detailSchema.parse(JSON.parse(created.text)).organization.id;

    // The probing user is a legitimate member — of a different organization.
    const orgB = await createOrganization(context, "user_other_owner");
    const probeInvite = await invite(context, "user_other_owner", orgB, "member");
    await join(context, "user_probe", orgB, probeInvite);

    const probes = [
      request(context.app).get(`/api/v1/organizations/${orgA}`),
      request(context.app).get(`/api/v1/organizations/${orgA}/members`),
      request(context.app).get(`/api/v1/organizations/${orgA}/invites`),
      request(context.app).get(`/api/v1/organizations/${orgA}/audit-events`),
      request(context.app).get(`/api/v1/organizations/${orgA}/sessions`),
      request(context.app).post(`/api/v1/organizations/${orgA}/sessions`).send({}),
      request(context.app).post(`/api/v1/organizations/${orgA}/invites`).send({ role: "member" }),
    ];
    for (const probe of probes) {
      const response = await probe.set("authorization", auth("user_probe"));
      expect([403, 404], `status for ${response.request.url}: ${response.status}`).toContain(
        response.status,
      );
      expect(response.text).not.toContain(confidentialName);
    }
  });

  it("rejects self-service role or status fields outright", async () => {
    await request(context.app)
      .post("/api/v1/organizations")
      .set("authorization", auth("user_escalator"))
      .send({ name: "Escalation Org", role: "owner" })
      .expect(400);

    const orgId = await createOrganization(context, "user_owner");
    const created = await invite(context, "user_owner", orgId, "viewer");
    await request(context.app)
      .post(`/api/v1/organizations/${orgId}/invites/${created.inviteId}/accept`)
      .set("authorization", auth("user_escalator"))
      .send({ secret: created.secret, role: "admin" })
      .expect(400);
  });

  it("rate limits organization model routes independently of reads", async () => {
    const orgId = await createOrganization(context, "user_owner");
    const sessionResponse = await request(context.app)
      .post(`/api/v1/organizations/${orgId}/sessions`)
      .set("authorization", auth("user_owner"))
      .send({})
      .expect(201);
    const sessionId = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(JSON.parse(sessionResponse.text)).session.id;

    // Twelve model-route requests consume the per-user budget (each fails harmlessly for lack of
    // conversation content); the thirteenth is refused before reaching the handler.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await request(context.app)
        .post(`/api/v1/organizations/${orgId}/sessions/${sessionId}/summarize`)
        .set("authorization", auth("user_owner"))
        .send({})
        .expect(409);
    }
    const limited = await request(context.app)
      .post(`/api/v1/organizations/${orgId}/sessions/${sessionId}/summarize`)
      .set("authorization", auth("user_owner"))
      .send({})
      .expect(429);
    expect(JSON.parse(limited.text)).toMatchObject({ error: { code: "RATE_LIMITED" } });

    await request(context.app)
      .get(`/api/v1/organizations/${orgId}/sessions`)
      .set("authorization", auth("user_owner"))
      .expect(200);
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
