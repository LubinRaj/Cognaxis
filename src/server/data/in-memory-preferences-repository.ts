import type { Preferences, UpdatePreferencesInput } from "../../shared/schemas.js";
import type { PreferencesRepository } from "./preferences-repository.js";

export class InMemoryPreferencesRepository implements PreferencesRepository {
  private readonly preferences = new Map<string, Preferences>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async get(uid: string): Promise<Preferences | null> {
    const stored = this.preferences.get(uid);
    return stored ? structuredClone(stored) : null;
  }

  async set(uid: string, input: UpdatePreferencesInput): Promise<Preferences> {
    const timestamp = this.now().toISOString();
    const existing = this.preferences.get(uid);
    const record: Preferences = {
      timezone: input.timezone,
      weekStartsOn: input.weekStartsOn,
      insightRangeDays: input.insightRangeDays,
      locationMode: input.locationMode ?? existing?.locationMode ?? "off",
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      schemaVersion: 1,
    };
    this.preferences.set(uid, record);
    return structuredClone(record);
  }
}
