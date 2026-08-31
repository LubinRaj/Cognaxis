import { useState } from "react";
import { FirebaseUIProvider } from "@firebase-oss/ui-react";
import { useAuth } from "../../auth/AuthProvider";
import { getFirebaseUI } from "../../auth/firebase-ui";
import { auth, firebaseApp } from "../../lib/firebase";
import { MaterialIcon } from "../MaterialIcon";
import { AuthForgotPasswordScreen } from "./AuthForgotPasswordScreen";
import { AuthResetSentScreen } from "./AuthResetSentScreen";
import { AuthSessionExpiredScreen } from "./AuthSessionExpiredScreen";
import { AuthShell } from "./AuthShell";
import { AuthSignInScreen } from "./AuthSignInScreen";
import { AuthSignUpScreen } from "./AuthSignUpScreen";
import { AuthVerifyEmailScreen } from "./AuthVerifyEmailScreen";
import "@firebase-oss/ui-styles/dist.min.css";
import "../../styles/firebase-ui-theme.css";

export default function AuthSurface() {
  const { state, globalError, send, clearGlobalError } = useAuth();
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [initialVerificationSent, setInitialVerificationSent] = useState<boolean | null>(null);

  if (!firebaseApp || !auth) return null;
  const ui = getFirebaseUI(firebaseApp, auth);

  function backToHome() {
    setResetEmail(null);
    send({ type: "BACK_TO_LANDING" });
  }

  // An unverified account must either verify or sign out, so the surface does not offer a route
  // back to the public page while a half-completed identity is held.
  const canReturnHome = state !== "AUTH_VERIFY_EMAIL";

  return (
    <FirebaseUIProvider ui={ui}>
      <AuthShell onBackToHome={canReturnHome ? backToHome : undefined}>
        {globalError && (
          <div
            role="alert"
            className="bg-error-container text-on-error-container mb-6 flex items-start gap-3 rounded-2xl p-4 text-sm"
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              <MaterialIcon name="error" size={20} />
            </span>
            <p className="flex-1">{globalError}</p>
            <button
              type="button"
              onClick={clearGlobalError}
              aria-label="Dismiss message"
              className="focus-visible:outline-primary -m-1 shrink-0 rounded-full p-1 focus-visible:outline-2"
            >
              <MaterialIcon name="close" size={18} />
            </button>
          </div>
        )}

        {state === "AUTH_SIGN_IN" && (
          <AuthSignInScreen
            onCreateAccount={() => send({ type: "OPEN_SIGN_UP" })}
            onForgotPassword={() => send({ type: "OPEN_FORGOT_PASSWORD" })}
          />
        )}

        {state === "AUTH_SIGN_UP" && (
          <AuthSignUpScreen
            onSignIn={() => send({ type: "BACK_TO_SIGN_IN" })}
            onVerificationEmailResult={setInitialVerificationSent}
          />
        )}

        {state === "AUTH_FORGOT_PASSWORD" && (
          <AuthForgotPasswordScreen
            onBackToSignIn={() => send({ type: "BACK_TO_SIGN_IN" })}
            onResetRequestAccepted={(email) => {
              setResetEmail(email);
              send({ type: "RESET_EMAIL_SENT" });
            }}
          />
        )}

        {state === "AUTH_RESET_EMAIL_SENT" && (
          <AuthResetSentScreen
            email={resetEmail}
            onBackToSignIn={() => {
              setResetEmail(null);
              send({ type: "BACK_TO_SIGN_IN" });
            }}
          />
        )}

        {state === "AUTH_VERIFY_EMAIL" && (
          // Remounting when the first verification email resolves lets the resend cooldown start
          // from the moment that email was actually accepted.
          <AuthVerifyEmailScreen
            key={String(initialVerificationSent)}
            initialEmailSent={initialVerificationSent}
          />
        )}

        {state === "AUTH_SESSION_EXPIRED" && (
          <AuthSessionExpiredScreen
            onSignIn={() => send({ type: "OPEN_SIGN_IN" })}
            onBackToHome={backToHome}
          />
        )}
      </AuthShell>
    </FirebaseUIProvider>
  );
}
