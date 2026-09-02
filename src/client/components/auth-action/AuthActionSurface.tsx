import { useEffect, useRef, useState } from "react";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import {
  parseActionLink,
  resolveContinueUrl,
  scrubActionQueryString,
  type ActionMode,
} from "../../auth/action-link";
import { authMessages, getFirebaseAuthErrorMessage, maskEmail } from "../../auth/auth-errors";
import { usePasswordPolicy } from "../../auth/use-password-policy";
import { auth } from "../../lib/firebase";
import { AuthCardHeading } from "../auth/AuthCardHeading";
import { AuthShell } from "../auth/AuthShell";
import { PasswordPolicyChecklist, describePasswordPolicy } from "../auth/PasswordPolicyChecklist";
import { PasswordRevealButton } from "../auth/PasswordRevealButton";
import { MaterialIcon } from "../MaterialIcon";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

type Phase =
  | "checking"
  | "reset-form"
  | "reset-complete"
  | "verifying"
  | "verified"
  | "email-recovered"
  | "invalid"
  | "configuration-missing";

const INVALID_COPY: Record<ActionMode | "unknown", string> = {
  resetPassword: "This password reset link is invalid, has expired, or has already been used.",
  verifyEmail: "This verification link is invalid, has expired, or has already been used.",
  recoverEmail: "This email recovery link is invalid, has expired, or has already been used.",
  unknown: "This link is not one Cognaxis can complete.",
};

/**
 * The link is read once, before the first render, so the effect only performs the Firebase call
 * and never has to write state synchronously during mount.
 */
function readEntryLink() {
  if (!auth) {
    return { phase: "configuration-missing" as Phase, mode: "unknown" as const, code: null, continueTo: null };
  }

  const parsed = parseActionLink(typeof window === "undefined" ? "" : window.location.search);
  if (parsed.status === "unsupported") {
    return { phase: "invalid" as Phase, mode: "unknown" as const, code: null, continueTo: null };
  }

  return {
    phase: parsed.mode === "resetPassword" ? ("checking" as Phase) : ("verifying" as Phase),
    mode: parsed.mode,
    code: parsed.oobCode,
    continueTo: resolveContinueUrl(parsed.continueUrl, window.location.origin),
  };
}

