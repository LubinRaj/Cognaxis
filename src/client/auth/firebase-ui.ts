import { initializeUI, type Behavior, type FirebaseUIStore } from "@firebase-oss/ui-core";
import { enUs, registerLocale } from "@firebase-oss/ui-translations";
import type { FirebaseApp } from "firebase/app";
import { linkWithPopup, signInWithPopup, signInWithRedirect, type Auth } from "firebase/auth";
import { authMessages, shouldFallbackToRedirect } from "./auth-errors";

// FirebaseUI's shipped English copy names the exact reason a credential failed, which discloses
// whether an address is registered. This locale replaces every such string with the Cognaxis
// generic copy. It is defence in depth: rendered failures are also mapped through auth-errors.
const cognaxisLocale = registerLocale(
  "en-US-cognaxis",
  {
    errors: {
      userNotFound: authMessages.invalidCredentials,
      wrongPassword: authMessages.invalidCredentials,
      invalidCredential: authMessages.invalidCredentials,
      userDisabled: authMessages.invalidCredentials,
      emailAlreadyInUse: authMessages.accountUnavailable,
      credentialAlreadyInUse: authMessages.differentSignInMethod,
      accountExistsWithDifferentCredential: authMessages.differentSignInMethod,
      providerAlreadyLinked: authMessages.differentSignInMethod,
      networkRequestFailed: authMessages.network,
      tooManyRequests: authMessages.rateLimited,
      quotaExceeded: authMessages.rateLimited,
      operationNotAllowed: authMessages.providerUnavailable,
      requiresRecentLogin: authMessages.recentSignInRequired,
      unverifiedEmail: authMessages.emailNotVerified,
      weakPassword: authMessages.weakPassword,
      invalidEmail: authMessages.invalidEmail,
      missingEmail: authMessages.invalidEmail,
      popupClosed: authMessages.popupCancelled,
      invalidActionCode: "That link is invalid or has expired. Request a new one.",
      unknownError: authMessages.unknown,
    },
    messages: {
      passwordResetEmailSent: authMessages.resetRequestAccepted,
      checkEmailForReset: authMessages.resetRequestAccepted,
      dividerOr: "or continue with email",
    },
    labels: {
      emailAddress: "Email",
      password: "Password",
      forgotPassword: "Forgot password?",
      signIn: "Sign in",
      signUp: "Create an account",
      createAccount: "Create account",
      resetPassword: "Send reset instructions",
      backToSignIn: "Back to sign in",
      signInWithGoogle: "Continue with Google",
      termsOfService: "Terms",
      privacyPolicy: "Privacy Policy",
    },
    prompts: {
      noAccount: "New to Cognaxis?",
      haveAccount: "Already have an account?",
      signInToAccount: "Continue to your private Cognaxis journal.",
      enterEmailToReset:
        "Enter your email and we'll send password reset instructions if an account is available.",
      enterDetailsToCreate: "Use Google or create an account with your email.",
    },
  },
  enUs,
);

// Popup keeps the user in the Cognaxis tab and matches the same-origin-allow-popups policy the
// server already sends. Redirect is used only when the popup runtime genuinely cannot complete.
function popupWithRedirectFallback(): Behavior<
  "providerSignInStrategy" | "providerLinkStrategy"
> {
  return {
    providerSignInStrategy: {
      type: "callable",
      handler: async (ui, provider) => {
        try {
          return await signInWithPopup(ui.auth, provider);
        } catch (error) {
          if (!shouldFallbackToRedirect(error)) throw error;
          return await signInWithRedirect(ui.auth, provider);
        }
      },
    },
    providerLinkStrategy: {
      type: "callable",
      handler: async (_ui, user, provider) => linkWithPopup(user, provider),
    },
  };
}

let store: FirebaseUIStore | null = null;

export function getFirebaseUI(app: FirebaseApp, firebaseAuth: Auth): FirebaseUIStore {
  store ??= initializeUI({
    app,
    auth: firebaseAuth,
    locale: cognaxisLocale,
    behaviors: [popupWithRedirectFallback()],
  });
  return store;
}

export function resetFirebaseUIForTests(): void {
  store = null;
}
