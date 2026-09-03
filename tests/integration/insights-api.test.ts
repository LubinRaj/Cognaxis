import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { localDateOf } from "../../src/shared/dates.js";
import { periodKeyFor } from "../../src/shared/periods.js";
import { TestInsightModel, createTestApp, spyOnServerLogs } from "../helpers/test-app.js";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

// Computed per call so a UTC midnight crossing mid-run cannot desynchronize fixtures.
const today = () => localDateOf(new Date(), "UTC");
const dayKey = () => periodKeyFor("day", today());

const sessionResponseSchema = z.object({ session: z.object({ id: z.string() }) });

async function seedReflection(context: TestApp, uid: string): Promise<string> {
  const created = await request(context.app)
    .post("/api/v1/sessions")
    .set("authorization", `Bearer token-${uid}`)
    .send({ title: "Reflection" });
  if (created.status !== 201) {
    throw new Error(`session creation failed: ${created.status} ${created.text}`);
  }
  const sessionId = sessionResponseSchema.parse(JSON.parse(created.text)).session.id;

  await request(context.app)
    .put(`/api/v1/sessions/${sessionId}/signals`)
    .set("authorization", `Bearer token-${uid}`)
    .send({
      moodScore: 4,
      energyScore: 3,
      emotions: ["calm"],
      note: null,
      location: null,
      localDate: today(),
      timezone: "UTC",
    })
    .expect(200);
  return sessionId;
}

describe("personal insights API", () => {
  let context: TestApp;
  let insightModel: TestInsightModel;

  beforeEach(async () => {
    insightModel = new TestInsightModel();
    context = await createTestApp({ insightModel });
    spyOnServerLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates, reuses, lists, and exposes recent insights on the dashboard", async () => {
    await seedReflection(context, "user_alpha");

    const generated = await request(context.app)
      .post(`/api/v1/personal/insights/day/${dayKey()}/generate`)
      .set("authorization", "Bearer token-user_alpha")
      .send({ requestId: randomUUID() })
      .expect(200);
    expect(JSON.parse(generated.text)).toMatchObject({
      outcome: "generated",
      insight: { periodKey: dayKey(), stale: false },
    });

    const reused = await request(context.app)
      .post(`/api/v1/personal/insights/day/${dayKey()}/generate`)
      .set("authorization", "Bearer token-user_alpha")
      .send({ requestId: randomUUID() })
      .expect(200);
    expect(JSON.parse(reused.text)).toMatchObject({ outcome: "reused" });

    const listed = await request(context.app)
      .get("/api/v1/personal/insights/periods?type=day&limit=5")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
    expect(JSON.parse(listed.text)).toMatchObject({
      insights: [{ periodKey: dayKey() }],
    });

    const dashboard = await request(context.app)
      .get("/api/v1/personal/insights/dashboard?rangeDays=7")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
    const parsed = JSON.parse(dashboard.text) as { recentInsights: Array<{ periodKey: string }> };
    expect(parsed.recentInsights.map((insight) => insight.periodKey)).toContain(dayKey());
  });

  it("keeps every insight private to its owner", async () => {
    await seedReflection(context, "user_alpha");
    await request(context.app)
      .post(`/api/v1/personal/insights/day/${dayKey()}/generate`)
      .set("authorization", "Bearer token-user_alpha")
      .send({ requestId: randomUUID() })
      .expect(200);

    const bravoList = await request(context.app)
      .get("/api/v1/personal/insights/periods?type=day&limit=5")
      .set("authorization", "Bearer token-user_bravo")
      .expect(200);
    expect(JSON.parse(bravoList.text)).toEqual({ insights: [] });

    await request(context.app)
      .delete(`/api/v1/personal/insights/${dayKey()}`)
      .set("authorization", "Bearer token-user_bravo")
      .expect(404);

    expect(await context.insights.get("user_alpha", dayKey())).not.toBeNull();
  });

  it("rejects malformed generation requests before any model call", async () => {
    for (const body of [
      {},
      { requestId: "not-a-uuid" },
      { requestId: randomUUID(), extra: true },
      { requestId: randomUUID(), regenerate: "yes" },
    ]) {
      await request(context.app)
        .post(`/api/v1/personal/insights/day/${dayKey()}/generate`)
        .set("authorization", "Bearer token-user_alpha")
        .send(body)
        .expect(400);
    }

    await request(context.app)
      .post(`/api/v1/personal/insights/month/${dayKey()}/generate`)
      .set("authorization", "Bearer token-user_alpha")
      .send({ requestId: randomUUID() })
      .expect(400);

    expect(insightModel.calls).toBe(0);
  });

  it("applies a tight per-user limit to generation requests", async () => {
    const responses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(context.app)
        .post(`/api/v1/personal/insights/day/${dayKey()}/generate`)
        .set("authorization", "Bearer token-user_alpha")
        .send({ requestId: randomUUID() });
      responses.push(response.status);
    }
    expect(responses[10]).toBe(429);
  });

  it("hides the whole insights module behind its feature flag", async () => {
    const disabled = await createTestApp({ environment: { FEATURE_INSIGHTS: "false" } });
    for (const attempt of [
      request(disabled.app)
        .get("/api/v1/personal/insights/periods?type=day")
        .set("authorization", "Bearer token-user_alpha"),
      request(disabled.app)
        .post(`/api/v1/personal/insights/day/${dayKey()}/generate`)
        .set("authorization", "Bearer token-user_alpha")
        .send({ requestId: randomUUID() }),
      request(disabled.app)
        .delete(`/api/v1/personal/insights/${dayKey()}`)
        .set("authorization", "Bearer token-user_alpha"),
    ]) {
      const response = await attempt;
      expect(response.status).toBe(404);
    }
  });
});
