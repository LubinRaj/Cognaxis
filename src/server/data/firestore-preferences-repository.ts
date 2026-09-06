import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type Firestore,
  type Timestamp,
} from "firebase-admin/firestore";
import type { Preferences, UpdatePreferencesInput } from "../../shared/schemas.js";
import type { PreferencesRepository } from "./preferences-repository.js";

type StoredPreferences = {
  timezone: string;
  weekStartsOn: "monday";
  insightRangeDays: 7 | 30 | 90;
  locationMode?: "off" | "approximate" | "exact";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  schemaVersion: 1;
};

function toIso(value: Timestamp | undefined): string {
  return value ? value.toDate().toISOString() : new Date(0).toISOString();
}

export class FirestorePreferencesRepository implements PreferencesRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  private reference(uid: string): DocumentReference {
    return this.firestore.collection("users").doc(uid).collection("settings").doc("preferences");
  }

  async get(uid: string): Promise<Preferences | null> {
    const snapshot = await this.reference(uid).get();
    if (!snapshot.exists) return null;
    const stored = snapshot.data() as StoredPreferences;
    return {
      timezone: stored.timezone,
      weekStartsOn: "monday",
      insightRangeDays: stored.insightRangeDays,
      locationMode: stored.locationMode ?? "off",
      createdAt: toIso(stored.createdAt),
      updatedAt: toIso(stored.updatedAt),
      schemaVersion: 1,
    };
  }

  async set(uid: string, input: UpdatePreferencesInput): Promise<Preferences> {
    const reference = this.reference(uid);

    await this.firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      transaction.set(reference, {
        timezone: input.timezone,
        weekStartsOn: input.weekStartsOn,
        insightRangeDays: input.insightRangeDays,
        locationMode: input.locationMode ?? "off",
        createdAt: existing.exists
          ? (existing.data() as StoredPreferences).createdAt
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      });
    });

    const saved = await this.get(uid);
    if (!saved) throw new Error("Preferences write failed");
    return saved;
  }
}
