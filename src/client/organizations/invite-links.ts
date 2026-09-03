// The invitation link carries public identifiers in the query and the one-time secret only in
// the URL fragment, which browsers never send in requests or referrer headers.

export function buildJoinLink(origin: string, orgId: string, inviteId: string, secret: string): string {
  return `${origin}/join?org=${encodeURIComponent(orgId)}&invite=${encodeURIComponent(inviteId)}#token=${encodeURIComponent(secret)}`;
}

export type PendingInvite = {
  orgId: string;
  inviteId: string;
  secret: string;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;
const STORAGE_KEY = "cognaxis.pendingInvite";

export function parseJoinLocation(search: string, hash: string): PendingInvite | null {
  const query = new URLSearchParams(search);
  const orgId = query.get("org") ?? "";
  const inviteId = query.get("invite") ?? "";
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const secret = fragment.get("token") ?? "";
  if (!ID_PATTERN.test(orgId) || !ID_PATTERN.test(inviteId) || !SECRET_PATTERN.test(secret)) {
    return null;
  }
  return { orgId, inviteId, secret };
}

// The secret is parked only while the recipient signs in, and is removed the moment the
// invitation is accepted, rejected, or abandoned.
export function storePendingInvite(invite: PendingInvite): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(invite));
  } catch {
    // Storage being unavailable only costs the redirect-after-sign-in convenience.
  }
}

export function readPendingInvite(): PendingInvite | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingInvite>;
    if (
      typeof parsed.orgId === "string" &&
      ID_PATTERN.test(parsed.orgId) &&
      typeof parsed.inviteId === "string" &&
      ID_PATTERN.test(parsed.inviteId) &&
      typeof parsed.secret === "string" &&
      SECRET_PATTERN.test(parsed.secret)
    ) {
      return { orgId: parsed.orgId, inviteId: parsed.inviteId, secret: parsed.secret };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function hasPendingInvite(): boolean {
  return readPendingInvite() !== null;
}
