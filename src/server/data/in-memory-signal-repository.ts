import type { PersonalSignal } from "../../shared/schemas.js";
import type { SignalRepository, SignalWrite } from "./signal-repository.js";

export class InMemorySignalRepository implements SignalRepository {
  private readonly signals = new Map<string, Map<string, PersonalSignal>>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private forUser(uid: string): Map<string, PersonalSignal> {
    let userSignals = this.signals.get(uid);
    if (!userSignals) {
      userSignals = new Map();
      this.signals.set(uid, userSignals);
    }
    return userSignals;
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

  async listRange(
    uid: string,
    fromLocalDate: string,
    toLocalDate: string,
    limit: number,
  ): Promise<PersonalSignal[]> {
    return [...this.forUser(uid).values()]
      .filter((signal) => signal.localDate >= fromLocalDate && signal.localDate <= toLocalDate)
      .sort(
        (a, b) =>
          b.localDate.localeCompare(a.localDate) || b.capturedAt.localeCompare(a.capturedAt),
      )
      .slice(0, limit)
      .map((signal) => structuredClone(signal));
  }
}
