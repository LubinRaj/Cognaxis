import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import type { UsageDay } from "../../shared/schemas.js";
import { emptyUsageDay, type UsageField, type UsageRepository } from "./usage-repository.js";

// Daily usage documents contain event counters only: no identifiers, no content, no wellbeing
// data. The document id is the UTC calendar date.
export class FirestoreUsageRepository implements UsageRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async increment(date: string, field: UsageField): Promise<void> {
    await this.firestore
      .collection("platformUsageDaily")
      .doc(date)
      .set(
        {
          date,
          [field]: FieldValue.increment(1),
          updatedAt: Timestamp.now(),
          schemaVersion: 1,
        },
        { merge: true },
      );
  }

  async listRange(fromDate: string, toDate: string): Promise<UsageDay[]> {
    const snapshot = await this.firestore
      .collection("platformUsageDaily")
      .where("date", ">=", fromDate)
      .where("date", "<=", toDate)
      .orderBy("date", "asc")
      .get();

    return snapshot.docs.map((document) => {
      const stored = document.data() as Partial<UsageDay> & { date: string };
      return { ...emptyUsageDay(stored.date), ...stored };
    });
  }
}
