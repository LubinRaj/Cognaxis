export const MAX_TOKEN_REFRESH_ATTEMPTS = 1;

export type ApiFailure = {
  status: number;
  errorCode: string | null;
  completedRefreshes: number;
};

export type TokenRefreshDecisionInput = ApiFailure & { method: string };

// The backend emits 401 UNAUTHENTICATED from the authentication middleware, before any handler,
// repository, or model call runs. A replay after a forced token refresh therefore cannot duplicate
// a write for any HTTP method. No other status or code is replayed.
export function shouldForceTokenRefresh(input: TokenRefreshDecisionInput): boolean {
  if (input.completedRefreshes >= MAX_TOKEN_REFRESH_ATTEMPTS) return false;
  return input.status === 401 && input.errorCode === "UNAUTHENTICATED";
}

export function isSessionTerminatingResponse(failure: ApiFailure): boolean {
  if (failure.status !== 401) return false;
  if (failure.errorCode === "RECENT_AUTH_REQUIRED") return true;
  return (
    failure.errorCode === "UNAUTHENTICATED" &&
    failure.completedRefreshes >= MAX_TOKEN_REFRESH_ATTEMPTS
  );
}
