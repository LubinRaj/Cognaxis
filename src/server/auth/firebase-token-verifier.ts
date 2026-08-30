import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { AppConfig } from "../config/env.js";
import type { AuthenticatedPrincipal, TokenVerifier } from "../types.js";

export class FirebaseTokenVerifier implements TokenVerifier {
  constructor(config: Pick<AppConfig, "GOOGLE_CLOUD_PROJECT">) {
    if (getApps().length === 0) {
      initializeApp({
        credential: applicationDefault(),
        projectId: config.GOOGLE_CLOUD_PROJECT,
      });
    }
  }

  async verify(token: string, checkRevoked = false): Promise<AuthenticatedPrincipal> {
    const decoded = await getAuth().verifyIdToken(token, checkRevoked);

    return {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      issuedAt: decoded.iat,
      authTime: decoded.auth_time,
    };
  }
}
