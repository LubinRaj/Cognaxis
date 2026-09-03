import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { localDateOf } from "../../src/shared/dates.js";
import { createTestApp, spyOnServerLogs } from "../helpers/test-app.js";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const sessionResponseSchema = z.object({ session: z.object({ id: z.string() }) });
const errorResponseSchema = z.object({ error: z.object({ code: z.string() }) });

// Computed per call so a UTC midnight crossing mid-run cannot desynchronize fixtures from the
// service clock.
const today = () => localDateOf(new Date(), "UTC");

function checkin(overrides: Record<string, unknown> = {}) {
  return {
    moodScore: 4,
    energyScore: 3,
    emotions: ["calm"],
    note: "A synthetic reflection note.",
    location: null,
    localDate: today(),
    timezone: "UTC",
    ...overrides,
  };
}

async function createSession(context: TestApp, uid: string): Promise<string> {
  const response = await request(context.app)
    .post("/api/v1/sessions")
    .set("authorization", `Bearer token-${uid}`)
    .send({ title: "Reflection" });
  if (response.status !== 201) {
    throw new Error(`session creation failed: ${response.status} ${response.text}`);
  }
  return sessionResponseSchema.parse(JSON.parse(response.text)).session.id;
}

describe("personal signals API", () => {
  let context: TestApp;

  beforeEach(async () => {
    context = await createTestApp();
    spyOnServerLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores and returns a check-in for an owned session", async () => {
    const sessionId = await createSession(context, "user_alpha");

    const saved = await request(context.app)
      .put(`/api/v1/sessions/${sessionId}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .send(checkin())
      .expect(200);
    expect(JSON.parse(saved.text)).toMatchObject({
      deleted: false,
      signal: { moodScore: 4, emotions: ["calm"], createdBy: "user_alpha" },
    });

    const read = await request(context.app)
      .get(`/api/v1/sessions/${sessionId}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
    expect(read.headers["cache-control"]).toBe("private, no-store");
    expect(JSON.parse(read.text)).toMatchObject({ signal: { moodScore: 4 } });
  });

  it("returns a null signal for an owned session without one", async () => {
    const sessionId = await createSession(context, "user_alpha");

    const response = await request(context.app)
      .get(`/api/v1/sessions/${sessionId}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
    expect(JSON.parse(response.text)).toEqual({ signal: null });
  });

  it("hides another user's session behind a generic 404 on every method", async () => {
    const sessionId = await createSession(context, "user_alpha");
    await request(context.app)
      .put(`/api/v1/sessions/${sessionId}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .send(checkin())
      .expect(200);

    for (const attempt of [
      request(context.app)
        .get(`/api/v1/sessions/${sessionId}/signals`)
        .set("authorization", "Bearer token-user_bravo"),
      request(context.app)
        .put(`/api/v1/sessions/${sessionId}/signals`)
        .set("authorization", "Bearer token-user_bravo")
        .send(checkin({ moodScore: 1 })),
      request(context.app)
        .delete(`/api/v1/sessions/${sessionId}/signals`)
        .set("authorization", "Bearer token-user_bravo"),
    ]) {
      const response = await attempt;
      expect(response.status).toBe(404);
    }

    expect(await context.signals.get("user_alpha", sessionId)).toMatchObject({ moodScore: 4 });
    expect(await context.signals.get("user_bravo", sessionId)).toBeNull();
  });

  it("rejects server-controlled fields and invalid identifiers", async () => {
    const sessionId = await createSession(context, "user_alpha");

    const spoofed = await request(context.app)
      .put(`/api/v1/sessions/${sessionId}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .send(checkin({ createdBy: "user_bravo" }))
      .expect(400);
    expect(errorResponseSchema.parse(JSON.parse(spoofed.text)).error.code).toBe("INVALID_REQUEST");

    // The error code is asserted so any future failure log identifies exactly which layer
    // answered instead of leaving only a bare status mismatch.
    const traversal = await request(context.app)
      .put("/api/v1/sessions/..%2F..%2Fetc/signals")
      .set("authorization", "Bearer token-user_alpha")
      .send(checkin())
      .expect(400);
    expect(errorResponseSchema.parse(JSON.parse(traversal.text)).error.code).toBe(
      "INVALID_RESOURCE_ID",
    );
  });

  it("treats an all-empty save as removal", async () => {
    const sessionId = await createSession(context, "user_alpha");
    await request(context.app)
      .put(`/api/v1/sessions/${sessionId}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .send(checkin())
      .expect(200);

    const cleared = await request(context.app)
      .put(`/api/v1/sessions/${sessionId}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .send(checkin({ moodScore: null, energyScore: null, emotions: [], note: null }))
      .expect(200);
    expect(JSON.parse(cleared.text)).toEqual({ signal: null, deleted: true });
  });

  it("deletes the signal when its reflection is deleted", async () => {
    const sessionId = await createSession(context, "user_alpha");
    await request(context.app)
      .put(`/api/v1/sessions/${sessionId}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .send(checkin())
      .expect(200);

    await request(context.app)
      .delete(`/api/v1/sessions/${sessionId}`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(204);

    expect(await context.signals.get("user_alpha", sessionId)).toBeNull();
    expect(await context.repository.getSession("user_alpha", sessionId)).toBeNull();
  });
});

describe("personal preferences API", () => {
  let context: TestApp;

  beforeEach(async () => {
    context = await createTestApp();
    spyOnServerLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns safe defaults before anything is saved", async () => {
    const response = await request(context.app)
      .get("/api/v1/personal/preferences")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
    expect(JSON.parse(response.text)).toMatchObject({
      preferences: { timezone: "UTC", weekStartsOn: "monday", insightRangeDays: 7 },
    });
  });

  it("stores validated preferences per user", async () => {
    await request(context.app)
      .put("/api/v1/personal/preferences")
      .set("authorization", "Bearer token-user_alpha")
      .send({ timezone: "Asia/Kolkata", weekStartsOn: "monday", insightRangeDays: 30 })
      .expect(200);

    const alpha = await request(context.app)
      .get("/api/v1/personal/preferences")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
    expect(JSON.parse(alpha.text)).toMatchObject({
      preferences: { timezone: "Asia/Kolkata", insightRangeDays: 30 },
    });

    const bravo = await request(context.app)
      .get("/api/v1/personal/preferences")
      .set("authorization", "Bearer token-user_bravo")
      .expect(200);
    expect(JSON.parse(bravo.text)).toMatchObject({ preferences: { timezone: "UTC" } });
  });

  it("rejects invalid preference documents", async () => {
    for (const body of [
      { timezone: "Mars/Olympus", weekStartsOn: "monday", insightRangeDays: 7 },
      { timezone: "UTC", weekStartsOn: "sunday", insightRangeDays: 7 },
      { timezone: "UTC", weekStartsOn: "monday", insightRangeDays: 14 },
      { timezone: "UTC", weekStartsOn: "monday", insightRangeDays: 7, uid: "user_bravo" },
    ]) {
      await request(context.app)
        .put("/api/v1/personal/preferences")
        .set("authorization", "Bearer token-user_alpha")
        .send(body)
        .expect(400);
    }
  });
});

describe("personal dashboard API", () => {
  let context: TestApp;

  beforeEach(async () => {
    context = await createTestApp();
    spyOnServerLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes deterministic metrics from the caller's own check-ins only", async () => {
    const alphaSession = await createSession(context, "user_alpha");
    await request(context.app)
      .put(`/api/v1/sessions/${alphaSession}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .send(checkin({ moodScore: 5, energyScore: 1 }))
      .expect(200);

    const bravoSession = await createSession(context, "user_bravo");
    await request(context.app)
      .put(`/api/v1/sessions/${bravoSession}/signals`)
      .set("authorization", "Bearer token-user_bravo")
      .send(checkin({ moodScore: 1, energyScore: 5 }))
      .expect(200);

    const response = await request(context.app)
      .get("/api/v1/personal/insights/dashboard?rangeDays=7")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);

    const { dashboard } = JSON.parse(response.text) as {
      dashboard: {
        checkinCount: number;
        reflectionCount: number;
        moodAverage: number;
        energyAverage: number;
        hasEnoughForTrend: boolean;
      };
    };
    expect(dashboard.checkinCount).toBe(1);
    expect(dashboard.reflectionCount).toBe(1);
    expect(dashboard.moodAverage).toBe(5);
    expect(dashboard.energyAverage).toBe(1);
    expect(dashboard.hasEnoughForTrend).toBe(false);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("accepts only the three supported ranges", async () => {
    for (const rangeDays of ["1", "14", "365", "abc", "-7"]) {
      await request(context.app)
        .get(`/api/v1/personal/insights/dashboard?rangeDays=${rangeDays}`)
        .set("authorization", "Bearer token-user_alpha")
        .expect(400);
    }
    await request(context.app)
      .get("/api/v1/personal/insights/dashboard?rangeDays=90")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
  });

  it("answers with a generic 404 when the insights feature is disabled", async () => {
    const disabled = await createTestApp({ environment: { FEATURE_INSIGHTS: "false" } });
    await request(disabled.app)
      .get("/api/v1/personal/insights/dashboard?rangeDays=7")
      .set("authorization", "Bearer token-user_alpha")
      .expect(404);
  });

  it("requires authentication for every personal route", async () => {
    for (const path of [
      "/api/v1/personal/preferences",
      "/api/v1/personal/insights/dashboard?rangeDays=7",
      "/api/v1/sessions/abc123456789/signals",
    ]) {
      await request(context.app).get(path).expect(401);
    }
  });

  it("uses an idempotent request id for message writes before dashboard reads", async () => {
    const sessionId = await createSession(context, "user_alpha");
    const requestId = randomUUID();
    await request(context.app)
      .post(`/api/v1/sessions/${sessionId}/messages`)
      .set("authorization", "Bearer token-user_alpha")
      .send({ requestId, content: "A synthetic private reflection." })
      .expect(201);

    const response = await request(context.app)
      .get("/api/v1/personal/insights/dashboard?rangeDays=7")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
    expect(JSON.parse(response.text)).toHaveProperty("dashboard");
  });
});
