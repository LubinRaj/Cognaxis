import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Timestamp,
} from "firebase-admin/firestore";
import type {
  EmotionLabel,
  PersonalCheckIn,
  PersonalSignal,
  PersonalSignalLocation,
} from "../../shared/schemas.js";
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

type StoredCheckIn = Omit<StoredSignal, "schemaVersion"> & {
  anchorMessageId: string | null;
  schemaVersion: 2;
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

function mapCheckIn(snapshot: DocumentSnapshot): PersonalCheckIn {
  const signal = mapSignal(snapshot);
  const stored = snapshot.data() as StoredCheckIn;
  return {
    ...signal,
    id: snapshot.id,
    anchorMessageId: stored.anchorMessageId ?? null,
    schemaVersion: 2,
  };
}

function asSignal(checkIn: PersonalCheckIn): PersonalSignal {
  const signal = { ...checkIn, schemaVersion: 1 } as PersonalSignal & {
    id?: string;
    anchorMessageId?: string | null;
  };
  delete signal.id;
  delete signal.anchorMessageId;
  return signal;
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

  private checkIns(uid: string) {
    return this.firestore.collection("users").doc(uid).collection("personalCheckIns");
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

  async createCheckIn(
    uid: string,
    sessionId: string,
    write: SignalWrite,
    anchorMessageId: string | null,
  ): Promise<PersonalCheckIn> {
    const reference = this.checkIns(uid).doc();
    await reference.create({
      sourceSessionId: sessionId,
      moodScore: write.moodScore,
      energyScore: write.energyScore,
      emotions: write.emotions,
      note: write.note,
      location: write.location,
      localDate: write.localDate,
      timezone: write.timezone,
      capturedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: write.createdBy,
      scopeType: "personal",
      scopeId: write.scopeId,
      anchorMessageId,
      schemaVersion: 2,
    });
    return mapCheckIn(await reference.get());
  }

  async listCheckIns(uid: string, sessionId: string, limit: number): Promise<PersonalCheckIn[]> {
    const base = this.checkIns(uid).where("sourceSessionId", "==", sessionId);
    try {
      const snapshot = await base.orderBy("capturedAt", "desc").limit(limit).get();
      return snapshot.docs.map(mapCheckIn);
    } catch (error) {
      // A newly provisioned project may not have received firestore.indexes.json yet. The
      // equality-only query uses Firestore's automatic single-field index, so the feature stays
      // usable while the composite index deployment catches up; ordering remains deterministic.
      if (!(error instanceof Error && error.message.includes("requires an index"))) throw error;
      const snapshot = await base.limit(limit).get();
      return snapshot.docs
        .map(mapCheckIn)
        .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
    }
  }

  async deleteCheckIn(uid: string, checkInId: string): Promise<boolean> {
    const reference = this.checkIns(uid).doc(checkInId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return false;
    await reference.delete();
    return true;
  }

  async deleteCheckInsForSession(uid: string, sessionId: string): Promise<void> {
    // Keep batches below Firestore's write limit and continue until the whole private session
    // history is removed. This is part of the deletion cascade, so partial cleanup is not safe.
    while (true) {
      const snapshot = await this.checkIns(uid).where("sourceSessionId", "==", sessionId).limit(500).get();
      if (snapshot.empty) return;
      const batch = this.firestore.batch();
      snapshot.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
  }

  async listRange(
    uid: string,
    fromLocalDate: string,
    toLocalDate: string,
    limit: number,
  ): Promise<PersonalSignal[]> {
    const [legacy, checkIns] = await Promise.all([
      this.firestore
      .collection("users")
      .doc(uid)
      .collection("personalSignals")
      .where("localDate", ">=", fromLocalDate)
      .where("localDate", "<=", toLocalDate)
      .orderBy("localDate", "desc")
      .limit(limit)
      .get(),
      this.checkIns(uid)
        .where("localDate", ">=", fromLocalDate)
        .where("localDate", "<=", toLocalDate)
        .orderBy("localDate", "desc")
        .limit(limit)
        .get(),
    ]);
    return [
      ...legacy.docs.map(mapSignal),
      ...checkIns.docs.map(mapCheckIn).map(asSignal),
    ]
      .sort((left, right) => right.localDate.localeCompare(left.localDate) || right.capturedAt.localeCompare(left.capturedAt))
      .slice(0, limit);
  }
}
