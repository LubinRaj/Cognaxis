import { MaterialIcon } from "./MaterialIcon";
import { ThemeMenu } from "./ThemeMenu";

const steps = [
  {
    icon: "edit_document" as const,
    title: "Capture the context",
    body: "Write, speak, or attach what happened, what changed, and what your team should remember.",
    tone: "primary" as const,
  },
  {
    icon: "forum" as const,
    title: "Build shared memory",
    body: "Keep decisions, updates, blockers, and reasoning together in the space where the work belongs.",
    tone: "secondary" as const,
  },
  {
    icon: "bookmark_added" as const,
    title: "Ask what happened",
    body: "Return to the accumulated history and find the source behind a decision, pattern, or open loop.",
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
    icon: "description" as const,
    title: "Preserve the why",
    body: "Capture the reasoning behind decisions, not just the final document or task that came out of them.",
  },
  {
    icon: "memory" as const,
    title: "Find the signal later",
    body: "Ask about past work and receive answers grounded in the reflections and sources your space is allowed to use.",
  },
  {
    icon: "auto_graph" as const,
    title: "Keep work moving",
    body: "Preserve blockers, next steps, and unfinished thinking so important context does not disappear between meetings.",
  },
  {
    icon: "groups" as const,
    title: "One system, two scopes",
    body: "Use Personal Intelligence privately, or build Organizational Intelligence with the people you choose.",
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
              For teams
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
        <section className="bg-surface relative isolate overflow-hidden pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <div className="bg-primary-container/35 absolute -top-40 left-[42%] h-[34rem] w-[34rem] rounded-full blur-3xl" />
            <div className="bg-secondary-container/30 absolute -right-48 bottom-[-12rem] h-[30rem] w-[30rem] rounded-full blur-3xl" />
            <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(to_right,color-mix(in_srgb,var(--color-outline-variant)_28%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--color-outline-variant)_28%,transparent)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
          </div>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-12 lg:items-center lg:gap-12">
              <div className="md:mx-auto sm:text-center lg:col-span-6 lg:text-left">
                <p className="border-outline-variant bg-surface-container-low text-on-surface-variant mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium">
                  <span className="text-primary" aria-hidden="true">
                    <MaterialIcon name="auto_awesome" size={16} />
                  </span>
                  Cognitive intelligence for people and teams
                </p>
                <h1 className="font-display text-on-surface text-4xl leading-[1.1] font-medium tracking-tight sm:text-5xl md:text-6xl lg:text-[clamp(3rem,5vw,4.5rem)]">
                  Think clearly. <br className="hidden lg:block" />
                  <span className="text-primary">Remember what matters.</span>
                </h1>
                <p className="text-on-surface-variant mx-auto mt-6 max-w-2xl text-lg lg:mx-0">
                  Cognaxis is a secure second brain for your thinking and your team&apos;s context.
                  Capture decisions, blockers, updates, and reflections as they happen, then return
                  to the reasoning behind the work when it matters most.
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
                    <MaterialIcon name="groups" size={18} /> Personal and team spaces
                  </li>
                </ul>
              </div>

              <div className="relative mt-16 sm:mt-20 lg:col-span-6 lg:mt-0">
                <div className="border-primary/25 bg-surface-container/70 absolute z-10 -top-7 left-0 hidden items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-md sm:flex lg:-left-8" aria-hidden="true">
                  <span className="bg-primary-container text-on-primary-container flex h-7 w-7 items-center justify-center rounded-lg"><MaterialIcon name="memory" size={16} /></span>
                  <span><span className="text-on-surface block font-medium">Context retained</span><span className="text-on-surface-variant block">Across people and projects</span></span>
                </div>
                <div className="border-primary/25 bg-surface-container/90 absolute z-10 -right-2 -bottom-7 hidden items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-md sm:flex lg:-right-8" aria-hidden="true">
                  <span className="bg-secondary-container text-on-secondary-container flex h-7 w-7 items-center justify-center rounded-lg"><MaterialIcon name="lock" size={16} /></span>
                  <span><span className="text-on-surface block font-medium">Private by scope</span><span className="text-on-surface-variant block">Personal and team stay separate</span></span>
                </div>
                <div className="from-primary-container/25 via-surface-container to-secondary-container/20 absolute -inset-3 -z-10 rounded-[36px] bg-gradient-to-br blur-xl" aria-hidden="true" />
                <div className="border-outline-variant bg-surface-container relative z-0 mx-auto w-full max-w-lg rounded-[28px] border p-6 shadow-sm">
                  <div className="space-y-6">
                    <div className="flex justify-end">
                      <div className="bg-primary text-on-primary max-w-[85%] rounded-[24px] rounded-tr-[4px] px-5 py-3.5 text-[15px] leading-relaxed shadow-sm">
                        This quarter, our activation rate rose from 50% to 70% after we simplified
                        onboarding and added guided setup.
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="bg-surface-container-high text-on-surface max-w-[90%] rounded-[24px] rounded-tl-[4px] px-5 py-4 text-[15px] leading-relaxed shadow-sm">
                        <p>
                          That&apos;s meaningful progress: activation improved by 20 percentage points.
                        </p>
                        <p className="text-on-surface-variant mt-2">
                          What do you think changed in the customer experience, and which parts
                          should carry into next quarter?
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
                          Activation improvement
                        </h3>
                        <p className="text-on-surface-variant mt-1.5 text-sm leading-relaxed">
                          Captured the result, likely drivers, and the question to investigate before
                          planning the next quarter.
                        </p>
                        <div className="mt-4 flex gap-2">
                          <span className="bg-secondary-container text-on-secondary-container rounded-lg px-2.5 py-1 text-xs font-medium">
                            Customer insight
                          </span>
                          <span className="bg-primary-container text-on-primary-container rounded-lg px-2.5 py-1 text-xs font-medium">
                            Next-quarter question
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
                Turn everyday work into context your future self and your team can use.
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

        <section className="bg-surface py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
            <div>
              <p className="text-primary text-sm font-medium">The problem is context loss</p>
              <h2 className="font-display text-on-surface mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
                Your company remembers the result. Cognaxis keeps the reasoning.
              </h2>
              <p className="text-on-surface-variant mt-5 text-lg leading-relaxed">
                Important knowledge lives in meeting notes, old chats, handoffs, and people&apos;s
                heads. When the project changes or someone leaves, the why often disappears with it.
              </p>
            </div>
            <div className="border-outline-variant bg-surface-container-low rounded-[28px] border p-5 sm:p-7">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="bg-surface rounded-2xl p-5 shadow-sm">
                  <p className="text-on-surface-variant text-xs font-medium uppercase tracking-[0.14em]">Before</p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="border-outline-variant text-on-surface-variant flex items-center gap-2 rounded-xl border p-3"><MaterialIcon name="forum" size={17} /> Buried in chat</div>
                    <div className="border-outline-variant text-on-surface-variant flex items-center gap-2 rounded-xl border p-3"><MaterialIcon name="description" size={17} /> Missing the why</div>
                    <div className="border-outline-variant text-on-surface-variant flex items-center gap-2 rounded-xl border p-3"><MaterialIcon name="history" size={17} /> Hard to recover</div>
                  </div>
                </div>
                <div className="text-primary flex justify-center py-1 sm:rotate-0" aria-hidden="true"><MaterialIcon name="arrow_forward" size={26} /></div>
                <div className="bg-primary-container rounded-2xl p-5">
                  <p className="text-on-primary-container text-xs font-medium uppercase tracking-[0.14em]">After</p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="bg-surface text-on-surface flex items-center gap-2 rounded-xl p-3"><MaterialIcon name="memory" size={17} className="text-primary" /> Searchable context</div>
                    <div className="bg-surface text-on-surface flex items-center gap-2 rounded-xl p-3"><MaterialIcon name="check_circle" size={17} className="text-primary" /> Grounded answers</div>
                    <div className="bg-surface text-on-surface flex items-center gap-2 rounded-xl p-3"><MaterialIcon name="groups" size={17} className="text-primary" /> Shared understanding</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="intelligence" className="bg-surface py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-primary text-sm font-medium">Personal Intelligence and Organizational Intelligence</p>
              <h2 className="font-display text-on-surface mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
                One memory layer. The right trust boundary.
              </h2>
              <p className="text-on-surface-variant mt-4 text-lg">
                Think privately, work together, and keep every answer inside the space it came from.
                Cognaxis gives people and organizations the same simple way to build useful memory.
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

        <section className="bg-surface-container-low py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-primary text-sm font-medium">From daily updates to team intelligence</p>
              <h2 className="font-display text-on-surface mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
                Let the team&apos;s memory compound.
              </h2>
              <p className="text-on-surface-variant mt-4 text-lg">
                Small reflections become a shared record of decisions, risks, and the reasoning that
                helps the next person move faster.
              </p>
            </div>

            <div className="border-outline-variant bg-surface-container mt-14 rounded-[28px] border p-4 shadow-sm sm:p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-3">
                  <span className="bg-primary-container text-on-primary-container flex h-10 w-10 items-center justify-center rounded-xl" aria-hidden="true">
                    <MaterialIcon name="groups" size={21} />
                  </span>
                  <div>
                    <p className="text-on-surface text-sm font-medium">Product team memory</p>
                    <p className="text-on-surface-variant text-xs">12 contributors · shared space</p>
                  </div>
                </div>
                <span className="text-primary flex items-center gap-1 text-xs font-medium"><MaterialIcon name="lock" size={15} /> Scoped access</span>
              </div>
              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="bg-surface-container-low rounded-2xl p-4 sm:p-5">
                  <p className="text-on-surface-variant mb-4 text-[11px] font-medium uppercase tracking-[0.14em]">Captured context</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="border-outline-variant bg-surface rounded-xl border p-4">
                      <div className="flex items-center gap-2"><MaterialIcon name="checklist" size={17} className="text-primary" /><span className="text-on-surface text-xs font-medium">Release decision</span></div>
                      <p className="text-on-surface-variant mt-2 text-sm leading-relaxed">Why we chose the smaller migration path and what we still need to validate.</p>
                    </div>
                    <div className="border-outline-variant bg-surface rounded-xl border p-4">
                      <div className="flex items-center gap-2"><MaterialIcon name="warning" size={17} className="text-secondary" /><span className="text-on-surface text-xs font-medium">Open blocker</span></div>
                      <p className="text-on-surface-variant mt-2 text-sm leading-relaxed">The customer concern that needs an owner before the next release.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-primary-container rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center gap-2"><MaterialIcon name="search" size={18} className="text-primary" /><p className="text-primary text-xs font-medium">Ask your organization</p></div>
                  <p className="text-on-primary-container mt-5 text-base font-medium leading-relaxed">Why did we choose the smaller migration path?</p>
                  <div className="bg-surface-container mt-4 rounded-xl p-4">
                    <p className="text-on-surface text-sm leading-relaxed">The team chose it to reduce implementation risk while validating the customer workflow first.</p>
                    <div className="border-outline-variant mt-4 flex items-center gap-2 border-t pt-3 text-xs font-medium text-primary"><MaterialIcon name="content_copy" size={15} /> 3 source reflections</div>
                  </div>
                </div>
              </div>
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
                Secure by scope. Useful by design.
              </h2>
              <p className="text-on-surface-variant mt-4 text-lg">
                Trust is part of the product. Personal memory stays personal, while team context is
                visible only to authorized people in that organization.
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
              Make the context behind your work impossible to lose.
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
            &copy; {new Date().getFullYear()} Cognaxis. A secure memory layer for people and teams.
          </p>
        </div>
      </footer>
    </div>
  );
}
