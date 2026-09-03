import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { SummaryOutput } from "../../src/shared/schemas.js";
import type { InMemoryJournalRepository } from "../../src/server/data/in-memory-journal-repository.js";
import { TestModel, createTestApp, spyOnServerLogs } from "../helpers/test-app.js";

const sessionDetailSchema = z.object({
  session: z.object({
    id: z.string(),
    title: z.string(),
    messageCount: z.number(),
    summarizedMessageCount: z.number(),
    messages: z.array(z.object({ id: z.string(), role: z.string(), content: z.string() })),
    summary: z
      .object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        themes: z.array(z.string()),
        nextSteps: z.array(z.string()),
        sourceSessionId: z.string(),
      })
      .nullable(),
  }),
});

class TwoThemeModel extends TestModel {
  override async summarize(): Promise<SummaryOutput> {
    return {
      title: "Reflection summary",
      summary: "A synthetic summary containing no private fixture data.",
      themes: ["clarity", "focus"],
      nextSteps: ["Write the next thought.", "Revisit tomorrow."],
    };
  }
}

describe("session detail summary contract", () => {
  let repository: InMemoryJournalRepository;
  let app: Awaited<ReturnType<typeof createTestApp>>["app"];

  beforeEach(async () => {
    ({ app, repository } = await createTestApp({ model: new TwoThemeModel() }));
    spyOnServerLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createSessionFor(uid: string): Promise<string> {
    const created = await request(app)
      .post("/api/v1/sessions")
      .set("authorization", `Bearer token-${uid}`)
      .send({ title: "Reflection" })
      .expect(201);
    return z.object({ session: z.object({ id: z.string() }) }).parse(JSON.parse(created.text))
      .session.id;
  }

  async function addExchange(uid: string, sessionId: string, content: string) {
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/messages`)
      .set("authorization", `Bearer token-${uid}`)
      .send({ requestId: randomUUID(), content })
      .expect(201);
  }

  function detail(text: string) {
    return sessionDetailSchema.parse(JSON.parse(text)).session;
  }

  it("returns a null summary before one has been generated", async () => {
    const sessionId = await createSessionFor("user_alpha");

    const response = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);

    expect(detail(response.text).summary).toBeNull();
  });

  it("returns the owned summary with session detail so it survives reload", async () => {
    const sessionId = await createSessionFor("user_alpha");
    await addExchange("user_alpha", sessionId, "A synthetic private reflection.");

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/summarize`)
      .set("authorization", "Bearer token-user_alpha")
      .send({})
      .expect(200);

    const response = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);

    const session = detail(response.text);
    expect(session.summary).not.toBeNull();
    expect(session.summary?.sourceSessionId).toBe(sessionId);
    expect(session.summary?.themes).toEqual(["clarity", "focus"]);
    expect(session.summary?.nextSteps).toEqual([
      "Write the next thought.",
      "Revisit tomorrow.",
    ]);
  });

  it("reports whether the summary is current through the message counts", async () => {
    const sessionId = await createSessionFor("user_alpha");
    await addExchange("user_alpha", sessionId, "First reflection.");

    await request(app)
      .post(`/api/v1/sessions/${sessionId}/summarize`)
      .set("authorization", "Bearer token-user_alpha")
      .send({})
      .expect(200);

    const current = detail(
      (
        await request(app)
          .get(`/api/v1/sessions/${sessionId}`)
          .set("authorization", "Bearer token-user_alpha")
          .expect(200)
      ).text,
    );
    expect(current.summarizedMessageCount).toBe(current.messageCount);

    await addExchange("user_alpha", sessionId, "A later thought.");

    const stale = detail(
      (
        await request(app)
          .get(`/api/v1/sessions/${sessionId}`)
          .set("authorization", "Bearer token-user_alpha")
          .expect(200)
      ).text,
    );
    expect(stale.summary).not.toBeNull();
    expect(stale.messageCount).toBeGreaterThan(stale.summarizedMessageCount);
  });

  it("never returns another user's summary through a guessed session id", async () => {
    const sessionId = await createSessionFor("user_alpha");
    await addExchange("user_alpha", sessionId, "Private to the first account.");
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/summarize`)
      .set("authorization", "Bearer token-user_alpha")
      .send({})
      .expect(200);

    const response = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", "Bearer token-user_bravo")
      .expect(404);

    expect(response.text).not.toContain("A synthetic summary");
    expect(response.text).not.toContain("clarity");
    expect(response.text).not.toContain(sessionId);
  });

  it("does not let an unverified account read a summary", async () => {
    const sessionId = await createSessionFor("user_alpha");

    const nowSeconds = Math.floor(Date.now() / 1_000);
    const { app: unverifiedApp } = await createTestApp({
      repository,
      verifier: {
        verify: async () => ({
          uid: "user_alpha",
          email: "user_alpha@example.test",
          emailVerified: false,
          signInProvider: "password",
          issuedAt: nowSeconds,
          authTime: nowSeconds,
        }),
      },
    });

    const response = await request(unverifiedApp)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(403);

    const body = z.object({ error: z.object({ code: z.string() }) }).parse(JSON.parse(response.text));
    expect(body.error.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });

  it("removes the summary when the session is deleted", async () => {
    const sessionId = await createSessionFor("user_alpha");
    await addExchange("user_alpha", sessionId, "A synthetic private reflection.");
    await request(app)
      .post(`/api/v1/sessions/${sessionId}/summarize`)
      .set("authorization", "Bearer token-user_alpha")
      .send({})
      .expect(200);

    expect(await repository.getSummary("user_alpha", sessionId)).not.toBeNull();

    await request(app)
      .delete(`/api/v1/sessions/${sessionId}`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(204);

    expect(await repository.getSummary("user_alpha", sessionId)).toBeNull();
    await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(404);
  });

  it("keeps session detail uncacheable", async () => {
    const sessionId = await createSessionFor("user_alpha");

    const response = await request(app)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
});
