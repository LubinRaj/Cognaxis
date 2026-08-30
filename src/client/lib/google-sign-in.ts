import {
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type AuthProvider,
} from "firebase/auth";
import { shouldFallbackToRedirect } from "./auth-errors";

export async function beginGoogleSignIn(auth: Auth, provider: AuthProvider): Promise<void> {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (!shouldFallbackToRedirect(error)) throw error;
    await signInWithRedirect(auth, provider);
  }
}

export async function completeGoogleRedirect(auth: Auth): Promise<void> {
  await getRedirectResult(auth);
}
