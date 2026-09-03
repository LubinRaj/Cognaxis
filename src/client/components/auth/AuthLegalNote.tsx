export function AuthLegalNote() {
  return (
    <p className="text-on-surface-variant border-outline-variant border-t pt-5 text-xs leading-relaxed">
      Sign-in is handled by Firebase Authentication. Cognaxis never stores or sees your password,
      and your journal stays inside your own authenticated workspace. By continuing you accept the{" "}
      <a href="/terms" className="text-primary underline underline-offset-2">
        terms
      </a>{" "}
      and the{" "}
      <a href="/privacy" className="text-primary underline underline-offset-2">
        privacy page
      </a>
      .
    </p>
  );
}
