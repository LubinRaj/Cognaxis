export const authMessages = {
  invalidCredentials: "Email or password is incorrect.",
  network: "We couldn't reach the sign-in service. Check your connection and try again.",
  rateLimited: "Too many attempts. Wait a moment and try again.",
  unauthorizedDomain: "Sign-in is not configured for this web address.",
  popupCancelled: "Sign-in was cancelled before it completed.",
  sessionInvalid: "Your session could not be verified. Please sign in again.",
  emailNotVerified: "Verify your email before opening your private journal.",
  resetRequestAccepted: "If an account is available, reset instructions have been sent.",
  unknown: "Sign-in could not be completed. Please try again.",
  accountUnavailable: "We couldn't create that account. Try signing in or resetting your password.",
  differentSignInMethod:
    "This account was set up with a different sign-in method. Use that method to continue.",
  recentSignInRequired: "Please sign in again to continue.",
  weakPassword: "Choose a password that meets every requirement listed below.",
  invalidEmail: "Enter a valid email address.",
  providerUnavailable: "This sign-in method is not available right now.",
  storageBlocked:
    "This browser is blocking the storage required for sign-in. Update its privacy settings and try again.",
  verificationEmailFailed: "We couldn't send the verification email. Try again in a moment.",
} as const;

export type AuthFailureCategory =
  | "invalid_credentials"
  | "network"
  | "rate_limited"
  | "configuration"
  | "cancelled"
  | "session"
  | "account_conflict"
  | "policy"
  | "unknown";

type ErrorProfile = { message: string; category: AuthFailureCategory };

// Every credential outcome resolves to one identical message so that response text cannot be
// used to determine whether an address is registered.
const credentialFailure: ErrorProfile = {
  message: authMessages.invalidCredentials,
  category: "invalid_credentials",
};

const sessionFailure: ErrorProfile = {
  message: authMessages.sessionInvalid,
  category: "session",
};

const errorProfiles: Record<string, ErrorProfile> = {
  "auth/invalid-credential": credentialFailure,
  "auth/invalid-login-credentials": credentialFailure,
  "auth/user-not-found": credentialFailure,
  "auth/wrong-password": credentialFailure,
  "auth/user-disabled": credentialFailure,
  "auth/missing-password": credentialFailure,

  "auth/email-already-in-use": {
    message: authMessages.accountUnavailable,
    category: "account_conflict",
  },
  "auth/credential-already-in-use": {
    message: authMessages.differentSignInMethod,
    category: "account_conflict",
  },
  "auth/account-exists-with-different-credential": {
    message: authMessages.differentSignInMethod,
    category: "account_conflict",
  },
  "auth/provider-already-linked": {
    message: authMessages.differentSignInMethod,
    category: "account_conflict",
  },

  "auth/network-request-failed": { message: authMessages.network, category: "network" },
  "auth/timeout": { message: authMessages.network, category: "network" },

  "auth/too-many-requests": { message: authMessages.rateLimited, category: "rate_limited" },
  "auth/quota-exceeded": { message: authMessages.rateLimited, category: "rate_limited" },

  "auth/unauthorized-domain": {
    message: authMessages.unauthorizedDomain,
    category: "configuration",
  },
  "auth/operation-not-allowed": {
    message: authMessages.providerUnavailable,
    category: "configuration",
  },
  "auth/invalid-api-key": {
    message: authMessages.providerUnavailable,
    category: "configuration",
  },
  "auth/web-storage-unsupported": {
    message: authMessages.storageBlocked,
    category: "configuration",
  },

  "auth/popup-closed-by-user": { message: authMessages.popupCancelled, category: "cancelled" },
  "auth/cancelled-popup-request": { message: authMessages.popupCancelled, category: "cancelled" },
  "auth/user-cancelled": { message: authMessages.popupCancelled, category: "cancelled" },

  "auth/user-token-expired": sessionFailure,
  "auth/invalid-user-token": sessionFailure,
  "auth/user-signed-out": sessionFailure,
  "auth/session-expired": sessionFailure,
  "auth/requires-recent-login": {
    message: authMessages.recentSignInRequired,
    category: "session",
  },

  "auth/weak-password": { message: authMessages.weakPassword, category: "policy" },
  "auth/password-does-not-meet-requirements": {
    message: authMessages.weakPassword,
    category: "policy",
  },
  "auth/invalid-email": { message: authMessages.invalidEmail, category: "policy" },
  "auth/missing-email": { message: authMessages.invalidEmail, category: "policy" },
};

const terminalSessionCodes = new Set([
  "auth/user-token-expired",
  "auth/invalid-user-token",
  "auth/user-disabled",
  "auth/user-signed-out",
  "auth/session-expired",
  "auth/invalid-refresh-token",
]);

const redirectFallbackCodes = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/internal-error",
]);

export function getFirebaseAuthErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export function getFirebaseAuthErrorMessage(error: unknown): string {
  const code = getFirebaseAuthErrorCode(error);
  if (!code) return authMessages.unknown;
  return errorProfiles[code]?.message ?? authMessages.unknown;
}

export function classifyAuthFailure(error: unknown): AuthFailureCategory {
  const code = getFirebaseAuthErrorCode(error);
  if (!code) return "unknown";
  return errorProfiles[code]?.category ?? "unknown";
}

export function shouldFallbackToRedirect(error: unknown): boolean {
  const code = getFirebaseAuthErrorCode(error);
  return code !== null && redirectFallbackCodes.has(code);
}

export function isTerminalSessionFailure(error: unknown): boolean {
  const code = getFirebaseAuthErrorCode(error);
  return code !== null && terminalSessionCodes.has(code);
}

export function maskEmail(email: string | null | undefined): string {
  if (typeof email !== "string") return "your email address";

  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) return "your email address";

  const domain = email.slice(separator + 1);
  if (!domain.includes(".")) return "your email address";

  const localPart = email.slice(0, separator);
  const visible = localPart.length > 2 ? localPart.slice(0, 2) : localPart.slice(0, 1);
  return `${localPart.length > 1 ? visible : ""}•••@${domain}`;
}
