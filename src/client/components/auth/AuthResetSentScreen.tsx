import { useState } from "react";
import { sendPasswordResetEmail } from "@firebase-oss/ui-core";
import { useUI } from "@firebase-oss/ui-react";
import {
  authMessages,
  classifyAuthFailure,
  getFirebaseAuthErrorMessage,
} from "../../auth/auth-errors";
import { useCooldown } from "../../auth/use-cooldown";
import { MaterialIcon } from "../MaterialIcon";
import { AuthCardHeading } from "./AuthCardHeading";

const RESEND_COOLDOWN_SECONDS = 60;
const reportableCategories = new Set(["network", "rate_limited", "configuration"]);

type AuthResetSentScreenProps = {
  email: string | null;
  onBackToSignIn: () => void;
};

export function AuthResetSentScreen({ email, onBackToSignIn }: AuthResetSentScreenProps) {
  const ui = useUI();
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    if (!email || busy || cooldown.isCoolingDown) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await sendPasswordResetEmail(ui, email);
      setStatus(authMessages.resetRequestAccepted);
    } catch (failure) {
      if (reportableCategories.has(classifyAuthFailure(failure))) {
        setError(getFirebaseAuthErrorMessage(failure));
      } else {
        setStatus(authMessages.resetRequestAccepted);
      }
    } finally {
      cooldown.start(RESEND_COOLDOWN_SECONDS);
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="bg-primary-container text-on-primary-container mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
        aria-hidden="true"
      >
        <MaterialIcon name="lock_reset" size={28} />
      </div>

      <AuthCardHeading
        title="Check your inbox"
        description="If an account is available for that email, Firebase has sent password reset instructions."
      />

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onBackToSignIn}
          className="bg-primary text-on-primary focus-visible:outline-primary flex min-h-13 w-full items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Back to sign in
        </button>

        {email && (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={busy || cooldown.isCoolingDown}
            className="border-outline text-on-surface hover:bg-surface-container-high focus-visible:outline-primary flex min-h-13 w-full items-center justify-center rounded-full border px-6 text-[0.9375rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cooldown.isCoolingDown
              ? `Resend available in ${cooldown.secondsRemaining}s`
              : "Resend instructions"}
          </button>
        )}

        <p aria-live="polite" className="text-on-surface-variant text-sm">
          {status}
        </p>
        {error && (
          <p role="alert" className="text-error flex items-start gap-2 text-sm">
            <span aria-hidden="true" className="mt-0.5">
              <MaterialIcon name="error" size={16} />
            </span>
            {error}
          </p>
        )}
      </div>
    </>
  );
}
