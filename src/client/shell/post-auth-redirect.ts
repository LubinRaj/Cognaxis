const STORAGE_KEY = "cognaxis.postAuthPath";

// Only same-application absolute paths are ever stored or replayed, so the redirect can never
// leave the origin or carry a query string, fragment, or credential material.
export function isSafeAppPath(path: string): boolean {
  return /^\/app(?:\/[A-Za-z0-9_-]+)*\/?$/.test(path);
}

export function rememberIntendedPath(path: string): void {
  try {
    if (isSafeAppPath(path)) {
      window.sessionStorage.setItem(STORAGE_KEY, path);
    }
  } catch {
    // Storage can be unavailable in private browsing modes; losing the redirect is acceptable.
  }
}

export function consumeIntendedPath(): string | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return value !== null && isSafeAppPath(value) ? value : null;
  } catch {
    return null;
  }
}
