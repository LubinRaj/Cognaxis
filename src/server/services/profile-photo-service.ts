import { randomUUID } from "node:crypto";
import { getStorage, type Storage } from "firebase-admin/storage";
import { FieldValue, getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { AppError } from "../errors.js";

const MAX_PROFILE_PHOTO_BYTES = 1_000_000;
const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
type StoredProfilePhoto = {
  storagePath: string;
  mimeType: string;
  byteSize: number;
};

type StorageBucket = ReturnType<Storage["bucket"]>;

export interface ProfilePhotoProvider {
  get(uid: string): Promise<{ bytes: Buffer; mimeType: string } | null>;
  upload(uid: string, mimeType: string, bytes: Buffer): Promise<void>;
  remove(uid: string): Promise<void>;
}

export function isSupportedProfilePhotoType(mimeType: string): boolean {
  return PROFILE_PHOTO_TYPES.has(mimeType.toLowerCase());
}

export class ProfilePhotoService implements ProfilePhotoProvider {
  private readonly storage: Storage;

  constructor(
    private readonly firestore: Firestore = getFirestore(),
    storage: Storage = getStorage(),
    private readonly bucketName?: string,
  ) {
    this.storage = storage;
  }

  private getBucket(): StorageBucket {
    return this.bucketName ? this.storage.bucket(this.bucketName) : this.storage.bucket();
  }

  private reference(uid: string): DocumentReference {
    return this.firestore.collection("users").doc(uid).collection("profile").doc("photo");
  }

  private storagePath(uid: string): string {
    return `users/${uid}/profile/avatar-${randomUUID()}`;
  }

  async get(uid: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const snapshot = await this.reference(uid).get();
    if (!snapshot.exists) return null;
    const stored = snapshot.data() as StoredProfilePhoto;
    const [bytes] = await this.getBucket().file(stored.storagePath).download();
    return { bytes, mimeType: stored.mimeType };
  }

  async upload(uid: string, mimeType: string, bytes: Buffer): Promise<void> {
    const normalizedMimeType = mimeType.toLowerCase();
    if (!isSupportedProfilePhotoType(normalizedMimeType)) {
      throw new AppError(415, "PROFILE_PHOTO_TYPE_UNSUPPORTED", "Use a JPEG, PNG, or WebP image.");
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) {
      throw new AppError(413, "PROFILE_PHOTO_TOO_LARGE", "Profile photos must be 1 MB or smaller.");
    }

    const storagePath = this.storagePath(uid);
    const reference = this.reference(uid);
    const previousSnapshot = await reference.get();
    const previous = previousSnapshot.exists
      ? (previousSnapshot.data() as StoredProfilePhoto)
      : null;

    await this.getBucket().file(storagePath).save(bytes, {
      resumable: false,
      metadata: {
        contentType: normalizedMimeType,
        metadata: { ownerUid: uid, purpose: "profile-photo" },
      },
    });
    try {
      await reference.set({
        storagePath,
        mimeType: normalizedMimeType,
        byteSize: bytes.byteLength,
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      });
    } catch (error) {
      await this.getBucket().file(storagePath).delete().catch(() => undefined);
      throw error;
    }

    if (previous && previous.storagePath !== storagePath) {
      await this.getBucket().file(previous.storagePath).delete().catch(() => undefined);
    }
  }

  async remove(uid: string): Promise<void> {
    const reference = this.reference(uid);
    const snapshot = await reference.get();
    if (!snapshot.exists) return;
    const stored = snapshot.data() as StoredProfilePhoto;
    await this.getBucket().file(stored.storagePath).delete().catch(() => undefined);
    await reference.delete();
  }
}
