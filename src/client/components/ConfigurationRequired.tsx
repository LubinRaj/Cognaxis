export function ConfigurationRequired() {
  return (
    <main className="centered-page">
      <section className="configuration-card" aria-labelledby="configuration-title">
        <div className="brand-mark" aria-hidden="true">C</div>
        <p className="eyebrow">Secure setup checkpoint</p>
        <h1 id="configuration-title">Connect Firebase to continue</h1>
        <p>
          Cognaxis is intentionally refusing to simulate authentication. Add the public Firebase web
          configuration from <code>.env.example</code>, then restart the development server.
        </p>
        <div className="configuration-note">
          No journal data or Gemini credentials belong in browser environment variables.
        </div>
      </section>
    </main>
  );
}
