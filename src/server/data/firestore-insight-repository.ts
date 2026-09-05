import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Timestamp,
} from "firebase-admin/firestore";
import type { PersonalInsight } from "../../shared/schemas.js";
import { AppError } from "../errors.js";
import type {
  GenerationLeaseRequest,
  InsightRepository,
  InsightWrite,
} from "./insight-repository.js";

type StoredInsight = Omit<PersonalInsight, "createdAt" | "updatedAt"> & {
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

function toIso(value: Timestamp | undefined): string {
  return value ? value.toDate().toISOString() : new Date(0).toISOString();
}

function mapInsight(snapshot: DocumentSnapshot): PersonalInsight {
  const stored = snapshot.data() as StoredInsight;
  return {
    ...stored,
    stale: stored.stale === true,
    createdAt: toIso(stored.createdAt),
    updatedAt: toIso(stored.updatedAt),
  };
}

// Every path is rooted at the verified owner's document, so no query can cross user boundaries.
export class FirestoreInsightRepository implements InsightRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  private collection(uid: string) {
    return this.firestore.collection("users").doc(uid).collection("personalInsights");
  }

  private reference(uid: string, periodKey: string): DocumentReference {
    return this.collection(uid).doc(periodKey);
  }

  async get(uid: string, periodKey: string): Promise<PersonalInsight | null> {
    const snapshot = await this.reference(uid, periodKey).get();
    return snapshot.exists ? mapInsight(snapshot) : null;
  }

  async save(uid: string, insight: InsightWrite): Promise<PersonalInsight> {
    const reference = this.reference(uid, insight.periodKey);
    await this.firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      transaction.set(reference, {
        ...insight,
        createdAt: existing.exists
          ? (existing.data() as StoredInsight).createdAt
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    const saved = await reference.get();
    return mapInsight(saved);
  }

  async delete(uid: string, periodKey: string): Promise<boolean> {
    const reference = this.reference(uid, periodKey);
    const snapshot = await reference.get();
    if (!snapshot.exists) return false;
    await reference.delete();
    return true;
  }

  async list(uid: string, periodType: "day" | "week", limit: number): Promise<PersonalInsight[]> {
    try {
      const snapshot = await this.collection(uid)
        .where("periodType", "==", periodType)
        .orderBy("periodStart", "desc")
        .limit(limit)
        .get();
      return snapshot.docs.map((document) => mapInsight(document));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isIndexError =
        (typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 9) ||
        message.toLowerCase().includes("requires an index") ||
        message.includes("FAILED_PRECONDITION");
      if (isIndexError) {
        throw new AppError(
          503,
          "INDEX_BUILDING",
          "The insights index is currently building or missing in Firestore. Please ensure the composite index is deployed.",
        );
      }
      throw error;
    }
  }

  async markStale(uid: string, periodKeys: string[]): Promise<void> {
    const batch = this.firestore.batch();
    let hasUpdates = false;
    for (const periodKey of periodKeys) {
      const snapshot = await this.reference(uid, periodKey).get();
      if (snapshot.exists && (snapshot.data() as StoredInsight).stale !== true) {
        batch.update(snapshot.ref, { stale: true, updatedAt: FieldValue.serverTimestamp() });
        hasUpdates = true;
      }
    }
    if (hasUpdates) await batch.commit();
  }

  private leaseReference(uid: string, periodKey: string): DocumentReference {
    return this.firestore
      .collection("users")
      .doc(uid)
      .collection("insightGenerationLeases")
      .doc(periodKey);
  }

  // The lease transaction is a single short read-then-write; the model call itself never runs
  // inside a Firestore transaction.
  async acquireGenerationLease(
    uid: string,
    periodKey: string,
    lease: GenerationLeaseRequest,
  ): Promise<boolean> {
    const reference = this.leaseReference(uid, periodKey);
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        const stored = snapshot.data() as { holder: string; expiresAtIso: string };
        if (stored.expiresAtIso > lease.nowIso && stored.holder !== lease.holder) return false;
      }
      transaction.set(reference, { holder: lease.holder, expiresAtIso: lease.expiresAtIso });
      return true;
    });
  }

  async releaseGenerationLease(uid: string, periodKey: string, holder: string): Promise<void> {
    const reference = this.leaseReference(uid, periodKey);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists && (snapshot.data() as { holder: string }).holder === holder) {
        transaction.delete(reference);
      }
    });
  }

  async listCitingSession(uid: string, sessionId: string): Promise<PersonalInsight[]> {
    const [bySession, bySignal] = await Promise.all([
      this.collection(uid).where("sourceSessionIds", "array-contains", sessionId).get(),
      this.collection(uid).where("sourceSignalSessionIds", "array-contains", sessionId).get(),
    ]);
    const unique = new Map<string, PersonalInsight>();
    for (const document of [...bySession.docs, ...bySignal.docs]) {
      unique.set(document.id, mapInsight(document));
    }
    return [...unique.values()];
  }
}
