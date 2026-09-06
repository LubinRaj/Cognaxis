import { randomUUID } from "node:crypto";
import type { AttachmentKind, AttachmentReference } from "../../shared/schemas.js";
import type { AttachmentRepository, AttachmentScope, StoredAttachment } from "./attachment-repository.js";

function key(scope: AttachmentScope, id: string): string {
  return `${scope.type}:${scope.scopeId}:${id}`;
}

export class InMemoryAttachmentRepository implements AttachmentRepository {
  private readonly records = new Map<string, StoredAttachment>();

  async create(
    scope: AttachmentScope,
    sourceSessionId: string,
    kind: AttachmentKind,
    mimeType: string,
    bytes: Buffer,
  ): Promise<AttachmentReference> {
    const reference: AttachmentReference = {
      id: randomUUID(),
      kind,
      mimeType,
      byteSize: bytes.byteLength,
      createdAt: new Date().toISOString(),
    };
    this.records.set(key(scope, reference.id), {
      ...reference,
      sourceSessionId,
      scope: structuredClone(scope),
      bytes: Buffer.from(bytes),
    });
    return structuredClone(reference);
  }

  async get(scope: AttachmentScope, sourceSessionId: string, attachmentId: string): Promise<StoredAttachment | null> {
    const record = this.records.get(key(scope, attachmentId));
    if (!record || record.sourceSessionId !== sourceSessionId) return null;
    return { ...structuredClone(record), bytes: Buffer.from(record.bytes) };
  }

  async delete(scope: AttachmentScope, sourceSessionId: string, attachmentId: string): Promise<boolean> {
    const record = await this.get(scope, sourceSessionId, attachmentId);
    if (!record) return false;
    return this.records.delete(key(scope, attachmentId));
  }

  async deleteForSession(scope: AttachmentScope, sourceSessionId: string): Promise<void> {
    for (const [recordKey, record] of this.records) {
      if (record.scope.type === scope.type && record.scope.scopeId === scope.scopeId && record.sourceSessionId === sourceSessionId) {
        this.records.delete(recordKey);
      }
    }
  }
}
