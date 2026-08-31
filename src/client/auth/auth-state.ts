export const authStates = [
  "CONFIGURATION_MISSING",
  "BOOTSTRAPPING",
  "SIGNED_OUT_LANDING",
  "AUTH_SIGN_IN",
  "AUTH_SIGN_UP",
  "AUTH_FORGOT_PASSWORD",
  "AUTH_RESET_EMAIL_SENT",
  "AUTH_VERIFY_EMAIL",
  "AUTH_SESSION_EXPIRED",
  "AUTHENTICATED",
] as const;

export type AuthState = (typeof authStates)[number];

export type AuthEvent =
  | { type: "CONFIGURATION_MISSING" }
  | { type: "NO_USER" }
  | { type: "VERIFIED_USER" }
  | { type: "UNVERIFIED_USER" }
  | { type: "OPEN_SIGN_IN" }
  | { type: "OPEN_SIGN_UP" }
  | { type: "OPEN_FORGOT_PASSWORD" }
  | { type: "RESET_EMAIL_SENT" }
  | { type: "BACK_TO_SIGN_IN" }
  | { type: "BACK_TO_LANDING" }
  | { type: "SESSION_EXPIRED" }
  | { type: "BOOTSTRAP_RETRY" };

export const initialAuthState: AuthState = "BOOTSTRAPPING";

const authScreenStates = new Set<AuthState>([
  "AUTH_SIGN_IN",
  "AUTH_SIGN_UP",
  "AUTH_FORGOT_PASSWORD",
  "AUTH_RESET_EMAIL_SENT",
  "AUTH_VERIFY_EMAIL",
  "AUTH_SESSION_EXPIRED",
]);

export function isAuthScreen(state: AuthState): boolean {
  return authScreenStates.has(state);
}

const identityStates = new Set<AuthState>(["AUTHENTICATED", "AUTH_VERIFY_EMAIL"]);

const signedOutScreens = new Set<AuthState>([
  "AUTH_SIGN_IN",
  "AUTH_SIGN_UP",
  "AUTH_FORGOT_PASSWORD",
  "AUTH_RESET_EMAIL_SENT",
  "AUTH_SESSION_EXPIRED",
  "SIGNED_OUT_LANDING",
]);

// The observer reports identity facts, so every transition table entry is keyed by the
// current state. An unlisted combination is not an error; it keeps the current state so a
// late or duplicated Firebase callback can never move the user into a more trusted screen.
const transitions: Record<AuthState, Partial<Record<AuthEvent["type"], AuthState>>> = {
  CONFIGURATION_MISSING: {},
  BOOTSTRAPPING: {
    CONFIGURATION_MISSING: "CONFIGURATION_MISSING",
    NO_USER: "SIGNED_OUT_LANDING",
    VERIFIED_USER: "AUTHENTICATED",
    UNVERIFIED_USER: "AUTH_VERIFY_EMAIL",
    SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
    BOOTSTRAP_RETRY: "BOOTSTRAPPING",
  },
  SIGNED_OUT_LANDING: {
    OPEN_SIGN_IN: "AUTH_SIGN_IN",
    VERIFIED_USER: "AUTHENTICATED",
    UNVERIFIED_USER: "AUTH_VERIFY_EMAIL",
    BACK_TO_LANDING: "SIGNED_OUT_LANDING",
  },
  AUTH_SIGN_IN: {
    OPEN_SIGN_UP: "AUTH_SIGN_UP",
    OPEN_FORGOT_PASSWORD: "AUTH_FORGOT_PASSWORD",
    VERIFIED_USER: "AUTHENTICATED",
    UNVERIFIED_USER: "AUTH_VERIFY_EMAIL",
    BACK_TO_LANDING: "SIGNED_OUT_LANDING",
  },
  AUTH_SIGN_UP: {
    BACK_TO_SIGN_IN: "AUTH_SIGN_IN",
    OPEN_SIGN_IN: "AUTH_SIGN_IN",
    VERIFIED_USER: "AUTHENTICATED",
    UNVERIFIED_USER: "AUTH_VERIFY_EMAIL",
    BACK_TO_LANDING: "SIGNED_OUT_LANDING",
  },
  AUTH_FORGOT_PASSWORD: {
    RESET_EMAIL_SENT: "AUTH_RESET_EMAIL_SENT",
    BACK_TO_SIGN_IN: "AUTH_SIGN_IN",
    OPEN_SIGN_IN: "AUTH_SIGN_IN",
    VERIFIED_USER: "AUTHENTICATED",
    UNVERIFIED_USER: "AUTH_VERIFY_EMAIL",
    BACK_TO_LANDING: "SIGNED_OUT_LANDING",
  },
  AUTH_RESET_EMAIL_SENT: {
    BACK_TO_SIGN_IN: "AUTH_SIGN_IN",
    OPEN_SIGN_IN: "AUTH_SIGN_IN",
    VERIFIED_USER: "AUTHENTICATED",
    UNVERIFIED_USER: "AUTH_VERIFY_EMAIL",
    BACK_TO_LANDING: "SIGNED_OUT_LANDING",
  },
  AUTH_VERIFY_EMAIL: {
    NO_USER: "AUTH_SIGN_IN",
    BACK_TO_SIGN_IN: "AUTH_SIGN_IN",
    OPEN_SIGN_IN: "AUTH_SIGN_IN",
    VERIFIED_USER: "AUTHENTICATED",
    SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
    BACK_TO_LANDING: "SIGNED_OUT_LANDING",
  },
  AUTH_SESSION_EXPIRED: {
    OPEN_SIGN_IN: "AUTH_SIGN_IN",
    BACK_TO_SIGN_IN: "AUTH_SIGN_IN",
    VERIFIED_USER: "AUTHENTICATED",
    UNVERIFIED_USER: "AUTH_VERIFY_EMAIL",
    BACK_TO_LANDING: "SIGNED_OUT_LANDING",
  },
  AUTHENTICATED: {
    NO_USER: "SIGNED_OUT_LANDING",
    UNVERIFIED_USER: "AUTH_VERIFY_EMAIL",
    SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
  },
};

export function reduceAuthState(state: AuthState, event: AuthEvent): AuthState {
  return transitions[state][event.type] ?? state;
}

export function isSignedOutScreen(state: AuthState): boolean {
  return signedOutScreens.has(state);
}

export function requiresFirebaseUser(state: AuthState): boolean {
  return identityStates.has(state);
}
