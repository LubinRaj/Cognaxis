import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { authMessages, getFirebaseAuthErrorMessage } from "../../auth/auth-errors";
import { useCooldown } from "../../auth/use-cooldown";
import { MaterialIcon } from "../MaterialIcon";
import { AuthCardHeading } from "./AuthCardHeading";

const RESEND_COOLDOWN_SECONDS = 60;

type AuthVerifyEmailScreenProps = {
  initialEmailSent: boolean | null;
};

export function AuthVerifyEmailScreen({ initialEmailSent }: AuthVerifyEmailScreenProps) {
  const { maskedEmail, confirmEmailVerified, sendVerificationEmail, signOutAndReset, isSigningOut } =
    useAuth();
  const cooldown = useCooldown(initialEmailSent === true ? RESEND_COOLDOWN_SECONDS : 0);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    initialEmailSent === false ? authMessages.verificationEmailFailed : null,
  );

  async function checkVerification() {
    if (checking) return;
    setChecking(true);
    setError(null);
    setStatus("Checking your verification status…");
    try {
      const verified = await confirmEmailVerified();
      if (!verified) {
        setStatus(null);
        setError("That email is not verified yet. Open the link we sent, then check again.");
      }
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    if (sending || cooldown.isCoolingDown) return;
    setSending(true);
    setError(null);
    setStatus(null);
    try {
      await sendVerificationEmail();
      setStatus("Verification email sent. Check your inbox and spam folder.");
      cooldown.start(RESEND_COOLDOWN_SECONDS);
    } catch (failure) {
      setError(getFirebaseAuthErrorMessage(failure));
      cooldown.start(RESEND_COOLDOWN_SECONDS);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div
        className="bg-primary-container text-on-primary-container mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
        aria-hidden="true"
      >
        <MaterialIcon name="mark_email_unread" size={28} />
      </div>

      <AuthCardHeading
        title="Verify your email"
        description={
          initialEmailSent === true ? (
            <>
              We sent a verification link to{" "}
              <span className="text-on-surface font-medium">{maskedEmail}</span>. Open it, then
              return here to continue.
            </>
          ) : (
            <>
              Verify <span className="text-on-surface font-medium">{maskedEmail}</span> to
              continue. Request a new verification email below if you need a current link.
            </>
          )
        }
      />

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => void checkVerification()}
          disabled={checking}
          className="bg-primary text-on-primary focus-visible:outline-primary flex min-h-13 w-full items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking && (
            <span aria-hidden="true" className="animate-spin motion-reduce:animate-none">
              <MaterialIcon name="refresh" size={18} />
            </span>
          )}
          {checking ? "Checking…" : "I've verified my email"}
        </button>

        <button
          type="button"
          onClick={() => void resend()}
          disabled={sending || cooldown.isCoolingDown}
          className="border-outline text-on-surface hover:bg-surface-container-high focus-visible:outline-primary flex min-h-13 w-full items-center justify-center rounded-full border px-6 text-[0.9375rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cooldown.isCoolingDown
            ? `Resend available in ${cooldown.secondsRemaining}s`
            : "Resend verification email"}
        </button>

        <p aria-live="polite" className="text-on-surface-variant min-h-5 text-sm">
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

        <div className="border-outline-variant border-t pt-4 text-center">
          <button
            type="button"
            onClick={() => void signOutAndReset()}
            disabled={isSigningOut}
            className="text-primary focus-visible:outline-primary rounded text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          >
            Use a different account
          </button>
        </div>

        <p className="text-on-surface-variant text-xs leading-relaxed">
          Your private journal stays locked until this email is verified. Verification is checked
          again on the server for every request.
        </p>
      </div>
    </>
  );
}
