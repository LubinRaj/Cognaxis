const authErrorMessages: Record<string, string> = {
  "auth/popup-closed-by-user": "Sign-in was cancelled before it completed.",
  "auth/cancelled-popup-request": "Another sign-in attempt is already in progress.",
  "auth/network-request-failed": "Sign-in could not reach Google. Check your connection and try again.",
  "auth/unauthorized-domain":
    "Sign-in is not configured for this web address. Please contact the Cognaxis team.",
  "auth/operation-not-allowed": "Google sign-in is temporarily unavailable.",
  "auth/too-many-requests": "Too many sign-in attempts were made. Please wait and try again.",
  "auth/web-storage-unsupported":
    "This browser is blocking the storage required for sign-in. Update its privacy settings and try again.",
};

export function getFirebaseAuthErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export function getFirebaseAuthErrorMessage(error: unknown): string {
  const code = getFirebaseAuthErrorCode(error);
  if (!code) return "Google sign-in could not be completed. Please try again.";
  return authErrorMessages[code] ?? "Google sign-in could not be completed. Please try again.";
}

export function shouldFallbackToRedirect(error: unknown): boolean {
  const code = getFirebaseAuthErrorCode(error);
  return (
    code === "auth/popup-blocked" ||
    code === "auth/operation-not-supported-in-this-environment" ||
    code === "auth/internal-error"
  );
}
