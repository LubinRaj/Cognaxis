import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/test-app.js";

const auth = (uid: string) => `Bearer token-${uid}`;

async function personalSession(app: Awaited<ReturnType<typeof createTestApp>>["app"], uid: string) {
  const response = await request(app)
    .post("/api/v1/sessions")
    .set("authorization", auth(uid))
    .send({ title: "Attachment test" })
    .expect(201);
  return (JSON.parse(response.text) as { session: { id: string } }).session.id;
}

async function organization(app: Awaited<ReturnType<typeof createTestApp>>["app"]) {
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("authorization", auth("user_owner"))
    .send({ name: "Attachment team", description: null })
    .expect(201);
  const orgId = (JSON.parse(created.text) as { organization: { id: string } }).organization.id;
  const invited = await request(app)
    .post(`/api/v1/organizations/${orgId}/invites`)
    .set("authorization", auth("user_owner"))
    .send({ role: "viewer" })
    .expect(201);
  const invite = (JSON.parse(invited.text) as { invite: { inviteId: string; secret: string } }).invite;
  await request(app)
    .post(`/api/v1/organizations/${orgId}/invites/${invite.inviteId}/accept`)
    .set("authorization", auth("user_viewer"))
    .send({ secret: invite.secret })
    .expect(200);
  const session = await request(app)
    .post(`/api/v1/organizations/${orgId}/sessions`)
    .set("authorization", auth("user_owner"))
    .send({ title: "Shared attachment" })
    .expect(201);
  return {
    orgId,
    sessionId: (JSON.parse(session.text) as { session: { id: string } }).session.id,
  };
}

describe("private attachment isolation", () => {
  it("binds a personal attachment to its owner and source session", async () => {
    const context = await createTestApp();
    const sourceSessionId = await personalSession(context.app, "user_alpha");
    const otherSessionId = await personalSession(context.app, "user_alpha");
    const bytes = Buffer.from("private-image-bytes");
    const uploaded = await request(context.app)
      .post(`/api/v1/sessions/${sourceSessionId}/attachments`)
      .set("authorization", auth("user_alpha"))
      .set("content-type", "image/png")
      .send(bytes)
      .expect(201);
    const attachmentId = (JSON.parse(uploaded.text) as { attachment: { id: string } }).attachment.id;

    const ownRead = await request(context.app)
      .get(`/api/v1/sessions/${sourceSessionId}/attachments/${attachmentId}`)
      .set("authorization", auth("user_alpha"))
      .expect(200);
    expect(Buffer.from(ownRead.body)).toEqual(bytes);
    await request(context.app)
      .get(`/api/v1/sessions/${otherSessionId}/attachments/${attachmentId}`)
      .set("authorization", auth("user_alpha"))
      .expect(404);
    await request(context.app)
      .get(`/api/v1/sessions/${sourceSessionId}/attachments/${attachmentId}`)
      .set("authorization", auth("user_bravo"))
      .expect(404);
  });

  it("shares a team attachment only with active team members and removes it with its source", async () => {
    const context = await createTestApp();
    const { orgId, sessionId } = await organization(context.app);
    const uploaded = await request(context.app)
      .post(`/api/v1/organizations/${orgId}/sessions/${sessionId}/attachments`)
      .set("authorization", auth("user_owner"))
      .set("content-type", "image/webp")
      .send(Buffer.from("shared-image-bytes"))
      .expect(201);
    const attachmentId = (JSON.parse(uploaded.text) as { attachment: { id: string } }).attachment.id;

    await request(context.app)
      .get(`/api/v1/organizations/${orgId}/sessions/${sessionId}/attachments/${attachmentId}`)
      .set("authorization", auth("user_viewer"))
      .expect(200);
    await request(context.app)
      .get(`/api/v1/organizations/${orgId}/sessions/${sessionId}/attachments/${attachmentId}`)
      .set("authorization", auth("user_stranger"))
      .expect(404);

    await request(context.app)
      .delete(`/api/v1/organizations/${orgId}/sessions/${sessionId}`)
      .set("authorization", auth("user_owner"))
      .send({ requestId: randomUUID() })
      .expect(204);
    await expect(
      context.attachments.get({ type: "organization", scopeId: orgId }, sessionId, attachmentId),
    ).resolves.toBeNull();
  });
});
