import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { AppConfig } from "../config/env.js";
import type { AuthenticatedPrincipal, TokenVerifier } from "../types.js";

export class FirebaseTokenVerifier implements TokenVerifier {
  constructor(config: Pick<AppConfig, "GOOGLE_CLOUD_PROJECT" | "FIREBASE_STORAGE_BUCKET">) {
    if (getApps().length === 0) {
      initializeApp({
        credential: applicationDefault(),
        projectId: config.GOOGLE_CLOUD_PROJECT,
        storageBucket: config.FIREBASE_STORAGE_BUCKET,
      });
    }
  }

  // Every field of the principal is derived from the verified token. Nothing here is read from the
  // request body, query, or headers.
  async verify(token: string, checkRevoked = false): Promise<AuthenticatedPrincipal> {
    const decoded = await getAuth().verifyIdToken(token, checkRevoked);
    const signInProvider = decoded.firebase.sign_in_provider;

    return {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      displayName: typeof decoded.name === "string" ? decoded.name : undefined,
      emailVerified: decoded.email_verified === true,
      signInProvider: typeof signInProvider === "string" ? signInProvider : undefined,
      issuedAt: decoded.iat,
      authTime: decoded.auth_time,
    };
  }
}
