import { randomUUID } from "node:crypto";
import type { PersonalCheckIn, PersonalSignal } from "../../shared/schemas.js";
import type { SignalRepository, SignalWrite } from "./signal-repository.js";

export class InMemorySignalRepository implements SignalRepository {
  private readonly signals = new Map<string, Map<string, PersonalSignal>>();
  private readonly checkIns = new Map<string, Map<string, PersonalCheckIn>>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private forUser(uid: string): Map<string, PersonalSignal> {
    let userSignals = this.signals.get(uid);
    if (!userSignals) {
      userSignals = new Map();
      this.signals.set(uid, userSignals);
    }
    return userSignals;
  }

  private checkInsForUser(uid: string): Map<string, PersonalCheckIn> {
    let userCheckIns = this.checkIns.get(uid);
    if (!userCheckIns) {
      userCheckIns = new Map();
      this.checkIns.set(uid, userCheckIns);
    }
    return userCheckIns;
  }

  private asSignal(checkIn: PersonalCheckIn): PersonalSignal {
    const signal = { ...checkIn, schemaVersion: 1 } as PersonalSignal & {
      id?: string;
      anchorMessageId?: string | null;
    };
    delete signal.id;
    delete signal.anchorMessageId;
    return signal;
  }

  async get(uid: string, sessionId: string): Promise<PersonalSignal | null> {
    const signal = this.forUser(uid).get(sessionId);
    return signal ? structuredClone(signal) : null;
  }

  async upsert(uid: string, sessionId: string, write: SignalWrite): Promise<PersonalSignal> {
    const existing = this.forUser(uid).get(sessionId);
    const timestamp = this.now().toISOString();
    const record: PersonalSignal = {
      sourceSessionId: sessionId,
      moodScore: write.moodScore,
      energyScore: write.energyScore,
      emotions: [...write.emotions],
      note: write.note,
      location: write.location ? { ...write.location } : null,
      localDate: write.localDate,
      timezone: write.timezone,
      capturedAt: existing?.capturedAt ?? timestamp,
      updatedAt: timestamp,
      createdBy: write.createdBy,
      scopeType: "personal",
      scopeId: write.scopeId,
      schemaVersion: 1,
    };
    this.forUser(uid).set(sessionId, record);
    return structuredClone(record);
  }

  async delete(uid: string, sessionId: string): Promise<boolean> {
    return this.forUser(uid).delete(sessionId);
  }

  async createCheckIn(
    uid: string,
    sessionId: string,
    write: SignalWrite,
    anchorMessageId: string | null,
  ): Promise<PersonalCheckIn> {
    const now = this.now().toISOString();
    const checkIn: PersonalCheckIn = {
      id: randomUUID(),
      sourceSessionId: sessionId,
      moodScore: write.moodScore,
      energyScore: write.energyScore,
      emotions: [...write.emotions],
      note: write.note,
      location: write.location ? { ...write.location } : null,
      localDate: write.localDate,
      timezone: write.timezone,
      capturedAt: now,
      updatedAt: now,
      createdBy: write.createdBy,
      scopeType: "personal",
      scopeId: write.scopeId,
      anchorMessageId,
      schemaVersion: 2,
    };
    this.checkInsForUser(uid).set(checkIn.id, checkIn);
    return structuredClone(checkIn);
  }

  async listCheckIns(uid: string, sessionId: string, limit: number): Promise<PersonalCheckIn[]> {
    return [...this.checkInsForUser(uid).values()]
      .filter((checkIn) => checkIn.sourceSessionId === sessionId)
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
      .slice(0, limit)
      .map((checkIn) => structuredClone(checkIn));
  }

  async deleteCheckIn(uid: string, checkInId: string): Promise<boolean> {
    return this.checkInsForUser(uid).delete(checkInId);
  }

  async deleteCheckInsForSession(uid: string, sessionId: string): Promise<void> {
    for (const [id, checkIn] of this.checkInsForUser(uid)) {
      if (checkIn.sourceSessionId === sessionId) this.checkInsForUser(uid).delete(id);
    }
  }

  async listRange(
    uid: string,
    fromLocalDate: string,
    toLocalDate: string,
    limit: number,
  ): Promise<PersonalSignal[]> {
    const legacy = [...this.forUser(uid).values()]
      .filter((signal) => signal.localDate >= fromLocalDate && signal.localDate <= toLocalDate)
      .sort(
        (a, b) =>
          b.localDate.localeCompare(a.localDate) || b.capturedAt.localeCompare(a.capturedAt),
      )
      .map((signal) => structuredClone(signal));
    const events = [...this.checkInsForUser(uid).values()]
      .filter((checkIn) => checkIn.localDate >= fromLocalDate && checkIn.localDate <= toLocalDate)
      .map((checkIn) => this.asSignal(structuredClone(checkIn)));
    return [...legacy, ...events]
      .sort((left, right) => right.localDate.localeCompare(left.localDate) || right.capturedAt.localeCompare(left.capturedAt))
      .slice(0, limit);
  }
}
