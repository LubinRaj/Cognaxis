import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type {
  PersonalSignal,
  UpsertSignalInput,
  EmotionLabel,
  PersonalSignalLocation,
} from "../../shared/schemas.js";
import type { SignalRepository } from "./signal-repository.js";

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

interface StoredSignalDoc {
  sourceSessionId?: string;
  moodScore?: (1 | 2 | 3 | 4 | 5) | null;
  energyScore?: (1 | 2 | 3 | 4 | 5) | null;
  emotions?: EmotionLabel[];
  note?: string | null;
  location?: PersonalSignalLocation | null;
  localDate?: string;
  timezone?: string;
  capturedAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
  scopeType?: "personal";
  scopeId?: string;
  schemaVersion?: number;
}

export class FirestoreSignalRepository implements SignalRepository {
  private getDb() {
    return getFirestore();
  }

  async getSignal(uid: string, sessionId: string): Promise<PersonalSignal | null> {
    const doc = await this.getDb()
      .collection("users")
      .doc(uid)
      .collection("personalSignals")
      .doc(sessionId)
      .get();

    if (!doc.exists) return null;
    return this.mapSignal(doc);
  }

  async upsertSignal(uid: string, sessionId: string, input: UpsertSignalInput): Promise<PersonalSignal> {
    const db = this.getDb();
    const docRef = db.collection("users").doc(uid).collection("personalSignals").doc(sessionId);

    // If input is effectively empty, delete the signal instead
    if (
      input.moodScore === null &&
      input.energyScore === null &&
      input.emotions.length === 0 &&
      !input.note &&
      input.location === null
    ) {
      await docRef.delete();
      throw new Error("Empty signal upsert results in deletion. Use deleteSignal directly if intentional.");
    }

    const now = FieldValue.serverTimestamp();
    const data = {
      sourceSessionId: sessionId,
      moodScore: input.moodScore,
      energyScore: input.energyScore,
      emotions: input.emotions,
      note: input.note || null,
      location: input.location,
      localDate: input.localDate,
      timezone: input.timezone,
      updatedAt: now,
      createdBy: uid,
      scopeType: "personal",
      scopeId: uid,
      schemaVersion: 1,
    };

    const doc = await docRef.get();
    if (doc.exists) {
      await docRef.update(data);
    } else {
      await docRef.set({ ...data, capturedAt: now });
    }

    const updated = await docRef.get();
    return this.mapSignal(updated);
  }

  async deleteSignal(uid: string, sessionId: string): Promise<boolean> {
    const docRef = this.getDb()
      .collection("users")
      .doc(uid)
      .collection("personalSignals")
      .doc(sessionId);
    
    await docRef.delete();
    return true;
  }

  async listSignals(uid: string, limit = 50): Promise<PersonalSignal[]> {
    const snap = await this.getDb()
      .collection("users")
      .doc(uid)
      .collection("personalSignals")
      .orderBy("localDate", "desc")
      .limit(limit)
      .get();
      
    return snap.docs.map(doc => this.mapSignal(doc));
  }

  private mapSignal(doc: FirebaseFirestore.DocumentSnapshot): PersonalSignal {
    const data = (doc.data() ?? {}) as StoredSignalDoc;
    return {
      sourceSessionId: data.sourceSessionId ?? doc.id,
      moodScore: data.moodScore ?? null,
      energyScore: data.energyScore ?? null,
      emotions: data.emotions ?? [],
      note: data.note ?? null,
      location: data.location ?? null,
      localDate: data.localDate ?? "",
      timezone: data.timezone ?? "UTC",
      capturedAt: timestampToIso(data.capturedAt),
      updatedAt: timestampToIso(data.updatedAt),
      createdBy: data.createdBy ?? "",
      scopeType: "personal",
      scopeId: data.scopeId ?? "",
      schemaVersion: 1,
    };
  }
}
