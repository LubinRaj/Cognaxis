import { MaterialIcon } from "./MaterialIcon";
import { ThemeMenu } from "./ThemeMenu";

const steps = [
  {
    icon: "edit_document" as const,
    title: "Capture what matters",
    body: "Write, speak, or attach a note in one reflection. Start messy and shape it as you go.",
    tone: "primary" as const,
  },
  {
    icon: "forum" as const,
    title: "Reflect with context",
    body: "Cognaxis asks thoughtful questions and responds using the context you chose to share.",
    tone: "secondary" as const,
  },
  {
    icon: "bookmark_added" as const,
    title: "Keep the thread useful",
    body: "Create summaries, revisit themes, and follow insights, check-ins, and open loops over time.",
    tone: "primary" as const,
  },
];

const assurances = [
  {
    icon: "verified_user" as const,
    title: "Verified identity",
    body: "Firebase Authentication verifies every sign-in. Cognaxis never stores or handles your password.",
  },
  {
    icon: "vpn_key" as const,
    title: "Backend authorisation",
    body: "Private requests are authorised by the backend on every operation.",
  },
  {
    icon: "cloud" as const,
    title: "Server-side models",
    body: "Gemini credentials remain server-side. The client never touches the model API directly.",
  },
  {
    icon: "folder_managed" as const,
    title: "Separate spaces",
    body: "Personal reflections stay isolated from team spaces, with access checked on every request.",
  },
];

const intelligenceFeatures = [
  {
    icon: "psychiatry" as const,
    title: "Think through real life",
    body: "Use one calm space for work, study, business decisions, relationships, or whatever is on your mind.",
  },
  {
    icon: "memory" as const,
    title: "Build a useful second brain",
    body: "Revisit past decisions, themes, and next steps with answers grounded in the reflections you have saved.",
  },
  {
    icon: "auto_graph" as const,
    title: "Notice patterns over time",
    body: "Optional check-ins, insights, and streaks help you see what is changing without inventing meaning for you.",
  },
  {
    icon: "groups" as const,
    title: "Keep team context together",
    body: "Share deliberate updates, decisions, and blockers in a team space while personal reflections remain separate.",
  },
];

type LandingPageProps = {
  onOpenAuth: () => void;
};

