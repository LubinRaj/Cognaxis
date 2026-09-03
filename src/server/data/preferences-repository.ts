import type { Preferences, UpdatePreferencesInput } from "../../shared/schemas.js";

export const DEFAULT_PREFERENCES: Omit<Preferences, "createdAt" | "updatedAt"> = {
  timezone: "UTC",
  weekStartsOn: "monday",
  insightRangeDays: 7,
  schemaVersion: 1,
};

export interface PreferencesRepository {
  get(uid: string): Promise<Preferences | null>;
  set(uid: string, input: UpdatePreferencesInput): Promise<Preferences>;
}
