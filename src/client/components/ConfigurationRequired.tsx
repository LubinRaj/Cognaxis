import { Lock, KeyRound } from "lucide-react";

export function ConfigurationRequired() {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-4 sm:p-8 bg-[#050c0a]">
      {/* Glow background */}
      <div className="absolute h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <section
        className="relative z-10 w-full max-w-xl rounded-3xl border border-emerald-500/25 bg-gradient-to-b from-[#0e221d] to-[#071310] p-8 shadow-2xl backdrop-blur-xl"
        aria-labelledby="configuration-title"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/25 shadow-sm">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
                Secure Configuration Checkpoint
              </span>
            </div>
            <h1 id="configuration-title" className="text-xl font-bold text-white sm:text-2xl">
              Connect Firebase Authentication
            </h1>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-zinc-300">
          Cognaxis enforces real, cryptographic identity verification and intentionally refuses to simulate
          authentication. To initialize your local or development workspace:
        </p>

        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-[#091815] p-3.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">
              1
            </div>
            <div className="text-xs">
              <p className="font-semibold text-zinc-200">Copy environment template</p>
              <p className="mt-0.5 text-zinc-400">
                Populate your <code className="text-emerald-300 font-mono">.env.local</code> file using the variables defined in <code className="text-emerald-300 font-mono">.env.example</code>.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-[#091815] p-3.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">
              2
            </div>
            <div className="text-xs">
              <p className="font-semibold text-zinc-200">Provide Public Firebase Config</p>
              <p className="mt-0.5 text-zinc-400">
                Supply <code className="text-emerald-300 font-mono">VITE_FIREBASE_API_KEY</code>, <code className="text-emerald-300 font-mono">VITE_FIREBASE_PROJECT_ID</code>, and <code className="text-emerald-300 font-mono">VITE_FIREBASE_APP_ID</code>.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-[#091815] p-3.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">
              3
            </div>
            <div className="text-xs">
              <p className="font-semibold text-zinc-200">Restart Dev Server</p>
              <p className="mt-0.5 text-zinc-400">
                Restart the application to reload the newly configured environment variables.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <Lock className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Security Invariant: No journal data or Gemini API keys are ever stored in client variables.</span>
        </div>
      </section>
    </main>
  );
}
