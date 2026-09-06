function storageKey(uid: string): string {
  return `cognaxis.workspace-scope.${uid}`;
}

export function readRecentTeamScope(uid: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(uid));
  } catch {
    return null;
  }
}

export function rememberWorkspaceScope(uid: string, organizationId: string | null): void {
  try {
    if (organizationId) window.sessionStorage.setItem(storageKey(uid), organizationId);
    else window.sessionStorage.removeItem(storageKey(uid));
  } catch {
    // Navigation still works when storage is unavailable or disabled.
  }
}
