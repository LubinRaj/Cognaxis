import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { addDays, localDateOf } from "../../src/shared/dates.js";
import { createTestApp, spyOnServerLogs } from "../helpers/test-app.js";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

// Computed per call so a UTC midnight crossing mid-run cannot desynchronize fixtures from the
// service clock.
const today = () => localDateOf(new Date(), "UTC");
const sessionResponseSchema = z.object({ session: z.object({ id: z.string() }) });

async function seedLocatedReflection(
  context: TestApp,
  uid: string,
  label: string,
): Promise<string> {
  const created = await request(context.app)
    .post("/api/v1/sessions")
    .set("authorization", `Bearer token-${uid}`)
    .send({ title: `Reflection at ${label}` });
  if (created.status !== 201) {
    throw new Error(`session creation failed: ${created.status} ${created.text}`);
  }
  const sessionId = sessionResponseSchema.parse(JSON.parse(created.text)).session.id;

  await request(context.app)
    .put(`/api/v1/sessions/${sessionId}/signals`)
    .set("authorization", `Bearer token-${uid}`)
    .send({
      moodScore: 4,
      energyScore: null,
      emotions: [],
      note: "A private note that must never appear on the map response.",
      location: {
        placeId: null,
        label,
        latitude: 12.9716,
        longitude: 77.5946,
        precision: "approximate",
      },
      localDate: today(),
      timezone: "UTC",
    })
    .expect(200);
  return sessionId;
}

describe("private map points API", () => {
  let context: TestApp;

  beforeEach(async () => {
    context = await createTestApp();
    spyOnServerLogs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns only the owner's located reflections with a minimal projection", async () => {
    const sessionId = await seedLocatedReflection(context, "user_alpha", "Neighborhood park");

    const unlocated = await request(context.app)
      .post("/api/v1/sessions")
      .set("authorization", "Bearer token-user_alpha")
      .send({ title: "No location" })
      .expect(201);
    const unlocatedId = sessionResponseSchema.parse(JSON.parse(unlocated.text)).session.id;

    const response = await request(context.app)
      .get("/api/v1/personal/map-points")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);

    const body = JSON.parse(response.text) as { points: Array<Record<string, unknown>> };
    expect(body.points).toHaveLength(1);
    expect(body.points[0]).toEqual({
      sessionId,
      sessionTitle: "Reflection at Neighborhood park",
      label: "Neighborhood park",
      latitude: 12.97,
      longitude: 77.59,
      precision: "approximate",
      localDate: today(),
      moodScore: 4,
      updatedAt: expect.any(String) as unknown,
    });
    expect(response.text).not.toContain("private note");
    expect(body.points.map((point) => point.sessionId)).not.toContain(unlocatedId);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("never returns another user's points", async () => {
    await seedLocatedReflection(context, "user_alpha", "Alpha place");

    const response = await request(context.app)
      .get("/api/v1/personal/map-points")
      .set("authorization", "Bearer token-user_bravo")
      .expect(200);

    expect(JSON.parse(response.text)).toEqual({ points: [] });
    expect(response.text).not.toContain("Alpha place");
  });

  it("validates ranges and limits strictly", async () => {
    for (const query of [
      "?from=2026-02-30",
      "?to=not-a-date",
      "?limit=0",
      "?limit=201",
      "?from=2026-09-03&to=2026-09-01",
      "?unknown=1",
    ]) {
      await request(context.app)
        .get(`/api/v1/personal/map-points${query}`)
        .set("authorization", "Bearer token-user_alpha")
        .expect(400);
    }
  });

  it("drops the pin as soon as the reflection or its check-in is deleted", async () => {
    const sessionId = await seedLocatedReflection(context, "user_alpha", "Old spot");

    await request(context.app)
      .delete(`/api/v1/sessions/${sessionId}/signals`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(204);

    const afterSignalDelete = await request(context.app)
      .get("/api/v1/personal/map-points")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
    expect(JSON.parse(afterSignalDelete.text)).toEqual({ points: [] });

    const second = await seedLocatedReflection(context, "user_alpha", "Another spot");
    await request(context.app)
      .delete(`/api/v1/sessions/${second}`)
      .set("authorization", "Bearer token-user_alpha")
      .expect(204);

    const afterSessionDelete = await request(context.app)
      .get("/api/v1/personal/map-points")
      .set("authorization", "Bearer token-user_alpha")
      .expect(200);
    expect(JSON.parse(afterSessionDelete.text)).toEqual({ points: [] });
  });

  it("defaults the range to ninety days ending on the user's local today", async () => {
    const uid = "user_alpha";
    // Midway sits at UTC-11, so its local date trails UTC for half of every day; a UTC-derived
    // default range would end on the wrong day for this user.
    const timezone = "Pacific/Midway";
    await request(context.app)
      .put("/api/v1/personal/preferences")
      .set("authorization", `Bearer token-${uid}`)
      .send({ timezone, weekStartsOn: "monday", insightRangeDays: 30 })
      .expect(200);

    const localToday = localDateOf(new Date(), timezone);
    const seed = async (localDate: string) => {
      const created = await request(context.app)
        .post("/api/v1/sessions")
        .set("authorization", `Bearer token-${uid}`)
        .send({ title: `Reflection ${localDate}` });
      if (created.status !== 201) {
        throw new Error(`session creation failed: ${created.status} ${created.text}`);
      }
      const sessionId = sessionResponseSchema.parse(JSON.parse(created.text)).session.id;
      await context.signals.upsert(uid, sessionId, {
        moodScore: 3,
        energyScore: null,
        emotions: [],
        note: null,
        location: {
          placeId: null,
          label: "Somewhere nearby",
          latitude: 12.9716,
          longitude: 77.5946,
          precision: "approximate",
        },
        localDate,
        timezone,
        createdBy: uid,
        scopeId: uid,
      });
      return sessionId;
    };

    const onLocalToday = await seed(localToday);
    const atRangeStart = await seed(addDays(localToday, -89));
    await seed(addDays(localToday, -90));
    await seed(addDays(localToday, 1));

    const response = await request(context.app)
      .get("/api/v1/personal/map-points")
      .set("authorization", `Bearer token-${uid}`)
      .expect(200);
    const body = JSON.parse(response.text) as { points: Array<{ sessionId: string }> };
    expect(body.points.map((point) => point.sessionId).sort()).toEqual(
      [onLocalToday, atRangeStart].sort(),
    );
  });

  it("hides the endpoint when the maps feature is disabled", async () => {
    const disabled = await createTestApp({ environment: { FEATURE_MAPS: "false" } });
    await request(disabled.app)
      .get("/api/v1/personal/map-points")
      .set("authorization", "Bearer token-user_alpha")
      .expect(404);
  });
});
