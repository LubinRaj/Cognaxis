/** The Firebase email-action modes Cognaxis is prepared to handle. */
export const SUPPORTED_ACTION_MODES = ["resetPassword", "verifyEmail", "recoverEmail"] as const;

export type ActionMode = (typeof SUPPORTED_ACTION_MODES)[number];

export type ParsedActionLink =
  | { status: "ready"; mode: ActionMode; oobCode: string; continueUrl: string | null }
  | { status: "unsupported" };

const OOB_CODE_PATTERN = /^[A-Za-z0-9_-]{8,512}$/;

/**
 * Reads only `mode`, `oobCode`, and `continueUrl`. The `apiKey` and `lang` parameters are ignored
 * because Cognaxis always uses its own configured Firebase instance and locale.
 */
export function parseActionLink(search: string): ParsedActionLink {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");

  if (!mode || !oobCode) return { status: "unsupported" };
  if (!SUPPORTED_ACTION_MODES.includes(mode as ActionMode)) return { status: "unsupported" };
  // The code is a one-time credential; anything that is not a plain opaque token is rejected
  // before it is ever handed to the Firebase SDK.
  if (!OOB_CODE_PATTERN.test(oobCode)) return { status: "unsupported" };

  return {
    status: "ready",
    mode: mode as ActionMode,
    oobCode,
    continueUrl: params.get("continueUrl"),
  };
}

/**
 * Accepts a continuation target only when it resolves to a path on this exact origin. Any absolute
 * URL to another host, and any scheme other than the page's own, is discarded.
 */
export function resolveContinueUrl(
  candidate: string | null,
  origin: string,
): string | null {
  if (!candidate) return null;

  let target: URL;
  try {
    target = new URL(candidate, origin);
  } catch {
    return null;
  }

  if (target.origin !== origin) return null;
  if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  // A path beginning with two slashes is a protocol-relative reference to another host.
  if (target.pathname.startsWith("//")) return null;

  return `${target.pathname}${target.search}${target.hash}`;
}

/** Removes the one-time code from the address bar once it has been captured in memory. */
export function scrubActionQueryString(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const { pathname } = window.location;
  try {
    window.history.replaceState(null, "", pathname);
  } catch {
    // A blocked history API must not stop the flow.
  }
}
