import { useState } from "react";
import { Button, GoogleLogo, useUI } from "@firebase-oss/ui-react";
import { signInWithProvider } from "@firebase-oss/ui-core";
import { getFirebaseAuthErrorMessage } from "../../auth/auth-errors";
import { createGoogleProvider } from "../../lib/firebase";

// FirebaseUI's own provider button renders `error.message` directly, and its translation map does
// not cover popup, domain, or session codes, so those failures would reach the user as raw Firebase
// text. This button keeps the official credential call and brand mark but routes every failure
// through the Cognaxis sanitiser.
export function GoogleAuthButton() {
  const ui = useUI();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithProvider(ui, createGoogleProvider());
    } catch (failure) {
      setError(getFirebaseAuthErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        data-provider="google.com"
        className="fui-provider__button"
        disabled={busy || ui.state !== "idle"}
        onClick={() => void start()}
      >
        <GoogleLogo />
        <span>Continue with Google</span>
      </Button>
      {error && (
        <p role="alert" className="fui-error mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
