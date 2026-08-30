import { signInWithPopup } from "firebase/auth";
import { useState } from "react";
import { auth, googleProvider } from "../lib/firebase";

export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!auth) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      setError("Sign-in did not complete. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-copy">
        <div className="brand-lockup"><span className="brand-mark">C</span> Cognaxis</div>
        <p className="eyebrow">Personal intelligence, on your terms</p>
        <h1>Turn reflection into clarity without surrendering privacy.</h1>
        <p className="signin-description">
          Think with Gemini, preserve the moments that matter, and keep personal memory inside your
          authenticated workspace.
        </p>
        <ul className="assurance-list">
          <li>Identity verified before every protected request</li>
          <li>Personal records stored under your server-derived user scope</li>
          <li>Gemini credentials remain on the server</li>
        </ul>
      </section>
      <section className="signin-card" aria-labelledby="signin-title">
        <p className="eyebrow">Private workspace</p>
        <h2 id="signin-title">Welcome to Cognaxis</h2>
        <p>Sign in with the Google account connected to your Firebase project.</p>
        <button className="primary-button wide" onClick={() => void signIn()} disabled={busy}>
          {busy ? "Connecting…" : "Continue with Google"}
        </button>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <p className="fine-print">Cognaxis never stores your Google password.</p>
      </section>
    </main>
  );
}
