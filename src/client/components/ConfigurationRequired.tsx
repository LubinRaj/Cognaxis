import { missingFirebaseConfigKeys } from "../lib/firebase";
import { MaterialIcon } from "./MaterialIcon";

export function ConfigurationRequired() {
  return (
    <main className="bg-surface text-on-surface flex min-h-screen items-center justify-center p-4 font-sans sm:p-8">
      <section
        className="border-outline-variant bg-surface-container-low w-full max-w-xl rounded-[28px] border p-6 shadow-sm sm:p-8"
        aria-labelledby="configuration-title"
      >
        <div className="border-outline-variant flex items-center gap-4 border-b pb-6">
          <div
            className="bg-error-container text-on-error-container flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            aria-hidden="true"
          >
            <MaterialIcon name="vpn_key" size={24} />
          </div>
          <div>
            <p className="text-on-surface-variant text-xs font-semibold tracking-widest uppercase">
              Diagnostic screen
            </p>
            <h1
              id="configuration-title"
              className="font-display mt-1 text-xl font-medium sm:text-2xl"
            >
              Firebase configuration missing
            </h1>
          </div>
        </div>

        <p className="text-on-surface-variant mt-6 text-sm leading-relaxed">
          Cognaxis enforces real, cryptographic identity verification and intentionally refuses to
          simulate authentication. The public Firebase configuration below has not been supplied to
          this build.
        </p>

        {missingFirebaseConfigKeys.length > 0 && (
          <div className="border-outline-variant bg-surface-container mt-6 rounded-2xl border p-4">
            <h2 className="text-on-surface text-sm font-medium">Missing variable names</h2>
            <ul className="text-on-surface-variant mt-3 space-y-1.5 font-mono text-sm">
              {missingFirebaseConfigKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        )}

        <ol className="mt-6 space-y-4">
          <li className="border-outline-variant bg-surface-container flex items-start gap-3 rounded-2xl border p-4">
            <span
              className="bg-surface-container-high text-on-surface flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold"
              aria-hidden="true"
            >
              1
            </span>
            <div className="text-sm">
              <p className="text-on-surface font-medium">Provide the public configuration</p>
              <p className="text-on-surface-variant mt-1">
                Set the listed environment variables in your local environment file. Never place a
                secret value in a variable that is exposed to the browser.
              </p>
            </div>
          </li>
          <li className="border-outline-variant bg-surface-container flex items-start gap-3 rounded-2xl border p-4">
            <span
              className="bg-surface-container-high text-on-surface flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold"
              aria-hidden="true"
            >
              2
            </span>
            <div className="text-sm">
              <p className="text-on-surface font-medium">Restart the development server</p>
              <p className="text-on-surface-variant mt-1">
                Restart the application so the newly configured environment variables are loaded.
              </p>
            </div>
          </li>
        </ol>

        <p className="bg-surface-container text-on-surface-variant mt-8 flex items-center gap-3 rounded-2xl p-4 text-sm">
          <span aria-hidden="true" className="shrink-0">
            <MaterialIcon name="lock" size={20} />
          </span>
          <span className="font-medium">
            Fail-closed invariant: the application will not mount an authenticated experience
            without a working authentication configuration.
          </span>
        </p>
      </section>
    </main>
  );
}
