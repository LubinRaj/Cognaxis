import { Lock, KeyRound } from "lucide-react";

export function ConfigurationRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-8 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100">
      <section
        className="w-full max-w-xl rounded-3xl border border-slate-200/60 bg-white p-8 shadow-xl dark:border-slate-800/60 dark:bg-[#0b1120]"
        aria-labelledby="configuration-title"
      >
        <div className="flex items-center gap-4 border-b border-slate-100 pb-6 dark:border-slate-800">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-400">
              Diagnostic Screen
            </div>
            <h1 id="configuration-title" className="text-xl font-bold sm:text-2xl mt-1">
              Firebase Configuration Missing
            </h1>
          </div>
        </div>
        
        <p className="mt-6 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Cognaxis enforces real, cryptographic identity verification and intentionally refuses to simulate authentication. The required public Firebase configuration variables are missing.
        </p>

        <div className="mt-6 space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs font-bold font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              1
            </div>
            <div className="text-sm">
              <p className="font-semibold text-slate-900 dark:text-slate-200">Provide Public Config</p>
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                Supply the standard Firebase configuration identifiers via environment variables.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs font-bold font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              2
            </div>
            <div className="text-sm">
              <p className="font-semibold text-slate-900 dark:text-slate-200">Restart Dev Server</p>
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                Restart the application to reload the newly configured environment variables.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3 rounded-xl bg-slate-100 p-4 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <Lock className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" />
          <span className="font-medium">Fail-Closed Invariant: The application will not mount without proper authentication configuration.</span>
        </div>
      </section>
    </main>
  );
}
