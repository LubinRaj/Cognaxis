import type { CaptureType } from "../../shared/schemas.js";

export type MemoryScope =
  | { type: "personal"; scopeId: string }
  | { type: "organization"; scopeId: string };

export type MemoryChunk = {
  id: string;
  sourceSessionId: string;
  sourceMessageIds: string[];
  captureType: CaptureType;
  text: string;
  embedding: number[];
  embeddingModel: string;
  embeddingVersion: 1;
  indexStatus: "ready" | "pending" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type SaveMemoryChunkInput = Omit<MemoryChunk, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export interface MemoryIndexRepository {
  upsert(scope: MemoryScope, input: SaveMemoryChunkInput): Promise<MemoryChunk>;
  findNearest(scope: MemoryScope, embedding: number[], limit: number): Promise<MemoryChunk[]>;
  deleteForSession(scope: MemoryScope, sourceSessionId: string): Promise<void>;
}
