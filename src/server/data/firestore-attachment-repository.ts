import { randomUUID } from "node:crypto";
import { getStorage, type Storage } from "firebase-admin/storage";
import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import type { AttachmentKind, AttachmentReference } from "../../shared/schemas.js";
import type { AttachmentRepository, AttachmentScope, StoredAttachment } from "./attachment-repository.js";

type StoredMetadata = Omit<AttachmentReference, "createdAt"> & {
  createdAt: Timestamp;
  sourceSessionId: string;
  scopeType: AttachmentScope["type"];
  scopeId: string;
  storagePath: string;
};

type StorageBucket = ReturnType<Storage["bucket"]>;

function reference(data: StoredMetadata): AttachmentReference {
  return {
    id: data.id,
    kind: data.kind,
    mimeType: data.mimeType,
    byteSize: data.byteSize,
    createdAt: data.createdAt.toDate().toISOString(),
  };
}

function collectionPath(scope: AttachmentScope): string {
  return scope.type === "personal"
    ? `users/${scope.scopeId}/attachments`
    : `organizations/${scope.scopeId}/attachments`;
}

export class FirestoreAttachmentRepository implements AttachmentRepository {
  private readonly bucketName?: string;
  private readonly storage: Storage;

  constructor(
    private readonly firestore: Firestore = getFirestore(),
    storage: Storage = getStorage(),
    bucketName?: string,
  ) {
    this.storage = storage;
    this.bucketName = bucketName;
  }

  private getBucket(): StorageBucket {
    // Resolve the bucket lazily so the app can still start when attachments have not yet been
    // configured. Upload/read operations then fail at the boundary instead of crashing all routes.
    return this.bucketName ? this.storage.bucket(this.bucketName) : this.storage.bucket();
  }

  async create(
    scope: AttachmentScope,
    sourceSessionId: string,
    kind: AttachmentKind,
    mimeType: string,
    bytes: Buffer,
  ): Promise<AttachmentReference> {
    const id = randomUUID();
    const createdAt = Timestamp.now();
    const storagePath = `${collectionPath(scope)}/${id}/original`;
    const metadataRef = this.firestore.collection(collectionPath(scope)).doc(id);
    const stored: StoredMetadata = {
      id,
      kind,
      mimeType,
      byteSize: bytes.byteLength,
      createdAt,
      sourceSessionId,
      scopeType: scope.type,
      scopeId: scope.scopeId,
      storagePath,
    };
    try {
      await this.getBucket().file(storagePath).save(bytes, {
        resumable: false,
        metadata: { contentType: mimeType, metadata: { scopeType: scope.type, scopeId: scope.scopeId } },
      });
      await metadataRef.create(stored);
    } catch (error) {
      await this.getBucket().file(storagePath).delete().catch(() => undefined);
      throw error;
    }
    return reference(stored);
  }

  async get(scope: AttachmentScope, sourceSessionId: string, attachmentId: string): Promise<StoredAttachment | null> {
    const snapshot = await this.firestore.collection(collectionPath(scope)).doc(attachmentId).get();
    if (!snapshot.exists) return null;
    const stored = snapshot.data() as StoredMetadata;
    if (stored.sourceSessionId !== sourceSessionId || stored.scopeType !== scope.type || stored.scopeId !== scope.scopeId) return null;
    const [bytes] = await this.getBucket().file(stored.storagePath).download();
    return { ...reference(stored), sourceSessionId, scope: structuredClone(scope), bytes };
  }

  async delete(scope: AttachmentScope, sourceSessionId: string, attachmentId: string): Promise<boolean> {
    const metadataRef = this.firestore.collection(collectionPath(scope)).doc(attachmentId);
    const snapshot = await metadataRef.get();
    if (!snapshot.exists) return false;
    const stored = snapshot.data() as StoredMetadata;
    if (stored.sourceSessionId !== sourceSessionId || stored.scopeType !== scope.type || stored.scopeId !== scope.scopeId) return false;
    await this.getBucket().file(stored.storagePath).delete().catch(() => undefined);
    await metadataRef.delete();
    return true;
  }

  async deleteForSession(scope: AttachmentScope, sourceSessionId: string): Promise<void> {
    const snapshot = await this.firestore.collection(collectionPath(scope)).where("sourceSessionId", "==", sourceSessionId).limit(100).get();
    for (const document of snapshot.docs) {
      const stored = document.data() as StoredMetadata;
      await this.getBucket().file(stored.storagePath).delete().catch(() => undefined);
      await document.ref.delete();
    }
  }
}
