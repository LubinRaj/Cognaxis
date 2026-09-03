import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Timestamp,
} from "firebase-admin/firestore";
import type { EmotionLabel, PersonalSignal, PersonalSignalLocation } from "../../shared/schemas.js";
import type { SignalRepository, SignalWrite } from "./signal-repository.js";

type StoredSignal = {
  sourceSessionId: string;
  moodScore: PersonalSignal["moodScore"];
  energyScore: PersonalSignal["energyScore"];
  emotions: EmotionLabel[];
  note: string | null;
  location: PersonalSignalLocation | null;
  localDate: string;
  timezone: string;
  capturedAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  scopeType: "personal";
  scopeId: string;
  schemaVersion: 1;
};

function toIso(value: Timestamp | undefined): string {
  return value ? value.toDate().toISOString() : new Date(0).toISOString();
}

function mapSignal(snapshot: DocumentSnapshot): PersonalSignal {
  const stored = snapshot.data() as StoredSignal;
  return {
    sourceSessionId: stored.sourceSessionId,
    moodScore: stored.moodScore ?? null,
    energyScore: stored.energyScore ?? null,
    emotions: stored.emotions ?? [],
    note: stored.note ?? null,
    location: stored.location ?? null,
    localDate: stored.localDate,
    timezone: stored.timezone,
    capturedAt: toIso(stored.capturedAt),
    updatedAt: toIso(stored.updatedAt),
    createdBy: stored.createdBy,
    scopeType: "personal",
    scopeId: stored.scopeId,
    schemaVersion: 1,
  };
}

// Every path is rooted at the verified owner's document, so no query can cross user boundaries.
export class FirestoreSignalRepository implements SignalRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  private reference(uid: string, sessionId: string): DocumentReference {
    return this.firestore
      .collection("users")
      .doc(uid)
      .collection("personalSignals")
      .doc(sessionId);
  }

  async get(uid: string, sessionId: string): Promise<PersonalSignal | null> {
    const snapshot = await this.reference(uid, sessionId).get();
    return snapshot.exists ? mapSignal(snapshot) : null;
  }

  async upsert(uid: string, sessionId: string, write: SignalWrite): Promise<PersonalSignal> {
    const reference = this.reference(uid, sessionId);

    await this.firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      transaction.set(reference, {
        sourceSessionId: sessionId,
        moodScore: write.moodScore,
        energyScore: write.energyScore,
        emotions: write.emotions,
        note: write.note,
        location: write.location,
        localDate: write.localDate,
        timezone: write.timezone,
        capturedAt: existing.exists
          ? (existing.data() as StoredSignal).capturedAt
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: write.createdBy,
        scopeType: "personal",
        scopeId: write.scopeId,
        schemaVersion: 1,
      });
    });

    const saved = await reference.get();
    return mapSignal(saved);
  }

  async delete(uid: string, sessionId: string): Promise<boolean> {
    const reference = this.reference(uid, sessionId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return false;
    await reference.delete();
    return true;
  }

  async listRange(
    uid: string,
    fromLocalDate: string,
    toLocalDate: string,
    limit: number,
  ): Promise<PersonalSignal[]> {
    const snapshot = await this.firestore
      .collection("users")
      .doc(uid)
      .collection("personalSignals")
      .where("localDate", ">=", fromLocalDate)
      .where("localDate", "<=", toLocalDate)
      .orderBy("localDate", "desc")
      .limit(limit)
      .get();
    return snapshot.docs.map((document) => mapSignal(document));
  }
}
