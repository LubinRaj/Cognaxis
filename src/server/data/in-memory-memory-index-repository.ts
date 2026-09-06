import { randomUUID } from "node:crypto";
import type { MemoryChunk, MemoryIndexRepository, MemoryScope, SaveMemoryChunkInput } from "./memory-index-repository.js";

function key(scope: MemoryScope, sourceSessionId: string): string {
  return `${scope.type}:${scope.scopeId}:${sourceSessionId}`;
}

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude === 0 || rightMagnitude === 0
    ? 0
    : dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export class InMemoryMemoryIndexRepository implements MemoryIndexRepository {
  private readonly records = new Map<string, MemoryChunk>();

  async upsert(scope: MemoryScope, input: SaveMemoryChunkInput): Promise<MemoryChunk> {
    const recordKey = key(scope, input.sourceSessionId);
    const previous = this.records.get(recordKey);
    const now = new Date().toISOString();
    const record: MemoryChunk = {
      ...input,
      id: input.id ?? previous?.id ?? randomUUID(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.records.set(recordKey, structuredClone(record));
    return structuredClone(record);
  }

  async findNearest(scope: MemoryScope, embedding: number[], limit: number): Promise<MemoryChunk[]> {
    return [...this.records.entries()]
      .filter(([recordKey]) => recordKey.startsWith(`${scope.type}:${scope.scopeId}:`))
      .map(([, record]) => ({ record, score: cosine(record.embedding, embedding) }))
      // Match Firestore's COSINE distanceThreshold of 0.65 (similarity >= 0.35) so local and test
      // retrieval do not accept evidence that production would reject.
      .filter(({ record, score }) => record.indexStatus === "ready" && score >= 0.35)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ record }) => structuredClone(record));
  }

  async deleteForSession(scope: MemoryScope, sourceSessionId: string): Promise<void> {
    this.records.delete(key(scope, sourceSessionId));
  }
}
