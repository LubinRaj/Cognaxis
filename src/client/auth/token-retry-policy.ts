export const MAX_TOKEN_REFRESH_ATTEMPTS = 1;

export type ApiFailure = {
  status: number;
  errorCode: string | null;
  completedRefreshes: number;
};

export type TokenRefreshDecisionInput = ApiFailure & { method: string };

// The backend emits 401 UNAUTHENTICATED from the authentication middleware and 403
// EMAIL_VERIFICATION_REQUIRED from the verified-email middleware, both before any handler,
// repository, or model call runs. A replay after a forced token refresh therefore cannot
// duplicate a write for any HTTP method. Verification is replayed because that claim genuinely
// changes server-side the moment the user follows the mail link; a stale token would otherwise
// bounce a freshly verified user back to the verify screen. No other status or code is replayed.
export function shouldForceTokenRefresh(input: TokenRefreshDecisionInput): boolean {
  if (input.completedRefreshes >= MAX_TOKEN_REFRESH_ATTEMPTS) return false;
  if (input.status === 401 && input.errorCode === "UNAUTHENTICATED") return true;
  return input.status === 403 && input.errorCode === "EMAIL_VERIFICATION_REQUIRED";
}

export function isSessionTerminatingResponse(failure: ApiFailure): boolean {
  if (failure.status !== 401) return false;
  // A recent-authentication challenge protects a sensitive operation; it does not mean the
  // Firebase session is invalid. Keep the signed-in workspace intact and let the operation show
  // the challenge to the user. Only a genuinely invalid token after one refresh ends a session.
  if (failure.errorCode === "RECENT_AUTH_REQUIRED") return false;
  return (
    failure.errorCode === "UNAUTHENTICATED" &&
    failure.completedRefreshes >= MAX_TOKEN_REFRESH_ATTEMPTS
  );
}
