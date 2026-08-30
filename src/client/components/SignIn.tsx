import { signInWithPopup } from "firebase/auth";
import { useState } from "react";
import { ShieldCheck, Lock, Sparkles, ArrowRight, ShieldAlert, CheckCircle2 } from "lucide-react";
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
      setError("Google authentication did not complete. Please verify popup permissions and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4 sm:p-8 lg:p-12 overflow-hidden bg-[#050c0a]">
      {/* Subtle background ambient glows */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 translate-x-1/2 translate-y-1/2 rounded-full bg-teal-600/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
        {/* Left Hero Column */}
        <section className="lg:col-span-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-teal-500/10 text-emerald-400 border border-emerald-400/30 shadow-md font-mono font-bold text-lg">
              C
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">Cognaxis</span>
              <span className="ml-2 text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                Security-First AI
              </span>
            </div>
          </div>

          <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.1]">
            Personal reflection with <span className="bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">zero compromise</span> on privacy.
          </h1>

          <p className="mt-5 text-base sm:text-lg leading-relaxed text-zinc-400 max-w-xl">
            A high-assurance personal intelligence platform powered by server-side Gemini, cryptographic
            identity verification, and strict tenant isolation.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3 max-w-2xl">
            <div className="rounded-2xl border border-emerald-500/20 bg-[#091915]/70 p-4 backdrop-blur-xs">
              <ShieldCheck className="h-5 w-5 text-emerald-400 mb-2" />
              <h2 className="text-xs font-semibold text-zinc-200">Verified Token Gate</h2>
              <p className="mt-1 text-[11px] text-zinc-400 leading-snug">
                Every request validated server-side by Firebase Admin SDK.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-[#091915]/70 p-4 backdrop-blur-xs">
              <Lock className="h-5 w-5 text-emerald-400 mb-2" />
              <h2 className="text-xs font-semibold text-zinc-200">Zero Client IDs</h2>
              <p className="mt-1 text-[11px] text-zinc-400 leading-snug">
                Ownership scope derived strictly from verified JWT tokens.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-[#091915]/70 p-4 backdrop-blur-xs">
              <Sparkles className="h-5 w-5 text-emerald-400 mb-2" />
              <h2 className="text-xs font-semibold text-zinc-200">Protected Gemini</h2>
              <p className="mt-1 text-[11px] text-zinc-400 leading-snug">
                Model credentials never exposed to the browser.
              </p>
            </div>
          </div>
        </section>

        {/* Right Sign-in Card Column */}
        <section className="lg:col-span-5">
          <div className="relative rounded-3xl border border-emerald-500/25 bg-gradient-to-b from-[#0e221d]/90 to-[#071310]/90 p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                Private Workspace Sign-In
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
              Welcome to Cognaxis
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Sign in with your Google account to access your personal reflection vault.
            </p>

            <div className="mt-8 space-y-4">
              <button
                type="button"
                onClick={() => void signIn()}
                disabled={busy}
                className="group relative flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 py-3.5 text-sm font-semibold text-zinc-900 shadow-xl transition-all hover:bg-zinc-100 hover:shadow-2xl active:scale-[0.99] disabled:opacity-60"
              >
                {busy ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent" />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>{busy ? "Authenticating..." : "Continue with Google"}</span>
                {!busy && <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />}
              </button>

              {error && (
                <div
                  className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2"
                  role="alert"
                >
                  <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="mt-8 border-t border-emerald-500/10 pt-4">
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Cognaxis never stores or accesses your Google password</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
