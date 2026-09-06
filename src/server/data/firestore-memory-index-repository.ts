import { FieldValue, Timestamp, getFirestore, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { captureTypes, type CaptureType } from "../../shared/schemas.js";
import type { MemoryChunk, MemoryIndexRepository, MemoryScope, SaveMemoryChunkInput } from "./memory-index-repository.js";

function collectionPath(scope: MemoryScope): string {
  return scope.type === "personal"
    ? `users/${scope.scopeId}/memoryChunks`
    : `organizations/${scope.scopeId}/memoryChunks`;
}

function valuesOf(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((item): item is number => typeof item === "number");
  const vector = value as { toArray?: () => unknown } | null;
  if (vector && typeof vector.toArray === "function") {
    const array = vector.toArray();
    return Array.isArray(array) ? array.filter((item): item is number => typeof item === "number") : [];
  }
  return [];
}

function toChunk(id: string, data: DocumentData): MemoryChunk {
  const values = data as Record<string, unknown>;
  const createdAt = values.createdAt instanceof Timestamp ? values.createdAt.toDate().toISOString() : new Date(0).toISOString();
  const updatedAt = values.updatedAt instanceof Timestamp ? values.updatedAt.toDate().toISOString() : createdAt;
  const sourceMessageIds = Array.isArray(values.sourceMessageIds)
    ? values.sourceMessageIds.filter((item): item is string => typeof item === "string")
    : [];
  const captureType: CaptureType = captureTypes.includes(values.captureType as CaptureType)
    ? values.captureType as CaptureType
    : "reflection";
  return {
    id,
    sourceSessionId: typeof values.sourceSessionId === "string" ? values.sourceSessionId : "",
    sourceMessageIds,
    captureType,
    text: typeof values.text === "string" ? values.text : "",
    embedding: valuesOf(values.embedding),
    embeddingModel: typeof values.embeddingModel === "string" ? values.embeddingModel : "",
    embeddingVersion: 1,
    indexStatus: values.indexStatus === "ready" || values.indexStatus === "pending" || values.indexStatus === "failed"
      ? values.indexStatus
      : "failed",
    createdAt,
    updatedAt,
  };
}

export class FirestoreMemoryIndexRepository implements MemoryIndexRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async upsert(scope: MemoryScope, input: SaveMemoryChunkInput): Promise<MemoryChunk> {
    const id = input.id ?? input.sourceSessionId;
    const ref = this.firestore.collection(collectionPath(scope)).doc(id);
    const existing = await ref.get();
    const existingData = existing.exists
      ? (existing.data() as unknown as Record<string, unknown>)
      : undefined;
    const now = Timestamp.now();
    await ref.set({
      ...input,
      embedding: FieldValue.vector(input.embedding),
      createdAt: existingData?.createdAt ?? now,
      updatedAt: now,
    }, { merge: true });
    const saved = await ref.get();
    return toChunk(ref.id, saved.data() ?? {});
  }

  async findNearest(scope: MemoryScope, embedding: number[], limit: number): Promise<MemoryChunk[]> {
    const query = this.firestore.collection(collectionPath(scope)).findNearest({
      vectorField: "embedding",
      queryVector: embedding,
      limit,
      distanceMeasure: "COSINE",
      distanceThreshold: 0.65,
    });
    const snapshot = await query.get();
    return snapshot.docs
      .map((document) => toChunk(document.id, document.data()))
      .filter((chunk) => chunk.indexStatus === "ready");
  }

  async deleteForSession(scope: MemoryScope, sourceSessionId: string): Promise<void> {
    const snapshot = await this.firestore.collection(collectionPath(scope)).where("sourceSessionId", "==", sourceSessionId).limit(100).get();
    if (snapshot.empty) return;
    const batch = this.firestore.batch();
    for (const document of snapshot.docs) batch.delete(document.ref);
    await batch.commit();
  }
}
