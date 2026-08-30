import { useState, useRef, useEffect } from "react";
import { auth, googleProvider } from "../lib/firebase";
import { useTheme, type ThemeOption } from "../hooks/useTheme";
import { MaterialIcon, type MaterialIconName } from "./MaterialIcon";
import { getFirebaseAuthErrorMessage } from "../lib/auth-errors";
import { beginGoogleSignIn } from "../lib/google-sign-in";

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

const CognaxisLogo = () => (
  <span className="text-primary flex items-center justify-center">
    <MaterialIcon name="psychiatry" size={28} />
  </span>
);

type SignInProps = {
  authError?: string | null;
  onAuthAttempt?: () => void;
};

export function SignIn({ authError = null, onAuthAttempt }: SignInProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { theme, setTheme } = useTheme();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setThemeMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function signIn() {
    if (!auth) {
      setError("Sign-in is not configured for this environment.");
      return;
    }
    setBusy(true);
    setError(null);
    onAuthAttempt?.();
    try {
      await beginGoogleSignIn(auth, googleProvider);
    } catch (err: unknown) {
      setError(getFirebaseAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const themeOptions: { value: ThemeOption; label: string; icon: MaterialIconName }[] = [
    { value: "system", label: "System", icon: "desktop_windows" },
    { value: "light", label: "Light", icon: "light_mode" },
    { value: "dark", label: "Dark", icon: "dark_mode" },
  ];

  const currentThemeOption = themeOptions.find(o => o.value === theme) || themeOptions[0];

  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans transition-colors duration-200">
      
      {/* MD3 Top App Bar */}
      <header className="sticky top-0 z-50 w-full bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <CognaxisLogo />
            <span className="text-[22px] font-display font-medium text-on-surface tracking-tight">Cognaxis</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">How it works</a>
            <a href="#privacy" className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Privacy</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative" ref={themeMenuRef}>
              <button
                onClick={() => setThemeMenuOpen(!themeMenuOpen)}
                className="flex items-center justify-center rounded-full h-10 w-10 sm:w-auto sm:px-4 gap-2 bg-surface hover:bg-surface-container-high text-on-surface-variant transition-colors"
                aria-haspopup="true"
                aria-expanded={themeMenuOpen}
                aria-label="Select theme"
              >
                <MaterialIcon name={currentThemeOption.icon} size={20} />
                <span className="hidden sm:inline-block text-sm font-medium">{currentThemeOption.label}</span>
                <span className="hidden sm:inline-block"><MaterialIcon name="arrow_drop_down" size={18} /></span>
              </button>
              
              {themeMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-outline-variant bg-surface-container p-2 shadow-md z-50">
                  {themeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTheme(option.value);
                        setThemeMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        theme === option.value
                          ? "bg-secondary-container text-on-secondary-container"
                          : "text-on-surface hover:bg-surface-container-high"
                      }`}
                      role="menuitem"
                    >
                      <MaterialIcon name={option.icon} size={20} />
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => void signIn()}
              disabled={busy}
              className="hidden sm:inline-flex rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-on-primary hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-12 lg:gap-12 lg:items-center">
              
              {/* Left Column: Copy & Actions */}
              <div className="sm:text-center md:mx-auto lg:col-span-6 lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-4 py-1.5 text-sm font-medium text-on-surface-variant mb-6">
                  <span className="text-primary"><MaterialIcon name="auto_awesome" size={16} /></span>
                  Your private thinking space
                </div>
                <h1 className="text-4xl font-display font-medium tracking-tight text-on-surface sm:text-5xl md:text-6xl lg:text-[clamp(3rem,5vw,4.5rem)] leading-[1.1]">
                  Think freely. <br className="hidden lg:block" />
                  <span className="text-primary">Remember what matters.</span>
                </h1>
                <p className="mt-6 text-lg text-on-surface-variant max-w-2xl mx-auto lg:mx-0">
                  Journal with Gemini, explore your ideas, and turn meaningful conversations into personal memory—kept inside your authenticated workspace.
                </p>
                
                <div className="mt-10 flex flex-col sm:flex-row sm:justify-center lg:justify-start gap-4">
                  <button
                    onClick={() => void signIn()}
                    disabled={busy}
                    className="group flex w-full sm:w-auto items-center justify-center gap-3 rounded-full border border-outline-variant bg-surface px-8 py-4 text-base font-medium text-on-surface shadow-sm transition hover:bg-surface-container-high active:scale-95 disabled:opacity-60"
                  >
                    {busy ? (
                      <MaterialIcon name="progress_activity" size={20} />
                    ) : (
                      <GoogleIcon />
                    )}
                    <span>Continue with Google</span>
                  </button>
                  <a
                    href="#how-it-works"
                    className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-medium text-primary hover:bg-primary-container hover:text-on-primary-container transition-colors"
                  >
                    See how it works
                    <MaterialIcon name="arrow_forward" size={18} />
                  </a>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-sm text-on-surface-variant font-medium">
                  <span className="flex items-center gap-1.5"><MaterialIcon name="verified_user" size={18} /> Google Identity</span>
                  <span className="flex items-center gap-1.5"><MaterialIcon name="dns" size={18} /> Server-side AI</span>
                  <span className="flex items-center gap-1.5"><MaterialIcon name="lock" size={18} /> Private Vault</span>
                </div>

                {(error ?? authError) && (
                  <div className="mt-6 rounded-2xl bg-error/10 p-4 text-left text-sm text-error" role="alert">
                    <div className="flex items-start gap-3">
                      <MaterialIcon name="error" size={20} />
                      <p className="mt-0.5">{error ?? authError}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Product Visual */}
              <div className="mt-16 sm:mt-20 lg:mt-0 lg:col-span-6">
                <div className="relative mx-auto w-full max-w-lg rounded-[28px] border border-outline-variant bg-surface-container p-6 shadow-sm">
                  {/* Mock Conversation */}
                  <div className="space-y-6">
                    {/* User Message */}
                    <div className="flex justify-end">
                      <div className="rounded-[24px] rounded-tr-[4px] bg-primary px-5 py-3.5 text-[15px] text-on-primary max-w-[85%] shadow-sm leading-relaxed">
                        I've been struggling to organize my thoughts around the new architecture proposal. It feels too complex.
                      </div>
                    </div>
                    {/* AI Message */}
                    <div className="flex justify-start">
                      <div className="rounded-[24px] rounded-tl-[4px] bg-surface-container-high px-5 py-4 text-[15px] text-on-surface max-w-[90%] shadow-sm leading-relaxed">
                        <p>Let's break it down. Complexity often comes from coupling. What if we isolated the storage layer first?</p>
                        <p className="mt-2 text-on-surface-variant">Would separating the tenant isolation logic help clarify the boundaries?</p>
                      </div>
                    </div>
                    
                    {/* Memory Card */}
                    <div className="mt-8">
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <span className="text-primary"><MaterialIcon name="memory" size={18} /></span>
                        <span className="text-sm font-medium text-primary">Saved to your private memory</span>
                      </div>
                      <div className="rounded-[20px] border border-outline-variant bg-surface p-5 shadow-sm">
                        <h4 className="font-display text-base font-medium text-on-surface">Architecture Simplification</h4>
                        <p className="mt-1.5 text-sm text-on-surface-variant leading-relaxed">
                          Identified that system complexity is stemming from tight coupling. Action item: isolate storage layer and clearly define tenant boundaries.
                        </p>
                        <div className="mt-4 flex gap-2">
                          <span className="rounded-lg bg-secondary-container px-2.5 py-1 text-xs font-medium text-on-secondary-container">Design</span>
                          <span className="rounded-lg bg-primary-container px-2.5 py-1 text-xs font-medium text-on-primary-container">Action Item</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="bg-surface-container-low py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-display font-medium tracking-tight text-on-surface sm:text-4xl">How it works</h2>
              <p className="mt-4 text-lg text-on-surface-variant">A natural flow from messy thoughts to clear insights.</p>
            </div>

            <div className="mt-20 grid gap-12 md:grid-cols-3 relative">
              <div className="relative flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-primary-container text-on-primary-container shadow-sm mb-6">
                  <MaterialIcon name="edit_document" size={32} />
                </div>
                <h3 className="text-xl font-display font-medium text-on-surface">Reflect naturally</h3>
                <p className="mt-3 text-on-surface-variant max-w-xs leading-relaxed">
                  Write, vent, or brainstorm exactly as you think without worrying about structure.
                </p>
              </div>

              <div className="relative flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-secondary-container text-on-secondary-container shadow-sm mb-6">
                  <MaterialIcon name="forum" size={32} />
                </div>
                <h3 className="text-xl font-display font-medium text-on-surface">Explore with Gemini</h3>
                <p className="mt-3 text-on-surface-variant max-w-xs leading-relaxed">
                  The AI acts as a sounding board, asking clarifying questions to distill your ideas.
                </p>
              </div>

              <div className="relative flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-primary-container text-on-primary-container shadow-sm mb-6">
                  <MaterialIcon name="bookmark_added" size={32} />
                </div>
                <h3 className="text-xl font-display font-medium text-on-surface">Keep the insight</h3>
                <p className="mt-3 text-on-surface-variant max-w-xs leading-relaxed">
                  Key takeaways are automatically summarized, themed, and saved to your private memory.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Privacy Section */}
        <section id="privacy" className="bg-surface py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-block text-primary mb-4"><MaterialIcon name="fingerprint" size={48} /></span>
              <h2 className="text-3xl font-display font-medium tracking-tight text-on-surface sm:text-4xl">Personal by design</h2>
              <p className="mt-4 text-lg text-on-surface-variant">
                Cognaxis is built on rigorous isolation invariants. We don't make impossible security promises, but we do enforce strict controls.
              </p>
            </div>
            
            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[24px] border border-outline-variant bg-surface-container p-6">
                <span className="text-primary"><MaterialIcon name="verified_user" size={32} /></span>
                <h3 className="mt-4 font-display font-medium text-on-surface">Verified Identity</h3>
                <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">Firebase verifies the signed-in user cryptographically. No passwords are handled directly.</p>
              </div>
              
              <div className="rounded-[24px] border border-outline-variant bg-surface-container p-6">
                <span className="text-primary"><MaterialIcon name="vpn_key" size={32} /></span>
                <h3 className="mt-4 font-display font-medium text-on-surface">Backend Authorization</h3>
                <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">Private requests are strictly authorized by the backend on every operation.</p>
              </div>
              
              <div className="rounded-[24px] border border-outline-variant bg-surface-container p-6">
                <span className="text-primary"><MaterialIcon name="cloud" size={32} /></span>
                <h3 className="mt-4 font-display font-medium text-on-surface">Server-side Models</h3>
                <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">Gemini credentials remain server-side. The client never touches the model API directly.</p>
              </div>
              
              <div className="rounded-[24px] border border-outline-variant bg-surface-container p-6">
                <span className="text-primary"><MaterialIcon name="folder_managed" size={32} /></span>
                <h3 className="mt-4 font-display font-medium text-on-surface">Scoped Data</h3>
                <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">Your personal journal data is strictly scoped and isolated to your verified account.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-surface-container-low py-24 border-t border-outline-variant">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-display font-medium tracking-tight text-on-surface sm:text-4xl">
              Make space for clearer thinking.
            </h2>
            <div className="mt-10 flex justify-center">
              <button
                onClick={() => void signIn()}
                disabled={busy}
                className="group flex w-full sm:w-auto items-center justify-center gap-3 rounded-full border border-outline-variant bg-surface px-8 py-4 text-base font-medium text-on-surface shadow-sm transition hover:bg-surface-container-high active:scale-95 disabled:opacity-60"
              >
                {busy ? (
                  <MaterialIcon name="progress_activity" size={20} />
                ) : (
                  <GoogleIcon />
                )}
                <span>Continue with Google</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-outline-variant bg-surface py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <CognaxisLogo />
            <span className="text-lg font-display font-medium tracking-tight text-on-surface">Cognaxis</span>
          </div>
          <p className="text-sm text-on-surface-variant">
            &copy; {new Date().getFullYear()} Cognaxis. Personal intelligence.
          </p>
          <div className="flex gap-6 text-sm text-on-surface-variant font-medium">
            <span className="cursor-pointer hover:text-on-surface transition-colors">Privacy</span>
            <span className="cursor-pointer hover:text-on-surface transition-colors">Terms</span>
            <span className="cursor-pointer hover:text-on-surface transition-colors">Security</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
