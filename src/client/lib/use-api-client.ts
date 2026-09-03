import { useMemo } from "react";
import type { User } from "firebase/auth";
import { useAuth } from "../auth/AuthProvider";
import { ApiClient } from "./api-client";

export function useApiClient(user: User): ApiClient {
  const { reportSessionExpired, reportEmailVerificationRequired } = useAuth();
  return useMemo(
    () =>
      new ApiClient(() => user, {
        onSessionExpired: reportSessionExpired,
        onEmailVerificationRequired: reportEmailVerificationRequired,
      }),
    [user, reportSessionExpired, reportEmailVerificationRequired],
  );
}