export function AuthActionSurface({
  onReturnToApp,
}: {
  onReturnToApp: (destination?: string | null) => void;
}) {
  const [entry] = useState(readEntryLink);
  const [phase, setPhase] = useState<Phase>(entry.phase);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const mode = entry.mode;
  const continueTo = entry.continueTo;

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const { status, unavailable, validatedPassword } = usePasswordPolicy(auth, password);
  // The one-time code is held in memory only. It is never written to storage, logs, or the URL.
  const oobCode = useRef<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // The visible URL is cleared as soon as the code is captured in memory, whatever the outcome.
    scrubActionQueryString();

    const firebaseAuth = auth;
    if (!firebaseAuth || entry.code === null) return;

    oobCode.current = entry.code;

    async function run(code: string, actionMode: ActionMode) {
      if (!firebaseAuth) return;
      try {
        if (actionMode === "resetPassword") {
          const email = await verifyPasswordResetCode(firebaseAuth, code);
          setAccountEmail(email);
          setPhase("reset-form");
          return;
        }

        if (actionMode === "verifyEmail") {
          await applyActionCode(firebaseAuth, code);
          setPhase("verified");
          return;
        }

        const info = await checkActionCode(firebaseAuth, code);
        setAccountEmail(info.data.email ?? null);
        await applyActionCode(firebaseAuth, code);
        setPhase("email-recovered");
      } catch (error) {
        setFailure(getFirebaseAuthErrorMessage(error));
        setPhase("invalid");
      }
    }

    void run(entry.code, entry.mode);
  }, [entry]);

  async function submitNewPassword() {
    const firebaseAuth = auth;
    const code = oobCode.current;
    if (!firebaseAuth || !code || submitting) return;

    if (password !== confirmation) {
      setFieldError("Both passwords must match.");
      return;
    }
    if (status && validatedPassword === password && !status.isValid) {
      setFieldError(authMessages.weakPassword);
      return;
    }

    setSubmitting(true);
    setFieldError(null);
    try {
      await confirmPasswordReset(firebaseAuth, code, password);
      // The code is single use; it is discarded as soon as it has been spent.
      oobCode.current = null;
      setPassword("");
      setConfirmation("");
      setPhase("reset-complete");
    } catch (error) {
      setFieldError(getFirebaseAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const requirements = describePasswordPolicy(status);
  const maskedAccount = accountEmail ? maskEmail(accountEmail) : null;

  return (
    <AuthShell>
      {phase === "checking" && (
        <Status
          icon="progress_activity"
          title="Checking your link"
          description="This only takes a moment."
          spinning
        />
      )}

      {phase === "verifying" && (
        <Status
          icon="progress_activity"
          title="Verifying your email"
          description="This only takes a moment."
          spinning
        />
      )}

      {phase === "reset-form" && (
        <>
          <AuthCardHeading
            title="Set a new password"
            description={
              maskedAccount ? (
                <>
                  Choose a new password for{" "}
                  <span className="text-on-surface font-medium">{maskedAccount}</span>.
                </>
              ) : (
                "Choose a new password for your account."
              )
            }
          />

          <form
            className="cx-form flex flex-col gap-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submitNewPassword();
            }}
          >
            <div className="cx-field">
              <div className="cx-field__label-row">
                <label className="cx-field__label" htmlFor="new-password">
                  New password
                </label>
              </div>
              <div className="cx-field__control">
                <input
                  id="new-password"
                  name="new-password"
                  type={revealed ? "text" : "password"}
                  autoComplete="new-password"
                  aria-describedby="reset-password-policy"
                  data-has-reveal="true"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <PasswordRevealButton
                  revealed={revealed}
                  controls="new-password"
                  fieldLabel="new password"
                  onToggle={() => setRevealed((value) => !value)}
                />
              </div>
            </div>

            <PasswordPolicyChecklist
              id="reset-password-policy"
              requirements={requirements}
              unavailable={unavailable}
            />

            <div className="cx-field">
              <div className="cx-field__label-row">
                <label className="cx-field__label" htmlFor="confirm-new-password">
                  Confirm new password
                </label>
              </div>
              <div className="cx-field__control">
                <input
                  id="confirm-new-password"
                  name="confirm-new-password"
                  type={revealed ? "text" : "password"}
                  autoComplete="new-password"
                  data-has-reveal="true"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
                <PasswordRevealButton
                  revealed={revealed}
                  controls="confirm-new-password"
                  fieldLabel="confirm new password"
                  onToggle={() => setRevealed((value) => !value)}
                />
              </div>
            </div>

            {fieldError && (
              <p role="alert" className="text-error text-sm">
                {fieldError}
              </p>
            )}

            <Button
              type="submit"
              fullWidth
              loading={submitting}
              loadingLabel="Saving…"
              disabled={password.length === 0 || confirmation.length === 0}
            >
              Save new password
            </Button>
          </form>
        </>
      )}

      {phase === "reset-complete" && (
        <Status
          icon="check_circle"
          title="Your password has been changed"
          description="Sign in with your new password to continue."
          action={
            <Button fullWidth onClick={() => onReturnToApp(continueTo)}>
              Return to sign in
            </Button>
          }
        />
      )}

      {phase === "verified" && (
        <Status
          icon="check_circle"
          title="Your email is verified"
          description="You can now open your private Cognaxis journal."
          action={
            <Button fullWidth onClick={() => onReturnToApp(continueTo)}>
              Continue to Cognaxis
            </Button>
          }
        />
      )}

      {phase === "email-recovered" && (
        <Status
          icon="check_circle"
          title="Your email address has been restored"
          description={
            maskedAccount
              ? `Your account email has been restored to ${maskedAccount}. Change your password if you did not request this.`
              : "Your previous email address has been restored. Change your password if you did not request this."
          }
          action={
            <Button fullWidth onClick={() => onReturnToApp()}>
              Return to sign in
            </Button>
          }
        />
      )}

      {phase === "invalid" && (
        <>
          <AuthCardHeading title="This link cannot be used" description={INVALID_COPY[mode]} />
          <InlineAlert tone="info" className="mb-5">
            {failure ?? "Request a new link from Cognaxis and try again."}
          </InlineAlert>
          <Button fullWidth onClick={() => onReturnToApp()}>
            Return to sign in
          </Button>
        </>
      )}

      {phase === "configuration-missing" && (
        <Status
          icon="vpn_key"
          title="Cognaxis is not configured"
          description="This installation cannot complete email actions yet. Contact whoever set up this deployment."
        />
      )}

      {continueTo && (phase === "verified" || phase === "reset-complete") && (
        <p className="text-on-surface-variant mt-4 text-xs">
          You will be returned to <span className="font-medium">{continueTo}</span>.
        </p>
      )}
    </AuthShell>
  );
}

function Status({
  icon,
  title,
  description,
  action,
  spinning = false,
}: {
  icon: Parameters<typeof MaterialIcon>[0]["name"];
  title: string;
  description: string;
  action?: React.ReactNode;
  spinning?: boolean;
}) {
  return (
    <>
      <div
        className="bg-primary-container text-on-primary-container mb-6 flex h-14 w-14 items-center justify-center rounded-2xl"
        aria-hidden="true"
      >
        <span className={spinning ? "motion-safe:animate-spin motion-reduce:animate-none" : ""}>
          <MaterialIcon name={icon} size={28} />
        </span>
      </div>
      <AuthCardHeading title={title} description={description} />
      <div role="status" className="sr-only">
        {title}
      </div>
      {action}
    </>
  );
}
