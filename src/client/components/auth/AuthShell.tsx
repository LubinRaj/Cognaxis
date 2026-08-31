import type { ReactNode } from "react";
import { MaterialIcon } from "../MaterialIcon";
import { ThemeMenu } from "../ThemeMenu";

const assurances = [
  {
    icon: "verified_user" as const,
    title: "Verified identity",
    body: "Firebase Authentication handles every credential. Cognaxis never stores or sees your password.",
  },
  {
    icon: "lock" as const,
    title: "Private by default",
    body: "Your journal is scoped to your account and authorised on the server for every request.",
  },
  {
    icon: "dns" as const,
    title: "Server-side intelligence",
    body: "Model credentials stay on the backend. The browser never receives them.",
  },
];

type AuthShellProps = {
  children: ReactNode;
  onBackToHome?: () => void;
};

export function AuthShell({ children, onBackToHome }: AuthShellProps) {
  return (
    <div className="bg-surface text-on-surface flex min-h-screen flex-col font-sans">
      <a
        href="#auth-main"
        className="bg-primary text-on-primary sr-only rounded-full px-4 py-2 focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to authentication
      </a>

      <header className="bg-surface/90 sticky top-0 z-40 w-full backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-primary flex items-center justify-center" aria-hidden="true">
              <MaterialIcon name="psychiatry" size={28} />
            </span>
            <span className="font-display text-on-surface text-[22px] font-medium tracking-tight">
              Cognaxis
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            {onBackToHome && (
              <button
                type="button"
                onClick={onBackToHome}
                aria-label="Back to home"
                className="text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-primary flex h-11 min-w-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4"
              >
                <MaterialIcon name="arrow_back" size={18} />
                <span aria-hidden="true" className="hidden sm:inline">
                  Back to home
                </span>
              </button>
            )}
            <ThemeMenu />
          </div>
        </div>
      </header>

      <main
        id="auth-main"
        className="mx-auto flex w-full max-w-[1200px] flex-1 items-center px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
      >
        {/* The card is first in the document so assistive technology and small screens reach the
            form before the supporting copy; CSS order restores the visual two-column layout. */}
        <div className="grid w-full items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex w-full justify-center lg:order-2 lg:justify-end">
            <div className="border-outline-variant bg-surface-container-low cx-auth-card w-full max-w-[480px] rounded-[28px] border p-6 shadow-sm sm:p-8">
              {children}
            </div>
          </div>

          <section
            className="hidden lg:order-1 lg:block"
            aria-labelledby="auth-supporting-heading"
          >
            <h2
              id="auth-supporting-heading"
              className="font-display text-on-surface text-[2.5rem] leading-[1.15] font-medium tracking-tight"
            >
              A private space
              <br />
              for thinking clearly.
            </h2>
            <p className="text-on-surface-variant mt-4 max-w-md text-base leading-relaxed">
              Cognaxis keeps your reflections inside your own authenticated workspace. Sign in
              securely with Google or email.
            </p>

            <ul className="mt-10 space-y-6">
              {assurances.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span
                    className="bg-primary-container text-on-primary-container flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    aria-hidden="true"
                  >
                    <MaterialIcon name={item.icon} size={22} />
                  </span>
                  <div>
                    <h3 className="text-on-surface text-sm font-medium">{item.title}</h3>
                    <p className="text-on-surface-variant mt-1 max-w-sm text-sm leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-outline-variant border-t">
        <div className="text-on-surface-variant mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-3 px-4 py-6 text-xs sm:flex-row sm:px-6 lg:px-8">
          <p>&copy; {new Date().getFullYear()} Cognaxis. Personal intelligence.</p>
          <p>Authentication is provided by Firebase Authentication.</p>
        </div>
      </footer>
    </div>
  );
}
