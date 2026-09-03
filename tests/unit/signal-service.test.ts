import { describe, expect, it } from "vitest";
import type { UpsertSignalInput } from "../../src/shared/schemas.js";
import { InMemoryJournalRepository } from "../../src/server/data/in-memory-journal-repository.js";
import { InMemorySignalRepository } from "../../src/server/data/in-memory-signal-repository.js";
import { SignalService } from "../../src/server/services/signal-service.js";

const NOW = new Date("2026-09-03T10:00:00.000Z");

function input(overrides: Partial<UpsertSignalInput> = {}): UpsertSignalInput {
  return {
    moodScore: 4,
    energyScore: 3,
    emotions: ["calm"],
    note: null,
    location: null,
    localDate: "2026-09-03",
    timezone: "UTC",
    ...overrides,
  };
}

async function createContext() {
  const journal = new InMemoryJournalRepository();
  const signals = new InMemorySignalRepository(() => NOW);
  const service = new SignalService(signals, journal, () => NOW);
  const session = await journal.createSession("user_alpha", "Reflection");
  return { journal, signals, service, sessionId: session.id };
}

describe("SignalService", () => {
  it("creates a signal for an owned session with server-derived provenance", async () => {
    const { service, sessionId } = await createContext();

    const outcome = await service.upsert("user_alpha", sessionId, input());

    expect(outcome.deleted).toBe(false);
    expect(outcome.signal).toMatchObject({
      sourceSessionId: sessionId,
      moodScore: 4,
      energyScore: 3,
      emotions: ["calm"],
      createdBy: "user_alpha",
      scopeType: "personal",
      scopeId: "user_alpha",
    });
  });

  it("refuses to touch a session that belongs to someone else", async () => {
    const { service, sessionId } = await createContext();

    await expect(service.upsert("user_bravo", sessionId, input())).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getForSession("user_bravo", sessionId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.remove("user_bravo", sessionId)).rejects.toMatchObject({ status: 404 });
  });

  it("treats an all-empty update as removal, not an error", async () => {
    const { service, signals, sessionId } = await createContext();
    await service.upsert("user_alpha", sessionId, input());

    const outcome = await service.upsert(
      "user_alpha",
      sessionId,
      input({ moodScore: null, energyScore: null, emotions: [], note: null, location: null }),
    );

    expect(outcome).toEqual({ signal: null, deleted: true });
    expect(await signals.get("user_alpha", sessionId)).toBeNull();
  });

  it("rejects a local date that cannot belong to the supplied timezone today", async () => {
    const { service, sessionId } = await createContext();

    await expect(
      service.upsert("user_alpha", sessionId, input({ localDate: "2026-08-20" })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.upsert("user_alpha", sessionId, input({ localDate: "2026-09-10" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts adjacent local dates in the supplied timezone to tolerate clock skew", async () => {
    const { service, sessionId } = await createContext();

    // At the fixed test instant the local date in Pacific/Kiritimati is 2026-09-04.
    for (const localDate of ["2026-09-03", "2026-09-04", "2026-09-05"]) {
      const outcome = await service.upsert(
        "user_alpha",
        sessionId,
        input({ localDate, timezone: "Pacific/Kiritimati" }),
      );
      expect(outcome.signal?.localDate).toBe(localDate);
    }

    await expect(
      service.upsert(
        "user_alpha",
        sessionId,
        input({ localDate: "2026-09-02", timezone: "Pacific/Kiritimati" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("genuinely reduces precision for an approximate location", async () => {
    const { service, sessionId } = await createContext();

    const outcome = await service.upsert(
      "user_alpha",
      sessionId,
      input({
        location: {
          placeId: null,
          label: "Near the park",
          latitude: 12.971598,
          longitude: 77.594566,
          precision: "approximate",
        },
      }),
    );

    expect(outcome.signal?.location).toMatchObject({ latitude: 12.97, longitude: 77.59 });
  });

  it("stores full precision only when the user explicitly chose exact", async () => {
    const { service, sessionId } = await createContext();

    const outcome = await service.upsert(
      "user_alpha",
      sessionId,
      input({
        location: {
          placeId: null,
          label: "Exact spot",
          latitude: 12.971598,
          longitude: 77.594566,
          precision: "exact",
        },
      }),
    );

    expect(outcome.signal?.location).toMatchObject({
      latitude: 12.971598,
      longitude: 77.594566,
    });
  });

  it("preserves the original capture time across edits", async () => {
    const { service, signals, sessionId } = await createContext();
    await service.upsert("user_alpha", sessionId, input());
    const first = await signals.get("user_alpha", sessionId);

    await service.upsert("user_alpha", sessionId, input({ moodScore: 2 }));
    const second = await signals.get("user_alpha", sessionId);

    expect(second?.capturedAt).toBe(first?.capturedAt);
    expect(second?.moodScore).toBe(2);
  });

  it("removes a signal idempotently", async () => {
    const { service, sessionId } = await createContext();
    await service.upsert("user_alpha", sessionId, input());

    await service.remove("user_alpha", sessionId);
    await expect(service.remove("user_alpha", sessionId)).resolves.toBeUndefined();
    expect(await service.getForSession("user_alpha", sessionId)).toBeNull();
  });
});
