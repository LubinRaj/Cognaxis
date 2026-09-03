import { Link } from "react-router-dom";
import { usePageTitle } from "../shell/use-page-title";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-on-surface text-xl font-medium tracking-tight">{title}</h2>
      <div className="text-on-surface-variant mt-3 space-y-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export function TermsPage() {
  usePageTitle("Terms · Cognaxis");
  return (
    <main className="bg-surface min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <Link to="/" className="text-primary text-sm font-medium hover:underline">
          ← Back to Cognaxis
        </Link>
        <h1 className="font-display text-on-surface mt-6 text-3xl font-medium tracking-tight">
          Terms of use
        </h1>
        <p className="text-on-surface-variant mt-4 text-sm leading-relaxed">
          By using Cognaxis you agree to these terms. They are intentionally short and written to
          be read.
        </p>

        <Section title="What Cognaxis is — and is not">
          <p>
            Cognaxis is a personal reflection journal with AI-assisted summaries and insights.
            Insights describe patterns in your own reflections. They are not medical advice, a
            diagnosis, or a substitute for professional care, and the application deliberately
            refuses to store diagnostic or causal claims about you.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You are responsible for the accuracy of what you write and for keeping access to your
            sign-in method secure. Organization spaces are shared: anything you write in an
            organization session is visible to its other members according to their roles.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>
            Do not use Cognaxis to store unlawful content, to attempt to access another
            person&apos;s data, or to probe or overload the service. Accounts and organizations
            that do so can be suspended by platform administrators, with the action recorded in an
            audit trail.
          </p>
        </Section>

        <Section title="Third-party services">
          <p>
            Cognaxis runs on Google Cloud. Sign-in is provided by Firebase Authentication, AI
            responses by the Gemini API, and the optional map screen by the Google Maps JavaScript
            API. Your use of the map is additionally subject to the{" "}
            <a
              href="https://cloud.google.com/maps-platform/terms"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Google Maps Platform Terms of Service
            </a>{" "}
            and the{" "}
            <a
              href="https://policies.google.com/privacy"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Google Privacy Policy
            </a>
            .
          </p>
        </Section>

        <Section title="Availability and changes">
          <p>
            Cognaxis is provided as-is, without a guarantee of uninterrupted availability. Features
            behind configuration flags may be enabled or disabled per deployment. These terms and
            the <Link to="/privacy" className="text-primary hover:underline">privacy page</Link>{" "}
            may change; continued use after a change means you accept the updated version.
          </p>
        </Section>
      </div>
    </main>
  );
}

export default TermsPage;
