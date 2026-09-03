import type { NextFunction, Response } from "express";
import { forbidden } from "../errors.js";
import type { AuthenticatedRequest } from "../types.js";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { PlatformUser } from "../../shared/schemas.js";

interface StoredPlatformUserDoc {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  providerIds?: string[];
  emailVerified?: boolean;
  platformRole?: "user" | "super_admin";
  status?: "active" | "suspended";
  firstSeenAt?: unknown;
  lastSeenAt?: unknown;
  lastSeenWriteAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  schemaVersion?: number;
}

function timestampToIso(value: unknown, fallback: string): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return fallback;
}

function timestampToDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date(0);
}

// Require a user to be active, and upsert their platformUser record on first visit.
export async function requireActivePlatformUser(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  if (!request.principal) {
    next(forbidden());
    return;
  }

  const { uid, email } = request.principal;
  const db = getFirestore();
  const userRef = db.collection("platformUsers").doc(uid);

  try {
    const userDoc = await userRef.get();
    let platformUser: PlatformUser;
    const now = new Date();
    
    if (!userDoc.exists) {
      // Create new platform user
      const newUserData = {
        uid,
        email: email || null,
        displayName: null,
        providerIds: request.principal.signInProvider ? [request.principal.signInProvider] : [],
        emailVerified: request.principal.emailVerified,
        platformRole: "user" as const,
        status: "active" as const,
        firstSeenAt: FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
        lastSeenWriteAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1 as const,
      };
      
      await userRef.set(newUserData);
      platformUser = {
        ...newUserData,
        firstSeenAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        lastSeenWriteAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    } else {
      const data = (userDoc.data() ?? {}) as StoredPlatformUserDoc;
      platformUser = {
        uid: data.uid ?? uid,
        email: data.email ?? email ?? null,
        displayName: data.displayName ?? null,
        providerIds: data.providerIds ?? (request.principal.signInProvider ? [request.principal.signInProvider] : []),
        emailVerified: data.emailVerified ?? request.principal.emailVerified,
        platformRole: data.platformRole ?? "user",
        status: data.status ?? "active",
        firstSeenAt: timestampToIso(data.firstSeenAt, now.toISOString()),
        lastSeenAt: timestampToIso(data.lastSeenAt, now.toISOString()),
        lastSeenWriteAt: timestampToIso(data.lastSeenWriteAt, now.toISOString()),
        createdAt: timestampToIso(data.createdAt, now.toISOString()),
        updatedAt: timestampToIso(data.updatedAt, now.toISOString()),
        schemaVersion: 1,
      };
      
      if (platformUser.status !== "active") {
        next(forbidden());
        return;
      }

      // Throttle lastSeenAt writes to at most once per 15 minutes
      const lastWriteDate = timestampToDate(data.lastSeenWriteAt);
      if (now.getTime() - lastWriteDate.getTime() > 15 * 60 * 1000) {
        await userRef.update({
          lastSeenAt: FieldValue.serverTimestamp(),
          lastSeenWriteAt: FieldValue.serverTimestamp(),
        });
      }
    }

    request.platformUser = platformUser;
    request.personalScope = { type: "personal", uid };
    
    next();
  } catch (error) {
    next(error);
  }
}
