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

export function PrivacyPage() {
  usePageTitle("Privacy · Cognaxis");
  return (
    <main className="bg-surface min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <Link to="/" className="text-primary text-sm font-medium hover:underline">
          ← Back to Cognaxis
        </Link>
        <h1 className="font-display text-on-surface mt-6 text-3xl font-medium tracking-tight">
          Privacy
        </h1>
        <p className="text-on-surface-variant mt-4 text-sm leading-relaxed">
          Cognaxis is a personal reflection journal. This page describes plainly what the
          application stores, which services process your content, and what you can delete.
        </p>

        <Section title="What we store">
          <p>
            Your account identity (email address, display name, and sign-in provider) comes from
            Firebase Authentication; Cognaxis never sees or stores your password. Your journal
            sessions, messages, summaries, check-ins, and generated insights are stored in Google
            Cloud Firestore under your own account document, and every request for them is checked
            on the server against your verified sign-in.
          </p>
          <p>
            If you attach a place to a check-in, Cognaxis stores an approximate location (a label
            and rounded coordinates). It is kept with the check-in until you delete that check-in
            or its reflection, and it is only ever shown back to you.
          </p>
        </Section>

        <Section title="AI processing">
          <p>
            Conversational replies, summaries, and insights are generated with Google&apos;s Gemini
            API. Your relevant journal content is sent from our server to Google only to produce
            the response you asked for; the API credentials never reach your browser. This
            processing is governed by Google&apos;s Gemini API terms: under the paid tier this
            deployment uses, Google states that prompts and responses are not used to train its
            models. Cognaxis itself does not train any model on your content. See{" "}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Google&apos;s Gemini API terms
            </a>{" "}
            for the authoritative wording.
          </p>
        </Section>

        <Section title="Maps">
          <p>
            The optional map screen loads the Google Maps JavaScript API in your browser, and only
            after you open that screen. While it is in use, Google may receive your requests for
            map tiles as described in the{" "}
            <a
              href="https://policies.google.com/privacy"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Google Privacy Policy
            </a>
            ; use of the map is also subject to the{" "}
            <a
              href="https://cloud.google.com/maps-platform/terms"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Google Maps Platform Terms of Service
            </a>
            . Without a configured maps key the application shows list views and contacts no map
            service.
          </p>
        </Section>

        <Section title="Exports and deletion">
          <p>
            You can export a reflection at any time; a downloaded file leaves the
            application&apos;s protections and is yours to look after. Deleting a reflection also
            deletes its derived summary and check-in, and any insight that cited it is marked out
            of date. Deleting your account data can be requested from within the application.
          </p>
        </Section>

        <Section title="Administration">
          <p>
            Platform administrators can see operational metadata only - such as account status,
            usage counters, and audit events. There is no administrative surface that returns
            journal content, check-in notes, or locations.
          </p>
        </Section>

        <Section title="Questions">
          <p>
            Cognaxis avoids impossible promises: no service can guarantee absolute security. What
            it does enforce are the isolation rules above, on the server, for every request. See
            also our <Link to="/terms" className="text-primary hover:underline">Terms</Link>.
          </p>
        </Section>
      </div>
    </main>
  );
}

export default PrivacyPage;
