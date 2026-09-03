import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { PersonalInsight } from "../../shared/schemas.js";

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export class FirestoreInsightRepository {
  async getInsight(uid: string, periodKey: string): Promise<PersonalInsight | null> {
    const doc = await getFirestore()
      .collection("users")
      .doc(uid)
      .collection("personalInsights")
      .doc(periodKey)
      .get();
    if (!doc.exists) return null;
    const data = doc.data() as PersonalInsight & { createdAt: unknown; updatedAt: unknown };
    return {
      ...data,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
    };
  }

  async saveInsight(uid: string, insight: PersonalInsight): Promise<void> {
    const docRef = getFirestore()
      .collection("users")
      .doc(uid)
      .collection("personalInsights")
      .doc(insight.periodKey);
    await docRef.set({
      ...insight,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async listInsights(uid: string, periodType: string, limit = 20): Promise<PersonalInsight[]> {
    const snap = await getFirestore()
      .collection("users")
      .doc(uid)
      .collection("personalInsights")
      .where("periodType", "==", periodType)
      .orderBy("periodStart", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((doc) => {
      const data = doc.data() as PersonalInsight & { createdAt: unknown; updatedAt: unknown };
      return {
        ...data,
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt),
      };
    });
  }
}