export function LandingPage({ onOpenAuth }: LandingPageProps) {
  return (
    <div className="bg-surface text-on-surface min-h-screen font-sans transition-colors duration-200">
      <header className="bg-surface/90 sticky top-0 z-40 w-full backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-primary flex items-center justify-center" aria-hidden="true">
              <MaterialIcon name="psychiatry" size={28} />
            </span>
            <span className="font-display text-on-surface text-[22px] font-medium tracking-tight">
              Cognaxis
            </span>
          </div>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Sections">
            <a
              href="#how-it-works"
              className="text-on-surface-variant hover:text-on-surface text-sm font-medium transition-colors"
            >
              How it works
            </a>
            <a
              href="#intelligence"
              className="text-on-surface-variant hover:text-on-surface text-sm font-medium transition-colors"
            >
              Intelligence
            </a>
            <a
              href="#privacy"
              className="text-on-surface-variant hover:text-on-surface text-sm font-medium transition-colors"
            >
              Privacy
            </a>
          </nav>

          <div className="flex items-center gap-1 sm:gap-3">
            <ThemeMenu />
            <button
              type="button"
              onClick={onOpenAuth}
              className="bg-primary text-on-primary focus-visible:outline-primary inline-flex h-11 items-center rounded-full px-5 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-12 lg:items-center lg:gap-12">
              <div className="md:mx-auto sm:text-center lg:col-span-6 lg:text-left">
                <p className="border-outline-variant bg-surface-container-low text-on-surface-variant mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium">
                  <span className="text-primary" aria-hidden="true">
                    <MaterialIcon name="auto_awesome" size={16} />
                  </span>
                  Personal and shared reflection
                </p>
                <h1 className="font-display text-on-surface text-4xl leading-[1.1] font-medium tracking-tight sm:text-5xl md:text-6xl lg:text-[clamp(3rem,5vw,4.5rem)]">
                  Think clearly. <br className="hidden lg:block" />
                  <span className="text-primary">Remember what matters.</span>
                </h1>
                <p className="text-on-surface-variant mx-auto mt-6 max-w-2xl text-lg lg:mx-0">
                  Cognaxis is a cognitive reflection assistant and second brain for everyday life.
                  Capture thoughts, clarify decisions, and turn experience into useful memory -
                  privately for yourself or deliberately with your team.
                </p>

                <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="bg-primary text-on-primary focus-visible:outline-primary flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-8 text-base font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                  >
                    Start capturing
                    <MaterialIcon name="arrow_forward" size={18} />
                  </button>
                  <a
                    href="#how-it-works"
                    className="text-primary hover:bg-primary-container hover:text-on-primary-container focus-visible:outline-primary flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                  >
                    See how it works
                  </a>
                </div>

                <p className="text-on-surface-variant mt-4 text-sm">
                  Sign in securely with Google or email.
                </p>

                <ul className="text-on-surface-variant mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-medium lg:justify-start">
                  <li className="flex items-center gap-1.5">
                    <MaterialIcon name="verified_user" size={18} /> Verified identity
                  </li>
                  <li className="flex items-center gap-1.5">
                    <MaterialIcon name="dns" size={18} /> Server-side AI
                  </li>
                  <li className="flex items-center gap-1.5">
                    <MaterialIcon name="lock" size={18} /> Private vault
                  </li>
                </ul>
              </div>

              <div className="mt-16 sm:mt-20 lg:col-span-6 lg:mt-0">
                <div className="border-outline-variant bg-surface-container relative mx-auto w-full max-w-lg rounded-[28px] border p-6 shadow-sm">
                  <div className="space-y-6">
                    <div className="flex justify-end">
                      <div className="bg-primary text-on-primary max-w-[85%] rounded-[24px] rounded-tr-[4px] px-5 py-3.5 text-[15px] leading-relaxed shadow-sm">
                        I need to make a decision about next quarter without losing sight of what I
                        learned this quarter.
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="bg-surface-container-high text-on-surface max-w-[90%] rounded-[24px] rounded-tl-[4px] px-5 py-4 text-[15px] leading-relaxed shadow-sm">
                        <p>
                          Let&apos;s slow it down. What did you learn this quarter that should shape the
                          decision?
                        </p>
                        <p className="text-on-surface-variant mt-2">
                          We can separate what you know, what is still open, and what you want to
                          explore next.
                        </p>
                      </div>
                    </div>

                    <div className="mt-8">
                      <div className="mb-3 flex items-center gap-2 px-1">
                        <span className="text-primary" aria-hidden="true">
                          <MaterialIcon name="memory" size={18} />
                        </span>
                        <span className="text-primary text-sm font-medium">
                          Saved to your memory
                        </span>
                      </div>
                      <div className="border-outline-variant bg-surface rounded-[20px] border p-5 shadow-sm">
                        <h3 className="font-display text-on-surface text-base font-medium">
                          Next quarter decision
                        </h3>
                        <p className="text-on-surface-variant mt-1.5 text-sm leading-relaxed">
                          Captured the lessons from this quarter and the questions to revisit before
                          choosing the next direction.
                        </p>
                        <div className="mt-4 flex gap-2">
                          <span className="bg-secondary-container text-on-secondary-container rounded-lg px-2.5 py-1 text-xs font-medium">
                            Decision
                          </span>
                          <span className="bg-primary-container text-on-primary-container rounded-lg px-2.5 py-1 text-xs font-medium">
                            Open loop
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-surface-container-low py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="font-display text-on-surface text-3xl font-medium tracking-tight sm:text-4xl">
                How it works
              </h2>
              <p className="text-on-surface-variant mt-4 text-lg">
                Capture, reflect, and return to what matters.
              </p>
            </div>

            <div className="mt-20 grid gap-12 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.title} className="flex flex-col items-center text-center">
                  <div
                    className={`mb-6 flex h-20 w-20 items-center justify-center rounded-[24px] shadow-sm ${
                      step.tone === "primary"
                        ? "bg-primary-container text-on-primary-container"
                        : "bg-secondary-container text-on-secondary-container"
                    }`}
                    aria-hidden="true"
                  >
                    <MaterialIcon name={step.icon} size={32} />
                  </div>
                  <h3 className="font-display text-on-surface text-xl font-medium">{step.title}</h3>
                  <p className="text-on-surface-variant mt-3 max-w-xs leading-relaxed">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="intelligence" className="bg-surface py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-primary text-sm font-medium">One space for shared thinking</p>
              <h2 className="font-display text-on-surface mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
                A second brain that keeps context
              </h2>
              <p className="text-on-surface-variant mt-4 text-lg">
                Use Cognaxis for personal reflection or the work you share with a team. The same
                simple flow keeps private and shared context distinct.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2">
              {intelligenceFeatures.map((feature) => (
                <article
                  key={feature.title}
                  className="border-outline-variant bg-surface-container-low rounded-[24px] border p-6 sm:p-7"
                >
                  <span className="bg-primary-container text-on-primary-container inline-flex h-12 w-12 items-center justify-center rounded-2xl" aria-hidden="true">
                    <MaterialIcon name={feature.icon} size={24} />
                  </span>
                  <h3 className="font-display text-on-surface mt-5 text-xl font-medium">{feature.title}</h3>
                  <p className="text-on-surface-variant mt-2 leading-relaxed">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="privacy" className="border-outline-variant bg-surface border-t py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-primary mb-4 inline-block" aria-hidden="true">
                <MaterialIcon name="fingerprint" size={48} />
              </span>
              <h2 className="font-display text-on-surface text-3xl font-medium tracking-tight sm:text-4xl">
                Private when personal. Shared when intentional.
              </h2>
              <p className="text-on-surface-variant mt-4 text-lg">
                Choose where each new reflection belongs. Personal reflections stay private, while
                team context is visible only inside its shared space.
              </p>
            </div>

            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {assurances.map((item) => (
                <div
                  key={item.title}
                  className="border-outline-variant bg-surface-container rounded-[24px] border p-6"
                >
                  <span className="text-primary" aria-hidden="true">
                    <MaterialIcon name={item.icon} size={32} />
                  </span>
                  <h3 className="font-display text-on-surface mt-4 font-medium">{item.title}</h3>
                  <p className="text-on-surface-variant mt-2 text-sm leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-surface-container-low border-outline-variant border-t py-24">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="font-display text-on-surface text-3xl font-medium tracking-tight sm:text-4xl">
              Give your thinking somewhere to land.
            </h2>
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={onOpenAuth}
                className="bg-primary text-on-primary focus-visible:outline-primary flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-8 text-base font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
              >
                Start capturing
                <MaterialIcon name="arrow_forward" size={18} />
              </button>
            </div>
            <p className="text-on-surface-variant mt-4 text-sm">
              Sign in securely with Google or email.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-outline-variant bg-surface border-t py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-primary flex items-center justify-center" aria-hidden="true">
              <MaterialIcon name="psychiatry" size={28} />
            </span>
            <span className="font-display text-on-surface text-lg font-medium tracking-tight">
              Cognaxis
            </span>
          </div>
          <nav aria-label="Legal" className="flex items-center gap-6">
            <a
              href="/privacy"
              className="text-on-surface-variant hover:text-on-surface text-sm font-medium transition-colors"
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="text-on-surface-variant hover:text-on-surface text-sm font-medium transition-colors"
            >
              Terms
            </a>
          </nav>
          <p className="text-on-surface-variant text-sm">
            &copy; {new Date().getFullYear()} Cognaxis. Personal and shared reflection.
          </p>
        </div>
      </footer>
    </div>
  );
}
